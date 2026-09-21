/*
 * Turning the rendered diagram into an image.
 *
 * The renderer has no geometry model that exists outside the browser:
 * `HTMLRenderHandler.rectangle` measures with `getBoundingClientRect`, layout
 * is CSS flexbox, and `HTMLDrawHandler` places the SVG overlay at coordinates
 * read back off the laid-out DOM. So an image can only be produced by a
 * browser that has already rendered the diagram - which is what this module
 * does, via `html-to-image`'s foreignObject-into-canvas trick.
 *
 * Two callers use it: `websockets_transfer` answering a `renderRequest` from a
 * notebook, and the `window.tsncd` hook in `index.ts` driven by a headless
 * browser. Both go through `captureElement`.
 */

import * as htmlToImage from 'html-to-image';

export type CaptureFormat = 'png' | 'svg';

export interface CaptureOptions {
    format?: CaptureFormat;
    /** Device pixel ratio for `png`. Ignored for `svg`, which is resolution independent. */
    scale?: number;
    /** Margin in px added on every side, outside the measured content. */
    padding?: number;
    /** CSS colour, `auto` for the diagram theme, or `null` for transparency. */
    background?: string | null;
}

export const defaultCaptureOptions = {
    format: 'png',
    scale: 2,
    padding: 16,
    background: 'auto',
} satisfies Required<CaptureOptions>;

export interface CaptureResult {
    mime: string;
    /** Base64 for `png`, the markup itself for `svg`. */
    payload: string;
    encoding: 'base64' | 'utf-8';
    /** CSS px, before `scale` is applied. */
    width: number;
    height: number;
}

/*
 * KaTeX ships around twenty font files. `getFontEmbedCSS` fetches every one of
 * them and inlines it as a data URI, which is far too slow to repeat on each
 * capture - and the answer cannot change while the page is alive.
 */
let fontEmbedCSSCache: string | undefined;

async function fontEmbedCSS(node: HTMLElement): Promise<string> {
    if (fontEmbedCSSCache === undefined) {
        fontEmbedCSSCache = await htmlToImage.getFontEmbedCSS(node);
    }
    return fontEmbedCSSCache;
}

/**
 * Wait until what is on screen is what will be captured.
 *
 * Two distinct hazards. Fonts: KaTeX measures wrong while its faces are still
 * swapping, and since the overlay is drawn from measured rectangles, capturing
 * early puts the wires in the wrong place - not merely the wrong typeface.
 * Layout: `post_placement` and `update` mutate styles, so we let the browser
 * run a full frame before reading anything back.
 */
export async function waitForRenderSettled(): Promise<void> {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

interface Box {left: number; top: number; right: number; bottom: number}

function clippedBox(box: Box, clip: Box): Box {
    return {
        left: Math.max(box.left, clip.left),
        top: Math.max(box.top, clip.top),
        right: Math.min(box.right, clip.right),
        bottom: Math.min(box.bottom, clip.bottom),
    };
}

function clipsOverflow(overflow: string): boolean {
    return overflow === 'hidden' || overflow === 'clip'
        || overflow === 'auto' || overflow === 'scroll';
}

/**
 * The box actually occupied by `node` and everything inside it, in viewport
 * coordinates.
 *
 * Not the same as `node.getBoundingClientRect()`. `HTMLDrawHandler` places its
 * SVG layers at a negative offset from the diagram container and sizes them
 * past its far edge, so the drawing overhangs its own container - currently by
 * `BUFFER` on each side. Measuring the union rather than assuming a number
 * keeps the capture correct if that offset ever changes.
 *
 * It also keeps it correct where the drawing overhangs by more than the layer
 * does. The layers are `overflow: visible` precisely so that a wire may be
 * drawn outside them - `TapeBox` runs a grab's tape above the top of the
 * figure - and the shapes themselves are descendants of `node`, so the loop
 * below measures where the ink actually went and not merely where the layer
 * that holds it sits.
 */
export function contentBox(node: HTMLElement): Box {
    const rect = node.getBoundingClientRect();
    const box: Box = {
        left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
    };
    const unclipped: Box = {left: -Infinity, top: -Infinity,
                           right: Infinity, bottom: Infinity};
    const childClips = new Map<Element, Box>([[node, unclipped]]);
    for (const child of Array.from(node.querySelectorAll('*'))) {
        const q = child.getBoundingClientRect();
        const parentClip = childClips.get(child.parentElement ?? node) ?? unclipped;
        const style = getComputedStyle(child);
        childClips.set(child, clippedBox(parentClip, {
            left: clipsOverflow(style.overflowX) ? q.left : -Infinity,
            right: clipsOverflow(style.overflowX) ? q.right : Infinity,
            top: clipsOverflow(style.overflowY) ? q.top : -Infinity,
            bottom: clipsOverflow(style.overflowY) ? q.bottom : Infinity,
        }));
        // Zero-area elements are structural - anchors, wire stubs, spacers -
        // and several sit at the origin, which would drag the box out.
        if (q.width === 0 && q.height === 0) {
            continue;
        }
        const visible = clippedBox(q, parentClip);
        if (visible.right < visible.left || visible.bottom < visible.top) {
            continue;
        }
        box.left = Math.min(box.left, visible.left);
        box.top = Math.min(box.top, visible.top);
        box.right = Math.max(box.right, visible.right);
        box.bottom = Math.max(box.bottom, visible.bottom);
    }
    return box;
}

/** Page-coordinate box of everything in `node`, grown by `padding`. */
export function captureBounds(
    node: HTMLElement,
    padding: number = defaultCaptureOptions.padding,
): {x: number; y: number; width: number; height: number} {
    const box = contentBox(node);
    return {
        x: box.left + window.scrollX - padding,
        y: box.top + window.scrollY - padding,
        width: Math.ceil(box.right - box.left) + 2 * padding,
        height: Math.ceil(box.bottom - box.top) + 2 * padding,
    };
}

function splitDataUrl(dataUrl: string): {mime: string; body: string; base64: boolean} {
    const comma = dataUrl.indexOf(',');
    const header = dataUrl.slice(5, comma);           // strip the leading 'data:'
    const base64 = header.endsWith(';base64');
    return {
        mime: header.split(';')[0],
        body: dataUrl.slice(comma + 1),
        base64,
    };
}

export function captureBackground(
    node: HTMLElement,
    background: string | null = defaultCaptureOptions.background,
): string | null {
    if (background !== 'auto') {
        return background;
    }
    const diagramBackground = getComputedStyle(node).backgroundColor;
    return diagramBackground === 'rgba(0, 0, 0, 0)' || diagramBackground === 'transparent'
        ? '#ffffff'
        : diagramBackground;
}

export async function captureElement(
    node: HTMLElement,
    options: CaptureOptions = {},
): Promise<CaptureResult> {
    const {format, scale, padding} = {...defaultCaptureOptions, ...options};
    await waitForRenderSettled();
    const background = captureBackground(node, options.background);

    const rect = node.getBoundingClientRect();
    const box = contentBox(node);
    const width = Math.ceil(box.right - box.left) + 2 * padding;
    const height = Math.ceil(box.bottom - box.top) + 2 * padding;

    /*
     * `html-to-image` sizes the clone to `width`/`height` and applies `style`
     * on top. Shifting by the measured overhang as well as the padding seats
     * the content inside that larger box, rather than letting whatever spills
     * past the container's own origin fall outside the frame.
     *
     * The positioning is neutralised because the clone inherits the original's
     * inline style, offsets included. An off-screen render target parked at
     * `left: -100000px` would otherwise be cloned still parked, land far
     * outside the frame, and capture as a blank image. `relative` rather than
     * `static`, since the overlay and annotation layers are positioned against
     * this element.
     */
    const shared = {
        width,
        height,
        backgroundColor: background ?? undefined,
        fontEmbedCSS: await fontEmbedCSS(node),
        style: {
            backgroundColor: background ?? 'transparent',
            position: 'relative',
            left: '0px',
            top: '0px',
            transform: `translate(${padding + rect.left - box.left}px, `
                + `${padding + rect.top - box.top}px)`,
            transformOrigin: 'top left',
        },
    };

    const dataUrl = format === 'svg'
        ? await htmlToImage.toSvg(node, shared)
        : await htmlToImage.toPng(node, {...shared, pixelRatio: scale});

    const {mime, body, base64} = splitDataUrl(dataUrl);
    return {
        mime,
        payload: base64 ? body : decodeURIComponent(body),
        encoding: base64 ? 'base64' : 'utf-8',
        width,
        height,
    };
}
