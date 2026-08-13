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
    /** CSS colour, or `null` for a transparent background. */
    background?: string | null;
}

export const defaultCaptureOptions = {
    format: 'png',
    scale: 2,
    padding: 16,
    background: '#ffffff',
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

/**
 * The box actually occupied by `node` and everything inside it, in viewport
 * coordinates.
 *
 * Not the same as `node.getBoundingClientRect()`. `HTMLDrawHandler` places its
 * SVG layers at a negative offset from the diagram container and sizes them
 * past its far edge, so the drawing overhangs its own container - currently by
 * `BUFFER` on each side. Measuring the union rather than assuming a number
 * keeps the capture correct if that offset ever changes.
 */
export function contentBox(node: HTMLElement): Box {
    const rect = node.getBoundingClientRect();
    const box: Box = {
        left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
    };
    for (const child of Array.from(node.querySelectorAll('*'))) {
        const q = child.getBoundingClientRect();
        // Zero-area elements are structural - anchors, wire stubs, spacers -
        // and several sit at the origin, which would drag the box out.
        if (q.width === 0 && q.height === 0) {
            continue;
        }
        box.left = Math.min(box.left, q.left);
        box.top = Math.min(box.top, q.top);
        box.right = Math.max(box.right, q.right);
        box.bottom = Math.max(box.bottom, q.bottom);
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

export async function captureElement(
    node: HTMLElement,
    options: CaptureOptions = {},
): Promise<CaptureResult> {
    const {format, scale, padding, background} = {...defaultCaptureOptions, ...options};
    await waitForRenderSettled();

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
