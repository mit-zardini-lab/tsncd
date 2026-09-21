import * as assert from 'node:assert/strict';
import {test} from 'node:test';

import * as aops from '../src/advanced_axis_dynamics/data_structure/Operators.ts';
import * as cat from '../src/data_structure/Category.ts';
import * as fd from '../src/data_structure/Term.ts';
import * as nm from '../src/data_structure/Numeric.ts';
import * as ops from '../src/data_structure/Operators.ts';
import * as bb from '../src/display/Framework/BroadcastedCategoryRenderer.ts';
import * as scr from '../src/display/Framework/StrideCategoryRenderer.ts';
import * as boxes from '../src/display/Framework/advanced_axis_dynamics/covariantOperatorBoxes.ts';
import * as opboxes from '../src/display/Framework/Operations/additionalOperationBoxes.ts';
import * as ds from '../src/deepseek/data_structure.ts';
import * as ds_display from '../src/deepseek/display_deepseek.ts';
import * as rhs from '../src/display/Render/RenderHandlerSettings.ts';
import * as rh from '../src/display/Render/RenderHandler.ts';
import * as cv from '../src/utilities/Curve.ts';
import * as pt from '../src/utilities/Point.ts';

interface DrawRecords {
    circles: Array<{point: pt.Point; attributes: Record<string, unknown>}>;
    polygons: pt.Point[][];
    polylines: pt.Point[][];
    annotations: Array<{rect: pt.Rectangle; latex: string}>;
}

function make_render_handler(): {
    handler: rh.RenderHandler<unknown, unknown>; records: DrawRecords;
} {
    const records: DrawRecords = {
        circles: [], polygons: [], polylines: [], annotations: []};
    const handler = {
        annotation_handler: {
            addAnnotation(rect: pt.Rectangle, annotation: {latex: string}): void {
                records.annotations.push({rect, latex: annotation.latex});
            },
            removeAnnotation(): void {},
            update(): void {},
        },
        diagram_elements: {},
        diagram_rendered: {},
        draw_handler: {
            circle(point: pt.Point, attributes: Record<string, unknown>): void {
                records.circles.push({point, attributes});
            },
            curve(): void {},
            deltaPolygon(points: pt.Point[]): void {
                records.polygons.push(points);
            },
            drawRectangle(): void {},
            polyline(points: pt.Point[]): void {
                records.polylines.push(points);
            },
        },
        event_handler: undefined,
        location(target: {dims: pt.Point}): pt.Point {
            return handler.rectangle(target).midpoint();
        },
        rectangle(target: {dims: pt.Point}): pt.Rectangle {
            return new pt.Rectangle({x: 0, y: 0}, target.dims);
        },
        register_term_region(): void {},
        remove_element(): void {},
        settings: {...rhs.defaultRenderHandlerSettings, darkMode: false},
        text_rectangle(): pt.Rectangle {
            return new pt.Rectangle({x: 0, y: 0}, {x: 0, y: 0});
        },
    };
    return {handler: handler as unknown as rh.RenderHandler<unknown, unknown>, records};
}

function axis(name: string, id: number): cat.RawAxis {
    return new cat.RawAxis(new fd.UID(
        {__registered__: 'type', repr: 'Axis'}, id, new fd.DynamicName(name)));
}

test('shift-only stride nodes reserve height and point at their empty domain',
     (): void => {
    const {handler} = make_render_handler();
    const output_axis = axis('a', 1);
    const reindexing = new cat.StrideMorphism(
        [], [[output_axis, [], new nm.Integer(0)]], new fd.DynamicName('A^{0}'));
    const renderer = new scr.StrideRenderer(handler);
    const box = renderer.display_morphism(reindexing);

    assert.equal(box.shift_only, true);
    assert.equal(box.dims.y, scr.SHIFT_ONLY_REINDEXING_HEIGHT);
    assert.equal(box.points_left, false);

    box.mirror();
    assert.equal(box.points_left, true);
});

test('a covariant view with an empty domain points its node left', (): void => {
    const {handler, records} = make_render_handler();
    const output_axis = axis('a', 2);
    const reindexing = new cat.StrideMorphism(
        [], [[output_axis, [], new nm.Integer(0)]], new fd.DynamicName('A^{0}'));
    const operator = new aops.CovariantView(
        new fd.DynamicName('A^{0}'), reindexing);
    const target = new cat.Broadcasted(
        operator,
        [],
        [new cat.Weave(new cat.Reals(), [output_axis])],
        [],
        new cat.ProdObject([]),
    );
    const renderer = new bb.BroadcastedRenderer(handler);
    const box = new boxes.CovariantViewBox(renderer, target);

    assert.equal(
        bb.opsRegistry.classRegistry.get(aops.CovariantView.name),
        boxes.CovariantViewBox,
    );
    assert.equal(box.dims.y, scr.SHIFT_ONLY_REINDEXING_HEIGHT);
    box.update();

    assert.equal(records.polygons.length, 1);
    const [point, shoulder_top, flat_top] = absolute_points(records.polygons[0]);
    assert.equal(point.x, 0);
    assert.equal(point.y, scr.SHIFT_ONLY_REINDEXING_HEIGHT / 2);
    assert.ok(shoulder_top.x > point.x);
    assert.equal(flat_top.y, shoulder_top.y);
    assert.ok(flat_top.x > shoulder_top.x);
});

/* The node and the glyph of a box drawn in the NODE form, which
 * `BroadcastedBox` puts in the first child of its core. */
function glyph_stack(box: bb.BroadcastedBox<any, any>): rh.DiagramElement {
    return box.children[1].children[0];
}

test('a read at an index stands its glyph beside the node', (): void => {
    const {handler} = make_render_handler();
    const tokens = axis('t', 20);
    const index = new cat.StrideMorphism(
        [], [[tokens, [], new nm.Integer(3)]], new fd.DynamicName('i_{t}'));
    const target = new cat.Broadcasted(
        new ops.View(new fd.DynamicName('i_{t}')),
        [new cat.Weave(new cat.Reals(), [cat.WeaveMode.TILED])],
        [new cat.Weave(new cat.Reals(), [])],
        [index],
    );
    const renderer = new bb.BroadcastedRenderer(handler);
    const box = new bb.BroadcastedBox(renderer, target);

    // The reindexing has an empty domain, so under `reversed` the right column
    // of its node is empty and the point of the pentagon stands free. What the
    // operator emits leaves that point, so the glyph goes beside the node.
    assert.ok(glyph_stack(box) instanceof rh.Horizontal);
});

test('a node carrying a degree out keeps the glyph under it', (): void => {
    const {handler} = make_render_handler();
    const rows = axis('u', 21);
    const columns = axis('p', 22);
    const merged = axis('m', 23);
    const merge = new cat.StrideMorphism(
        [rows, columns],
        [[merged, [new nm.Integer(4), new nm.Integer(1)], new nm.Integer(0)]],
        new fd.DynamicName('cand'));
    const tiled = cat.WeaveMode.TILED;
    const target = new cat.Broadcasted(
        new ops.GenericOperator(new fd.DynamicName('F')),
        [new cat.Weave(new cat.Reals(), [tiled])],
        [new cat.Weave(new cat.Reals(), [tiled, tiled])],
        [merge],
    );
    const renderer = new bb.BroadcastedRenderer(handler);
    const box = new bb.BroadcastedBox(renderer, target);

    assert.ok(glyph_stack(box) instanceof rh.Vertical);
});

/* The anchors of each array that the weave beside it leaves in the target. */
function target_anchors(
    weaves: cat.Weave<any, any>[], meridians: bb.ArrayMeridian<any, any>[],
): any[] {
    return weaves.flatMap((weave, i) =>
        weave.select_target(meridians[i].axes_anchors.anchors));
}

test('concatenation target wires meet at the holder\'s output anchor', (): void => {
    const {handler, records} = make_render_handler();
    const first = axis('w', 3);
    const second = axis('s', 4);
    const result = axis('t', 5);
    const operator = new aops.ConcatenateAxes(new fd.DynamicName('\\Vert'));
    const target = new cat.Broadcasted(
        operator,
        [new cat.Weave(new cat.Reals(), [first]),
         new cat.Weave(new cat.Reals(), [second])],
        [new cat.Weave(new cat.Reals(), [result])],
        [new cat.Rearrangement([], []), new cat.Rearrangement([], [])],
    );
    const renderer = new bb.BroadcastedRenderer(handler);
    const holder = new bb.BroadcastedBox(renderer, target);
    const inputs = target_anchors(target.input_weaves, holder.input_meridians);
    const [output] = target_anchors(
        target.output_weaves, holder.output_meridians);

    assert.equal(
        bb.opsRegistry.classRegistry.get(aops.ConcatenateAxes.name),
        boxes.ConcatenateAxesBox,
    );
    // The operation box takes no room and keeps its own anchors out of the
    // wiring, so the figure is drawn on the holder's anchors alone.
    assert.deepEqual(holder.op_box.core.dims, {x: 0, y: 0});
    assert.ok(holder.op_box.input_axes.flat().every(
        (anchor) => anchor.further.length === 0));
    assert.ok(inputs.every((anchor) => anchor.further.includes(output)));
    assert.equal(output.draws_meeting_dot, false);

    holder.op_box.update();
    const output_circle = records.circles.at(-1);
    assert.deepEqual(output_circle?.point, output.rectangle().midpoint());
    assert.deepEqual(output_circle?.attributes, {
        fill: 'white',
        stroke: 'black',
        'stroke-width': '2px',
        radius: boxes.CONCATENATION_JUNCTION_RADIUS,
    });

    holder.mirror();
    assert.ok(inputs.every((anchor) => output.further.includes(anchor)));
    holder.op_box.update();
    assert.deepEqual(
        records.circles.at(-1)?.point,
        output.rectangle().midpoint(),
    );
});

test('deconcatenation target wires meet at the holder\'s input anchor', (): void => {
    const {handler, records} = make_render_handler();
    const whole = axis('c', 6);
    const first = axis('z', 7);
    const second = axis('y', 8);
    const operator = new aops.DeconcatenateAxes(
        new fd.DynamicName('\\Vert^{-1}'));
    const target = new cat.Broadcasted(
        operator,
        [new cat.Weave(new cat.Reals(), [whole])],
        [new cat.Weave(new cat.Reals(), [first]),
         new cat.Weave(new cat.Reals(), [second])],
        [new cat.Rearrangement([], [])],
    );
    const renderer = new bb.BroadcastedRenderer(handler);
    const holder = new bb.BroadcastedBox(renderer, target);
    const [input] = target_anchors(target.input_weaves, holder.input_meridians);
    const outputs = target_anchors(
        target.output_weaves, holder.output_meridians);

    assert.equal(
        bb.opsRegistry.classRegistry.get(aops.DeconcatenateAxes.name),
        boxes.DeconcatenateAxesBox,
    );
    assert.deepEqual(holder.op_box.core.dims, {x: 0, y: 0});
    assert.ok(outputs.every((anchor) => input.further.includes(anchor)));
    assert.equal(input.draws_meeting_dot, false);

    holder.op_box.update();
    const input_circle = records.circles.at(-1);
    assert.deepEqual(input_circle?.point, input.rectangle().midpoint());
    assert.deepEqual(input_circle?.attributes, {
        fill: 'white',
        stroke: 'black',
        'stroke-width': '2px',
        radius: boxes.CONCATENATION_JUNCTION_RADIUS,
    });
});

/* The control points of every segment of a chirp, in order, which is the whole
 * of the curve's shape. */
function control_points(chirp: cv.CurveSequence): pt.Point[] {
    return chirp.curves.flatMap((segment) => {
        const cubic = segment as cv.CubicBezierSegment;
        return [cubic.start, cubic.control0, cubic.control1, cubic.end];
    });
}

test('a rotary table turns counterclockwise', (): void => {
    const center = {x: 100, y: 50};
    const radius = 22.5;

    // The first arch of a counterclockwise sine rises, which is the smaller y.
    const sine = control_points(ds_display.chirpSine(center, radius));
    assert.ok(sine[1].y < center.y);
    // The cosine starts on the mid-line at the left of the circle and runs
    // down to its first trough.
    const cosine = control_points(ds_display.chirpCosine(center, radius));
    assert.equal(cosine[0].y, center.y);
    assert.ok(cosine[3].y > center.y);
});

test('all three rotary tables are drawn by one box', (): void => {
    const circle = bb.opsRegistry.classRegistry.get(ds.ComplexRotary.name);

    assert.ok(circle !== undefined);
    assert.equal(bb.opsRegistry.classRegistry.get(ds.Rotary.name), circle);
    assert.equal(bb.opsRegistry.classRegistry.get(ds.YarnRotary.name), circle);
});

function absolute_points(deltas: pt.Point[]): pt.Point[] {
    return deltas.reduce<pt.Point[]>((points, delta) => {
        const prior = points.at(-1) ?? {x: 0, y: 0};
        points.push({x: prior.x + delta.x, y: prior.y + delta.y});
        return points;
    }, []);
}

/* An array of whole numbers below `bound`, which is what the integer
 * arithmetic of a hash reads and returns. */
function whole_numbers(bound: number): cat.Natural {
    return new cat.Natural(new nm.Integer(bound));
}

/* The box the registry builds for `target`, which is what a figure draws. */
function registered_box(
    handler: rh.RenderHandler<unknown, unknown>,
    target: cat.Broadcasted<any, any, any>,
): bb.OperationBox<any, any, any> {
    return bb.opsRegistry.getConstructor(target.operator)(
        new bb.BroadcastedRenderer(handler), target);
}

/* A fold of the values along `reduced` into one value of `datatype`. */
function fold_along_an_axis(
    operator: cat.Operator, reduced: cat.RawAxis, datatype: cat.Datatype,
): cat.Broadcasted<any, any, any> {
    return new cat.Broadcasted(
        operator,
        [new cat.Weave(datatype, [reduced])],
        [new cat.Weave(datatype, [])],
        [new cat.Rearrangement([], [])],
    );
}

/* Two operands of `datatype` read at one position and one result. */
function two_operands(
    operator: cat.Operator, datatype: cat.Datatype,
): cat.Broadcasted<any, any, any> {
    return new cat.Broadcasted(
        operator,
        [new cat.Weave(datatype, []), new cat.Weave(datatype, [])],
        [new cat.Weave(datatype, [])],
        [new cat.Rearrangement([], []), new cat.Rearrangement([], [])],
    );
}

test('an exclusive or draws a crossed circle over the name of the operation',
     (): void => {
    const {handler, records} = make_render_handler();
    const box = registered_box(
        handler,
        fold_along_an_axis(
            new ops.BitwiseXor(), axis('L', 30), whole_numbers(64)));
    box.update();

    assert.equal(records.circles.length, 1);
    const [circle] = records.circles;
    const [across, down] = records.polylines;
    // The two arms of the cross meet at the centre of the circle.
    assert.equal(across[0].y, circle.point.y);
    assert.equal(across[1].y, circle.point.y);
    assert.equal(down[0].x, circle.point.x);
    assert.equal(down[1].x, circle.point.x);
    const [name] = records.annotations;
    assert.equal(name.latex, '\\mathrm{XOR}');
    // The name is written under the circle, clear of its outline.
    assert.ok(name.rect.top >= circle.point.y + Number(circle.attributes.radius));
});

test('an exclusive or sets its circle on the line the box is placed against',
     (): void => {
    const {handler, records} = make_render_handler();
    const box = registered_box(
        handler,
        fold_along_an_axis(
            new ops.BitwiseXor(), axis('L', 31), whole_numbers(64)));
    box.update();
    const [circle] = records.circles;

    // The name hangs below the circle, so the circle stands above the middle
    // of the box by half the strip the name takes, and the box is placed that
    // much lower to put the circle back on the line the wires arrive at.
    assert.ok(box.vertical_alignment_shift() > 0);
    assert.equal(
        box.rectangle().midpoint().y - circle.point.y,
        box.vertical_alignment_shift());
});

test('an addition of whole numbers stands in a rectangle', (): void => {
    const {handler} = make_render_handler();
    const whole = registered_box(
        handler, two_operands(new ops.AdditionOp(), whole_numbers(64)));
    const reals = registered_box(
        handler, two_operands(new ops.AdditionOp(), new cat.Reals()));

    assert.ok(whole instanceof opboxes.NamedRectangleBox);
    assert.ok(!(reals instanceof opboxes.NamedRectangleBox));
});

test('a remainder of whole numbers stands in a rectangle', (): void => {
    const {handler} = make_render_handler();
    const whole = registered_box(
        handler, two_operands(new ops.Modulo(), whole_numbers(64)));

    assert.ok(whole instanceof opboxes.NamedRectangleBox);
});
