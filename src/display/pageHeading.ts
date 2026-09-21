// Claude Fable 5.1, effort 80.
/*
 * The heading of the page and the name of its tab.
 *
 * The tab reads `tsncd - <title>` when the settings of the message on display
 * carry a `title`, and `tsncd` when they carry none. The heading holds the same
 * text and is shown under the `heading` setting `title` alone. Under `none`,
 * the default, the page holds the figure alone, so it can stand as a page of a
 * site that writes its own heading above it. Both are written after every
 * draw, because settings are merged over the defaults per message, so a
 * message that sends no title returns the tab to `tsncd` and a message that
 * sends no `heading` hides the heading.
 *
 * Only the display target is given a heading. An off-screen capture and the
 * diagram inside an inspection box draw with the same settings, and neither
 * changes what the page is called.
 */

import type * as rhs from './Render/RenderHandlerSettings';
import type {RenderTarget} from './diagramRenderTarget';

export const PAGE_NAME = 'tsncd';

export function heading_text(title: string | undefined): string {
    return title ? `${PAGE_NAME} - ${title}` : PAGE_NAME;
}

export function shows_heading(
    settings: rhs.RenderHandlerSettings | undefined,
): boolean {
    return settings?.heading === 'title';
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
            heading.hidden = !shows_heading(settings);
            heading.ownerDocument.title = text;
        },
    };
}
