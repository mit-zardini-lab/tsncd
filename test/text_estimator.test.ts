import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as TextEstimator from '../src/display/Render/TextEstimator';

test('text estimates scale in both dimensions with the font size', (): void => {
    const small = TextEstimator.estimate_text_dims(['{M}_{\\mathrm{gmem}}'], 0.65);
    const large = TextEstimator.estimate_text_dims(['{M}_{\\mathrm{gmem}}'], 1.3);
    assert.ok(large.x > small.x);
    assert.ok(large.y > small.y);
});

test('text estimates cover the measured width of a superscripted weight name', (): void => {
    const dims = TextEstimator.estimate_text_dims(['W^{KV}'], 1.2);
    assert.ok(dims.x >= 58);
});

test('text estimates reserve the widest of several lines', (): void => {
    const one_line = TextEstimator.estimate_text_dims(['\\text{long operator name}']);
    const two_lines = TextEstimator.estimate_text_dims(['x', '\\text{long operator name}']);
    assert.equal(two_lines.x, one_line.x);
    assert.ok(two_lines.y > one_line.y);
});

test('text estimates reserve height for scripts and fractions', (): void => {
    const plain = TextEstimator.estimate_text_dims(['A']);
    const scripted = TextEstimator.estimate_text_dims(['{A}_{i}^{j}']);
    const fraction = TextEstimator.estimate_text_dims(['\\frac{a}{b}']);
    assert.ok(scripted.y > plain.y);
    assert.ok(fraction.y > plain.y);
});
