// GPT-6 Astra, high reasoning effort.
import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import * as cat from '../src/data_structure/Category';
import * as ops from '../src/data_structure/Operators';
import {decompress_json} from '../src/data_transfer/json_compression';
import {TermJSONConverter, broadcast_occurrence} from '../src/data_transfer/json';

const fixture = JSON.parse(readFileSync(
    new URL('./fixtures/compressed_term.json', import.meta.url), 'utf8'));

[cat, ops].forEach(module => module);

test('Python compressed values retain types, object fields and order', () => {
    const restored = decompress_json(fixture.compressed_values);
    assert.deepEqual(restored, fixture.values);
    assert.deepEqual(Object.keys(restored as object), ['z', 'a', 'empty']);
    assert.equal(Object.prototype.hasOwnProperty.call(
        (restored as any).a, '__proto__'), true);
    assert.equal(({} as any).value, undefined);
});

test('compressed terms retain occurrence numbers and UID sharing', async () => {
    assert.deepEqual(decompress_json(fixture.compressed), fixture.legacy);
    const legacy = await TermJSONConverter.import(fixture.legacy);
    const compressed = await TermJSONConverter.import(fixture.compressed) as any;
    assert.deepEqual(compressed, legacy);
    assert.notEqual(compressed[0], compressed[1]);
    assert.equal(broadcast_occurrence(compressed[0]), 0);
    assert.equal(broadcast_occurrence(compressed[1]), 1);
    assert.ok(compressed[0].input_weaves[0]._shape[0] instanceof cat.RawAxis);
    assert.equal(compressed[0].input_weaves[0]._shape[0], compressed[1].input_weaves[0]._shape[0]);
});

test('missing, forward, cyclic and malformed JSON references are rejected', () => {
    const valid = {export_form: 'compressed', version: 1, value_repository: [[0, null]], data: 0};
    for (const change of [
        {version: 2}, {version: true}, {data: -1}, {data: true},
        {data: 0.5}, {data: 9}, {value_repository: [[1, [0]]]},
        {value_repository: [[1, [-1]]]}, {value_repository: [[0, []]]},
        {value_repository: [[0, Infinity]]}, {value_repository: [[9, []]]},
        {value_repository: [[0, 'x'], [2, [0]]], data: 1},
        {value_repository: [[0, 'x'], [2, [0, 0, 0, 0]]], data: 1},
        {value_repository: [[0, 1], [2, [0, 0]]], data: 1},
    ]) {
        assert.throws(() => decompress_json({...valid, ...change}));
    }
});

test('the term importer rejects unknown export forms', async () => {
    await assert.rejects(TermJSONConverter.import({...fixture.legacy, export_form: 'future'}));
});
