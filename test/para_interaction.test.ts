import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as pwd from '../src/display/Framework/para/ParaWrapDisplay';
import * as padlock from '../src/display/Render/padlock';
import * as pdt from '../src/para/data_structure/Para';
import * as fd from '../src/data_structure/Term';
import * as pt from '../src/utilities/Point';

test('tape halo width adds two pixels to the source stroke', (): void => {
    assert.equal(pwd.tape_halo_width({'stroke-width': '1.5px'}), '3.5px');
    assert.equal(pwd.tape_halo_width({}), '3px');
});

test('tapes run through all the spare room to the edge of an operation', (): void => {
    const operation = new pt.Rectangle({x: 0, y: 30}, {x: 20, y: 40});
    assert.deepEqual(
        pwd.extended_tape_terminal({x: 5, y: 10}, pwd.TapeEnd.ABOVE, operation),
        {x: 5, y: 30});
    assert.deepEqual(
        pwd.extended_tape_terminal({x: 5, y: 100}, pwd.TapeEnd.BELOW, operation),
        {x: 5, y: 70});
});

test('tapes do not extend when an operation has no spare room', (): void => {
    const point = {x: 5, y: 30};
    const operation = new pt.Rectangle({x: 0, y: 20}, {x: 20, y: 40});
    assert.deepEqual(
        pwd.extended_tape_terminal(point, pwd.TapeEnd.ABOVE, operation), point);
    assert.equal(
        pwd.extended_tape_terminal(point, pwd.TapeEnd.ABOVE, undefined), point);
});

test('a tape is drawn past its row anchor only where the wire carries on down', (): void => {
    assert.equal(
        pwd.wire_continues_towards_the_operation([{horizontal: true}]), true);
    assert.equal(
        pwd.wire_continues_towards_the_operation([{horizontal: false}]), false);
    assert.equal(
        pwd.wire_continues_towards_the_operation(
            [{horizontal: true}, {horizontal: false}]), false);
    assert.equal(pwd.wire_continues_towards_the_operation([]), false);
});

test('a row gives every tape a slot and every change of array one more', (): void => {
    assert.deepEqual(
        pwd.tape_offsets_along_a_row([0, 0, 1, 1, 2], 20, 20),
        [0, 20, 60, 80, 120]);
    assert.deepEqual(pwd.tape_offsets_along_a_row([3, 4], 10, 0), [0, 10]);
});

test('a tape has the room between it and the next tape of its row', (): void => {
    assert.deepEqual(pwd.axis_label_rooms([0, 20, 60, 80, 120], 20),
                     [20, 40, 20, 40, 20]);
    assert.deepEqual(pwd.axis_label_rooms([], 20), []);
});

test('an axis name fits until its text is wider than the room', (): void => {
    assert.equal(pwd.axis_label_fits(15.7, 20), true);
    assert.equal(pwd.axis_label_fits(20, 20), true);
    assert.equal(pwd.axis_label_fits(57.6, 20), false);
});

test('a name too wide for its room turns the names of its own array', (): void => {
    assert.deepEqual(
        pwd.rotated_axis_labels([0, 0, 0, 1, 1], [15.7, 17.9, 57.6, 17.9, 15.7],
                                [20, 20, 40, 20, 20]),
        [true, true, true, false, false]);
    assert.deepEqual(
        pwd.rotated_axis_labels([0, 1], [0, 15.7], [20, 20]), [false, false]);
});

test('a turned name stands on its tape and reads down from the axis line', (): void => {
    const dims = {x: 57.6, y: 17.5};
    assert.deepEqual(
        pwd.turned_label_centre(100, 300, dims, pwd.TapeEnd.ABOVE),
        {x: 108.75, y: 328.8});
    assert.deepEqual(
        pwd.turned_label_centre(100, 300, dims, pwd.TapeEnd.BELOW),
        {x: 108.75, y: 271.2});
});

test('a tape on a body with no height runs the height its row needs', (): void => {
    assert.equal(
        pwd.elbow_row_free_end_y(100, [120], pwd.TapeEnd.ABOVE, 45), 75);
    assert.equal(
        pwd.elbow_row_free_end_y(140, [120], pwd.TapeEnd.BELOW, 45), 165);
});

test('a row keeps the line its box reserved where that line is far enough out', (): void => {
    assert.equal(
        pwd.elbow_row_free_end_y(40, [120, 150], pwd.TapeEnd.ABOVE, 45), 40);
    assert.equal(
        pwd.elbow_row_free_end_y(230, [120, 150], pwd.TapeEnd.BELOW, 45), 230);
    assert.equal(pwd.elbow_row_free_end_y(40, [], pwd.TapeEnd.ABOVE, 45), 40);
});

test('one free end line serves a row, so its arrowheads stay level', (): void => {
    assert.equal(
        pwd.elbow_row_free_end_y(100, [120, 150], pwd.TapeEnd.ABOVE, 45), 75);
    assert.equal(
        pwd.elbow_row_free_end_y(140, [120, 150], pwd.TapeEnd.BELOW, 45), 195);
});

test('a plate covers the strip between the first and last tape of an array', (): void => {
    const tape = (x: number): pwd.TapeGeometry<unknown> => ({
        tape: {anchor: {} as never, object: 0, elbow: false},
        corner: {x, y: 50},
        free_end: {x, y: 10},
        terminal: {x, y: 60},
        top: 10,
    });
    const region = pwd.taped_array_region([tape(100), tape(120)], {x: 3.5, y: 8}, 3);
    assert.deepEqual(region.top_left, {x: 93.5, y: 7});
    assert.deepEqual(region.dims, {x: 33, y: 56});
});

test('an elbow tape ends its plate at the corner rather than the anchor', (): void => {
    const elbow: pwd.TapeGeometry<unknown> = {
        tape: {anchor: {} as never, object: 0, elbow: true},
        corner: {x: 40, y: 50},
        free_end: {x: 40, y: 10},
        terminal: {x: 70, y: 50},
        top: 10,
    };
    const region = pwd.taped_array_region([elbow], {x: 3.5, y: 8}, 0);
    assert.deepEqual(region.top_left, {x: 36.5, y: 10});
    assert.deepEqual(region.dims, {x: 7, y: 40});
});

test('every axis name but the last of its array stands over the plate', (): void => {
    assert.deepEqual(pwd.axis_labels_over_the_plate([0, 0, 0, 1, 1, 2]),
                     [true, true, false, true, false, false]);
    assert.deepEqual(pwd.axis_labels_over_the_plate([]), []);
});

test('a padlock stands outside the arrowhead edge of its plate', (): void => {
    const region = new pt.Rectangle({x: 100, y: 200}, {x: 40, y: 60});
    const dims = {x: 8, y: 12};
    assert.deepEqual(
        pwd.padlock_centre(region, pwd.TapeEnd.ABOVE, dims, 3),
        {x: 104, y: 191});
    assert.deepEqual(
        pwd.padlock_centre(region, pwd.TapeEnd.BELOW, dims, 3),
        {x: 104, y: 269});
});

test('a slot names one highlight for being lit and one for being locked', (): void => {
    const slot = new pdt.TapeSlot(new fd.UID(
        {'__registered__': 'type', 'repr': 'TapeSlot'}, 77));
    assert.deepEqual(pwd.slot_lock_tokens(slot), ['slot:77', 'slot-lock:77']);
});

test('the open padlock carries its shackle clear of the body', (): void => {
    const shape = padlock.DEFAULT_PADLOCK_SHAPE;
    const centre = {x: 0, y: 0};
    const body = padlock.padlock_body(centre, shape);
    const closed = padlock.closed_padlock_shackle(centre, shape);
    const open = padlock.open_padlock_shackle(centre, shape);
    assert.equal(closed.start.y, body.top);
    assert.equal(closed.end.y, body.top);
    assert.equal(open.end.y, body.top);
    assert.equal(open.start.y, body.top - shape.open_lift);
    assert.ok(open.start.x > closed.start.x);
});

test('a padlock takes the room its open form needs', (): void => {
    const shape = padlock.DEFAULT_PADLOCK_SHAPE;
    assert.deepEqual(padlock.padlock_dims(shape), {
        x: shape.body.x,
        y: shape.body.y + shape.shackle_leg + shape.shackle_radius
           + shape.open_lift,
    });
});
