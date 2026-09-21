import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as aops from '../src/advanced_axis_dynamics/data_structure/Operators.ts';
import * as cat from '../src/data_structure/Category.ts';
import * as fd from '../src/data_structure/Term.ts';
import * as nm from '../src/data_structure/Numeric.ts';
import * as bb from '../src/display/Framework/BroadcastedCategoryRenderer.ts';
import * as scr from '../src/display/Framework/StrideCategoryRenderer.ts';
import * as boxes from '../src/display/Framework/advanced_axis_dynamics/covariantOperatorBoxes.ts';
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
        remove_element(): void {},
        settings: rhs.defaultRenderHandlerSettings,
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

test('non-shift reindexings reserve the configured minimum height', (): void => {
    const input = axis('i', 1);
    const output = axis('o', 2);
    const reindexing = new cat.StrideMorphism(
        [input], [[output, [new nm.Integer(1)], new nm.Integer(0)]]);
    const renderer = new scr.StrideRenderer(render_handler(), {
        minimum_reindexing_height: 44,
    });
    assert.equal(renderer.display_morphism(reindexing).dims.y, 44);
});

test('a covariant view reserves the same minimum height for its merge', (): void => {
    const first = axis('u', 3);
    const second = axis('p', 4);
    const merged = axis('x', 5);
    const reindexing = new cat.StrideMorphism(
        [first, second],
        [[merged, [new nm.Integer(4), new nm.Integer(1)], new nm.Integer(0)]],
        new fd.DynamicName('cand'));
    const target = new cat.Broadcasted(
        new aops.CovariantView(new fd.DynamicName('cand'), reindexing),
        [new cat.Weave(new cat.Reals(), [first, second])],
        [new cat.Weave(new cat.Reals(), [merged])],
        [],
    );
    const handler = render_handler();
    const renderer = new bb.BroadcastedRenderer(
        handler, new scr.StrideRenderer(handler, {minimum_reindexing_height: 44}));

    assert.equal(new boxes.CovariantViewBox(renderer, target).core.dims.y, 44);
});
