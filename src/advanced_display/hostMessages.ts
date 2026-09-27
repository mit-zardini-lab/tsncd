// Claude Opus 5.5 (1M context), effort 40.
/*
 * The messages a page held in the frame of a host page exchanges with the
 * host.
 *
 * The lab website embeds a page in a sandboxed iframe and draws its own
 * toolbar above it: a selector of models, the buttons of the form, a toggle of
 * the theme and a selector of variants. The page posts a `tsncd-state` message
 * to the parent of its frame, naming the variant, the form and the theme on
 * display and listing the variants and the groups it offers. It posts one
 * after every draw, one once its own figure is read and before that figure is
 * drawn, and one in answer to every `tsncd-display` message it accepts, once
 * the switch the message asked for has settled. The host switches the page by
 * posting `{type: 'tsncd-display', variant, form, darkMode}` to the frame's
 * window, and `answer_host_messages` hands the fields to the page switch of
 * `pageChoices.ts`. A message the switch refuses changes nothing and is
 * answered with a `tsncd-refused` message naming the parameter, the value and
 * the values accepted. A page whose address is refused posts the same message
 * and draws nothing.
 *
 * A page opened on its own is its own parent and posts nothing. `PROTOCOL.md`
 * states the messages under *A page that reads its address strictly and
 * reports its state to a host*.
 */
import * as pageChoices from './pageChoices';
import type * as embedded_variants from '../data_transfer/embedded_variants';

export const STATE_MESSAGE_TYPE = 'tsncd-state';
export const REFUSED_MESSAGE_TYPE = 'tsncd-refused';

export interface OfferedVariant {
    id: string;
    group: string;
    title: string;
    detail: string;
}

export interface OfferedGroup {
    id: string;
    title: string;
}

/* The variants a page offers for choice, and the groups that hold them in the
 * order the selector draws them. */
export interface OfferedVariants {
    variants: OfferedVariant[];
    groups: OfferedGroup[];
}

export interface StateMessage extends pageChoices.PageState {
    type: typeof STATE_MESSAGE_TYPE;
    variants: OfferedVariant[];
    groups: OfferedGroup[];
}

export interface RefusedMessage {
    type: typeof REFUSED_MESSAGE_TYPE;
    parameter: string;
    value: unknown;
    accepted: unknown[];
}

/* The variants `carried` holds where it holds two or more, and none
 * otherwise, because a page holding one figure offers nothing to choose. A
 * group holding no variant is left out, as the selector leaves it out. */
export function offered_variants(
    carried: embedded_variants.EmbeddedVariants | undefined,
): OfferedVariants {
    if (carried === undefined || carried.variants.length < 2) {
        return {variants: [], groups: []};
    }
    return {
        variants: carried.variants.map(({id, group, title, detail}) =>
            ({id, group, title, detail: detail ?? ''})),
        groups: carried.groups
            .filter((group) => carried.variants.some((variant) => variant.group === group.id))
            .map(({id, title}) => ({id, title})),
    };
}

export function offered_ids(offered: OfferedVariants): string[] {
    return offered.variants.map((variant) => variant.id);
}

export function state_message(
    state: pageChoices.PageState,
    offered: OfferedVariants,
): StateMessage {
    return {type: STATE_MESSAGE_TYPE, ...state, ...offered};
}

export function refused_message(refusal: pageChoices.Refusal): RefusedMessage {
    return {
        type: REFUSED_MESSAGE_TYPE,
        parameter: refusal.parameter,
        value: refusal.value,
        accepted: [...refusal.accepted],
    };
}

/* Whether a frame of another page holds `page`. */
export function is_framed(page: Pick<Window, 'parent'>): boolean {
    return page.parent !== null && page.parent !== page;
}

/* Post `message` to the page whose frame holds `page`, and nothing where no
 * frame holds it. The host's origin is unknown to a page in a sandboxed frame,
 * so the message is posted to any origin, and it carries nothing private. */
export function post_to_host(
    page: Pick<Window, 'parent'>,
    message: StateMessage | RefusedMessage,
): void {
    if (is_framed(page)) {
        page.parent.postMessage(message, '*');
    }
}

export interface HostMessageAnswers {
    switch_page: pageChoices.PageSwitch;
    /* Posts the state on display, once an accepted message has settled. */
    answer_with_state: () => void;
    answer_with_refusal: (refusal: pageChoices.Refusal) => void;
}

/* Answer every `tsncd-display` message posted to `target` through the page
 * switch, with the state once the switch has settled or with the refusal. */
export function answer_host_messages(
    target: Pick<EventTarget, 'addEventListener'>,
    answers: HostMessageAnswers,
): void {
    target.addEventListener('message', (event: Event) => {
        const fields = pageChoices.fields_of_display_message((event as MessageEvent).data);
        if (fields === undefined) {
            return;
        }
        answers.switch_page(fields).then(answers.answer_with_state, (error: unknown) => {
            if (error instanceof pageChoices.RefusedChoice) {
                answers.answer_with_refusal(error.refusal);
                return;
            }
            console.error('A tsncd-display message was not drawn:', error);
        });
    });
}
