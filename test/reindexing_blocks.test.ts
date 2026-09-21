// Claude Opus, effort high.
/*
 * A reindexing wrapped in a block that carries its explanation, which
 * `pyncd`'s `notebooks/display/explain_reindexings.py` builds. The block draws
 * as the bare reindexing and the drawn pentagon is the region its inspection
 * box opens over.
 */
import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as cat from '../src/data_structure/Category.ts';
import * as fd from '../src/data_structure/Term.ts';
import * as nm from '../src/data_structure/Numeric.ts';
import * as tu from '../src/data_structure_processing/term_utilities.ts';
import * as scr from '../src/display/Framework/StrideCategoryRenderer.ts';
import * as rhs from '../src/display/Render/RenderHandlerSettings.ts';
import type * as rh from '../src/display/Render/RenderHandler';
import * as pt from '../src/utilities/Point.ts';

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

function axis(name: string, id: number): cat.RawAxis {
    return new cat.RawAxis(new fd.UID(
        {__registered__: 'type', repr: 'Axis'}, id, new fd.DynamicName(name)));
}

/* The sliding window read, which is the reindexing `win` of the V4.1 figures. */
function window_reindexing(): cat.StrideMorphism<cat.RawAxis> {
    return new cat.StrideMorphism(
        [axis('x', 51), axis('w', 52)],
        [[axis('x', 51), [new nm.Integer(1), new nm.Integer(-1)],
          new nm.Integer(0)]],
        new fd.DynamicName('win'));
}

function explained_by_a_block<M extends cat.Morphism<cat.RawAxis>>(
    body: M, id: number, drawing: cat.BlockDrawing,
): cat.Block<cat.RawAxis, M> {
    return new cat.Block(
        body,
        new cat.BlockTag(
            new fd.UID({__registered__: 'type', repr: 'BlockTag'}, id, null),
            new nm.Integer(1),
            new cat.BlockAesthetics(
                'win', 'The sliding window.', null, [],
                'y[i_{x}, i_{w|x}] = x[i_{x} - i_{w|x}]', drawing)));
}

test('a block drawn in place is read as its body', (): void => {
    const reindexing = window_reindexing();
    const in_place = explained_by_a_block(
        reindexing, 61, cat.BlockDrawing.BODY_IN_PLACE);
    const boxed = explained_by_a_block(reindexing, 62, cat.BlockDrawing.BOX);

    assert.equal(tu.drawn_morphism(in_place), reindexing);
    assert.equal(tu.drawn_morphism(boxed), boxed);
    assert.equal(tu.drawn_morphism(reindexing), reindexing);
});

test('a mapping is read through a block drawn in place', (): void => {
    const swap = new cat.Rearrangement([1, 0], [axis('u', 53), axis('p', 54)]);
    const in_place = explained_by_a_block(
        swap, 63, cat.BlockDrawing.BODY_IN_PLACE);
    const boxed = explained_by_a_block(swap, 64, cat.BlockDrawing.BOX);

    assert.equal(tu.is_mappable(in_place), true);
    assert.deepEqual(tu.get_mapping(in_place as tu.Mappable), [1, 0]);
    assert.equal(tu.isIdentity(in_place), false);
    assert.equal(
        tu.isIdentity(explained_by_a_block(
            new cat.Rearrangement([0, 1], [axis('u', 55), axis('p', 56)]),
            65, cat.BlockDrawing.BODY_IN_PLACE)),
        true);
    assert.equal(tu.is_mappable(boxed), false);
});

test('a reindexing explained by a block is drawn as the bare reindexing',
     (): void => {
    const handler = render_handler();
    const renderer = new scr.StrideRenderer(handler);
    const bare = renderer.display_category(window_reindexing(), false);
    const explained = renderer.display_category(
        explained_by_a_block(
            window_reindexing(), 66, cat.BlockDrawing.BODY_IN_PLACE),
        false);

    assert.ok(explained instanceof scr.StrideMorphismBox);
    assert.deepEqual(explained.dims, bare.dims);
});

test('the drawn reindexing is the region its block opens a box over', (): void => {
    const handler = render_handler();
    const renderer = new scr.StrideRenderer(handler);
    const block = explained_by_a_block(
        window_reindexing(), 67, cat.BlockDrawing.BODY_IN_PLACE);

    const box = renderer.display_category(block, false);

    assert.equal(handler.term_regions.get(box.diagram_id), block);
    assert.equal(handler.term_regions.size, 1);
});

test('a block drawn as a box keeps its own figure', (): void => {
    const handler = render_handler();
    const renderer = new scr.StrideRenderer(handler);
    const block = explained_by_a_block(
        window_reindexing(), 68, cat.BlockDrawing.BOX);

    const box = renderer.display_category(block, false);

    assert.ok(!(box instanceof scr.StrideMorphismBox));
    assert.equal(handler.term_regions.size, 0);
});
