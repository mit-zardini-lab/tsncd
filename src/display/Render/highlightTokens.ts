// Claude Fable 5.1, effort 80.
/*
 * The tokens under which the boxes of a figure share a highlight on the render
 * handler's registry. A module outside the renderer holds a highlight by
 * setting a source under the same token, so this module imports nothing at
 * runtime and every importer sits outside the renderer's import cycle.
 */

import type * as cat from '../../data_structure/Category';

/** The token every box drawn for one block shares, so a hover on any of them,
 * or a hold placed from outside the renderer, lights them all. */
export function block_highlight_token(tag: cat.BlockTag): string {
    return `block:${tag.uid._id}`;
}
