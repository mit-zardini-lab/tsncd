// Claude Opus 5.5 (1M context), effort max.
/*
 * The arrow form of the broadcasted category, which
 * `src/display/Framework/arrows/` draws. The tests cover the label an arrow
 * carries, the box that stands a column of arrows either side of an operator's
 * ordinary box, the name its plate carries, the elementwise map drawn as its
 * name over one arrow, and the arrows a tape reaches, drawn forwards and
 * drawn mirrored in the backward pass of a training step.
 */
import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import * as cat from '../src/data_structure/Category.ts';
import * as fd from '../src/data_structure/Term.ts';
import * as nm from '../src/data_structure/Numeric.ts';
import * as ops from '../src/data_structure/Operators.ts';
import * as pdt from '../src/para/data_structure/Para.ts';
import * as pwt from '../src/para/data_structure/ParaWrap.ts';
import * as bb from '../src/display/Framework/BroadcastedCategoryRenderer.ts';
import * as pwd from '../src/display/Framework/para/ParaWrapDisplay.ts';
import * as scr from '../src/display/Framework/StrideCategoryRenderer.ts';
import * as arrows from '../src/display/Framework/arrows/ArrowRenderer.ts';
import * as operator_faces from '../src/display/Framework/arrows/operatorFaces.ts';
import * as plate_names from '../src/display/Framework/arrows/plateNames.ts';
import * as arrow_labels from '../src/display/Framework/arrows/arrowLabels.ts';
import * as quantisation_labels from '../src/display/Framework/quantization/quantisationLabels.ts';
import * as Quantization from '../src/quantization/data_structure/Quantization.ts';
import * as rhs from '../src/display/Render/RenderHandlerSettings.ts';
import type * as rh from '../src/display/Render/RenderHandler';
import * as pt from '../src/utilities/Point.ts';
import * as Curve from '../src/utilities/Curve.ts';
import {TermJSONConverter} from '../src/data_transfer/json.ts';

type Datatype = cat.Datatype;
type Axis = cat.Axis;

function render_handler(): rh.RenderHandler<unknown, unknown> {
    const handler = {
        annotation_handler: {
            addAnnotation(): void {},
            removeAnnotation(): void {},
            update(): void {},
        },
        diagram_elements: {},
        diagram_rendered: {},
        location(target: {dims: pt.Point}): pt.Point {
            return handler.rectangle(target).midpoint();
        },
        rectangle(target: {dims: pt.Point}): pt.Rectangle {
            return new pt.Rectangle({x: 0, y: 0}, target.dims);
        },
        register_term_region(element: {diagram_id: string}, term: fd.Term): void {
            handler.term_regions.set(element.diagram_id, term);
        },
        remove_element(): void {},
        set_transform(): void {},
        settings: rhs.defaultRenderHandlerSettings,
        term_regions: new Map<string, fd.Term>(),
        text_rectangle(): pt.Rectangle {
            return new pt.Rectangle({x: 0, y: 0}, {x: 0, y: 0});
        },
    };
    return handler as unknown as rh.RenderHandler<unknown, unknown>;
}

function arrow_renderer(): arrows.ArrowRenderer<Datatype, Axis> {
    return new arrows.ArrowRenderer(new bb.BroadcastedRenderer(render_handler()));
}

interface DrawCall {
    method: string;
    args: unknown[];
}

/* A render handler whose draw handler records every call it is asked to draw,
 * and which answers every highlight with nothing. */
function recording_render_handler(): {
    handler: rh.RenderHandler<unknown, unknown>;
    calls: DrawCall[];
} {
    const calls: DrawCall[] = [];
    const draw_handler = new Proxy({}, {
        get: (_target: object, method: string | symbol) =>
            (...args: unknown[]): undefined => {
                calls.push({method: String(method), args});
                return undefined;
            },
    });
    const handler = Object.assign(render_handler(), {
        draw_handler,
        register_highlight: (): (() => void) => () => {},
        set_highlight: (): void => {},
    });
    return {handler: handler as unknown as rh.RenderHandler<unknown, unknown>, calls};
}

function axis(name: string, id: number, size?: nm.Numeric): cat.RawAxis {
    return new cat.RawAxis(
        new fd.UID({__registered__: 'type', repr: 'Axis'}, id, new fd.DynamicName(name)),
        size);
}

async function fixture(name: string): Promise<fd.Term> {
    return TermJSONConverter.import(JSON.parse(readFileSync(
        new URL(`./fixtures/${name}`, import.meta.url), 'utf8')));
}

/* The label of each arrow, as the shape it writes above its wire and the
 * datatype it writes below. */
function labels(anchors: readonly unknown[]): [string, string][] {
    return anchors.map((anchor) => {
        assert.ok(anchor instanceof arrows.ArrayArrowAnchor);
        return [anchor.shape_label(), anchor.datatype_label()];
    });
}

const REALS = '\\mathbb{R}';

/* The box the arrow form draws `term` as, which the test expects to stand
 * between two columns of arrows. */
function capped_box(
    renderer: arrows.ArrowRenderer<Datatype, Axis>,
    term: cat.Broadcasted<Datatype, Axis>,
): arrows.ArrowCappedBox<Datatype, Axis> {
    const box = renderer.display_morphism(term);
    assert.ok(box instanceof arrows.ArrowCappedBox);
    return box;
}

/* Every `ArrowCappedBox` in the tree of `element`, in the order its children
 * hold them. */
function capped_boxes(element: rh.DiagramElement): arrows.ArrowCappedBox<Datatype, Axis>[] {
    const own = element instanceof arrows.ArrowCappedBox ? [element] : [];
    return [...own, ...element.children.flatMap(capped_boxes)];
}

test('a real array writes its axes in brackets separated by commas, over the reals',
     (): void => {
    const array = new cat.Array(new cat.Reals(), [axis('q', 1), axis('d', 2)]);

    assert.equal(arrow_labels.array_shape_label(arrow_renderer(), array), '[q,\\ d]');
    assert.equal(arrow_labels.array_datatype_label(array), REALS);
});

test('a sized axis is labelled by its size, as its wire is', (): void => {
    const array = new cat.Array(
        new cat.Reals(), [axis('q', 3, new nm.Integer(64)), axis('d', 4)]);

    assert.equal(arrow_labels.array_shape_label(arrow_renderer(), array), '[64,\\ d]');
});

test('a real array with no axes writes no shape and the reals', (): void => {
    const array = new cat.Array(new cat.Reals(), []);
    const arrow = new arrows.ArrayArrowAnchor(arrow_renderer(), array);

    assert.equal(arrow_labels.array_shape_label(arrow_renderer(), array), '');
    assert.equal(arrow.getAnnotation(), undefined);
    assert.deepEqual(
        arrow.gap_annotations().map(({annotation, placement}) =>
            [annotation.latex, placement]),
        [[`{${REALS}}`, 'below']]);
});

test('a natural array writes its bound below its arrow', (): void => {
    const bound = new nm.FreeNumeric(new fd.UID(
        {__registered__: 'type', repr: 'FreeNumeric'}, 5, new fd.DynamicName('\\bar{v}')));
    const array = new cat.Array(new cat.Natural(bound), [axis('x', 6)]);

    assert.equal(arrow_labels.array_shape_label(arrow_renderer(), array), '[x]');
    assert.equal(arrow_labels.array_datatype_label(array), '\\bar{v}');
});

test('a quantised array writes its quantisation below its arrow', (): void => {
    const fp32 = new Quantization.Quantified(
        new cat.Reals(), new nm.Integer(32), new nm.Integer(1), Quantization.Encoding.FP32);
    const array = new cat.Array(fp32, [axis('x', 26)]);

    assert.equal(arrow_labels.array_datatype_label(array), '\\mathtt{FP32}');
});

test('a datatype that writes nothing is labelled as the reals', (): void => {
    class UnwrittenDatatype extends cat.Datatype {}
    const array = new cat.Array(new UnwrittenDatatype(), [axis('x', 14)]);

    assert.equal(arrow_labels.array_datatype_label(array), REALS);
});

test('an arrow writes its shape above its wire and its datatype below it', (): void => {
    const renderer = arrow_renderer();
    const array = new cat.Array(new cat.Reals(), [axis('q', 27), axis('d', 28)]);
    const arrow = new arrows.ArrayArrowAnchor(renderer, array);
    const placed: [pt.Rectangle, rh.AnnotationElement][] = [];
    (arrow.renderHandler.annotation_handler as {addAnnotation: unknown}).addAnnotation =
        (rectangle: pt.Rectangle, annotation: rh.AnnotationElement): void => {
            placed.push([rectangle, annotation]);
        };
    const wire_y = 100;

    const taken = arrow_labels.rest_arrow_label_on_wire(
        arrow, {left: 10, right: 110}, wire_y);

    const [[above, shape], [below, datatype]] = placed;
    assert.equal(shape.latex, '{[q,\\ d]}');
    assert.equal(datatype.latex, `{${REALS}}`);
    assert.equal(above.bottom, wire_y + renderer.settings.annotation_drop);
    assert.equal(below.top, wire_y + renderer.settings.annotation_drop
        + renderer.settings.arrow_datatype_clearance);
    assert.equal(above.left, 10);
    assert.equal(below.width, 100);
    assert.deepEqual(taken, pt.Rectangle.bounding_rectangle([above, below]));
    assert.deepEqual(arrow_labels.arrow_label_extent(arrow), {
        width: Math.max(shape.estimated_bare_text_width(),
                        datatype.estimated_bare_text_width()),
        above: wire_y - above.top,
        below: below.bottom - wire_y,
    });
});

test('the arrow forms are chosen only where a message asks for one', (): void => {
    assert.equal(rhs.defaultRenderHandlerSettings.form, 'all-broadcasted');
    assert.equal('arrayDisplay' in rhs.defaultRenderHandlerSettings, false);
});

test('the three forms are named in the order a reader meets them', (): void => {
    assert.deepEqual(
        rhs.DIAGRAM_FORMS,
        ['arrows-and-boxes', 'arrows-and-broadcasted', 'all-broadcasted']);
    for (const form of rhs.DIAGRAM_FORMS) {
        assert.equal(rhs.is_diagram_form(form), true);
    }
    for (const retired of ['arrows', 'axes', undefined, 3]) {
        assert.equal(rhs.is_diagram_form(retired), false);
    }
});

test('an arrow stands in its array\'s room unless its column spreads it evenly',
     (): void => {
    const renderer = arrow_renderer();
    const anchor_height = renderer.settings.anchor_height;
    const array = new cat.Array(new cat.Reals(), [axis('q', 32), axis('d', 33)]);

    assert.equal(
        arrows.room_of_array_wires(array, renderer.settings), 2 * anchor_height);
    assert.equal(new arrows.ArrayArrowMeridian(renderer, array).dims.y, 2 * anchor_height);
    assert.equal(new arrows.ArrayArrowMeridian(renderer, array, 70).dims.y, 70);
});

test('a contraction is its ordinary box between one arrow per array', async (): Promise<void> => {
    const matmul = await fixture('matmul.json');
    assert.ok(matmul instanceof cat.Broadcasted);

    const box = arrow_renderer().display_morphism(matmul);

    assert.ok(box instanceof arrows.ArrowCappedBox);
    assert.ok(box.inner_box instanceof bb.BroadcastedBox);
    assert.deepEqual(
        labels(box.left_anchors.anchors), [['[q,\\ d]', REALS], ['[d,\\ x]', REALS]]);
    assert.deepEqual(labels(box.right_anchors.anchors), [['[q,\\ x]', REALS]]);
    for (const arrow of box.operand_arrows) {
        assert.equal(arrow.further.length, 2);
        assert.ok(arrow.further.every((relay) => relay instanceof arrows.FanRelayAnchor
            && relay.reached instanceof scr.AxisAnchor
            && relay.next_terminal()[0] === relay.reached));
    }
});

test('the axes of a result close into the result\'s arrow', async (): Promise<void> => {
    const matmul = await fixture('matmul.json');
    assert.ok(matmul instanceof cat.Broadcasted);

    const box = capped_box(arrow_renderer(), matmul);
    const [result] = box.result_arrows;

    assert.equal(result.prior_terminal().length, 2);
    assert.ok(result.prior_terminal().every((relay) =>
        relay instanceof arrows.FanRelayAnchor
        && relay.reached instanceof scr.AxisAnchor
        && relay.prior_terminal()[0] === relay.reached));
    assert.deepEqual(result.next_terminal(), []);
});

test('an arrow is stroked heavier than the axis wires its fan opens into',
     async (): Promise<void> => {
    const matmul = await fixture('matmul.json');
    assert.ok(matmul instanceof cat.Broadcasted);
    const renderer = arrow_renderer();

    const box = capped_box(renderer, matmul);
    const [arrow] = box.operand_arrows;
    const [branch] = arrow.further;

    assert.equal(
        arrow.wire_attributes()['stroke-width'],
        `${renderer.settings.arrow_stroke_width}px`);
    assert.equal(branch.wire_attributes()['stroke-width'], '1px');
});

test('a fan room is as wide as the widest axis name written in it needs',
     async (): Promise<void> => {
    const matmul = await fixture('matmul.json');
    assert.ok(matmul instanceof cat.Broadcasted);
    const renderer = arrow_renderer();
    const settings = renderer.settings;
    const weave = new cat.Weave(new cat.Reals(), [axis('hidden', 15)]);
    const widely_named = new cat.Broadcasted(
        new ops.GenericOperator(new fd.DynamicName('F')),
        [weave], [weave], [new cat.Rearrangement([], [])]);

    const narrow = capped_box(renderer, matmul);
    const wide = capped_box(renderer, widely_named);
    const room = (box: arrows.ArrowCappedBox<Datatype, Axis>): number => {
        const name = box.inner_box.left_anchors.anchors[0].getAnnotation();
        assert.ok(name !== undefined);
        return settings.arrow_fan_width + settings.arrow_plate_padding
            + 2 * settings.arrow_axis_name_clearance + name.estimated_bare_text_width();
    };

    assert.equal(narrow.operand_fan_room.dims.x, room(narrow));
    assert.equal(narrow.result_fan_room.dims.x, room(narrow));
    assert.equal(wide.operand_fan_room.dims.x, room(wide));
    assert.ok(wide.operand_fan_room.dims.x > narrow.operand_fan_room.dims.x);
});

test('an operator stands on a shadowed plate and a block operator does not',
     async (): Promise<void> => {
    const matmul = await fixture('matmul.json');
    assert.ok(matmul instanceof cat.Broadcasted);
    const block = new cat.Block(matmul, new cat.BlockTag(
        new fd.UID({__registered__: 'type', repr: 'BlockTag'}, 16, null),
        new nm.Integer(1),
        new cat.BlockAesthetics('Attention', null, '#cfe0f5')));
    const block_operator = new cat.Broadcasted(
        new ops.BlockOperator(new fd.DynamicName('Attn'), block),
        matmul.input_weaves, matmul.output_weaves, matmul.reindexings);
    const settings = arrow_renderer().settings;
    const background_polygons = (term: cat.Broadcasted<Datatype, Axis>): DrawCall[] => {
        const {handler, calls} = recording_render_handler();
        const box = new arrows.ArrowRenderer(new bb.BroadcastedRenderer(handler))
            .display_morphism(term);
        box.update();
        return calls.filter(({method, args}) =>
            method === 'deltaPolygon' && args[3] === 'background');
    };

    const plates = background_polygons(matmul);

    assert.equal(plates.length, 1);
    assert.deepEqual(plates[0].args[1], {
        fill: settings.arrow_plate_color,
        fillRole: 'tint',
        surfaceTint: settings.arrow_plate_tint,
        stroke: 'none',
        'stroke-width': '0',
    });
    assert.deepEqual(plates[0].args[2], {dropShadow: true});
    assert.equal(background_polygons(block_operator).length, 0);
    assert.equal(capped_box(arrow_renderer(), matmul).draws_plate(), true);
    assert.equal(capped_box(arrow_renderer(), block_operator).draws_plate(), false);
});

test('a plate carries the name of its operator where the glyph writes none, '
     + 'an einops by its box-form name and a linear as Linear',
     async (): Promise<void> => {
    const matmul = await fixture('matmul.json');
    const attention = await fixture('attention.json');
    assert.ok(matmul instanceof cat.Broadcasted);
    assert.ok(attention instanceof cat.Composed);
    const weight = new cat.Broadcasted(
        new ops.Linear(new fd.DynamicName('W')),
        [new cat.Weave(new cat.Reals(), [axis('d', 24)])],
        [new cat.Weave(new cat.Reals(), [axis('h', 25)])],
        [new cat.Rearrangement([], [])]);
    const figure = new arrows.ArrowParaCategoryRenderer(arrow_renderer())
        .display_category(attention, true);

    // The rectangle writes the weight's name, and the plate names the operator.
    assert.equal(capped_box(arrow_renderer(), weight).plate_label?.latex, '\\mathrm{Linear}');
    // An einops is named as `arrows-and-boxes` names its box, not as `einops`.
    assert.equal(capped_box(arrow_renderer(), matmul).plate_label?.latex, '\\mathrm{Matmul}');
    assert.equal(plate_names.plate_name(matmul.operator),
                 operator_faces.einops_face_name(matmul.operator as ops.Einops));
    assert.deepEqual(
        capped_boxes(figure).map((box) => box.plate_label?.latex),
        ['\\mathrm{Matmul}', 'SoftMax', '\\mathrm{Matmul}']);
});

test('a plate leaves off the name its reindexing node writes', (): void => {
    const [kept, reversed] = [axis('i', 30), axis('j', 31)];
    const reversal = new cat.StrideMorphism(
        [kept], [[reversed, [new nm.Integer(-1)], new nm.Integer(0)]],
        new fd.DynamicName('mask'));
    const view = (name: string): cat.Broadcasted<Datatype, Axis> => new cat.Broadcasted(
        new ops.View(new fd.DynamicName(name)),
        [new cat.Weave(new cat.Reals(), [cat.WeaveMode.TILED])],
        [new cat.Weave(new cat.Reals(), [cat.WeaveMode.TILED])],
        [reversal]);

    assert.equal(capped_box(arrow_renderer(), view('mask')).plate_label, undefined);
    assert.equal(capped_box(arrow_renderer(), view('flip')).plate_label?.latex, 'flip');
});

test('an elementwise map is its name over one straight arrow, on no plate', (): void => {
    const weave = new cat.Weave(new cat.Reals(), [axis('q', 26), axis('d', 27)]);
    const halved = new cat.Broadcasted(
        new ops.Arithmetic(new fd.DynamicName('x/2')),
        [weave], [weave], [new cat.Rearrangement([], [])]);
    const {handler, calls} = recording_render_handler();
    const renderer = new arrows.ArrowRenderer(new bb.BroadcastedRenderer(handler));

    const box = renderer.display_morphism(halved);
    box.update();

    assert.ok(box instanceof arrows.ElementwiseArrowBox);
    assert.equal(box.map_name?.latex, 'x/2');
    assert.deepEqual(box.operand_arrow.next_terminal(), [box.result_arrow]);
    assert.deepEqual(box.result_arrow.prior_terminal(), [box.operand_arrow]);
    assert.equal(calls.filter(({method, args}) =>
        method === 'deltaPolygon' && args[3] === 'background').length, 0);
    const heavy_wires = calls.filter(({method, args}) => method === 'curve'
        && (args[1] as Record<string, unknown>)['stroke-width']
            === `${renderer.settings.arrow_stroke_width}px`);
    assert.equal(heavy_wires.length, 1);
});

test('the maps drawn as a name over an arrow are the one-operand maps ElementwiseBox draws',
     (): void => {
    const weave = new cat.Weave(new cat.Reals(), [axis('x', 28)]);
    const identity = new cat.Rearrangement([], []);
    const map = (operator: cat.Operator, operands: number): cat.Broadcasted<Datatype, Axis> =>
        new cat.Broadcasted(
            operator, Array(operands).fill(weave), [weave], Array(operands).fill(identity));

    for (const operator of [new ops.Elementwise(), new ops.ReLU(), new ops.Dropout(),
                            new ops.Arithmetic(new fd.DynamicName('2x')), new ops.Cast()]) {
        assert.equal(arrows.is_elementwise_map(map(operator, 1)), true);
    }
    assert.equal(arrows.is_elementwise_map(map(new ops.View(), 1)), false);
    assert.equal(arrows.is_elementwise_map(map(new ops.SoftMax(), 1)), false);
    assert.equal(arrows.is_elementwise_map(map(new ops.ReLU(), 2)), false);
});

test('attention carries one arrow per array at its edges and three operator boxes',
     async (): Promise<void> => {
    const attention = await fixture('attention.json');
    assert.ok(attention instanceof cat.Composed);
    const renderer = new arrows.ArrowParaCategoryRenderer(arrow_renderer());

    const figure = renderer.display_category(attention, true);

    assert.deepEqual(
        labels(figure.left_anchors.anchors),
        [['[q,\\ d]', REALS], ['[x,\\ d]', REALS], ['[x,\\ v]', REALS]]);
    assert.deepEqual(labels(figure.right_anchors.anchors), [['[q,\\ v]', REALS]]);
    assert.equal(capped_boxes(figure).length, 3);
});

test('an arrow stands in the room its array\'s wires take in the axis form', (): void => {
    const renderer = arrow_renderer();
    const anchor_height = renderer.settings.anchor_height;
    const room = (shape: cat.RawAxis[]): number =>
        renderer.display_lone(new cat.Array(new cat.Reals(), shape)).dims.y;

    assert.equal(room([axis('q', 10), axis('d', 11), axis('h', 12)]), 3 * anchor_height);
    assert.equal(room([axis('q', 13)]), 2 * anchor_height);
    assert.equal(room([]), 2 * anchor_height);
});

test('the run of an arrow beside a product continues through the spread\'s columns',
     async (): Promise<void> => {
    const attention = await fixture('attention.json');
    assert.ok(attention instanceof cat.Composed);
    const renderer = new arrows.ArrowParaCategoryRenderer(arrow_renderer());

    const figure = renderer.display_category(attention, true);
    const values = figure.left_anchors.anchors[2];
    assert.ok(values instanceof arrows.ArrayArrowAnchor);
    const [spread_entry] = values.next_terminal();
    assert.ok(spread_entry instanceof arrows.ArrayArrowAnchor);
    const spread_exit = spread_entry.run_continues_to();
    assert.ok(spread_exit instanceof arrows.ArrayArrowAnchor);
    const operand = spread_exit.run_continues_to();

    assert.equal(values.run_continues_to(), undefined);
    assert.ok(operand instanceof arrows.ArrayArrowAnchor);
    assert.equal(operand.shape_label(), '[x,\\ v]');
    assert.equal(operand.run_continues_to(), undefined);
    assert.ok(operand.further.every((relay) => relay instanceof arrows.FanRelayAnchor
        && relay.reached instanceof scr.AxisAnchor));
});

function tape_slot(name: string, id: number): pdt.TapeSlot {
    return new pdt.TapeSlot(
        new fd.UID({__registered__: 'type', repr: 'TapeSlot'}, id, new fd.DynamicName(name)));
}

test('a grabbed operand stays in the column of its operator and its tape turns into it',
     async (): Promise<void> => {
    const matmul = await fixture('matmul.json');
    assert.ok(matmul instanceof cat.Broadcasted);
    const wrap = new pwt.ParaWrap(matmul, [null, tape_slot('s0', 7)], [null]);
    const renderer = new arrows.ArrowParaCategoryRenderer(arrow_renderer());

    const box = renderer.display_morphism(wrap);

    assert.ok(box instanceof pwd.ParaWrapBox);
    const inner = box.inner;
    assert.ok(inner instanceof arrows.ArrowCappedBox);
    assert.equal(inner.plate_label?.latex, '\\mathrm{Matmul}');
    assert.deepEqual(labels(inner.left_anchors.anchors),
                     [['[q,\\ d]', REALS], ['[d,\\ x]', REALS]]);
    const [kept, grabbed] = inner.left_anchors.anchors;
    assert.deepEqual(box.left_anchors.anchors[0].next_terminal(), [kept]);
    assert.deepEqual(grabbed.prior, []);
    assert.equal(grabbed.horizontal, false);
    assert.equal(grabbed.annotate_in_gap, false);
    assert.ok(box.core.dims.x >= inner.dims.x
        + arrow_labels.arrow_label_extent(grabbed).width);
});

test('the label of a turned tape stands on its level leg, clear of the turn',
     (): void => {
    const geometry = (corner: pt.Point, terminal: pt.Point): pwd.TapeGeometry<unknown> => ({
        tape: {anchor: undefined as never, object: 0, elbow: true},
        corner, terminal, free_end: {x: corner.x, y: 0}, top: 0,
    });

    assert.deepEqual(
        pwd.leg_label_span(geometry({x: 100, y: 50}, {x: 200, y: 50}), 10, 5, 0),
        {left: 115, right: 200});
    assert.deepEqual(
        pwd.leg_label_span(geometry({x: 300, y: 50}, {x: 200, y: 50}), 10, 5, 7),
        {left: 207, right: 285});
    assert.equal(pwd.leg_length_for_label(85, 5, 10), 100);
});

test('each leg is as long as its own label needs, and an outer corner clears the one inside it',
     (): void => {
    assert.deepEqual(pwd.fanned_leg_distances([90, 60, 120], 40), [90, 130, 170]);
    assert.deepEqual(pwd.fanned_leg_distances([50, 200], 40), [50, 200]);
    assert.deepEqual(pwd.fanned_leg_distances([12, 12, 12], 20), [12, 32, 52]);
    assert.deepEqual(pwd.fanned_leg_distances([], 20), []);
});

test('a grab is a tape reaching an arrow', (): void => {
    const renderer = new arrows.ArrowParaCategoryRenderer(arrow_renderer());
    const grab = new pdt.Grab(
        tape_slot('s1', 8), new cat.Array(new cat.Reals(), [axis('q', 9)]));

    const box = renderer.display_morphism(grab);

    assert.ok(box instanceof pwd.ParaWrapBox);
    assert.deepEqual(labels(box.left_anchors.anchors), []);
    assert.deepEqual(labels(box.right_anchors.anchors), [['[q]', REALS]]);
});

test('a thin cast opens its box from its plate and from the blue format it wrote',
     (): void => {
    const renderer = arrow_renderer();
    const fp32 = new Quantization.Quantified(
        new cat.Reals(), new nm.Integer(32), new nm.Integer(1), Quantization.Encoding.FP32);
    const bf16 = new Quantization.Quantified(
        new cat.Reals(), new nm.Integer(16), new nm.Integer(2), Quantization.Encoding.BF16);
    const cast = new cat.Broadcasted(
        new Quantization.TypeConvert(null, bf16, fp32),
        [new cat.Weave(bf16, [axis('x', 29)])],
        [new cat.Weave(fp32, [axis('x', 29)])],
        [new cat.Rearrangement([], [])]);
    quantisation_labels.establish();

    const box = capped_box(renderer, cast);
    const regions = box.renderHandler.term_regions;
    const [result] = box.result_arrows;

    assert.equal(regions.get(box.inner_box.diagram_id), cast);
    assert.equal(regions.get(result.datatype_annotation().diagram_id), cast);
    assert.equal(
        result.datatype_annotation().annotationSettings.color,
        renderer.settings.thin_cast_label_color);
    assert.equal(box.operand_arrows[0].datatype_annotation().annotationSettings.color,
                 undefined);
    assert.equal(result.datatype_label(), '\\mathtt{FP32}');
});

test('the plate of an operator answers the pointer as its box does in the box form',
     async (): Promise<void> => {
    const matmul = await fixture('matmul.json');
    assert.ok(matmul instanceof cat.Broadcasted);

    const box = capped_box(arrow_renderer(), matmul);

    assert.equal(box.renderHandler.term_regions.get(box.inner_box.diagram_id), matmul);
    assert.equal(box.result_arrows[0].datatype_annotation().annotationSettings.color,
                 undefined);
});

/* The curve of the last wire `calls` records, which is the wire drawn over its
 * halo. */
function last_wire(calls: readonly DrawCall[]): Curve.Curve {
    const wires = calls.filter(({method}) => method === 'curve');
    const curve = wires[wires.length - 1]?.args[0];
    assert.ok(curve instanceof Curve.Curve);
    return curve;
}

const FP32_ARRAY = new cat.Array(
    new Quantization.Quantified(
        new cat.Reals(), new nm.Integer(32), new nm.Integer(1), Quantization.Encoding.FP32),
    [axis('q', 30), axis('d', 31)]);

/* The wire drawn from an arrow of `FP32_ARRAY` at the origin to another at
 * `end`, and the width the label line below the first arrow takes. */
function wire_between_arrows(end: pt.Point): {wire: Curve.Curve; datatype_room: number} {
    const {handler, calls} = recording_render_handler();
    const renderer = new arrows.ArrowRenderer(new bb.BroadcastedRenderer(handler));
    const from = new arrows.ArrayArrowAnchor(renderer, FP32_ARRAY);
    const to = new arrows.ArrayArrowAnchor(renderer, FP32_ARRAY);
    from.anchor_link(to);
    from.location = (): pt.Point => new pt.Point(0, 0);
    to.location = (): pt.Point => end;
    from.update();
    return {
        wire: last_wire(calls),
        datatype_room: from.datatype_annotation().estimated_bare_text_width()
            + renderer.settings.arrow_label_clearance,
    };
}

test('an arrow falling steeply runs level under its datatype and bends beyond it',
     (): void => {
    const {wire, datatype_room} = wire_between_arrows(new pt.Point(160, 80));
    const narrow = wire_between_arrows(new pt.Point(120, 80)).wire;

    assert.ok(wire instanceof Curve.CurveSequence);
    const [level] = wire.curves;
    assert.ok(level instanceof Curve.StraightLine);
    assert.equal(level.end.y, 0);
    assert.equal(level.end.x, datatype_room);
    assert.ok(narrow instanceof Curve.CurveSequence);
    assert.equal(narrow.curves[0].end.x, 40);
});

test('an arrow that barely climbs bends across the whole gap', (): void => {
    const {wire} = wire_between_arrows(new pt.Point(200, -4));

    assert.ok(!(wire instanceof Curve.CurveSequence));
});

/* The direction triangle drawn on a level wire from one arrow to another, as
 * absolute points from its tip, with each end drawn mirrored or not. */
function triangle_between_arrows(
    start_mirrored: boolean,
    end_mirrored: boolean,
): pt.Point[] {
    const {handler, calls} = recording_render_handler();
    const renderer = new arrows.ArrowRenderer(new bb.BroadcastedRenderer(handler));
    const from = new arrows.ArrayArrowAnchor(renderer, FP32_ARRAY);
    const to = new arrows.ArrayArrowAnchor(renderer, FP32_ARRAY);
    from.anchor_link(to);
    from.location = (): pt.Point => new pt.Point(0, 0);
    to.location = (): pt.Point => new pt.Point(400, 0);
    from.mirrored = start_mirrored;
    to.mirrored = end_mirrored;
    from.update();
    const triangles = calls.filter(({method}) => method === 'deltaPolygon');
    assert.equal(triangles.length, 1);
    return (triangles[0].args[0] as pt.Point[]).reduce<pt.Point[]>(
        (points, delta, i) => [...points, i === 0 ? delta : {
            x: points[i - 1].x + delta.x, y: points[i - 1].y + delta.y}], []);
}

test('an arrow between two arrows drawn mirrored points right to left', (): void => {
    const [forward_tip, forward_back] = triangle_between_arrows(false, false);
    const [mirrored_tip, mirrored_back] = triangle_between_arrows(true, true);
    const [joining_tip, joining_back] = triangle_between_arrows(false, true);

    // The triangle keeps its tip where the forward one has it, and its body
    // trails to the right of the tip rather than to the left.
    assert.deepEqual(mirrored_tip, forward_tip);
    assert.ok(forward_back.x < forward_tip.x);
    assert.ok(mirrored_back.x > mirrored_tip.x);
    // A wire joining a mirrored region to the composition around it reads as
    // that composition does, from left to right.
    assert.ok(joining_back.x < joining_tip.x);
});

/* The heads an elementwise map of the arrow form draws either side of its
 * name, as absolute points from each tip, drawn forwards or mirrored. */
function map_heads(mirror: boolean): {
    heads: pt.Point[][];
    box: arrows.ElementwiseArrowBox<Datatype, Axis>;
} {
    const weave = new cat.Weave(new cat.Reals(), [axis('q', 40), axis('d', 41)]);
    const halved = new cat.Broadcasted(
        new ops.Arithmetic(new fd.DynamicName('x/2')),
        [weave], [weave], [new cat.Rearrangement([], [])]);
    const {handler, calls} = recording_render_handler();
    const renderer = new arrows.ArrowRenderer(new bb.BroadcastedRenderer(handler));
    const box = renderer.display_morphism(halved);
    assert.ok(box instanceof arrows.ElementwiseArrowBox);
    if (mirror) {
        box.mirror();
    }
    box.update();
    const heads = calls
        .filter(({method, args}) => method === 'deltaPolygon'
            && (args[1] as Record<string, unknown>).fill === 'black')
        .map(({args}) => (args[0] as pt.Point[]).reduce<pt.Point[]>(
            (points, delta, i) => [...points, i === 0 ? delta : {
                x: points[i - 1].x + delta.x, y: points[i - 1].y + delta.y}], []));
    return {heads, box};
}

test('an elementwise map drawn mirrored points both heads left, and its wire carries '
     + 'no triangle', (): void => {
    const forward = map_heads(false);
    const mirrored = map_heads(true);

    assert.equal(forward.heads.length, 2);
    assert.equal(mirrored.heads.length, 2);
    for (const [tip, back] of forward.heads) {
        assert.ok(back.x < tip.x);
    }
    for (const [tip, back] of mirrored.heads) {
        assert.ok(back.x > tip.x);
    }
    // The wire through the map is drawn from the arrow on its left, which the
    // mirror makes the result's arrow, and that arrow keeps its run free of a
    // direction triangle. A second mirror hands the flag back.
    assert.equal(forward.box.operand_arrow.runs_through_a_map, true);
    assert.equal(forward.box.result_arrow.runs_through_a_map, false);
    assert.equal(mirrored.box.operand_arrow.runs_through_a_map, false);
    assert.equal(mirrored.box.result_arrow.runs_through_a_map, true);
    mirrored.box.mirror();
    assert.equal(mirrored.box.operand_arrow.runs_through_a_map, true);
});

/*
 * The tape a wrap over a matmul draws to the arrow of its taped array, which
 * is the curve that ends at the arrow, drawn forwards or mirrored. The arrow
 * is placed at `TAPED_ARROW` and every other element where the test render
 * handler puts it.
 */
const TAPED_ARROW = new pt.Point(200, 60);

type MatmulWrap = pwt.ParaWrap<cat.Array<Datatype, Axis>, cat.Broadcasted<Datatype, Axis>>;

async function tape_to_taped_arrow(
    wrap_of: (matmul: cat.Broadcasted<Datatype, Axis>) => MatmulWrap,
    taped_arrow_of: (inner: arrows.ArrowCappedBox<Datatype, Axis>)
        => arrows.ArrayArrowAnchor<Datatype, Axis>,
    mirror: boolean,
): Promise<Curve.CurveSequence> {
    const matmul = await fixture('matmul.json');
    assert.ok(matmul instanceof cat.Broadcasted);
    const {handler, calls} = recording_render_handler();
    const renderer = new arrows.ArrowParaCategoryRenderer(
        new arrows.ArrowRenderer(new bb.BroadcastedRenderer(handler)));
    const box = renderer.display_morphism(wrap_of(matmul));
    assert.ok(box instanceof pwd.ParaWrapBox);
    assert.ok(box.inner instanceof arrows.ArrowCappedBox);
    if (mirror) {
        box.mirror();
    }
    taped_arrow_of(box.inner).location = (): pt.Point => TAPED_ARROW;
    box.update();
    const tape = calls
        .map(({method, args}) => method === 'curve' ? args[0] : undefined)
        .find((curve): curve is Curve.CurveSequence =>
            curve instanceof Curve.CurveSequence
            && curve.end.x === TAPED_ARROW.x && curve.end.y === TAPED_ARROW.y);
    assert.ok(tape !== undefined);
    return tape;
}

test('a grab drawn mirrored comes down from above and turns left into its arrow',
     async (): Promise<void> => {
    const grab = (matmul: cat.Broadcasted<Datatype, Axis>): MatmulWrap =>
        new pwt.ParaWrap(matmul, [null, tape_slot('s0', 7)], [null]);
    const grabbed = (inner: arrows.ArrowCappedBox<Datatype, Axis>)
        : arrows.ArrayArrowAnchor<Datatype, Axis> => inner.operand_arrows[1];

    for (const mirror of [false, true]) {
        const tape = await tape_to_taped_arrow(grab, grabbed, mirror);
        const [run, , leg] = tape.curves;
        // The tape runs down from its free end above the arrow.
        assert.equal(run.start.x, run.end.x);
        assert.ok(run.end.y > run.start.y && run.start.y < TAPED_ARROW.y);
        // A forward grab turns right into its arrow and a mirrored one left.
        assert.equal(leg.start.y, TAPED_ARROW.y);
        assert.equal(leg.start.x > TAPED_ARROW.x, mirror);
    }
});

test('a drop drawn mirrored leaves its arrow to the left and turns down',
     async (): Promise<void> => {
    const drop = (matmul: cat.Broadcasted<Datatype, Axis>): MatmulWrap =>
        new pwt.ParaWrap(matmul, [null, null], [tape_slot('s1', 8)]);
    const dropped = (inner: arrows.ArrowCappedBox<Datatype, Axis>)
        : arrows.ArrayArrowAnchor<Datatype, Axis> => inner.result_arrows[0];

    for (const mirror of [false, true]) {
        const tape = await tape_to_taped_arrow(drop, dropped, mirror);
        const [run, , leg] = tape.curves;
        // The tape is drawn from its free end below the arrow.
        assert.equal(run.start.x, run.end.x);
        assert.ok(run.start.y > run.end.y && run.start.y > TAPED_ARROW.y);
        // A forward drop leaves its arrow to the right and a mirrored one left.
        assert.equal(leg.start.y, TAPED_ARROW.y);
        assert.equal(leg.start.x < TAPED_ARROW.x, mirror);
    }
});
