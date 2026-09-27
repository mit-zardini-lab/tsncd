// Claude Opus 5.5 (1M context), effort 40.
/*
 * The messages a page held in a host's frame exchanges with the host, which
 * `src/advanced_display/hostMessages.ts` holds: the variants the page offers,
 * the `tsncd-state` and `tsncd-refused` messages, the posting of either to
 * the parent frame alone, and the answer to a `tsncd-display` message.
 */
import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as host_messages from '../src/advanced_display/hostMessages.ts';
import * as page_choices from '../src/advanced_display/pageChoices.ts';
import type * as embedded_variants from '../src/data_transfer/embedded_variants.ts';
import type * as display_selector from '../src/advanced_display/displaySelector.ts';

function carried(ids: string[]): embedded_variants.EmbeddedVariants {
    return {
        version: 1,
        initial: ids[0],
        groups: [
            {id: 'decode', title: 'Decode'}, {id: 'training', title: 'Training'},
            {id: 'cached', title: 'Cached'},
        ],
        variants: ids.map((id, index) => ({
            id, group: index === 0 ? 'decode' : 'cached', title: id.toUpperCase(),
            ...(index === 0 ? {detail: 'The whole model.'} : {}),
            message: index,
        })),
        value_repository: [],
    };
}

test('a page offers its variants where it carries two or more', (): void => {
    assert.deepEqual(host_messages.offered_variants(undefined), {variants: [], groups: []});
    assert.deepEqual(host_messages.offered_variants(carried(['a'])), {variants: [], groups: []});
    assert.deepEqual(host_messages.offered_variants(carried(['a', 'b'])), {
        variants: [
            {id: 'a', group: 'decode', title: 'A', detail: 'The whole model.'},
            {id: 'b', group: 'cached', title: 'B', detail: ''},
        ],
        groups: [{id: 'decode', title: 'Decode'}, {id: 'cached', title: 'Cached'}],
    });
});

test('the state message names the state and lists what the page offers', (): void => {
    const offered = host_messages.offered_variants(carried(['a', 'b']));

    assert.deepEqual(
        host_messages.state_message(
            {variant: 'b', form: 'arrows-and-boxes', darkMode: false}, offered),
        {
            type: 'tsncd-state', variant: 'b', form: 'arrows-and-boxes', darkMode: false,
            variants: offered.variants, groups: offered.groups,
        });
    assert.deepEqual(
        host_messages.state_message(
            {variant: null, form: 'all-broadcasted', darkMode: true},
            host_messages.offered_variants(undefined)),
        {
            type: 'tsncd-state', variant: null, form: 'all-broadcasted', darkMode: true,
            variants: [], groups: [],
        });
});

test('the refused message names the parameter, the value and the values accepted',
     (): void => {
    assert.deepEqual(
        host_messages.refused_message({
            kind: 'refused-value', parameter: 'variant', value: 'nope', accepted: ['a', 'b'],
        }),
        {type: 'tsncd-refused', parameter: 'variant', value: 'nope', accepted: ['a', 'b']});
});

/* A window held in the frame of `parent`, or a window of its own where
 * `parent` is undefined, with every message posted to its parent recorded. */
function window_in_frame(framed: boolean): {
    page: Pick<Window, 'parent'>;
    posted: [unknown, string][];
} {
    const posted: [unknown, string][] = [];
    const parent = {
        postMessage: (message: unknown, origin: string): void => {
            posted.push([message, origin]);
        },
    };
    const page = {parent: parent as unknown as Window};
    if (!framed) {
        page.parent = page as unknown as Window;
    }
    return {page, posted};
}

test('a message reaches the parent of a frame and a page on its own posts nothing',
     (): void => {
    const message = host_messages.state_message(
        {variant: null, form: 'all-broadcasted', darkMode: true},
        host_messages.offered_variants(undefined));
    const framed = window_in_frame(true);
    const alone = window_in_frame(false);

    host_messages.post_to_host(framed.page, message);
    host_messages.post_to_host(alone.page, message);

    assert.deepEqual(framed.posted, [[message, '*']]);
    assert.equal(host_messages.is_framed(alone.page), false);
});

interface Answers {
    displayed: display_selector.DisplayChoice[];
    variants: string[];
    states: number;
    refusals: page_choices.Refusal[];
}

function answering_window(): {window_like: EventTarget; answers: Answers} {
    const answers: Answers = {displayed: [], variants: [], states: 0, refusals: []};
    const window_like = new EventTarget();
    host_messages.answer_host_messages(window_like, {
        switch_page: page_choices.make_page_switch({
            offered_variants: ['a', 'b'],
            display: async (choice): Promise<void> => {
                answers.displayed.push(choice);
            },
            variant: async (id: string): Promise<void> => {
                answers.variants.push(id);
            },
        }),
        answer_with_state: () => {
            answers.states += 1;
        },
        answer_with_refusal: (refusal) => answers.refusals.push(refusal),
    });
    return {window_like, answers};
}

async function post(window_like: EventTarget, data: unknown): Promise<void> {
    window_like.dispatchEvent(new MessageEvent('message', {data}));
    await new Promise((resolve) => setTimeout(resolve, 0));
}

test('an accepted tsncd-display message switches the page and is answered with the state',
     async (): Promise<void> => {
    const {window_like, answers} = answering_window();

    await post(window_like, {type: 'tsncd-display', variant: 'b'});
    await post(window_like, {type: 'tsncd-display', form: 'arrows-and-boxes'});
    await post(window_like, {type: 'tsncd-display'});
    await post(window_like, {type: 'diagram:connect'});

    assert.deepEqual(answers.variants, ['b']);
    assert.deepEqual(answers.displayed, [{form: 'arrows-and-boxes'}]);
    assert.equal(answers.states, 3);
    assert.deepEqual(answers.refusals, []);
});

test('a refused tsncd-display message changes nothing and is answered with the refusal',
     async (): Promise<void> => {
    const {window_like, answers} = answering_window();

    await post(window_like, {type: 'tsncd-display', variant: 'nope'});
    await post(window_like, {type: 'tsncd-display', variant: 'b', form: 'bad'});
    await post(window_like, {type: 'tsncd-display', darkMode: 'true'});
    await post(window_like, {type: 'tsncd-display', colour: 1});

    assert.deepEqual(answers.variants, []);
    assert.deepEqual(answers.displayed, []);
    assert.equal(answers.states, 0);
    assert.deepEqual(
        answers.refusals.map(({parameter, value}) => [parameter, value]),
        [['variant', 'nope'], ['form', 'bad'], ['darkMode', 'true'], ['colour', 1]]);
    assert.deepEqual(
        host_messages.refused_message(answers.refusals[0]),
        {type: 'tsncd-refused', parameter: 'variant', value: 'nope', accepted: ['a', 'b']});
});
