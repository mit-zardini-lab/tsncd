// Claude Fable 5.1, effort 80.
/*
 * The screen a page shows until its first figure is drawn.
 *
 * `public/index.html` paints the page in the canvas colour of the dark theme
 * from its own stylesheet and holds a turning ring in the element
 * `page-loading`, so a page that is still fetching its message, parsing the
 * message written into it or drawing its figure is never a white page. The
 * bundle that holds the theme has not run when the page is first painted, so
 * the stylesheet carries the colour on its own. `paint_surface` repaints the
 * page in the theme of the message once the message is known and before its
 * term is built, so a light figure arrives on a light page. The first draw
 * through `with_loading_screen` removes the ring, and a page whose figure
 * cannot be drawn writes the reason where the ring stood.
 */

import * as rhs from './Render/RenderHandlerSettings';
import * as DiagramTheme from './Render/DiagramTheme';
import type {RenderTarget} from './diagramRenderTarget';

export const LOADING_SCREEN_ID = 'page-loading';

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

/** `target` with the loading screen removed once a figure has been drawn. */
export function with_loading_screen(
    target: RenderTarget,
    screen: HTMLElement | null,
): RenderTarget {
    return {
        container: target.container,
        termPass: (term, settings, auxiliary): void => {
            target.termPass(term, settings, auxiliary);
            screen?.remove();
        },
    };
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
 * Resolves two frames on, once the browser has painted the ring, so a draw
 * that holds the thread for seconds starts on a page that already shows it.
 */
export function after_the_screen_has_painted(): Promise<void> {
    return new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}
