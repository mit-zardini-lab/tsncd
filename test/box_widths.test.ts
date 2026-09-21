// Claude Opus 5 (1M context), effort high.
import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as boxWidths from '../src/advanced_display/boxWidths';

const padding = 2 * (boxWidths.PADDING_SIDE_PX + boxWidths.BORDER_PX);

test('a box holds its core width inside its padding and its border',
    (): void => {
        assert.equal(boxWidths.padded_width(boxWidths.CORE_WIDTH_PX, 0),
                     boxWidths.CORE_WIDTH_PX + padding);
    });

test('a box showing a scrollbar is that much wider, and its core is not',
    (): void => {
        assert.equal(boxWidths.padded_width(boxWidths.CORE_WIDTH_PX, 15),
                     boxWidths.CORE_WIDTH_PX + padding + 15);
        assert.equal(boxWidths.core_width(4000, 15), boxWidths.CORE_WIDTH_PX);
    });

test('a window with room for the core width holds the whole of it', (): void => {
    assert.equal(boxWidths.core_width(2000, 0), boxWidths.CORE_WIDTH_PX);
});

test('a window with less room than that holds the padding before the core',
    (): void => {
        const room = boxWidths.CORE_WIDTH_PX / 2;
        assert.equal(boxWidths.core_width(room, 0), room - padding);
        assert.equal(
            boxWidths.padded_width(boxWidths.core_width(room, 0), 0), room);
        assert.equal(boxWidths.core_width(room, 15), room - padding - 15);
        assert.equal(
            boxWidths.padded_width(boxWidths.core_width(room, 15), 15), room);
        assert.equal(boxWidths.core_width(4, 0), 0);
        assert.equal(boxWidths.core_width(40, 15), 0);
    });

test('a drawing is wrapped at the core width less the overhang of its ink',
    (): void => {
        assert.equal(boxWidths.wrap_width(0), boxWidths.CORE_WIDTH_PX);
        assert.equal(boxWidths.wrap_width(20), boxWidths.CORE_WIDTH_PX - 20);
        assert.equal(boxWidths.wrap_width(boxWidths.CORE_WIDTH_PX),
                     boxWidths.MINIMUM_WRAP_WIDTH_PX);
    });

test('a drawing wider than the core width is wrapped narrower by the excess',
    (): void => {
        const core = boxWidths.CORE_WIDTH_PX;
        assert.equal(boxWidths.narrowed_wrap_width(core - 20, core + 90, 20),
                     core - 110);
        assert.equal(boxWidths.narrowed_wrap_width(core, core + 40, 100),
                     core - 100);
        assert.equal(
            boxWidths.narrowed_wrap_width(
                boxWidths.MINIMUM_WRAP_WIDTH_PX, core + 90, 20),
            boxWidths.MINIMUM_WRAP_WIDTH_PX);
    });

test('a drawing that occupies the core width is wrapped no narrower',
    (): void => {
        const core = boxWidths.CORE_WIDTH_PX;
        const wrap = core - 20;
        assert.ok(boxWidths.narrowed_wrap_width(wrap, core, 20) >= wrap);
    });
