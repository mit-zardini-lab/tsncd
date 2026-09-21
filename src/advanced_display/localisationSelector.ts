// Claude Opus 5, effort high.
/*
 * The control that switches the page between the wordings it carries.
 *
 * A page written by `pyncd`'s `websocket_transfer/standalone_page.py` may hold
 * a `tsncd-localisations` element beside its message, and the control draws one
 * button per wording in the order of that element. Clicking a button writes
 * that wording's descriptions onto the auxiliary information of the rendered
 * figure, through `localisedDescriptions.ts`, and writes the text of every open
 * inspection box again. The figure itself is not drawn again, so the layout,
 * the locked boxes and the locked highlights all stand.
 *
 * The control is placed beside the heading of the page rather than inside the
 * diagram container, because `capture.contentBox` measures the union over
 * every descendant of the container and a captured image would hold the
 * buttons. It is built once, from the element carried by the page, and holds
 * the chosen wording between visits in `localStorage`.
 */

import * as localisedDescriptions from './localisedDescriptions';
import * as inspectionBoxes from './inspectionBoxes';
import type * as aux from './AuxiliaryInformation';

const STORAGE_KEY = 'tsncd-localisation';
const ACTIVE_OPACITY = '1';
const INACTIVE_OPACITY = '0.55';

/**
 * Draw the control after `heading`, and answer with the function that applies a
 * wording by name.
 *
 * A page that carries no wordings, and a page rendered without auxiliary
 * information, are each given a function that does nothing, so `window.tsncd`
 * holds the same control surface whatever the page carries. The buttons are
 * drawn only where there are two wordings to choose between.
 */
export function attach_localisation_selector(
    heading: HTMLElement,
    container: HTMLElement,
    auxiliary: aux.DiagramAuxiliary | undefined,
    embedded: aux.EmbeddedLocalisations | undefined,
): (name: string) => void {
    if (auxiliary === undefined || embedded === undefined) {
        return (): void => undefined;
    }
    const table = embedded.localisations;
    const names = Object.keys(table);
    const descriptions =
        new localisedDescriptions.DescriptionLocalisations(auxiliary);
    const buttons = new Map<string, HTMLButtonElement>();

    function mark_chosen(name: string): void {
        buttons.forEach((button: HTMLButtonElement, key: string) => {
            const chosen = key === name;
            button.style.opacity = chosen ? ACTIVE_OPACITY : INACTIVE_OPACITY;
            button.style.fontWeight = chosen ? '600' : '400';
            button.setAttribute('aria-pressed', String(chosen));
        });
    }

    function localise(name: string): void {
        const localisation = table[name];
        if (localisation === undefined) {
            return;
        }
        descriptions.apply_localisation(localisation);
        mark_chosen(name);
        inspectionBoxes.refill_open_boxes(container);
        remember_localisation(name);
    }

    names.forEach((name: string) =>
        buttons.set(name, localisation_button(name, localise)));
    if (names.length > 1) {
        heading.insertAdjacentElement(
            'afterend', selector_node([...buttons.values()]));
    }
    const remembered = remembered_localisation();
    if (remembered !== null && table[remembered] !== undefined) {
        localise(remembered);
    } else {
        mark_chosen(embedded.default);
    }
    return localise;
}

function selector_node(buttons: HTMLButtonElement[]): HTMLDivElement {
    const node = document.createElement('div');
    node.className = 'localisation-selector';
    node.style.display = 'flex';
    node.style.flexDirection = 'row';
    node.style.flexWrap = 'wrap';
    node.style.gap = '6px';
    node.style.margin = '0px 0px 12px 0px';
    buttons.forEach((button: HTMLButtonElement) => node.appendChild(button));
    return node;
}

/*
 * One wording, drawn in the colours of the page.
 *
 * `termPass` paints the surface of the display target in the colours of the
 * diagram, and the surface is the body of the page, so a button written with
 * `inherit` and `currentColor` reads in a light figure and in a dark one.
 *
 * The click is stopped at the button. A click answered by the page outside
 * every inspection box closes them all, and a reader who switches the wording
 * is asking to read the locked boxes in the new wording.
 */
function localisation_button(
    name: string,
    localise: (name: string) => void,
): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'localisation-button';
    button.textContent = name;
    button.style.margin = '0px';
    button.style.padding = '4px 10px';
    button.style.cursor = 'pointer';
    button.style.color = 'inherit';
    button.style.backgroundColor = 'transparent';
    button.style.border = '1px solid currentColor';
    button.style.borderRadius = '4px';
    button.style.font = 'inherit';
    button.style.fontSize = '0.8rem';
    button.addEventListener('click', (event: MouseEvent) => {
        event.stopPropagation();
        localise(name);
    });
    return button;
}

/* A browser that blocks storage for the page throws on the read and on the
 * write, and the page then opens in the wording it was exported with. */
function remembered_localisation(): string | null {
    try {
        return window.localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

function remember_localisation(name: string): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, name);
    } catch {
        return;
    }
}
