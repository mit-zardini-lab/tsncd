import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as Color from '../src/utilities/Color';

test('CSS color forms resolve through the shared Color model', (): void => {
    for (const value of ['#f80', '#ff8800', 'rgb(255,136,0)', 'hsl(32,100%,50%)']) {
        assert.equal(Color.Color.from_css(value)?.hex(), '#ff8800');
    }
    assert.equal(Color.Color.from_css('blue')?.hex(), '#0000ff');
    assert.equal(Color.Color.from_css('var(--accent)'), undefined);
    assert.equal(Color.Color.from_h360sv(-30).hex(), Color.Color.from_h360sv(330).hex());
});

test('color adjustments preserve their source and raise foreground luminance', (): void => {
    const source = Color.Color.from_hex('#203040');
    const adjusted = source.with_minimum_luminance(0.62);
    assert.ok(Math.abs(adjusted.luminance - 0.62) < 1e-10);
    assert.equal(source.hex(), '#203040');
    assert.equal(source.blend(Color.Color.from_hex('#ffffff'), 0).hex(), '#203040');
    assert.equal(source.blend(Color.Color.from_hex('#ffffff'), 1).hex(), '#ffffff');
});
