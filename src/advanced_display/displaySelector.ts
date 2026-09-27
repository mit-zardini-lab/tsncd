// Claude Opus 5.5 (1M context), effort 40.
/*
 * The switch between the three forms and the two themes of the figure a page
 * holds, and the buttons that work it.
 *
 * The page keeps the last term its display target drew, with the settings and
 * the auxiliary information it was drawn with, and a switch draws that term
 * again through the same `termPass` with the form or the theme changed. Nothing
 * is fetched or parsed again. The pass repaints the surface of the page in the
 * theme of the new settings, and the inspection boxes drop the content they
 * drew for the previous draw once the figure is drawn again. The heading and
 * the localisation selector stand outside the diagram container, so the pass
 * leaves both where they are.
 *
 * The switch is reached three ways. `with_display_controls` draws one row of
 * controls under the heading where the settings of the drawn figure say
 * `controls: shown`: the selector of variants where the page carries several,
 * then the buttons of the form and of the theme. `src/index.ts` hands the
 * switch to a driving script as `window.tsncd.display`, and a `tsncd-display`
 * message a host page posts to the window reaches it through the page switch
 * of `pageChoices.ts`, which checks the choice first.
 *
 * The address alone decides the form and the theme a page's own figure opens
 * in. `settings_for_page` draws it in the all-broadcasted form where the
 * address names no `form`, and in the theme of the system where it names no
 * `darkMode`, whatever the message says. `follow_system_theme` draws the figure
 * again when the system's theme changes, until the address, a reader or a host
 * picks a theme. Nothing is kept in `localStorage`. `PROTOCOL.md` states the
 * mechanism under *A page that switches its form and its theme*.
 */

import * as rhs from '../display/Render/RenderHandlerSettings';
import type * as drt from '../display/diagramRenderTarget';
import type * as aux from './AuxiliaryInformation';

/* The form a page's own figure opens in where its address names none. */
export const FORM_OPENED_WITHOUT_ADDRESS: rhs.DiagramForm = 'all-broadcasted';
export const DARK_SYSTEM_THEME_QUERY = '(prefers-color-scheme: dark)';

/* The settings a switch changes. A field left out is left as it was. */
export interface DisplayChoice {
    form?: rhs.DiagramForm;
    darkMode?: boolean;
}

/* The settings the address of a page may set, which are the two a switch
 * changes, whether the controls are drawn, and the display mode. */
export interface AddressedSettings extends DisplayChoice {
    controls?: rhs.PageControls;
    displayMode?: rhs.DisplayMode;
}

/* The figure a display target drew last, with the settings it was drawn with,
 * merged over the defaults. */
export interface HeldFigure {
    term: drt.DiagramFigure;
    settings: rhs.RenderHandlerSettings;
    auxiliary?: aux.DiagramAuxiliary;
}

/* `choice` with every field that holds no value it may take left out. The
 * address and the messages of a host are checked strictly by `pageChoices.ts`
 * before they reach a switch, so this guards the buttons alone. */
function valid_choice(choice: DisplayChoice): DisplayChoice {
    return {
        ...(rhs.is_diagram_form(choice.form) ? {form: choice.form} : {}),
        ...(typeof choice.darkMode === 'boolean' ? {darkMode: choice.darkMode} : {}),
    };
}

/*
 * The settings a page draws a message of its own with, which is the message
 * written into the page, a variant of it, or the figure it boots with. The
 * form is the all-broadcasted form and the theme is `system_dark_mode`, the
 * theme of the system, whatever the message says, and the address wins over
 * both. A choice a switch made before the page held a figure wins over all,
 * because it was made after the page was opened.
 */
export function settings_for_page(
    own: rhs.RenderHandlerSettings | undefined,
    requested: AddressedSettings,
    system_dark_mode: boolean,
    chosen_before_a_figure: DisplayChoice = {},
): rhs.RenderHandlerSettings {
    return {
        ...(own ?? {}),
        form: FORM_OPENED_WITHOUT_ADDRESS,
        darkMode: system_dark_mode,
        ...requested,
        ...chosen_before_a_figure,
    };
}

export function settings_with_choice(
    settings: rhs.RenderHandlerSettings,
    choice: DisplayChoice,
): rhs.RenderHandlerSettings {
    return {...settings, ...valid_choice(choice)};
}

/* The part of a `MediaQueryList` the page reads the system's theme from. */
export type SystemThemeQuery =
    Pick<MediaQueryList, 'matches'> & Pick<EventTarget, 'addEventListener'>;

/* Whether the system asks for the dark theme, and the dark theme where the
 * browser answers no query, as the page's stylesheet paints it. */
export function system_theme_query(page: Window): SystemThemeQuery | undefined {
    return typeof page.matchMedia === 'function'
        ? page.matchMedia(DARK_SYSTEM_THEME_QUERY) : undefined;
}

export function system_dark_mode(query: SystemThemeQuery | undefined): boolean {
    return query?.matches ?? true;
}

/*
 * `following` reports whether the page still draws in the system's theme, and
 * `stop` ends that for the life of the page, once the address, a reader or a
 * host has picked a theme or a sender has drawn a figure with a theme of its
 * own.
 */
export interface SystemThemeFollower {
    following: () => boolean;
    stop: () => void;
}

/*
 * Call `redraw` with the system's theme each time the system's theme changes,
 * while the follower is following. `following_at_start` is false where the
 * address names a theme.
 */
export function follow_system_theme(
    query: SystemThemeQuery | undefined,
    following_at_start: boolean,
    redraw: (dark_mode: boolean) => void,
): SystemThemeFollower {
    let following = following_at_start;
    query?.addEventListener('change', () => {
        if (following) {
            redraw(query.matches);
        }
    });
    return {
        following: (): boolean => following,
        stop: (): void => {
            following = false;
        },
    };
}

export interface DisplaySwitchContext {
    held: () => HeldFigure | undefined;
    redraw: drt.RenderTarget['termPass'];
    /* Resolves once the page has painted the figure drawn last. */
    settled: () => Promise<void>;
}

/*
 * `display` draws the held figure again with `choice` applied and resolves
 * once the page has painted it. Where the page holds no figure yet, it
 * resolves at once and `chosen_before_a_figure` holds the choice for the
 * message the page draws of its own.
 */
export interface DisplaySwitch {
    display: (choice: DisplayChoice) => Promise<void>;
    chosen_before_a_figure: () => DisplayChoice;
}

export function make_display_switch(context: DisplaySwitchContext): DisplaySwitch {
    let chosen_before_a_figure: DisplayChoice = {};
    return {
        display: async (choice: DisplayChoice): Promise<void> => {
            const valid = valid_choice(choice);
            const held = context.held();
            if (held === undefined) {
                chosen_before_a_figure = {...chosen_before_a_figure, ...valid};
                return;
            }
            context.redraw(
                held.term, settings_with_choice(held.settings, valid), held.auxiliary);
            await context.settled();
        },
        chosen_before_a_figure: (): DisplayChoice => chosen_before_a_figure,
    };
}

/* The name each form and each theme is given on its button, in the order the
 * buttons stand. */
export const FORM_BUTTON_NAMES: Record<rhs.DiagramForm, string> = {
    'arrows-and-boxes': 'Arrows and boxes',
    'arrows-and-broadcasted': 'Arrows and broadcasted',
    'all-broadcasted': 'All broadcasted',
};
export const THEME_BUTTON_NAMES: readonly {name: string; darkMode: boolean}[] = [
    {name: 'Light', darkMode: false},
    {name: 'Dark', darkMode: true},
];

const CHOSEN_OPACITY = '1';
const UNCHOSEN_OPACITY = '0.55';

/*
 * `target` with one row of controls drawn under `heading`: `first_group`,
 * which is the selector of variants where the page carries several, then the
 * buttons of the form and of the theme. The row is shown after a draw whose
 * settings say `controls: shown` and hidden after any other, the first group
 * with it, and wraps where the page is narrower than the row. The form and the
 * theme of the draw are marked. The row is built once, and a click on a
 * button calls `display`.
 */
export function with_display_controls(
    target: drt.RenderTarget,
    heading: HTMLElement,
    display: DisplaySwitch['display'],
    first_group?: HTMLElement,
): drt.RenderTarget {
    const page = heading.ownerDocument;
    const form_buttons = rhs.DIAGRAM_FORMS.map((form) => ({
        chosen: (settings: rhs.RenderHandlerSettings): boolean => settings.form === form,
        button: switch_button(page, FORM_BUTTON_NAMES[form], () => display({form})),
    }));
    const theme_buttons = THEME_BUTTON_NAMES.map(({name, darkMode}) => ({
        chosen: (settings: rhs.RenderHandlerSettings): boolean =>
            settings.darkMode === darkMode,
        button: switch_button(page, name, () => display({darkMode})),
    }));
    const controls = controls_node(page, [
        ...(first_group === undefined ? [] : [first_group]),
        button_group(page, 'Form', form_buttons.map(({button}) => button)),
        button_group(page, 'Theme', theme_buttons.map(({button}) => button)),
    ]);
    heading.insertAdjacentElement('afterend', controls);
    return {
        container: target.container,
        termPass: (term, settings, auxiliary): void => {
            target.termPass(term, settings, auxiliary);
            const drawn = {...rhs.defaultRenderHandlerSettings, ...(settings ?? {})};
            controls.style.display = drawn.controls === 'shown' ? 'flex' : 'none';
            [...form_buttons, ...theme_buttons].forEach(({chosen, button}) =>
                mark_button(button, chosen(drawn)));
        },
    };
}

function controls_node(page: Document, groups: HTMLElement[]): HTMLDivElement {
    const node = page.createElement('div');
    node.className = 'display-selector';
    node.style.display = 'none';
    node.style.flexDirection = 'row';
    node.style.flexWrap = 'wrap';
    node.style.alignItems = 'center';
    node.style.columnGap = '18px';
    node.style.rowGap = '8px';
    node.style.margin = '0px 0px 12px 0px';
    groups.forEach((group) => node.appendChild(group));
    return node;
}

function button_group(
    page: Document,
    name: string,
    buttons: HTMLButtonElement[],
): HTMLDivElement {
    const group = page.createElement('div');
    group.className = 'display-selector-group';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', name);
    group.style.display = 'flex';
    group.style.flexDirection = 'row';
    group.style.flexWrap = 'wrap';
    group.style.alignItems = 'center';
    group.style.gap = '6px';
    const label = page.createElement('span');
    label.textContent = name;
    label.style.fontSize = '0.8rem';
    label.style.opacity = UNCHOSEN_OPACITY;
    group.appendChild(label);
    buttons.forEach((button) => group.appendChild(button));
    return group;
}

/*
 * One button, drawn in the colours of the page as the buttons of the
 * localisation selector are. The click is stopped at the button, because a
 * click the page answers outside every inspection box closes them all.
 */
function switch_button(
    page: Document,
    name: string,
    press: () => Promise<void>,
): HTMLButtonElement {
    const button = page.createElement('button');
    button.type = 'button';
    button.className = 'display-selector-button';
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
        void press();
    });
    return button;
}

function mark_button(button: HTMLButtonElement, chosen: boolean): void {
    button.style.opacity = chosen ? CHOSEN_OPACITY : UNCHOSEN_OPACITY;
    button.style.fontWeight = chosen ? '600' : '400';
    button.setAttribute('aria-pressed', String(chosen));
}
