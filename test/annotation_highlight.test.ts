import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as rh from '../src/display/Render/RenderHandler';
import * as scr from '../src/display/Framework/StrideCategoryRenderer';
import * as pwd from '../src/display/Framework/para/ParaWrapDisplay';
import * as rhs from '../src/display/Render/RenderHandlerSettings';

function render_handler(): rh.RenderHandler<unknown, unknown> {
    const Constructor = rh.RenderHandler as unknown as {
        new(): rh.RenderHandler<unknown, unknown>;
    };
    return new Constructor();
}

test('a label sets each hover token once however often it is asked', (): void => {
    const label = new rh.AnnotationElement(render_handler(), 'x');
    label.add_hover_token('axis:1');
    label.add_hover_token('slot:2');
    label.add_hover_token('axis:1');
    assert.deepEqual(label.hover_tokens, ['axis:1', 'slot:2']);
    assert.equal(label.halo_token, undefined);
});

test('an axis and a slot are named by their uids', (): void => {
    assert.equal(scr.axis_highlight_token(1670598927), 'axis:1670598927');
    assert.equal(pwd.tape_halo_width({'stroke-width': '2px'}), '4px');
});

test('axes answer the pointer from the legend alone unless asked for everywhere', (): void => {
    assert.equal(rhs.draws_axis_halos({}), true);
    assert.equal(rhs.axes_answer_the_pointer({}), false);
    assert.equal(rhs.draws_axis_halos({axisHover: 'off'}), false);
    assert.equal(rhs.axes_answer_the_pointer({axisHover: 'off'}), false);
    assert.equal(rhs.draws_axis_halos({axisHover: 'everywhere'}), true);
    assert.equal(rhs.axes_answer_the_pointer({axisHover: 'everywhere'}), true);
    assert.equal(rhs.defaultRenderHandlerSettings.axisHover, 'legend');
});
