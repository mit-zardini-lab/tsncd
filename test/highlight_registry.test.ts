import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as rh from '../src/display/Render/RenderHandler';
import * as locked_highlights from '../src/display/Render/locked_highlights';

function render_handler(): rh.RenderHandler<unknown, unknown> {
    const Constructor = rh.RenderHandler as unknown as {
        new(): rh.RenderHandler<unknown, unknown>;
    };
    return new Constructor();
}

/** The state of one slot as a plate and its padlocks read it: whether the slot
 * is lit and whether a click holds it locked. */
interface SlotState {
    lit: boolean;
    locked: boolean;
}

function watch_slot(
    renderer: rh.RenderHandler<unknown, unknown>, uid: number,
): SlotState {
    const state: SlotState = {lit: false, locked: false};
    renderer.register_highlight(
        `slot:${uid}`, (active) => { state.lit = active; });
    renderer.register_highlight(
        `slot-lock:${uid}`, (active) => { state.locked = active; });
    return state;
}

function slot_tokens(uid: number): string[] {
    return [`slot:${uid}`, `slot-lock:${uid}`];
}

test('a highlight stays active until every source leaves', async (): Promise<void> => {
    const renderer = render_handler();
    let active = false;
    renderer.register_highlight('slot:1', (value) => active = value);
    renderer.set_highlight('slot:1', 'grab', true);
    renderer.set_highlight('slot:1', 'drop', true);
    renderer.set_highlight('slot:1', 'grab', false);
    await Promise.resolve();
    assert.equal(active, true);
    renderer.set_highlight('slot:1', 'drop', false);
    await Promise.resolve();
    assert.equal(active, false);
});

test('leaving after a same-source transfer clears the highlight', async (): Promise<void> => {
    const renderer = render_handler();
    let active = false;
    renderer.register_highlight('slot:transfer', (value) => active = value);
    renderer.set_highlight('slot:transfer', 'tape', true);
    renderer.set_highlight('slot:transfer', 'tape', false);
    renderer.set_highlight('slot:transfer', 'tape', true);
    await Promise.resolve();
    assert.equal(active, true);
    renderer.set_highlight('slot:transfer', 'tape', false);
    await Promise.resolve();
    assert.equal(active, false);
});

test('an unsubscribed highlight handler receives no later changes', (): void => {
    const renderer = render_handler();
    const states: boolean[] = [];
    const unregister = renderer.register_highlight(
        'slot:2', (active) => states.push(active));
    renderer.set_highlight('slot:2', 'grab', true);
    unregister();
    renderer.set_highlight('slot:2', 'drop', true);
    assert.deepEqual(states, [false, true]);
});

test('clearing highlights deactivates handlers and removes active sources', (): void => {
    const renderer = render_handler();
    const states: boolean[] = [];
    renderer.register_highlight('slot:3', (active) => states.push(active));
    renderer.set_highlight('slot:3', 'grab', true);
    renderer.clear_highlights();
    renderer.register_highlight('slot:3', (active) => states.push(active));
    assert.deepEqual(states, [false, true, false, false]);
});

test('a click locks a slot and the pointer leaving keeps it lit', async (): Promise<void> => {
    const renderer = render_handler();
    const locks = new locked_highlights.LockedHighlights('slot-lock');
    const slot = watch_slot(renderer, 10);
    renderer.set_highlight('slot:10', 'plate', true);
    assert.deepEqual(slot, {lit: true, locked: false});

    assert.equal(locks.toggle(slot_tokens(10), renderer), true);
    renderer.set_highlight('slot:10', 'plate', false);
    await Promise.resolve();
    assert.deepEqual(slot, {lit: true, locked: true});
});

test('a second click releases the slot the first one locked', async (): Promise<void> => {
    const renderer = render_handler();
    const locks = new locked_highlights.LockedHighlights('slot-lock');
    const slot = watch_slot(renderer, 11);
    locks.toggle(slot_tokens(11), renderer);
    assert.equal(locks.toggle(slot_tokens(11), renderer), false);
    await Promise.resolve();
    assert.deepEqual(slot, {lit: false, locked: false});
});

test('two slots are locked and released one at a time', async (): Promise<void> => {
    const renderer = render_handler();
    const locks = new locked_highlights.LockedHighlights('slot-lock');
    const first = watch_slot(renderer, 12);
    const second = watch_slot(renderer, 13);
    locks.toggle(slot_tokens(12), renderer);
    locks.toggle(slot_tokens(13), renderer);
    assert.equal(locks.size, 4);
    assert.deepEqual(first, {lit: true, locked: true});
    assert.deepEqual(second, {lit: true, locked: true});

    locks.toggle(slot_tokens(12), renderer);
    await Promise.resolve();
    assert.deepEqual(first, {lit: false, locked: false});
    assert.deepEqual(second, {lit: true, locked: true});
});

test('a diagram registered after a lock is lit by it and released with it', async (): Promise<void> => {
    const figure = render_handler();
    const inside_a_box = render_handler();
    const locks = new locked_highlights.LockedHighlights('slot-lock');
    locks.toggle(slot_tokens(14), figure);
    const slot = watch_slot(inside_a_box, 14);
    assert.deepEqual(slot, {lit: false, locked: false});

    locks.register(inside_a_box);
    assert.deepEqual(slot, {lit: true, locked: true});
    locks.forget(inside_a_box);
    await Promise.resolve();
    assert.deepEqual(slot, {lit: false, locked: false});
});
