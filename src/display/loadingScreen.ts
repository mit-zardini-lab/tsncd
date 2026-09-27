// Claude Fable 5.1, effort 80. `show_loading_screen` and the line of text under
// the ring added by Claude Opus 5.5 (1M context), effort 40, on 2026-09-27.
/*
 * The screen a page shows until its first figure is drawn, and again while it
 * prepares another variant of its model.
 *
 * `public/index.html` paints the page in the canvas colour of the dark theme
 * from its own stylesheet and holds a turning ring in the element
 * `page-loading`, so a page that is still fetching its message, parsing the
 * message written into it or drawing its figure is never a white page. The
 * bundle that holds the theme has not run when the page is first painted, so
 * the stylesheet carries the colour on its own. `paint_surface` repaints the
 * page in the theme of the message once the message is known and before its
 * term is built, so a light figure arrives on a light page. Every draw through
 * `with_loading_screen` removes the element, and a page whose figure cannot be
 * drawn writes the reason where the ring stood.
 *
 * A page carrying several variants decodes, imports and derives a variant
 * after its first figure is drawn. `show_loading_screen` puts the element
 * back, over the figure and in the canvas colour of the page, with a line of
 * text under the ring saying what the page is doing. The element is removed
 * once the variant is drawn, so a driving browser that waits for
 * `#page-loading` to be gone waits for a variant as it waits for the first
 * figure.
 *
 * A page whose address is refused draws no figure, and
 * `report_refused_address` writes, where the ring stood, which parameter was
 * refused, the value it held and the values it takes.
 */

import * as rhs from './Render/RenderHandlerSettings';
import * as DiagramTheme from './Render/DiagramTheme';
import type {RenderTarget} from './diagramRenderTarget';

export const LOADING_SCREEN_ID = 'page-loading';
const LOADING_SCREEN_CLASS = 'page-loading';
const LOADING_RING_CLASS = 'page-loading-ring';
const LOADING_TEXT_CLASS = 'page-loading-text';
/* Above the figure, the variant selector and every inspection box, whose
 * z-index is 2147483000. */
const LOADING_SCREEN_Z_INDEX = '2147483200';

/**
 * Paint `surface` in the colours a figure drawn with `settings` stands on, and
 * name the colour scheme of the document, which the scrollbars of the page are
 * drawn from.
 */
export function paint_surface(
    surface: HTMLElement,
    settings: rhs.RenderHandlerSettings | undefined,
): void {
    const merged = {...rhs.defaultRenderHandlerSettings, ...(settings ?? {})};
    const colours = DiagramTheme.surfaceColors(merged);
    surface.style.backgroundColor = colours.backgroundColor;
    surface.style.color = colours.color;
    surface.ownerDocument.documentElement.style.colorScheme =
        DiagramTheme.colorScheme(merged);
}

/** `target` with the loading screen of `page` removed after every draw. */
export function with_loading_screen(
    target: RenderTarget,
    page: Document,
): RenderTarget {
    return {
        container: target.container,
        termPass: (term, settings, auxiliary): void => {
            target.termPass(term, settings, auxiliary);
            page.getElementById(LOADING_SCREEN_ID)?.remove();
        },
    };
}

function new_loading_screen(page: Document): HTMLElement {
    const screen = page.createElement('div');
    screen.id = LOADING_SCREEN_ID;
    screen.className = LOADING_SCREEN_CLASS;
    const ring = page.createElement('div');
    ring.className = LOADING_RING_CLASS;
    screen.appendChild(ring);
    page.body.appendChild(screen);
    return screen;
}

function text_line_of(screen: HTMLElement): HTMLElement {
    const existing = screen.querySelector<HTMLElement>(`.${LOADING_TEXT_CLASS}`);
    if (existing !== null) {
        return existing;
    }
    const line = screen.ownerDocument.createElement('p');
    line.className = LOADING_TEXT_CLASS;
    screen.appendChild(line);
    return line;
}

/**
 * Show the loading screen of `page` with `text` under the ring, over whatever
 * the page holds, and resolve once the browser has painted it.
 */
export async function show_loading_screen(page: Document, text: string): Promise<void> {
    const screen = page.getElementById(LOADING_SCREEN_ID) ?? new_loading_screen(page);
    if (screen.querySelector(`.${LOADING_RING_CLASS}`) === null) {
        screen.replaceChildren();
        const ring = page.createElement('div');
        ring.className = LOADING_RING_CLASS;
        screen.appendChild(ring);
    }
    screen.style.backgroundColor = page.body.style.backgroundColor;
    screen.style.zIndex = LOADING_SCREEN_Z_INDEX;
    screen.style.pointerEvents = 'auto';
    text_line_of(screen).textContent = text;
    await after_the_screen_has_painted();
}

/** The reason no figure was drawn, written where the ring stood. */
export function report_loading_failure(
    screen: HTMLElement | null,
    error: unknown,
): void {
    if (screen === null) {
        return;
    }
    screen.replaceChildren();
    screen.textContent = `The figure was not drawn: ${String(error)}`;
}

/**
 * The reason a page drew nothing for its address, written where the ring
 * stood as one paragraph per line, which the reader can select and copy.
 */
export function report_refused_address(
    screen: HTMLElement | null,
    lines: readonly string[],
): void {
    if (screen === null) {
        return;
    }
    const page = screen.ownerDocument;
    screen.replaceChildren(...lines.map((line) => {
        const paragraph = page.createElement('p');
        paragraph.className = LOADING_TEXT_CLASS;
        paragraph.textContent = line;
        return paragraph;
    }));
    screen.setAttribute('role', 'alert');
    screen.style.pointerEvents = 'auto';
}

/**
 * Resolves two frames on, once the browser has painted the ring, so a draw
 * that holds the thread for seconds starts on a page that already shows it.
 */
export function after_the_screen_has_painted(): Promise<void> {
    return new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
