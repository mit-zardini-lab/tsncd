import * as assert from 'node:assert/strict';
import {test} from 'node:test';

import * as addops from '../src/display/Framework/Operations/additionalOperationBoxes.ts';
import * as bb from '../src/display/Framework/BroadcastedCategoryRenderer.ts';
import * as cat from '../src/data_structure/Category.ts';
import * as cr from '../src/display/Framework/CategoryRenderer.ts';
import * as pt from '../src/utilities/Point.ts';

function absolute_points(deltas: pt.Point[]): pt.Point[] {
    return deltas.reduce<pt.Point[]>((points, delta) => {
        const prior = points.at(-1) ?? {x: 0, y: 0};
        points.push({x: prior.x + delta.x, y: prior.y + delta.y});
        return points;
    }, []);
}

test('elementwise arrows stand against the name, on the line they are given',
     (): void => {
    const text_rectangle = new pt.Rectangle({x: 100, y: 40}, {x: 40, y: 16});
    const line = 60;
    const half = addops.ELEMENTWISE_ARROW_HALF_HEIGHT;
    const length = addops.ELEMENTWISE_ARROW_LENGTH;
    const gap = addops.ELEMENTWISE_ARROW_GAP;
    const bite = addops.ELEMWNTWISE_ARROW_BITE;
    const base = addops.input_elementwise_arrow_base(text_rectangle, line);
    const far_tip = addops.output_elementwise_arrow_tip(text_rectangle, line);
    const [input_tip, input_base_top, input_notch, input_base_bottom] =
        absolute_points(addops.input_elementwise_arrow(text_rectangle, line));
    const [output_tip, output_base_top, output_notch, output_base_bottom] =
        absolute_points(addops.output_elementwise_arrow(text_rectangle, line));

    // Each arrow points at the name from a gap away, and stands on the line it
    // is given rather than on the name's own mid-line.
    assert.deepEqual(input_tip, {x: text_rectangle.left - gap, y: line});
    assert.deepEqual(output_tip, {x: text_rectangle.right + gap + length, y: line});
    assert.deepEqual(base, {x: text_rectangle.left - gap - length, y: line});
    assert.deepEqual(far_tip, output_tip);
    assert.deepEqual(input_base_top, {x: base.x, y: line - half});
    assert.deepEqual(input_base_bottom, {x: base.x, y: line + half});
    assert.deepEqual(output_base_top,
                     {x: text_rectangle.right + gap, y: line - half});
    assert.deepEqual(output_base_bottom,
                     {x: text_rectangle.right + gap, y: line + half});
    // The base is bitten, so the notch between its two corners lies on the
    // line one bite in front of them.
    assert.deepEqual(input_notch, {x: base.x + bite, y: line});
    assert.deepEqual(output_notch,
                     {x: text_rectangle.right + gap + bite, y: line});
});

test('each elementwise wire runs into the notch of its arrow', (): void => {
    const text_rectangle = new pt.Rectangle({x: 100, y: 40}, {x: 40, y: 16});
    const line = 60;
    const [, , input_notch] =
        absolute_points(addops.input_elementwise_arrow(text_rectangle, line));
    const [, , output_notch] =
        absolute_points(addops.output_elementwise_arrow(text_rectangle, line));

    // The arriving wire ends where the bite in the input arrow's base reaches,
    // and the leaving wire starts at the same point of the output arrow, which
    // is behind its tip.
    assert.deepEqual(
        addops.input_elementwise_arrow_notch(text_rectangle, line), input_notch);
    assert.deepEqual(
        addops.output_elementwise_arrow_notch(text_rectangle, line), output_notch);
    assert.ok(output_notch.x
              < addops.output_elementwise_arrow_tip(text_rectangle, line).x);
});

test('a cup reports its half way point and the way it travels', (): void => {
    const drawn: {start: pt.Point, end: pt.Point, radius: number}[] = [];
    const box = {
        mirrored: false,
        draw: {
            arcCurve: (start: pt.Point, end: pt.Point, radius: number): void => {
                drawn.push({start, end, radius});
            },
        },
        settings: {turn_radius: 5},
    } as unknown as bb.OperationBox<any, any, any>;
    const anchor = (location: pt.Point): cr.Anchor<unknown> =>
        ({location: (): pt.Point => location, horizontal: false}) as cr.Anchor<unknown>;

    const cup = addops.draw_cup_between_anchors(
        box, anchor({x: 100, y: 60}), anchor({x: 100, y: 40}));

    // The arc is the semicircle to the left of the two anchors, and travel from
    // the lower anchor to the upper one is upwards where it bulges furthest.
    assert.deepEqual(drawn, [{start: {x: 100, y: 60}, end: {x: 100, y: 40},
                              radius: 10}]);
    assert.deepEqual(cup?.point, {x: 90, y: 50});
    assert.equal(cup?.angle, -Math.PI / 2);
});

test('a feeding arrowhead has its tip at the point it is given', (): void => {
    const [tip] = absolute_points(addops.feeding_arrowhead({x: 12, y: 34}));

    assert.deepEqual(tip, {x: 12, y: 34});
});

test('an arrowhead built from its notch takes the wire end there', (): void => {
    const wire_end = {x: 12, y: 34};
    const [tip, , notch] =
        absolute_points(addops.feeding_arrowhead_from_notch(wire_end));

    // The wire stops at the notch and the tip stands ahead of it, so the stroke
    // squared across the wire's end is inside the head.
    assert.deepEqual(notch, wire_end);
    assert.deepEqual(addops.feeding_arrowhead_notch(tip), wire_end);
    assert.ok(tip.x > wire_end.x);
    assert.equal(tip.y, wire_end.y);
});

test('a datatype wire carries its triangle once it is long enough', (): void => {
    assert.equal(bb.DATATYPE_TRIANGLE_SHORTEST_WIRE, 14);
});

test('a wire that turns is marked on its longest straight run', (): void => {
    const row = {x: 100, y: 40};
    const column = {x: 160, y: 120};
    const mark = bb.turning_wire_direction_mark(
        cr.wire_curve(row, column, true, false));

    // The row anchor leaves vertically and the run down the page is 80 px
    // against the 60 px of the run across it, so the mark stands on the
    // vertical run and points down the page.
    assert.ok(mark !== undefined);
    assert.ok(Math.abs(mark.point.x - row.x) < 1e-9);
    assert.ok(Math.abs(mark.angle - Math.PI / 2) < 1e-9);
    assert.ok(mark.point.y > row.y && mark.point.y < column.y);
});

test('a wire that turns before it has run is left unmarked', (): void => {
    const mark = bb.turning_wire_direction_mark(
        cr.wire_curve({x: 100, y: 40}, {x: 104, y: 44}, true, false));

    assert.equal(mark, undefined);
});

/*
 * A renderer that places each element where the test says and records the
 * polygons drawn, which is what a direction triangle is.
 */
function renderer_placing(
    places: Map<number, pt.Point>,
): {renderer: bb.BroadcastedRenderer<any, any>; polygons: pt.Point[][]} {
    const polygons: pt.Point[][] = [];
    const renderHandler = {
        diagram_elements: {},
        diagram_rendered: {},
        draw_handler: {
            circle(): void {},
            curve(): void {},
            deltaPolygon(points: pt.Point[]): void {
                polygons.push(points);
            },
        },
        location(target: {diagram_id: number}): pt.Point {
            return places.get(target.diagram_id)!;
        },
        rectangle(target: {diagram_id: number}): pt.Rectangle {
            return new pt.Rectangle(places.get(target.diagram_id)!, {x: 0, y: 0});
        },
        settings: {turn_radius: 10},
    };
    return {
        renderer: {
            renderHandler,
            settings: {turn_radius: 10},
        } as unknown as bb.BroadcastedRenderer<any, any>,
        polygons,
    };
}

/* Two linked datatype anchors, the first on a row and the second in a column,
 * which is the wire that turns. */
function turning_datatype_wire(
    row: pt.Point,
    column: pt.Point,
): pt.Point[][] {
    const places = new Map<number, pt.Point>();
    const {renderer, polygons} = renderer_placing(places);
    const first = new bb.DatatypeAnchor(renderer, new cat.Reals());
    const second = new bb.DatatypeAnchor(renderer, new cat.Reals());
    places.set(first.diagram_id, row);
    places.set(second.diagram_id, column);
    first.horizontal = true;
    first.anchor_link(second);
    first.update();
    return polygons;
}

test('a datatype wire that turns is given a direction triangle', (): void => {
    const row = {x: 100, y: 40};
    const [triangle, ...rest] = turning_datatype_wire(row, {x: 160, y: 120});

    assert.equal(rest.length, 0);
    // The triangle is drawn from its tip, and the tip stands on the vertical
    // run the wire leaves the row on, pointing down the page.
    const [tip] = triangle;
    assert.ok(Math.abs(tip.x - row.x) < 1e-9);
    assert.ok(tip.y > row.y);
});

test('a triangle centred on a point straddles it', (): void => {
    const point = {x: 90, y: 50};
    const half_body = bb.DATATYPE_TRIANGLE_SHORTEST_WIRE / 4;

    // Travelling down the page the tip advances in y alone, and the body, which
    // runs back from the tip, then reaches as far behind the point as the tip
    // stands in front of it.
    const down = bb.datatype_triangle_tip_centred_on(point, Math.PI / 2);
    assert.ok(Math.abs(down.x - point.x) < 1e-9);
    assert.ok(Math.abs(down.y - (point.y + half_body)) < 1e-9);
    const right = bb.datatype_triangle_tip_centred_on(point, 0);
    assert.deepEqual(right, {x: point.x + half_body, y: point.y});
});
