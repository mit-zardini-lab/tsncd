// Claude Opus 5.5 (1M context), effort 40.
/*
 * The box form, which `src/display/Framework/arrows/BoxRenderer.ts` draws. The
 * tests cover the name an `Einops` is faced by, the faces of the elementwise
 * maps, the softmax and the normalisations, a `Linear` and a `View`, the box of
 * a contraction with its arrows on its edges, a block operator keeping its
 * titled box, the rows of arrows a tape reaches, and the name written above a
 * box, which is the name the arrow form writes on its plate.
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
import * as pbop from '../src/para/data_structure/ParaBlockOperator.ts';
import * as bb from '../src/display/Framework/BroadcastedCategoryRenderer.ts';
import * as aob from '../src/display/Framework/Operations/additionalOperationBoxes.ts';
import * as pwd from '../src/display/Framework/para/ParaWrapDisplay.ts';
import * as arrows from '../src/display/Framework/arrows/ArrowRenderer.ts';
import * as box_renderer from '../src/display/Framework/arrows/BoxRenderer.ts';
import * as operator_faces from '../src/display/Framework/arrows/operatorFaces.ts';
import * as plate_names from '../src/display/Framework/arrows/plateNames.ts';
import * as caching_boxes from '../src/display/Framework/caching/cachingBoxes.ts';
import * as caching from '../src/caching/data_structure/Caching.ts';
import * as rhs from '../src/display/Render/RenderHandlerSettings.ts';
import * as rh from '../src/display/Render/RenderHandler.ts';
import * as pt from '../src/utilities/Point.ts';
import {TermJSONConverter} from '../src/data_transfer/json.ts';

type Datatype = cat.Datatype;
type Axis = cat.Axis;

interface DrawCall {
    method: string;
    args: unknown[];
}

const REALS = '\\mathbb{R}';

interface PlacedAnnotation {
    rect: pt.Rectangle;
    annotation: rh.AnnotationElement;
}

/* A render handler that lays every element out at the origin at its own size,
 * records every call its draw handler is asked to draw, records the term each
 * region is registered for, and records each annotation placed. */
function recording_render_handler(): {
    handler: rh.RenderHandler<unknown, unknown>;
    calls: DrawCall[];
    regions: Map<string, fd.Term>;
    placed: PlacedAnnotation[];
} {
    const calls: DrawCall[] = [];
    const regions = new Map<string, fd.Term>();
    const placed: PlacedAnnotation[] = [];
    const draw_handler = new Proxy({}, {
        get: (_target: object, method: string | symbol) =>
            (...args: unknown[]): undefined => {
                calls.push({method: String(method), args});
                return undefined;
            },
    });
    const handler = {
        annotation_handler: {
            addAnnotation(rect: pt.Rectangle, annotation: rh.AnnotationElement): void {
                placed.push({rect, annotation});
            },
            removeAnnotation(): void {},
            update(): void {},
        },
        diagram_elements: {},
        diagram_rendered: {},
        draw_handler,
        location(target: {dims: pt.Point}): pt.Point {
            return handler.rectangle(target).midpoint();
        },
        rectangle(target: {dims: pt.Point}): pt.Rectangle {
            return new pt.Rectangle({x: 0, y: 0}, target.dims);
        },
        register_highlight: (): (() => void) => () => {},
        register_term_region(element: {diagram_id: string}, term: fd.Term): void {
            regions.set(element.diagram_id, term);
        },
        remove_element(): void {},
        set_highlight: (): void => {},
        set_transform(): void {},
        settings: rhs.defaultRenderHandlerSettings,
        term_regions: regions,
        text_rectangle(): pt.Rectangle {
            return new pt.Rectangle({x: 0, y: 0}, {x: 0, y: 0});
        },
    };
    return {
        handler: handler as unknown as rh.RenderHandler<unknown, unknown>,
        calls,
        regions,
        placed,
    };
}

function renderer_drawing_into(
    handler: rh.RenderHandler<unknown, unknown>,
): box_renderer.BoxRenderer<Datatype, Axis> {
    return new box_renderer.BoxRenderer(new bb.BroadcastedRenderer(handler));
}

function box_renderer_for_test(): box_renderer.BoxRenderer<Datatype, Axis> {
    return renderer_drawing_into(recording_render_handler().handler);
}

function axis(name: string, id: number): cat.RawAxis {
    return new cat.RawAxis(
        new fd.UID({__registered__: 'type', repr: 'Axis'}, id, new fd.DynamicName(name)));
}

async function fixture(name: string): Promise<fd.Term> {
    return TermJSONConverter.import(JSON.parse(readFileSync(
        new URL(`./fixtures/${name}`, import.meta.url), 'utf8')));
}

const IDENTITY = new cat.Rearrangement([], []);

/* Whether `left` and `right` hold the same objects in the same order. */
function same_items(left: readonly unknown[], right: readonly unknown[]): boolean {
    return left.length === right.length && left.every((item, i) => item === right[i]);
}

/* `operator` reading `operands` arrays over `q` and writing one. */
function applied(
    operator: cat.Operator,
    operands: number = 1,
): cat.Broadcasted<Datatype, Axis> {
    const weave = new cat.Weave(new cat.Reals(), [axis('q', 1)]);
    return new cat.Broadcasted(
        operator, Array(operands).fill(weave), [weave], Array(operands).fill(IDENTITY));
}

const ROOM: operator_faces.FaceRoom = {least: {x: 0, y: 0}};

function face_of(
    target: cat.Broadcasted<Datatype, Axis>,
    room: operator_faces.FaceRoom = ROOM,
): operator_faces.OperatorFace {
    return operator_faces.facesRegistry.getConstructor(target.operator)(
        box_renderer_for_test(), target, room);
}

function einops(signature: number[][]): ops.Einops {
    return new ops.Einops(new fd.DynamicName('einops'), signature);
}

test('two operands with a contracted group are faced as a matmul', (): void => {
    assert.equal(operator_faces.einops_face_name(einops([[0], [0]])), '\\mathrm{Matmul}');
    assert.equal(operator_faces.einops_face_name(einops([[0, 1], [1]])), '\\mathrm{Matmul}');
    assert.equal(operator_faces.einops_face_name(einops([[0], []])), '\\mathrm{Matmul}');
});

test('one operand with a contracted group is faced as a sum', (): void => {
    assert.equal(operator_faces.einops_face_name(einops([[0]])), '\\mathrm{Sum}');
    assert.equal(operator_faces.einops_face_name(einops([[0, 1]])), '\\mathrm{Sum}');
});

test('two or more operands with no contracted group are faced as a product', (): void => {
    assert.equal(operator_faces.einops_face_name(einops([[], []])), '\\mathrm{Product}');
    assert.equal(operator_faces.einops_face_name(einops([[], [], []])), '\\mathrm{Product}');
});

test('every other signature is faced as a contraction', (): void => {
    assert.equal(
        operator_faces.einops_face_name(einops([[0], [0], [0]])), '\\mathrm{Contraction}');
    assert.equal(operator_faces.einops_face_name(einops([[]])), '\\mathrm{Contraction}');
    assert.equal(operator_faces.einops_face_name(einops([])), '\\mathrm{Contraction}');
    assert.equal(operator_faces.EINOPS_FALLBACK_FACE_NAME, '\\mathrm{Contraction}');
});

test('the table names each case once and in the order it is read', (): void => {
    assert.deepEqual(
        operator_faces.EINOPS_FACE_NAMES.map(({name}) => name),
        ['\\mathrm{Matmul}', '\\mathrm{Sum}', '\\mathrm{Product}']);
    assert.deepEqual(
        operator_faces.einops_signature_shape(einops([[0, 1], [1, 2]])),
        {operands: 2, contracted_groups: 3});
});

test('an einops is faced by the name its signature gives it', async (): Promise<void> => {
    const matmul = await fixture('matmul.json');
    assert.ok(matmul instanceof cat.Broadcasted);

    const face = face_of(matmul);

    assert.ok(face instanceof operator_faces.EinopsFace);
    assert.equal(face.name.latex, '\\mathrm{Matmul}');
    assert.equal(face.draws_box_outline, false);
});

test('an elementwise map is faced by its symbol in the middle of its box', (): void => {
    const maps = [
        new ops.Elementwise(new fd.DynamicName('\\sigma')),
        new ops.Arithmetic(new fd.DynamicName('x/2')),
        new ops.ReLU(),
        new ops.Dropout(new fd.DynamicName('D')),
        new ops.Cast(),
    ];
    for (const operator of maps) {
        const face = face_of(applied(operator));
        assert.ok(face instanceof operator_faces.NameFace);
        assert.equal(face.constructor, operator_faces.NameFace);
        assert.equal(face.name.latex, operator.name?.to_latex());
        assert.equal(face.draws_box_outline, false);
    }
});

test('an operator the registry does not name is faced by its name', (): void => {
    const face = face_of(applied(new ops.AdditionOp(), 2));
    const unnamed = face_of(applied(new ops.GenericOperator(null)));

    assert.ok(face instanceof operator_faces.NameFace);
    assert.equal(face.name.latex, '+');
    assert.ok(unnamed instanceof operator_faces.NameFace);
    assert.equal(unnamed.name.latex, '\\mathrm{GenericOperator}');
});

test('a softmax and the normalisations draw their glyph under their name', (): void => {
    const cases: [cat.Operator, Function, string][] = [
        [new ops.SoftMax(), operator_faces.SoftMaxFace, 'deltaPolygon'],
        [new ops.L1Norm(), operator_faces.L1NormFace, 'deltaPolygon'],
        [new ops.L2Norm(), operator_faces.L2NormFace, 'deltaPolygon'],
        [new ops.Normalize(), operator_faces.NormalizeFace, 'circle'],
        [new ops.LayerNorm(), operator_faces.LayerNormFace, 'circle'],
    ];
    for (const [operator, face_class, glyph_method] of cases) {
        const {handler, calls} = recording_render_handler();
        const face = operator_faces.facesRegistry.getConstructor(operator)(
            renderer_drawing_into(handler), applied(operator), ROOM);
        face.update();

        assert.ok(face instanceof face_class);
        assert.ok(face instanceof operator_faces.LabelledGlyphFace);
        assert.equal(face.label.latex, operator.name?.to_latex());
        const glyph = calls.find(({method}) => method === glyph_method);
        assert.ok(glyph !== undefined, `${operator.constructor.name} draws no glyph`);
        assert.deepEqual(glyph.args[2], {dropShadow: true});
    }
});

test('a glyph is drawn small, at the side the settings give it', (): void => {
    const {handler, calls} = recording_render_handler();
    const renderer = renderer_drawing_into(handler);
    const face = operator_faces.facesRegistry.getConstructor(new ops.Normalize())(
        renderer, applied(new ops.Normalize()), {least: {x: 0, y: 200}});
    face.update();

    const circle = calls.find(({method}) => method === 'circle');
    assert.ok(circle !== undefined);
    assert.equal(
        (circle.args[1] as {radius: number}).radius, renderer.settings.box_glyph_side / 2);
    assert.equal(face.dims.y, 200);
});

test('a linear is its own named rectangle with a bitten corner', (): void => {
    const {handler, calls} = recording_render_handler();
    const renderer = renderer_drawing_into(handler);
    const weight = new cat.Broadcasted(
        new ops.Linear(new fd.DynamicName('W')),
        [new cat.Weave(new cat.Reals(), [axis('d', 2)])],
        [new cat.Weave(new cat.Reals(), [axis('h', 3)])],
        [IDENTITY]);

    const box = renderer.display_morphism(weight);
    box.update();

    assert.ok(box.face instanceof operator_faces.NamedRectangleFace);
    assert.equal(box.face.draws_box_outline, true);
    assert.equal(box.face.name.latex, 'W');
    const polygons = calls.filter(({method}) => method === 'deltaPolygon');
    assert.equal(polygons.length, 1);
    assert.equal(
        (polygons[0].args[1] as {fill: string}).fill, renderer.settings.box_linear_fill);
    assert.equal(polygons[0].args[3], undefined);
});

test('a view is faced by the name of its reindexing where it has none', (): void => {
    const [kept, reversed] = [axis('i', 4), axis('j', 5)];
    const reversal = new cat.StrideMorphism(
        [kept], [[reversed, [new nm.Integer(-1)], new nm.Integer(0)]],
        new fd.DynamicName('mask'));
    const view = (name: fd.DynamicName | null): cat.Broadcasted<Datatype, Axis> =>
        new cat.Broadcasted(
            new ops.View(name),
            [new cat.Weave(new cat.Reals(), [cat.WeaveMode.TILED])],
            [new cat.Weave(new cat.Reals(), [cat.WeaveMode.TILED])],
            [reversal]);

    const unnamed = face_of(view(null));
    const named = face_of(view(new fd.DynamicName('flip')));

    assert.ok(unnamed instanceof operator_faces.ViewFace);
    assert.equal(unnamed.name.latex, 'mask');
    assert.ok(named instanceof operator_faces.ViewFace);
    assert.equal(named.name.latex, 'flip');
});

test('the box of a view opens the inspection box of its explained reindexing',
     (): void => {
    const [kept, reversed] = [axis('i', 4), axis('j', 5)];
    const reversal = new cat.StrideMorphism(
        [kept], [[reversed, [new nm.Integer(-1)], new nm.Integer(0)]],
        new fd.DynamicName('mask'));
    // `pyncd`'s `explain_reindexings` wraps a named reindexing in a block.
    const explained = new cat.Block(reversal, new cat.BlockTag(
        new fd.UID({__registered__: 'type', repr: 'BlockTag'}, 17, null),
        new nm.Integer(1),
        new cat.BlockAesthetics('mask')));
    const weave = new cat.Weave(new cat.Reals(), [cat.WeaveMode.TILED]);
    const region_of_box = (operator: cat.Operator, reindexing: cat.StrideCategory<Axis>) => {
        const {handler, regions} = recording_render_handler();
        const target = new cat.Broadcasted(operator, [weave], [weave], [reindexing]);
        const box = renderer_drawing_into(handler).display_morphism(target);
        return {target, region: regions.get(box.face.diagram_id)};
    };

    // The box form draws no reindexing node, which is where the block's region
    // stands in the other forms, so the view's box carries it.
    assert.equal(region_of_box(new ops.View(null), explained).region, explained);
    const unexplained = region_of_box(new ops.View(null), reversal);
    assert.equal(unexplained.region, unexplained.target);
    const other = region_of_box(new ops.ReLU(), explained);
    assert.equal(other.region, other.target);
});

test('a contraction is a box with its operands entering the left edge and its '
     + 'result leaving the right', async (): Promise<void> => {
    const matmul = await fixture('matmul.json');
    assert.ok(matmul instanceof cat.Broadcasted);
    const {handler, calls, regions} = recording_render_handler();
    const renderer = renderer_drawing_into(handler);

    const box = renderer.display_morphism(matmul);
    box.update();

    assert.ok(box instanceof box_renderer.OperatorFaceBox);
    const labels = (anchors: readonly unknown[]): [string, string][] => anchors.map((anchor) => {
        assert.ok(anchor instanceof arrows.ArrayArrowAnchor);
        return [anchor.shape_label(), anchor.datatype_label()];
    });
    assert.deepEqual(
        labels(box.left_anchors.anchors), [['[q,\\ d]', REALS], ['[d,\\ x]', REALS]]);
    assert.deepEqual(labels(box.right_anchors.anchors), [['[q,\\ x]', REALS]]);
    assert.ok(same_items(box.operand_arrows, box.left_anchors.anchors));
    assert.ok(same_items(box.result_arrows, box.right_anchors.anchors));
    for (const arrow of [...box.operand_arrows, ...box.result_arrows]) {
        assert.deepEqual(arrow.next_terminal(), []);
        assert.deepEqual(arrow.prior_terminal(), []);
        assert.equal(arrow.allow_skip, false);
    }
    assert.ok(box.result_arrows.every((arrow) =>
        arrow.gap_label_inset === renderer.settings.box_result_label_inset));
    assert.ok(box.operand_arrows.every((arrow) => arrow.gap_label_inset === 0));
    assert.equal(regions.size, 1);
    assert.equal(regions.get(box.face.diagram_id), matmul);
    const plates = calls.filter(({method, args}) =>
        method === 'deltaPolygon' && args[3] === 'background');
    assert.equal(plates.length, 1);
    assert.deepEqual(plates[0].args[2], {dropShadow: true});
});

test('the arrows of a column stand evenly down the box and its margins',
     async (): Promise<void> => {
    const matmul = await fixture('matmul.json');
    assert.ok(matmul instanceof cat.Broadcasted);
    const renderer = box_renderer_for_test();
    const room_of_operands = 4 * renderer.settings.anchor_height;
    const margin = renderer.settings.box_margin;

    const box = renderer.display_morphism(matmul);
    const operand_slots = box.left_anchors.lone_elements.map((slot) => slot.dims.y);
    const result_slots = box.right_anchors.lone_elements.map((slot) => slot.dims.y);

    assert.equal(box.face.dims.y, room_of_operands - 2 * margin);
    assert.equal(box.dims.y, room_of_operands);
    assert.deepEqual(operand_slots, [room_of_operands / 2, room_of_operands / 2]);
    assert.deepEqual(result_slots, [room_of_operands]);
    assert.equal(box.left_anchors.dims.y, box.dims.y);
    assert.equal(box.right_anchors.dims.y, box.dims.y);
});

test('a block operator keeps its titled box and queues its body', async (): Promise<void> => {
    const matmul = await fixture('matmul.json');
    assert.ok(matmul instanceof cat.Broadcasted);
    const block = new cat.Block(matmul, new cat.BlockTag(
        new fd.UID({__registered__: 'type', repr: 'BlockTag'}, 16, null),
        new nm.Integer(1),
        new cat.BlockAesthetics('Attention', null, '#cfe0f5')));
    const operators = [
        new ops.BlockOperator(new fd.DynamicName('Attn'), block),
        new pbop.ParaBlockOperator(new fd.DynamicName('Attn'), block),
    ];
    for (const operator of operators) {
        const {handler, calls} = recording_render_handler();
        const renderer = renderer_drawing_into(handler);
        const block_operator = new cat.Broadcasted(
            operator, matmul.input_weaves, matmul.output_weaves, matmul.reindexings);

        const box = renderer.display_morphism(block_operator);
        box.update();

        assert.ok(box.face instanceof operator_faces.TitledBlockFace);
        assert.ok(box.face instanceof aob.BlockOperatorBox);
        assert.equal(box.face.draws_box_outline, true);
        assert.ok(same_items(box.face.children, [box.face.core]));
        assert.equal(box.dims.y, box.left_anchors.dims.y);
        assert.ok(same_items(renderer.referencesHandler.pop_pending(), [block]));
        assert.equal(calls.filter(({method, args}) =>
            method === 'deltaPolygon' && args[3] === 'background').length, 0);
        assert.equal(calls.filter(({method}) => method === 'deltaPolygon').length, 1);
    }
});

test('attention in the box form is two matmuls around a softmax', async (): Promise<void> => {
    const attention = await fixture('attention.json');
    assert.ok(attention instanceof cat.Composed);
    const renderer = new arrows.ArrowParaCategoryRenderer(box_renderer_for_test());

    const figure = renderer.display_category(attention, true);
    const boxes = (element: rh.DiagramElement): box_renderer.OperatorFaceBox<Datatype, Axis>[] =>
        [
            ...(element instanceof box_renderer.OperatorFaceBox ? [element] : []),
            ...element.children.flatMap(boxes),
        ];
    const faces = boxes(figure).map(({face}) => face);

    assert.equal(faces.length, 3);
    assert.ok(faces[0] instanceof operator_faces.EinopsFace);
    assert.equal(faces[0].name.latex, '\\mathrm{Matmul}');
    assert.ok(faces[1] instanceof operator_faces.SoftMaxFace);
    assert.equal(faces[1].label.latex, 'SoftMax');
    assert.ok(faces[2] instanceof operator_faces.EinopsFace);
    assert.equal(faces[2].name.latex, '\\mathrm{Matmul}');
});

function tape_slot(name: string, id: number): pdt.TapeSlot {
    return new pdt.TapeSlot(
        new fd.UID({__registered__: 'type', repr: 'TapeSlot'}, id, new fd.DynamicName(name)));
}

test('a grabbed operand stays in the left column of the box and its tape turns into it',
     async (): Promise<void> => {
    const matmul = await fixture('matmul.json');
    assert.ok(matmul instanceof cat.Broadcasted);
    const wrap = new pwt.ParaWrap(matmul, [null, tape_slot('s0', 7)], [null]);
    const renderer = new arrows.ArrowParaCategoryRenderer(box_renderer_for_test());

    const box = renderer.display_morphism(wrap);

    assert.ok(box instanceof pwd.ParaWrapBox);
    const inner = box.inner;
    assert.ok(inner instanceof box_renderer.OperatorFaceBox);
    assert.equal(inner.left_anchors.anchors.length, 2);
    const [kept, grabbed] = inner.left_anchors.anchors;
    assert.ok(grabbed instanceof arrows.ArrayArrowAnchor);
    assert.equal(grabbed.horizontal, false);
    assert.equal(grabbed.shape_label(), '[d,\\ x]');
    assert.ok(same_items(inner.operand_arrows, [kept, grabbed]));
    assert.deepEqual(box.left_anchors.anchors[0].next_terminal(), [kept]);
});

test('a grab is a tape reaching an arrow in the box form', (): void => {
    const renderer = new arrows.ArrowParaCategoryRenderer(box_renderer_for_test());
    const grab = new pdt.Grab(
        tape_slot('s1', 8), new cat.Array(new cat.Reals(), [axis('q', 9)]));

    const box = renderer.display_morphism(grab);

    assert.ok(box instanceof pwd.ParaWrapBox);
    assert.equal(box.right_anchors.anchors.length, 1);
    assert.ok(box.right_anchors.anchors[0] instanceof arrows.ArrayArrowAnchor);
});

/* An operator whose class a module registers a plate name for after the two
 * renderers are written, as `cachingBoxes.ts` registers `Cache`. */
class Rotation extends ops.GenericOperator {}
const ROTATION_PLATE_NAME = '\\mathrm{Rotation}';
plate_names.plateNamesRegistry.registerFunction(Rotation)(() => ROTATION_PLATE_NAME);

/* A `Linear` named `W` from `d` to `h`. */
function linear_weight(): cat.Broadcasted<Datatype, Axis> {
    return new cat.Broadcasted(
        new ops.Linear(new fd.DynamicName('W')),
        [new cat.Weave(new cat.Reals(), [axis('d', 40)])],
        [new cat.Weave(new cat.Reals(), [axis('h', 41)])],
        [IDENTITY]);
}

/* The name written on the plate of `target` by the arrow form. */
function arrow_form_plate_label(
    target: cat.Broadcasted<Datatype, Axis>,
): string | undefined {
    const box = new arrows.ArrowRenderer(
        new bb.BroadcastedRenderer(recording_render_handler().handler))
        .display_morphism(target);
    assert.ok(box instanceof arrows.ArrowCappedBox);
    return box.plate_label?.latex;
}

test('a box carries above it the name written on the plate by the arrow form',
     (): void => {
    const cache = applied(new caching.Caching(new fd.DynamicName('c_{W^K}')));
    const cases: [cat.Broadcasted<Datatype, Axis>, string, string][] = [
        [linear_weight(), '\\mathrm{Linear}', 'W'],
        [cache, '\\mathrm{Cache}', 'c_{W^K}'],
        [applied(new Rotation(new fd.DynamicName('R'))), ROTATION_PLATE_NAME, 'R'],
    ];
    for (const [target, plate_name, own_name] of cases) {
        const box = box_renderer_for_test().display_morphism(target);

        assert.equal(box.plate_label?.latex, plate_name);
        assert.equal(box.face.written_name, own_name);
        assert.equal(arrow_form_plate_label(target), plate_name);
    }
    const capped = new arrows.ArrowRenderer(
        new bb.BroadcastedRenderer(recording_render_handler().handler))
        .display_morphism(cache);
    assert.ok(capped instanceof arrows.ArrowCappedBox);
    assert.ok(capped.inner_box.op_box instanceof caching_boxes.CachingBox);
});

test('a box writes no name above it where its face writes the name already',
     async (): Promise<void> => {
    const matmul = await fixture('matmul.json');
    assert.ok(matmul instanceof cat.Broadcasted);
    const named_view = new cat.Broadcasted(
        new ops.View(new fd.DynamicName('flip')),
        [new cat.Weave(new cat.Reals(), [cat.WeaveMode.TILED])],
        [new cat.Weave(new cat.Reals(), [cat.WeaveMode.TILED])],
        [IDENTITY]);
    const faced_by_their_names = [
        matmul,
        applied(new ops.AdditionOp(), 2),
        applied(new ops.SoftMax()),
        applied(new ops.Normalize()),
        applied(new ops.Elementwise(new fd.DynamicName('\\sigma'))),
        named_view,
    ];

    for (const target of faced_by_their_names) {
        const box = box_renderer_for_test().display_morphism(target);
        assert.equal(box.plate_label, undefined, target.operator.constructor.name);
    }
    // The arrow form writes `Matmul` on the plate, and the box form writes it
    // once, as the face.
    const matmul_box = box_renderer_for_test().display_morphism(matmul);
    assert.equal(matmul_box.face.written_name, '\\mathrm{Matmul}');
    assert.equal(arrow_form_plate_label(matmul), '\\mathrm{Matmul}');
    const unnamed = box_renderer_for_test().display_morphism(
        applied(new ops.GenericOperator(null)));
    assert.equal(unnamed.plate_label, undefined);
});

test('the name stands directly above the box, and the box and its arrows stand '
     + 'where they stand with no name', (): void => {
    const {handler, placed} = recording_render_handler();
    const renderer = renderer_drawing_into(handler);
    const weight = linear_weight();
    const unlabelled = box_renderer_for_test().display_morphism(
        applied(new ops.GenericOperator(new fd.DynamicName('W'))));

    const box = renderer.display_morphism(weight);
    box.update();

    const label = box.plate_label;
    assert.ok(label !== undefined);
    const [top_margin, stack, bottom_margin] = box.children[1].children;
    assert.ok(stack instanceof plate_names.PlateNameStack);
    assert.equal(stack.drawn, box.face);
    const [label_room, face, balance] = stack.column.children;
    assert.deepEqual(stack.children, [stack.column]);
    // `HTMLRenderHandler` lays out a column only for the class `rh.Vertical` itself.
    assert.equal(stack.column.constructor, rh.Vertical);
    assert.equal(label_room, stack.label_room);
    assert.equal(face, box.face);
    assert.equal(label_room.dims.y, label.estimated_text_dims().y);
    assert.equal(balance.dims.y, label_room.dims.y);
    assert.equal(top_margin.dims.y, renderer.settings.box_margin);
    assert.equal(bottom_margin.dims.y, renderer.settings.box_margin);
    assert.ok(box.face.dims.x >= label.estimated_bare_text_width());
    // The columns of arrows take the height of the box and its margins alone,
    // as they do under a box that carries no name.
    const columns = box.face.dims.y + 2 * renderer.settings.box_margin;
    assert.equal(box.left_anchors.dims.y, columns);
    assert.equal(box.right_anchors.dims.y, columns);
    assert.equal(box.dims.y, columns + 2 * label_room.dims.y);
    assert.equal(unlabelled.plate_label, undefined);
    assert.equal(unlabelled.dims.y, unlabelled.left_anchors.dims.y);
    assert.ok(placed.some((placement) => placement.annotation === label));
});

test('the arrow form stands its plate name in the stack used by the box form',
     (): void => {
    const box = new arrows.ArrowRenderer(
        new bb.BroadcastedRenderer(recording_render_handler().handler))
        .display_morphism(linear_weight());
    assert.ok(box instanceof arrows.ArrowCappedBox);

    const [stack] = box.children.filter(
        (child) => child instanceof plate_names.PlateNameStack);

    assert.ok(stack instanceof plate_names.PlateNameStack);
    assert.equal(stack.drawn, box.inner_box);
    assert.equal(stack.label, box.plate_label);
    assert.equal(stack.column.children.length, 3);
});
