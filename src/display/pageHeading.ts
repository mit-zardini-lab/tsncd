// Claude Fable 5.1, effort 80.
/*
 * The heading of the page and the name of its tab.
 *
 * Both read `tsncd - <title>` when the settings of the message on display carry
 * a `title`, and `tsncd` when they carry none. The text is written after every
 * draw, because settings are merged over the defaults per message, so a message
 * that sends no title returns the heading to `tsncd`.
 *
 * Only the display target is given a heading. An off-screen capture and the
 * diagram inside an inspection box draw with the same settings, and neither
 * changes what the page is called.
 */

import type {RenderTarget} from './diagramRenderTarget';

export const PAGE_NAME = 'tsncd';

export function heading_text(title: string | undefined): string {
    return title ? `${PAGE_NAME} - ${title}` : PAGE_NAME;
}

export function with_page_heading(
    target: RenderTarget,
    heading: HTMLElement,
): RenderTarget {
    return {
        container: target.container,
        termPass: (term, settings, auxiliary): void => {
            target.termPass(term, settings, auxiliary);
            const text = heading_text(settings?.title);
            heading.textContent = text;
            heading.ownerDocument.title = text;
        },
    };
}
