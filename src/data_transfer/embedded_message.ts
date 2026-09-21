// Claude Fable 5.1, effort 80.
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

export function read_embedded_message(
    page: Document,
): diagram_protocol.DataUpdate | undefined {
    const element = page.getElementById(EMBEDDED_MESSAGE_ID);
    if (element === null) {
        return undefined;
    }
    return JSON.parse(element.textContent ?? '') as diagram_protocol.DataUpdate;
}
