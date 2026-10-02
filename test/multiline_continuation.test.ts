// Claude Opus 5.5 (1M context), effort 40.
import * as assert from 'node:assert/strict';
import {test} from 'node:test';

import * as bb from '../src/display/Framework/BroadcastedCategoryRenderer.ts';
import * as Curve from '../src/utilities/Curve.ts';
import * as mlc from '../src/display/Framework/Multiline.ts';
import * as pt from '../src/utilities/Point.ts';

const RADIUS = 10;

function pieces(arc: mlc.ContinuationArc): {
    straight: Curve.StraightLine;
    turn: Curve.CubicBezierSegment;
} {
    const straight = arc.curve.curves.find(
        (piece): piece is Curve.StraightLine => piece instanceof Curve.StraightLine);
    const turn = arc.curve.curves.find(
        (piece): piece is Curve.CubicBezierSegment =>
            piece instanceof Curve.CubicBezierSegment);
    assert.ok(straight !== undefined && turn !== undefined);
    return {straight, turn};
}

function assert_points_equal(actual: pt.Point, expected: pt.Point): void {
    assert.ok(Math.abs(actual.x - expected.x) < 1e-9
              && Math.abs(actual.y - expected.y) < 1e-9,
              `${JSON.stringify(actual)} is not ${JSON.stringify(expected)}`);
}

test('a row ends in a quarter turn down the page with the arrow at the junction',
     (): void => {
    const inner = {x: 100, y: 50};
    const arc = mlc.continuation_arc(mlc.RowSide.END, inner, 120, RADIUS);
    const {straight, turn} = pieces(arc);
    assert.equal(arc.curve.curves[0], straight);
    assert_points_equal(straight.start, inner);
    assert_points_equal(straight.end, {x: 110, y: 50});
    assert_points_equal(turn.start, {x: 110, y: 50});
    assert_points_equal(turn.end, {x: 120, y: 60});
    assert.equal(turn.control0.y, turn.start.y);
    assert.equal(turn.control1.x, turn.end.x);
    assert.ok(turn.control1.y < turn.end.y);
    assert_points_equal(arc.arrow_tip, {x: 110, y: 50});
    assert.equal(arc.arrow_angle, 0);
});

test('a row starts in the same turn coming down the page, with the arrow after it',
     (): void => {
    const inner = {x: 20, y: 50};
    const arc = mlc.continuation_arc(mlc.RowSide.START, inner, 0, RADIUS);
    const {straight, turn} = pieces(arc);
    assert.equal(arc.curve.curves[0], turn);
    assert_points_equal(turn.start, {x: 0, y: 40});
    assert.equal(turn.control0.x, turn.start.x);
    assert.ok(turn.control0.y > turn.start.y);
    assert.equal(turn.control1.y, turn.end.y);
    assert_points_equal(turn.end, {x: 10, y: 50});
    assert_points_equal(straight.end, inner);
    assert_points_equal(
        arc.arrow_tip, {x: 10 + bb.DATATYPE_ANCHOR_TRIANGLE_X, y: 50});
    assert.equal(arc.arrow_angle, 0);
});

test('a mirrored row ends turning left and down and starts turning down and left',
     (): void => {
    const end = mlc.continuation_arc(mlc.RowSide.END, {x: 20, y: 50}, 0, RADIUS);
    const end_turn = pieces(end).turn;
    assert_points_equal(end_turn.start, {x: 10, y: 50});
    assert_points_equal(end_turn.end, {x: 0, y: 60});
    assert_points_equal(end.arrow_tip, {x: 10, y: 50});
    assert.equal(end.arrow_angle, Math.PI);

    const start = mlc.continuation_arc(mlc.RowSide.START, {x: 100, y: 50}, 120, RADIUS);
    const start_turn = pieces(start).turn;
    assert_points_equal(start_turn.start, {x: 120, y: 40});
    assert_points_equal(start_turn.end, {x: 110, y: 50});
    assert_points_equal(
        start.arrow_tip, {x: 110 - bb.DATATYPE_ANCHOR_TRIANGLE_X, y: 50});
    assert.equal(start.arrow_angle, Math.PI);
});

test('a continuation names one highlight for being lit and one for being locked',
     (): void => {
    assert.equal(mlc.continuation_highlight_token('figure:0', 1),
                 'continuation:figure:0:1');
    assert.equal(mlc.continuation_lock_highlight_token('figure:0', 1),
                 'continuation-lock:figure:0:1');
    assert.notEqual(mlc.continuation_highlight_token('figure:0', 1),
                    mlc.continuation_highlight_token('figure:0', 2));
    assert.notEqual(mlc.continuation_highlight_token('figure:0', 1),
                    mlc.continuation_highlight_token('figure:1', 1));
});

test('a plate covers the level run, the arc and the arrow on the side the arc turns',
     (): void => {
    const padding = 3;
    const end = mlc.continuation_plate_region(
        mlc.RowSide.END, {x: 100, y: 50}, 120, RADIUS, padding);
    assert.deepEqual(
        [end.left, end.right, end.top, end.bottom],
        [97, 123, 50 - bb.DATATYPE_ANCHOR_TRIANGLE_Y - padding, 60 + padding]);
    const mirrored_start = mlc.continuation_plate_region(
        mlc.RowSide.START, {x: 100, y: 50}, 120, RADIUS, padding);
    assert.deepEqual(
        [mirrored_start.left, mirrored_start.right,
         mirrored_start.top, mirrored_start.bottom],
        [97, 123, 40 - padding, 50 + bb.DATATYPE_ANCHOR_TRIANGLE_Y + padding]);
});

test('one plate covers the arcs of every wire of an array and the room between them',
     (): void => {
    const padding = 3;
    const wires = [
        {inner: {x: 100, y: 50}, outer_x: 120},
        {inner: {x: 100, y: 70}, outer_x: 120},
        {inner: {x: 100, y: 90}, outer_x: 120},
    ];
    const end = mlc.array_continuation_plate_region(
        mlc.RowSide.END, wires, RADIUS, padding);
    assert.deepEqual(
        [end.left, end.right, end.top, end.bottom],
        [97, 123, 50 - bb.DATATYPE_ANCHOR_TRIANGLE_Y - padding, 100 + padding]);
    const start = mlc.array_continuation_plate_region(
        mlc.RowSide.START, wires, RADIUS, padding);
    assert.deepEqual(
        [start.top, start.bottom],
        [40 - padding, 90 + bb.DATATYPE_ANCHOR_TRIANGLE_Y + padding]);
});

test('a padlock stands outside the row, beside the plate, midway down its array',
     (): void => {
    const dims = {x: 8, y: 12};
    const ending = [
        {inner: {x: 100, y: 50}, outer_x: 120},
        {inner: {x: 100, y: 90}, outer_x: 120},
    ];
    const region = mlc.array_continuation_plate_region(
        mlc.RowSide.END, ending, RADIUS, 3);
    assert.deepEqual(
        mlc.continuation_padlock_centre(region, ending, dims, 3),
        {x: 123 + 3 + 4, y: 70});
    const mirrored = [{inner: {x: 120, y: 50}, outer_x: 100}];
    assert.deepEqual(
        mlc.continuation_padlock_centre(region, mirrored, dims, 3),
        {x: 97 - 3 - 4, y: 50});
});
