import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as pwd from '../src/display/Framework/para/ParaWrapDisplay';
import * as travelDirection from '../src/display/Render/travelDirection';
import * as Curve from '../src/utilities/Curve';
import * as rh from '../src/display/Render/RenderHandler';
import * as crs from '../src/display/Framework/CategoryRendererSettings';
import * as padlock from '../src/display/Render/padlock';
import * as pdt from '../src/para/data_structure/Para';
import * as pwt from '../src/para/data_structure/ParaWrap';
import * as cat from '../src/data_structure/Category';
import * as fd from '../src/data_structure/Term';
import * as pt from '../src/utilities/Point';
import * as covariant_operator_boxes from '../src/display/Framework/advanced_axis_dynamics/covariantOperatorBoxes';

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

test('a column centred in a body stacks its anchors from the column top', (): void => {
    assert.deepEqual(pwd.anchor_centre_depths([20, 20], 40, 40), [10, 30]);
    assert.deepEqual(pwd.anchor_centre_depths([20, 20], 40, 60), [20, 40]);
});

test('a grab runs to its highest anchor and a drop from its lowest', (): void => {
    assert.equal(pwd.run_to_the_nearest_anchor([10, 30], 40, pwd.TapeEnd.ABOVE), 10);
    assert.equal(pwd.run_to_the_nearest_anchor([10, 30], 40, pwd.TapeEnd.BELOW), 10);
    assert.equal(pwd.run_to_the_nearest_anchor([30], 60, pwd.TapeEnd.ABOVE), 30);
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

test('a value kept on its wire and dropped stays in the wrap domain and codomain', (): void => {
    const cache = new pdt.CacheTapeSlot(new pdt.TapeSlot(new fd.UID(
        {'__registered__': 'type', 'repr': 'TapeSlot'}, 5)));
    const wrap = new pwt.ParaWrap<string, cat.Rearrangement<string>>(
        new cat.Rearrangement<string>([0, 1], ['p', 'x']),
        [cache, new pdt.KeptAndDropped(cache)],
        [null, new pdt.KeptAndDropped(cache)]);
    assert.deepEqual(wrap.dom().content, ['x']);
    assert.deepEqual(wrap.cod().content, ['p', 'x']);
    assert.deepEqual(wrap.grabbed(), [0]);
    assert.deepEqual(wrap.kept_inputs(), [1]);
    assert.deepEqual(wrap.dropped(), []);
    assert.deepEqual(wrap.kept_outputs(), [0, 1]);
    assert.deepEqual(wrap.kept_and_dropped_inputs(), [1]);
    assert.deepEqual(wrap.kept_and_dropped_outputs(), [1]);
    assert.equal(pdt.grabbed_entry(wrap.grabs[1]), null);
    assert.equal(pdt.operand_dropped_entry(wrap.grabs[1]), cache);
    assert.equal(pdt.result_dropped_entry(wrap.drops[1]), cache);
});

test('a junction circle stands on the corner where a part on a row meets its line', (): void => {
    const junction = {x: 100, y: 50};
    assert.deepEqual(covariant_operator_boxes.junction_corner(junction, []), junction);
    assert.deepEqual(
        covariant_operator_boxes.junction_corner(
            junction, [{x: 60, y: 20}, {x: 80, y: 20}]),
        {x: 80, y: 50});
});

test('a padlock takes the room its open form needs', (): void => {
    const shape = padlock.DEFAULT_PADLOCK_SHAPE;
    assert.deepEqual(padlock.padlock_dims(shape), {
        x: shape.body.x,
        y: shape.body.y + shape.shackle_leg + shape.shackle_radius
           + shape.open_lift,
    });
});

const FORWARDS = travelDirection.TravelDirection.LEFT_TO_RIGHT;
const MIRRORED = travelDirection.TravelDirection.RIGHT_TO_LEFT;

test('a mirror turns every elbow on the other side of its anchor', (): void => {
    const grab = {end: pwd.TapeEnd.ABOVE};
    const drop = {end: pwd.TapeEnd.BELOW};
    const kept_operand = {end: pwd.TapeEnd.BELOW, elbow_side: pwd.ElbowSide.RIGHT};

    // A covariant grab's corner stands left of its anchor, and a drop's right.
    assert.equal(pwd.elbow_side(grab, FORWARDS), pwd.ElbowSide.LEFT);
    assert.equal(pwd.elbow_side(drop, FORWARDS), pwd.ElbowSide.RIGHT);
    assert.equal(pwd.elbow_side(kept_operand, FORWARDS), pwd.ElbowSide.RIGHT);
    // Drawn mirrored, a grab's corner stands right of its anchor, so its tape
    // turns left into the anchor, and a drop's corner stands left of it.
    assert.equal(pwd.elbow_side(grab, MIRRORED), pwd.ElbowSide.RIGHT);
    assert.equal(pwd.elbow_side(drop, MIRRORED), pwd.ElbowSide.LEFT);
    assert.equal(pwd.elbow_side(kept_operand, MIRRORED), pwd.ElbowSide.LEFT);
});

test('a mirrored grab comes down from above and turns left into its anchor',
     (): void => {
    const anchor = {x: 100, y: 80};
    const corner = {x: 140, y: 80};
    const curve = pwd.tape_curve(
        corner, {x: 140, y: 20}, anchor, pwd.TapeEnd.ABOVE, 10);

    assert.ok(curve instanceof Curve.CurveSequence);
    const [down, , leg] = curve.curves;
    assert.equal(down.start.x, down.end.x);
    assert.ok(down.end.y > down.start.y);
    assert.equal(leg.start.y, leg.end.y);
    assert.ok(leg.start.x > leg.end.x);
    assert.deepEqual(leg.end, anchor);
});

test('a mirrored drop leaves its anchor to the left and turns down', (): void => {
    const anchor = {x: 100, y: 80};
    const corner = {x: 60, y: 80};
    const curve = pwd.tape_curve(
        corner, {x: 60, y: 140}, anchor, pwd.TapeEnd.BELOW, 10);

    // The curve is drawn from the free end, so read backwards it leaves the
    // anchor to the left and runs down to the free end.
    assert.ok(curve instanceof Curve.CurveSequence);
    const [down, , leg] = curve.curves;
    assert.equal(down.start.x, down.end.x);
    assert.ok(down.start.y > down.end.y);
    assert.ok(leg.start.x < leg.end.x);
    assert.deepEqual(leg.end, anchor);
});

test('the label on a mirrored leg keeps its clearances from the turn and the anchor',
     (): void => {
    const geometry = (corner: pt.Point, terminal: pt.Point): pwd.TapeGeometry<unknown> => ({
        tape: {anchor: undefined as never, object: 0, elbow: true},
        corner, terminal, free_end: {x: corner.x, y: 0}, top: 0,
    });

    // A mirrored grab's leg runs right from its anchor to its corner.
    assert.deepEqual(
        pwd.leg_label_span(geometry({x: 300, y: 50}, {x: 200, y: 50}), 10, 5, 0),
        {left: 200, right: 285});
    // A mirrored drop's leg runs right from its corner to its anchor.
    assert.deepEqual(
        pwd.leg_label_span(geometry({x: 100, y: 50}, {x: 200, y: 50}), 10, 5, 7),
        {left: 115, right: 193});
});

test('a slot name stands on the side of its arrowheads it is given, and its padlock '
     + 'at that end of its plate', (): void => {
    const handler = {
        annotation_handler: {addAnnotation(): void {}},
        diagram_elements: {},
        remove_element(): void {},
    } as unknown as rh.RenderHandler;
    const tape = (x: number): pwd.TapeGeometry<unknown> => ({
        tape: {anchor: {} as never, object: 0, elbow: true},
        corner: {x, y: 50}, free_end: {x, y: 10}, terminal: {x: 0, y: 50}, top: 10,
    });
    const settings = crs.DefaultParaRendererSettings;
    const place = (side: pwd.SlotNameSide): pt.Rectangle | undefined =>
        pwd.place_slot_label(new rh.AnnotationElement(handler, 's0'),
                             [tape(100), tape(120)], settings, pwd.TapeEnd.ABOVE, side);

    const left = place(pwd.SlotNameSide.LEFT);
    const right = place(pwd.SlotNameSide.RIGHT);
    assert.ok(left !== undefined && right !== undefined);
    assert.equal(left.right, 100 - settings.tape_label_gap);
    assert.equal(right.left, 120 + settings.tape_label_gap);

    const region = new pt.Rectangle({x: 100, y: 200}, {x: 40, y: 60});
    const dims = {x: 8, y: 12};
    assert.deepEqual(
        pwd.padlock_centre(region, pwd.TapeEnd.ABOVE, dims, 3, pwd.SlotNameSide.RIGHT),
        {x: 136, y: 191});
});
