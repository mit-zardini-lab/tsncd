import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as HTMLEventHandler from '../src/display/HTMLRender/HTMLEventHandler';

test('open SVG paths only receive hover input on their visible stroke', (): void => {
    assert.equal(HTMLEventHandler.svg_hover_pointer_events('path'), 'visibleStroke');
    assert.equal(HTMLEventHandler.svg_hover_pointer_events('polygon'), 'all');
});
