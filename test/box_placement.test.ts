// Claude Fable 5.1, effort medium.
// Revised by Claude Opus 5.5 (1M context), effort 40: the place of a tooltip.
import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as boxPlacement from '../src/advanced_display/boxPlacement';

const viewport: boxPlacement.Viewport =
    {left: 0, top: 1000, width: 1200, height: 800};
const margin = boxPlacement.VIEWPORT_MARGIN_PX;
const gap = boxPlacement.POINTER_GAP_PX;

test('a box that fits hangs below and right of the pointer', (): void => {
    const placed = boxPlacement.place_beside_pointer(
        {x: 100, y: 1100}, {width: 300, height: 200}, viewport);
    assert.deepEqual(placed, {x: 100 + gap, y: 1100 + gap});
});

test('a box too tall for the room below the pointer stands above it',
    (): void => {
        const placed = boxPlacement.place_beside_pointer(
            {x: 100, y: 1700}, {width: 300, height: 400}, viewport);
        assert.deepEqual(placed, {x: 100 + gap, y: 1700 - gap - 400});
    });

test('a box that fits neither below nor above is held at the bottom edge',
    (): void => {
        const placed = boxPlacement.place_beside_pointer(
            {x: 100, y: 1500}, {width: 300, height: 700}, viewport);
        assert.equal(placed.y, 1000 + 800 - margin - 700);
        assert.ok(placed.y >= 1000 + margin);
    });

test('a box taller than the screen is held at the top edge', (): void => {
    const placed = boxPlacement.place_beside_pointer(
        {x: 100, y: 1500}, {width: 300, height: 900}, viewport);
    assert.equal(placed.y, 1000 + margin);
});

test('a box too wide for the room to the right is held at the right edge '
    + 'and never flips to the left', (): void => {
    const placed = boxPlacement.place_beside_pointer(
        {x: 1100, y: 1100}, {width: 300, height: 200}, viewport);
    assert.equal(placed.x, 1200 - margin - 300);
});

test('the room height caps boxes at 80% and preserves screen margins', (): void => {
    assert.equal(boxPlacement.room_height(viewport), 640);
    assert.equal(boxPlacement.room_height({...viewport, height: 40}), 24);
    assert.equal(boxPlacement.room_height({...viewport, height: 4}), 0);
});

test('the room width leaves the margin either side', (): void => {
    assert.equal(boxPlacement.room_width(viewport), 1200 - 2 * margin);
    assert.equal(boxPlacement.room_width({...viewport, width: 4}), 0);
});

const tooltip_gap = boxPlacement.TOOLTIP_GAP_PX;

test('a tooltip that fits stands centred under the text it explains', (): void => {
    const placed = boxPlacement.place_under_target(
        {left: 400, top: 1100, width: 40, height: 20},
        {width: 200, height: 30}, viewport);
    assert.deepEqual(placed, {x: 400 + 20 - 100, y: 1100 + 20 + tooltip_gap});
});

test('a tooltip too tall for the room under the text stands above it',
    (): void => {
        const placed = boxPlacement.place_under_target(
            {left: 400, top: 1760, width: 40, height: 20},
            {width: 200, height: 30}, viewport);
        assert.equal(placed.y, 1760 - tooltip_gap - 30);
    });

test('a tooltip beside an edge of the screen is moved inside its margin',
    (): void => {
        const at_the_right = boxPlacement.place_under_target(
            {left: 1180, top: 1100, width: 20, height: 20},
            {width: 200, height: 30}, viewport);
        assert.equal(at_the_right.x, 1200 - margin - 200);
        const at_the_left = boxPlacement.place_under_target(
            {left: 0, top: 1100, width: 20, height: 20},
            {width: 200, height: 30}, viewport);
        assert.equal(at_the_left.x, margin);
    });
