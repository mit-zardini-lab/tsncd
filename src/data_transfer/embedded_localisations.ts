// Claude Opus 5, effort high.
/*
 * The wordings a page carries beside its own message.
 *
 * `pyncd`'s `websocket_transfer/standalone_page.py` writes the element after
 * the embedded `dataUpdate` and before the bundle. Its text holds one
 * localisation per wording, each the difference from the exported
 * descriptions, so a reader switches the wording of every inspection box
 * without a server and without a second figure.
 * `PROTOCOL.md` states the form under *A page that carries its own message*.
 */

import type * as aux from '../advanced_display/AuxiliaryInformation';

export const EMBEDDED_LOCALISATIONS_ID = 'tsncd-localisations';

export function read_embedded_localisations(
    page: Document,
): aux.EmbeddedLocalisations | undefined {
    const element = page.getElementById(EMBEDDED_LOCALISATIONS_ID);
    if (element === null) {
        return undefined;
    }
    return JSON.parse(element.textContent ?? '') as aux.EmbeddedLocalisations;
}
