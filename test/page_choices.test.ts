// Claude Opus 5.5 (1M context), effort 40.
/*
 * The strict reading of a page's address and of a choice made by a host page
 * or a driving browser, the address written after every switch, and the page
 * switch that refuses a choice before it changes anything, all of which
 * `src/advanced_display/pageChoices.ts` holds.
 */
import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as page_choices from '../src/advanced_display/pageChoices.ts';
import * as rhs from '../src/display/Render/RenderHandlerSettings.ts';
import type * as display_selector from '../src/advanced_display/displaySelector.ts';

const PAGE = 'https://example.org/diagrams/mixtral/embed.html';
const OFFERED = ['decode-quantised', 'decode-unquantised', 'cached-quantised'];

function refusal_of_address(query: string, offered: readonly string[] = OFFERED):
    page_choices.Refusal {
    try {
        page_choices.choice_requested_by_address(`${PAGE}${query}`, offered);
    } catch (error: unknown) {
        assert.ok(error instanceof page_choices.RefusedChoice, String(error));
        return error.refusal;
    }
    assert.fail(`The address ${query} was accepted.`);
}

test('the address sets the variant, the form, the theme, the controls and the display mode',
     (): void => {
    assert.deepEqual(
        page_choices.choice_requested_by_address(
            `${PAGE}?variant=cached-quantised&form=arrows-and-boxes&darkMode=false`
            + '&controls=hidden&displayMode=fast', OFFERED),
        {
            variant: 'cached-quantised', form: 'arrows-and-boxes', darkMode: false,
            controls: 'hidden', displayMode: 'fast',
        });
    assert.deepEqual(
        page_choices.choice_requested_by_address(`${PAGE}?darkMode=true`, []),
        {darkMode: true});
    assert.deepEqual(page_choices.choice_requested_by_address(PAGE, []), {});
    assert.deepEqual(page_choices.choice_requested_by_address(`${PAGE}?#legend`, []), {});
});

test('an address naming a parameter the page does not read is refused', (): void => {
    assert.deepEqual(refusal_of_address('?colour=1'), {
        kind: 'unread-parameter', parameter: 'colour', value: '1',
        accepted: page_choices.ADDRESS_PARAMETERS,
    });
    assert.equal(refusal_of_address('?form=all-broadcasted&darkmode=true').parameter,
        'darkmode');
});

test('every parameter set to a value it may not take is refused, and nothing falls back',
     (): void => {
    const cases: [string, readonly string[], string, string, readonly unknown[]][] = [
        ['?variant=nope', OFFERED, 'variant', 'nope', OFFERED],
        ['?variant=', OFFERED, 'variant', '', OFFERED],
        ['?variant=decode-quantised', [], 'variant', 'decode-quantised', []],
        ['?form=bad', OFFERED, 'form', 'bad', rhs.DIAGRAM_FORMS],
        ['?form=', OFFERED, 'form', '', rhs.DIAGRAM_FORMS],
        ['?darkMode=yes', OFFERED, 'darkMode', 'yes', ['true', 'false']],
        ['?darkMode=True', OFFERED, 'darkMode', 'True', ['true', 'false']],
        ['?controls=visible', OFFERED, 'controls', 'visible', ['shown', 'hidden']],
        ['?displayMode=FAST', OFFERED, 'displayMode', 'FAST', ['slow', 'fast']],
    ];
    cases.forEach(([query, offered, parameter, value, accepted]) =>
        assert.deepEqual(refusal_of_address(query, offered),
            {kind: 'refused-value', parameter, value, accepted}, query));
});

test('a parameter set twice is refused, even to one value', (): void => {
    assert.deepEqual(refusal_of_address('?form=arrows-and-boxes&form=all-broadcasted'), {
        kind: 'repeated-parameter', parameter: 'form',
        value: ['arrows-and-boxes', 'all-broadcasted'], accepted: rhs.DIAGRAM_FORMS,
    });
    assert.equal(refusal_of_address('?darkMode=true&darkMode=true').kind, 'repeated-parameter');
});

test('the first refused parameter in the order of the address is the one named', (): void => {
    assert.equal(refusal_of_address('?form=bad&colour=1').parameter, 'form');
    assert.equal(refusal_of_address('?colour=1&form=bad').parameter, 'colour');
});

test('the refusal names the parameter, the value and the values accepted', (): void => {
    assert.equal(
        page_choices.refusal_text(refusal_of_address('?form=bad')),
        'The parameter "form" is set to "bad". It takes "arrows-and-boxes", '
        + '"arrows-and-broadcasted" or "all-broadcasted".');
    assert.equal(
        page_choices.refusal_text(refusal_of_address('?variant=nope', ['a', 'b'])),
        'The parameter "variant" is set to "nope". It takes "a" or "b".');
    assert.equal(
        page_choices.refusal_text(refusal_of_address('?variant=a', [])),
        'The parameter "variant" is set to "a". The page carries one figure, so it '
        + 'takes no "variant".');
    assert.equal(
        page_choices.refusal_text(refusal_of_address('?colour=1')),
        'The page does not read the parameter "colour", which is set to "1". It reads '
        + '"variant", "form", "darkMode", "controls" and "displayMode".');
    assert.equal(
        page_choices.refusal_text(refusal_of_address('?form=a&form=b')),
        'The parameter "form" is set to "a" and "b". It may be set once.');
});

test('the address of a state names the variant, the form and the theme, and keeps the rest',
     (): void => {
    assert.equal(
        page_choices.address_of_state(
            `${PAGE}?variant=decode-quantised&form=all-broadcasted&controls=hidden`
            + '&displayMode=fast#legend',
            {variant: 'cached-quantised', form: 'arrows-and-boxes', darkMode: false}),
        `${PAGE}?variant=cached-quantised&form=arrows-and-boxes&darkMode=false`
        + '&controls=hidden&displayMode=fast#legend');
    assert.equal(
        page_choices.address_of_state(
            PAGE, {variant: null, form: 'all-broadcasted', darkMode: true}),
        `${PAGE}?form=all-broadcasted&darkMode=true`);
});

test('an address written from a state reads back as that state', (): void => {
    const states: page_choices.PageState[] = [
        {variant: 'decode-unquantised', form: 'arrows-and-broadcasted', darkMode: true},
        {variant: 'cached-quantised', form: 'all-broadcasted', darkMode: false},
    ];
    states.forEach((state) => {
        const address = page_choices.address_of_state(`${PAGE}?controls=shown`, state);
        const {variant, form, darkMode, controls} =
            page_choices.choice_requested_by_address(address, OFFERED);
        assert.deepEqual({variant, form, darkMode, controls}, {...state, controls: 'shown'});
    });
});

/* A window whose address is `href`, and which records every address written
 * into its history. */
function window_at(href: string, refuses_rewriting = false): {
    location: {href: string};
    history: {state: unknown; replaceState: History['replaceState']};
    written: string[];
} {
    const page = {
        location: {href},
        written: [] as string[],
        history: {
            state: {kept: true},
            replaceState: (state: unknown, _unused: string, address?: string | URL | null) => {
                if (refuses_rewriting) {
                    throw new DOMException('The operation is insecure.', 'SecurityError');
                }
                assert.deepEqual(state, {kept: true});
                page.written.push(String(address));
                page.location.href = String(address);
            },
        },
    };
    return page;
}

test('the address is written after each switch without adding to the history', (): void => {
    const page = window_at(`${PAGE}?controls=hidden`);

    page_choices.write_address_of_state(
        page, {variant: 'decode-quantised', form: 'all-broadcasted', darkMode: false});
    page_choices.write_address_of_state(
        page, {variant: 'decode-quantised', form: 'arrows-and-boxes', darkMode: false});
    page_choices.write_address_of_state(
        page, {variant: 'cached-quantised', form: 'arrows-and-boxes', darkMode: false});
    page_choices.write_address_of_state(
        page, {variant: 'cached-quantised', form: 'arrows-and-boxes', darkMode: false});

    assert.deepEqual(page.written, [
        `${PAGE}?variant=decode-quantised&form=all-broadcasted&darkMode=false&controls=hidden`,
        `${PAGE}?variant=decode-quantised&form=arrows-and-boxes&darkMode=false&controls=hidden`,
        `${PAGE}?variant=cached-quantised&form=arrows-and-boxes&darkMode=false&controls=hidden`,
    ]);
});

test('a frame that may not rewrite its address keeps the one it was opened with', (): void => {
    const page = window_at(PAGE, true);

    assert.doesNotThrow(() => page_choices.write_address_of_state(
        page, {variant: null, form: 'all-broadcasted', darkMode: true}));
    assert.equal(page.location.href, PAGE);
});

test('a choice is checked as the address is, with typed values', (): void => {
    assert.deepEqual(
        page_choices.checked_choice(
            {variant: 'cached-quantised', form: 'arrows-and-boxes', darkMode: false}, OFFERED),
        {variant: 'cached-quantised', form: 'arrows-and-boxes', darkMode: false});
    assert.deepEqual(page_choices.checked_choice({form: undefined}, OFFERED), {});
    const refusals: [Record<string, unknown>, Partial<page_choices.Refusal>][] = [
        [{variant: 'nope'}, {parameter: 'variant', value: 'nope', accepted: OFFERED}],
        [{form: 'arrows'}, {parameter: 'form', value: 'arrows'}],
        [{darkMode: 'false'}, {parameter: 'darkMode', value: 'false', accepted: [true, false]}],
        [{width: 900}, {kind: 'unread-parameter', parameter: 'width', value: 900}],
        [{variant: null}, {parameter: 'variant', value: null}],
    ];
    refusals.forEach(([choice, expected]) => assert.throws(
        () => page_choices.checked_choice(choice, OFFERED),
        (error: unknown) => error instanceof page_choices.RefusedChoice
            && Object.entries(expected).every(([key, value]) =>
                JSON.stringify(error.refusal[key as keyof page_choices.Refusal])
                    === JSON.stringify(value)),
        JSON.stringify(choice)));
});

test('a tsncd-display message gives its fields and no other message does', (): void => {
    assert.deepEqual(
        page_choices.fields_of_display_message(
            {type: 'tsncd-display', variant: 'a', form: 'arrows-and-boxes'}),
        {variant: 'a', form: 'arrows-and-boxes'});
    assert.deepEqual(page_choices.fields_of_display_message({type: 'tsncd-display'}), {});
    assert.equal(page_choices.fields_of_display_message({type: 'resize'}), undefined);
    assert.equal(page_choices.fields_of_display_message('tsncd-display'), undefined);
    assert.equal(page_choices.fields_of_display_message(null), undefined);
});

interface SwitchCalls {
    displayed: display_selector.DisplayChoice[];
    variants: [string, display_selector.DisplayChoice][];
}

function page_switch_over(offered: readonly string[]): {
    switch_page: page_choices.PageSwitch;
    calls: SwitchCalls;
} {
    const calls: SwitchCalls = {displayed: [], variants: []};
    const switch_page = page_choices.make_page_switch({
        offered_variants: offered,
        display: async (choice): Promise<void> => {
            calls.displayed.push(choice);
        },
        ...(offered.length ? {
            variant: async (id: string, choice: display_selector.DisplayChoice) => {
                calls.variants.push([id, choice]);
            },
        } : {}),
    });
    return {switch_page, calls};
}

test('a variant named with a form is drawn once, in that form', async (): Promise<void> => {
    const {switch_page, calls} = page_switch_over(OFFERED);

    await switch_page({variant: 'cached-quantised', form: 'arrows-and-boxes'});
    await switch_page({darkMode: false});

    assert.deepEqual(calls.variants, [['cached-quantised', {form: 'arrows-and-boxes'}]]);
    assert.deepEqual(calls.displayed, [{darkMode: false}]);
});

test('a refused choice rejects and changes nothing', async (): Promise<void> => {
    const {switch_page, calls} = page_switch_over(OFFERED);

    await assert.rejects(switch_page({variant: 'nope', form: 'arrows-and-boxes'}),
        page_choices.RefusedChoice);
    await assert.rejects(switch_page({variant: 'cached-quantised', form: 'bad'}),
        /"form" is set to "bad"/);
    await assert.rejects(page_switch_over([]).switch_page({variant: 'cached-quantised'}),
        /carries one figure/);

    assert.deepEqual(calls, {displayed: [], variants: []});
});
