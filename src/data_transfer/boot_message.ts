// Claude Opus 5 (1M context), effort high.
/*
 * The figure a page draws when no sender has chosen one.
 *
 * The file holds a `dataUpdate` exactly as the relay relays one, with `data`,
 * `settings` and `auxiliary`, so the boot figure reaches the screen through the
 * code path every later message takes and its legend and its inspection boxes
 * answer the pointer. `pyncd`'s
 * `notebooks/sota/DeepSeekV41Flash.ipynb` builds the message,
 * in the cell that asks for `DiagramMode.BROWSER`.
 *
 * The message is fetched rather than written into the bundle. The term runs to
 * 6.9 MB and the auxiliary information to a further 6.2 MB, which webpack would
 * otherwise parse on every build and every browser would parse before running a
 * line of the renderer. `webpack.config.js` writes the file into `dist/` beside
 * the bundle, and `PROTOCOL.md` states the path under *The figure a page boots
 * with*.
 */

import type * as diagram_protocol from './diagram_protocol';

export const BOOT_MESSAGE_URL =
    '/json_files/deepseek_v41_flash_text_only_quantised.json';

export async function fetch_boot_message(
    url: string = BOOT_MESSAGE_URL,
): Promise<diagram_protocol.DataUpdate> {
    const answer = await fetch(url);
    if (!answer.ok) {
        throw new Error(
            `The boot message at ${url} answered `
            + `${answer.status} ${answer.statusText}.`);
    }
    return await answer.json() as diagram_protocol.DataUpdate;
}
