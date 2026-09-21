import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as cat from '../src/data_structure/Category.ts';
import * as fd from '../src/data_structure/Term.ts';
import * as nm from '../src/data_structure/Numeric.ts';
import * as ops from '../src/data_structure/Operators.ts';
import * as bb from '../src/display/Framework/BroadcastedCategoryRenderer';
import * as cr from '../src/display/Framework/CategoryRenderer';
import * as scr from '../src/display/Framework/StrideCategoryRenderer.ts';
import * as rh from '../src/display/Render/RenderHandler';
import * as rhs from '../src/display/Render/RenderHandlerSettings.ts';
import * as pt from '../src/utilities/Point.ts';
import * as Curve from '../src/utilities/Curve.ts';

class TestAnchor extends cr.Anchor<number> {}

function anchor_factory(): () => TestAnchor {
    const renderer = {
        renderHandler: {diagram_elements: {}},
        settings: {anchor_height: 20},
    } as ConstructorParameters<typeof TestAnchor>[0];
    return (): TestAnchor => new TestAnchor(renderer);
}

/*
 * A handler that records the curves the draw handler is asked for, with the
 * axis halos turned off so that each wire records one curve and no highlight
 * is registered.
 */
function recording_render_handler(): {
    handler: rh.RenderHandler<unknown, unknown>;
    curves: {curve: Curve.Curve; layer: string | undefined}[];
} {
    const curves: {curve: Curve.Curve; layer: string | undefined}[] = [];
    const handler = {
        annotation_handler: {
            addAnnotation(): void {},
            removeAnnotation(): void {},
            update(): void {},
        },
        diagram_elements: {},
        diagram_rendered: {},
        draw_handler: {
            circle(): void {},
            curve(
                curve: Curve.Curve,
                _attributes: unknown,
                _element: unknown,
                layer?: string,
            ): void {
                curves.push({curve, layer});
            },
            deltaPolygon(): void {},
            drawRectangle(): void {},
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
        settings: {...rhs.defaultRenderHandlerSettings, axisHover: 'off'},
        text_rectangle(): pt.Rectangle {
            return new pt.Rectangle({x: 0, y: 0}, {x: 0, y: 0});
        },
    };
    return {
        handler: handler as unknown as rh.RenderHandler<unknown, unknown>,
        curves,
    };
}

function axis(name: string, id: number): cat.RawAxis {
    return new cat.RawAxis(new fd.UID(
        {__registered__: 'type', repr: 'Axis'}, id, new fd.DynamicName(name)));
}

/* A reindexing of two domain axes onto one, which is drawn as a pentagon. */
function merging_reindexing(): cat.StrideMorphism<cat.RawAxis> {
    return new cat.StrideMorphism(
        [axis('u', 31), axis('p', 32)],
        [[axis('x', 33), [new nm.Integer(4), new nm.Integer(1)], new nm.Integer(0)]],
        new fd.DynamicName('cand'));
}

test('broadcast layer survives skipped degree anchors without changing the targets', (): void => {
    const anchor = anchor_factory();
    const before = anchor(), degree = anchor(), middle = anchor(), after = anchor();
    before.link(degree);
    degree.link(middle);
    middle.link(after);
    degree.loose = true;
    degree.wire_layer = 'broadcast';
    middle.loose = true;
    assert.deepEqual(before.next_terminal(), [after]);
    assert.deepEqual(before.wire_connections(), [{anchor: after, layer: 'broadcast'}]);
});

test('ordinary wires keep the main layer and fan-out keeps both targets', (): void => {
    const anchor = anchor_factory();
    const source = anchor(), first = anchor(), second = anchor();
    source.link(first);
    source.link(second);
    assert.deepEqual(source.wire_connections(), [
        {anchor: first, layer: 'main'}, {anchor: second, layer: 'main'},
    ]);
});

test('node degree paths use the broadcast layer for every segment', (): void => {
    const anchor = anchor_factory();
    const input = anchor();
    const node_input = anchor();
    const node_output = anchor();
    const output = anchor();
    input.link(node_input);
    node_input.link(node_output);
    node_output.link(output);
    const handler = input.renderHandler;
    const node = new rh.Vertical(handler, [
        new rh.Horizontal(handler, [node_input]),
        new rh.Horizontal(handler, [node_output]),
    ]);

    input.wire_layer = 'broadcast';
    bb.mark_broadcast_wire_layer(node);

    assert.equal(input.wire_connections()[0].layer, 'broadcast');
    assert.equal(node_input.wire_connections()[0].layer, 'broadcast');
    assert.equal(node_output.wire_connections()[0].layer, 'broadcast');
});

test('a degree wire reaching a dropped result is drawn over the glyph', (): void => {
    const {handler} = recording_render_handler();
    const token = axis('x', 41);
    const operand_axis = axis('r', 42);
    const result_axis = axis('c', 43);
    const datatype = new cat.Reals();
    const input_weave = new cat.Weave(datatype, [cat.WeaveMode.TILED, operand_axis]);
    const output_weave = new cat.Weave(datatype, [cat.WeaveMode.TILED, result_axis]);
    const target = new cat.Broadcasted(
        new ops.GenericOperator(new fd.DynamicName('F')),
        [input_weave],
        [output_weave],
        [new cat.Rearrangement([0], [token])]);
    const renderer = new bb.BroadcastedRenderer(handler);

    const box = new bb.BroadcastedBox(
        renderer, target, {grabbed: [false], dropped: [true]});
    const [degree] = input_weave.select_degree(
        box.input_meridians[0].axes_anchors.anchors);
    const [connection] = degree.wire_connections();

    assert.equal(connection.anchor.horizontal, true);
    assert.equal(degree.wire_layer, bb.DEGREE_WIRE_LAYER);
    assert.equal(connection.layer, 'broadcast');
});

test('a reindexing paints no wire between its columns and its node', (): void => {
    const {handler, curves} = recording_render_handler();
    const renderer = new scr.StrideRenderer(handler);
    const box = renderer.display_morphism(merging_reindexing());

    assert.equal(box.central_node.paints_wires, false);
    for (const anchor of [...box.left_anchors.anchors, box.central_node,
                          ...box.right_anchors.anchors]) {
        anchor.update();
    }

    assert.equal(curves.length, 0);
});

test('a reindexing paints the wires that reach its neighbours', (): void => {
    const {handler, curves} = recording_render_handler();
    const renderer = new scr.StrideRenderer(handler);
    const reindexing = merging_reindexing();
    const box = renderer.display_morphism(reindexing);
    const arriving = renderer.display_lone(reindexing.cod().content[0]);
    const leaving = reindexing._dom.map(
        (target) => renderer.display_lone(target));

    arriving.link(box.left_anchors);
    cr.Meridian.generic_link(box.right_anchors.anchors, leaving);
    for (const anchor of [arriving, ...box.left_anchors.anchors,
                          box.central_node, ...box.right_anchors.anchors]) {
        anchor.update();
    }

    assert.equal(curves.length, 1 + leaving.length);
});
