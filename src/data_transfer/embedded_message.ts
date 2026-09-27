// Claude Fable 5.1, effort 80. The reading of `displayMode` from the address moved
// to `advanced_display/pageChoices.ts` by Claude Opus 5.5 (1M context), effort 40,
// on 2026-09-27, where the address is checked strictly.
/*
 * A `dataUpdate` written into the page itself.
 *
 * `pyncd`'s `websocket_transfer/standalone_page.py` writes a copy of the built
 * page with the bundle inlined and one `dataUpdate` in a `script` element of
 * type `application/json`. A page holding that element draws the message and
 * opens no connection. The file is therefore read with no server and no
 * network, and a server on port 8765 cannot replace its figure.
 * `PROTOCOL.md` states the form under *A page that carries its own message*.
 */

import type * as diagram_protocol from './diagram_protocol';

export const EMBEDDED_MESSAGE_ID = 'tsncd-embedded-message';

/* The message written into `page`, as it is written. The page applies what
 * its address asks for, the `displayMode` among it, when it draws the
 * message. */
export function read_embedded_message(
    page: Document,
): diagram_protocol.DataUpdate | undefined {
    const element = page.getElementById(EMBEDDED_MESSAGE_ID);
    if (element === null) {
        return undefined;
    }
    return JSON.parse(element.textContent ?? '') as diagram_protocol.DataUpdate;
}
