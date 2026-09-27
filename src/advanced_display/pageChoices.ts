// Claude Opus 5.5 (1M context), effort 40.
/*
 * The choice of variant, form and theme a page is asked for, checked strictly,
 * and the address that states the variant, the form and the theme on display.
 *
 * A page reads five query parameters of its address: `variant`, `form`,
 * `darkMode`, `controls` and `displayMode`. `choice_requested_by_address`
 * refuses an address that names another parameter, sets one parameter twice,
 * or sets a parameter to a value it may not take, and the page then draws no
 * figure. A page offers its variants for choice only where it carries two or
 * more, so a page holding one figure takes no `variant`. `checked_choice`
 * applies the same rules to the fields of a `tsncd-display` message and to the
 * argument of `window.tsncd.display`, whose values are typed rather than
 * written as text. A refusal names the parameter, the value and the values
 * accepted, and `make_page_switch` changes nothing on a refused choice.
 *
 * `address_of_state` writes the variant, the form and the theme on display
 * into an address and keeps the `controls` and the `displayMode` it carried,
 * so an address copied from the page draws the same figure for any reader,
 * whatever the theme of the reader's system. `PROTOCOL.md` states the rules under *A page that
 * reads its address strictly and reports its state to a host*.
 */
import * as rhs from '../display/Render/RenderHandlerSettings';
import type * as displaySelector from './displaySelector';

export const DISPLAY_MESSAGE_TYPE = 'tsncd-display';

export const ADDRESS_PARAMETERS = [
    'variant', 'form', 'darkMode', 'controls', 'displayMode',
] as const;
export type AddressParameter = typeof ADDRESS_PARAMETERS[number];

export const CHOICE_FIELDS = ['variant', 'form', 'darkMode'] as const;
export type ChoiceField = typeof CHOICE_FIELDS[number];

/* A choice of the variant, the form and the theme. A field left out is left
 * as it is. */
export interface PageChoice extends displaySelector.DisplayChoice {
    variant?: string;
}

/* What the address of a page asks for. */
export interface AddressedChoice extends displaySelector.AddressedSettings {
    variant?: string;
}

/* The variant, the form and the theme a page has on display. `variant` is
 * null on a page that offers no variants. */
export interface PageState {
    variant: string | null;
    form: rhs.DiagramForm;
    darkMode: boolean;
}

/*
 * Why a choice was refused. An `unread-parameter` names a parameter the page
 * does not read, and `accepted` lists the parameters it reads. A
 * `repeated-parameter` is set more than once, and `value` lists its values. A
 * `refused-value` is set to a value outside `accepted`, which is empty for a
 * `variant` on a page that offers none.
 */
export type RefusalKind = 'unread-parameter' | 'repeated-parameter' | 'refused-value';

export interface Refusal {
    kind: RefusalKind;
    parameter: string;
    value: unknown;
    accepted: readonly unknown[];
}

export class RefusedChoice extends Error {
    constructor(readonly refusal: Refusal) {
        super(refusal_text(refusal));
    }
}

function quoted(value: unknown): string {
    return JSON.stringify(value) ?? String(value);
}

function listed(values: readonly unknown[], conjunction: string): string {
    const words = values.map(quoted);
    return words.length < 2
        ? words.join('')
        : `${words.slice(0, -1).join(', ')} ${conjunction} ${words[words.length - 1]}`;
}

/* The refusal in sentences, as the page writes it where its figure would
 * stand and as a refused call to `window.tsncd.display` rejects with it. */
export function refusal_text(refusal: Refusal): string {
    const {parameter, value, accepted} = refusal;
    switch (refusal.kind) {
        case 'unread-parameter':
            return `The page does not read the parameter ${quoted(parameter)}, which is `
                + `set to ${quoted(value)}. It reads ${listed(accepted, 'and')}.`;
        case 'repeated-parameter':
            return `The parameter ${quoted(parameter)} is set to ${listed(
                value as readonly unknown[], 'and')}. It may be set once.`;
        case 'refused-value':
            return accepted.length === 0
                ? `The parameter ${quoted(parameter)} is set to ${quoted(value)}. The page `
                    + `carries one figure, so it takes no ${quoted(parameter)}.`
                : `The parameter ${quoted(parameter)} is set to ${quoted(value)}. It takes `
                    + `${listed(accepted, 'or')}.`;
    }
}

function is_address_parameter(name: string): name is AddressParameter {
    return ADDRESS_PARAMETERS.some((parameter) => parameter === name);
}

function is_choice_field(name: string): name is ChoiceField {
    return CHOICE_FIELDS.some((field) => field === name);
}

function values_written_for(
    parameter: AddressParameter,
    offered_variants: readonly string[],
): readonly string[] {
    switch (parameter) {
        case 'variant':
            return offered_variants;
        case 'form':
            return rhs.DIAGRAM_FORMS;
        case 'darkMode':
            return ['true', 'false'];
        case 'controls':
            return rhs.PAGE_CONTROLS;
        case 'displayMode':
            return rhs.DISPLAY_MODES;
    }
}

function values_taken_by(
    field: ChoiceField,
    offered_variants: readonly string[],
): readonly unknown[] {
    switch (field) {
        case 'variant':
            return offered_variants;
        case 'form':
            return rhs.DIAGRAM_FORMS;
        case 'darkMode':
            return [true, false];
    }
}

function refusal_of_address_parameter(
    name: string,
    values: readonly string[],
    offered_variants: readonly string[],
): Refusal | undefined {
    if (!is_address_parameter(name)) {
        return {
            kind: 'unread-parameter', parameter: name, value: values[0],
            accepted: ADDRESS_PARAMETERS,
        };
    }
    const accepted = values_written_for(name, offered_variants);
    if (values.length > 1) {
        return {kind: 'repeated-parameter', parameter: name, value: values, accepted};
    }
    return accepted.includes(values[0])
        ? undefined
        : {kind: 'refused-value', parameter: name, value: values[0], accepted};
}

/**
 * What the query parameters of `address` ask for. `offered_variants` are the
 * ids of the variants the page offers for choice. It throws `RefusedChoice`
 * for the first parameter, in the order the address writes them, that the
 * page does not read, that is set twice, or that holds a value it may not
 * take.
 */
export function choice_requested_by_address(
    address: string,
    offered_variants: readonly string[],
): AddressedChoice {
    const parameters = new URL(address).searchParams;
    const names = [...new Set(parameters.keys())];
    const refusal = names
        .map((name) => refusal_of_address_parameter(
            name, parameters.getAll(name), offered_variants))
        .find((found) => found !== undefined);
    if (refusal !== undefined) {
        throw new RefusedChoice(refusal);
    }
    const variant = parameters.get('variant');
    const form = parameters.get('form') as rhs.DiagramForm | null;
    const dark_mode = parameters.get('darkMode');
    const controls = parameters.get('controls') as rhs.PageControls | null;
    const display_mode = parameters.get('displayMode') as rhs.DisplayMode | null;
    return {
        ...(variant === null ? {} : {variant}),
        ...(form === null ? {} : {form}),
        ...(dark_mode === null ? {} : {darkMode: dark_mode === 'true'}),
        ...(controls === null ? {} : {controls}),
        ...(display_mode === null ? {} : {displayMode: display_mode}),
    };
}

function refusal_of_choice_field(
    name: string,
    value: unknown,
    offered_variants: readonly string[],
): Refusal | undefined {
    if (!is_choice_field(name)) {
        return {kind: 'unread-parameter', parameter: name, value, accepted: CHOICE_FIELDS};
    }
    const accepted = values_taken_by(name, offered_variants);
    return accepted.includes(value)
        ? undefined
        : {kind: 'refused-value', parameter: name, value, accepted};
}

/**
 * `fields` as a choice, after checking every field as the address is checked.
 * A field holding `undefined` is left out. It throws `RefusedChoice` for the
 * first field that is not `variant`, `form` or `darkMode`, or that holds a
 * value its field may not take.
 */
export function checked_choice(
    fields: Readonly<Record<string, unknown>>,
    offered_variants: readonly string[],
): PageChoice {
    const given = Object.entries(fields).filter(([, value]) => value !== undefined);
    const refusal = given
        .map(([name, value]) => refusal_of_choice_field(name, value, offered_variants))
        .find((found) => found !== undefined);
    if (refusal !== undefined) {
        throw new RefusedChoice(refusal);
    }
    return Object.fromEntries(given) as PageChoice;
}

/* The fields besides `type` of a `tsncd-display` message, and nothing where
 * `data` is not one. */
export function fields_of_display_message(
    data: unknown,
): Readonly<Record<string, unknown>> | undefined {
    if (typeof data !== 'object' || data === null || Array.isArray(data)
        || (data as {type?: unknown}).type !== DISPLAY_MESSAGE_TYPE) {
        return undefined;
    }
    return Object.fromEntries(Object.entries(data).filter(([name]) => name !== 'type'));
}

/* The state of a figure drawn with `settings`, merged over the defaults, as
 * the variant `variant`. */
export function state_of_settings(
    variant: string | null,
    settings: rhs.RenderHandlerSettings | undefined,
): PageState {
    const merged = {...rhs.defaultRenderHandlerSettings, ...(settings ?? {})};
    return {
        variant,
        form: merged.form ?? 'all-broadcasted',
        darkMode: merged.darkMode ?? true,
    };
}

/* `address` with its query naming the variant, the form and the theme of
 * `state`, followed by the `controls` and the `displayMode` it carried. */
export function address_of_state(address: string, state: PageState): string {
    const url = new URL(address);
    const kept = (['controls', 'displayMode'] as const).flatMap((name) =>
        url.searchParams.getAll(name).map((value): [string, string] => [name, value]));
    url.search = new URLSearchParams([
        ...(state.variant === null ? [] : [['variant', state.variant] as [string, string]]),
        ['form', state.form],
        ['darkMode', String(state.darkMode)],
        ...kept,
    ]).toString();
    return url.href;
}

/*
 * Write the address of `state` into the address bar of `page` without adding
 * an entry to its history. A sandboxed frame whose origin is opaque may throw
 * on `replaceState`, and the page then keeps the address it was opened with.
 */
export function write_address_of_state(
    page: {location: Pick<Location, 'href'>; history: Pick<History, 'state' | 'replaceState'>},
    state: PageState,
): void {
    const address = address_of_state(page.location.href, state);
    if (address === page.location.href) {
        return;
    }
    try {
        page.history.replaceState(page.history.state, '', address);
    } catch {
        return;
    }
}

export interface PageSwitchContext {
    offered_variants: readonly string[];
    display: displaySelector.DisplaySwitch['display'];
    /* Draws the variant `id` with `choice` applied. A page that offers no
     * variants has none. */
    variant?: (id: string, choice: displaySelector.DisplayChoice) => Promise<void>;
}

/* Applies a choice and resolves once the page has drawn it. It rejects with
 * `RefusedChoice`, having changed nothing, for a choice `checked_choice`
 * refuses. */
export type PageSwitch = (choice: Readonly<Record<string, unknown>>) => Promise<void>;

/*
 * The switch a host, a driving browser and the selector reach. A choice naming
 * a variant is drawn by the variant switch with its form and theme applied to
 * that variant, so the figure is drawn once. A choice naming a form or a theme
 * alone is drawn by the display switch, and a choice naming nothing draws
 * nothing.
 */
export function make_page_switch(context: PageSwitchContext): PageSwitch {
    return async (choice: Readonly<Record<string, unknown>>): Promise<void> => {
        const {variant, ...display_choice} =
            checked_choice(choice, context.offered_variants);
        if (variant !== undefined && context.variant !== undefined) {
            return context.variant(variant, display_choice);
        }
        if (Object.keys(display_choice).length === 0) {
            return;
        }
        return context.display(display_choice);
    };
}
