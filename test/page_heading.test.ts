// Claude Fable 5.1, effort 80.
import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as page_heading from '../src/display/pageHeading';
import * as rhs from '../src/display/Render/RenderHandlerSettings';

test('the tab reads the page name and the title the message sends', (): void => {
    assert.equal(page_heading.heading_text(undefined), 'tsncd');
    assert.equal(page_heading.heading_text(''), 'tsncd');
    assert.equal(
        page_heading.heading_text('DeepSeekV4.1'), 'tsncd - DeepSeekV4.1');
});

test('the heading is hidden unless the message asks for it', (): void => {
    assert.equal(rhs.defaultRenderHandlerSettings.heading, 'none');
    assert.equal(page_heading.shows_heading(undefined), false);
    assert.equal(page_heading.shows_heading({}), false);
    assert.equal(page_heading.shows_heading({heading: 'none'}), false);
    assert.equal(
        page_heading.shows_heading({heading: 'title', title: 'DeepSeekV4.1'}),
        true);
    assert.equal(page_heading.shows_heading({heading: 'title'}), true);
});
