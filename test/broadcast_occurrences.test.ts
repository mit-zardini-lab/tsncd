// Claude Opus 5, effort high.
/*
 * The numbering `TermJSONConverter` gives each `Broadcasted` it builds.
 *
 * An operator expansion is keyed by that number, because a `Broadcasted`
 * carries no uid and nothing sent beside a term can name one of them by
 * identity. `pyncd`'s `data_transfer/broadcast_occurrences.py` numbers the same
 * nodes from the Python term, so the two walks agree only if the importer
 * counts a node when it enters it. Each fixture below was exported by `pyncd`
 * with its own auxiliary information, and every expansion key has to land on a
 * node whose operator is the class the sender named.
 */

import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

import * as cat from '../src/data_structure/Category';
import * as para_wrap from '../src/para/data_structure/ParaWrap';
import * as para_block_operator from '../src/para/data_structure/ParaBlockOperator';
import * as contravariant from '../src/para/data_structure/Contravariant';
import * as multicategory from '../src/para/data_structure/MultiCategory';
import * as quantization from '../src/quantization/data_structure/Quantization';
import * as affine_guards from '../src/advanced_axis_dynamics/data_structure/AffineGuards';
import * as advanced_axis_operators from '../src/advanced_axis_dynamics/data_structure/Operators';
import * as axis_concatenation from '../src/advanced_axis_dynamics/data_structure/AxisConcatenation';
import * as deepseek from '../src/deepseek/data_structure';
import * as fd from '../src/data_structure/Term';
import * as dt_json from '../src/data_transfer/json';
import type * as aux from '../src/advanced_display/AuxiliaryInformation';

const REGISTERED_MODULES = [
    cat, para_wrap, para_block_operator, contravariant, multicategory,
    quantization, affine_guards, advanced_axis_operators, axis_concatenation,
    deepseek,
];

interface DiagramPayload {
    data: string;
    settings: Record<string, unknown>;
    auxiliary: aux.DiagramAuxiliary;
}

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

function read_payload(file: string): DiagramPayload {
    return JSON.parse(readFileSync(file, 'utf8')) as DiagramPayload;
}

function fixture(name: string): DiagramPayload {
    return read_payload(path.join(TEST_DIRECTORY, 'fixtures', name));
}

/** Every `Broadcasted` of `term`, keyed by the number the importer gave it. */
function numbered_broadcasts(
    term: unknown,
): Map<number, cat.Broadcasted<any, any>> {
    const numbered = new Map<number, cat.Broadcasted<any, any>>();
    const seen = new Set<object>();
    const walk = (value: unknown): void => {
        if (value === null || typeof value !== 'object' || seen.has(value)) {
            return;
        }
        seen.add(value);
        if (Array.isArray(value)) {
            value.forEach(walk);
            return;
        }
        if (!(value instanceof fd.Term)) {
            return;
        }
        if (value instanceof cat.Broadcasted) {
            const occurrence = dt_json.broadcast_occurrence(value);
            if (occurrence !== undefined) {
                numbered.set(occurrence, value);
            }
        }
        Object.values(value.dict()).forEach(walk);
    };
    walk(term);
    return numbered;
}

async function numbered_operators(
    payload: DiagramPayload,
): Promise<Map<number, string>> {
    REGISTERED_MODULES.forEach((module) => module);
    const term = await dt_json.TermJSONConverter.import(JSON.parse(payload.data));
    return new Map([...numbered_broadcasts(term)].map(
        ([occurrence, broadcast]) =>
            [occurrence, broadcast.operator.constructor.name]));
}

async function check_expansion_keys(payload: DiagramPayload): Promise<number> {
    const operators = await numbered_operators(payload);
    const expansions = payload.auxiliary.expansions ?? {};
    Object.entries(expansions).forEach(([key, expansion]) => {
        assert.equal(
            operators.get(Number(key)), expansion.operator,
            `broadcast ${key} is ${operators.get(Number(key))}, and the sender `
            + `keyed its expansion as ${expansion.operator}`);
    });
    return Object.keys(expansions).length;
}

test('the small figure numbers its Normalize and its SoftMax',
    async (): Promise<void> => {
        const payload = fixture('small.json');
        const operators = await numbered_operators(payload);
        assert.equal(operators.get(2), 'Normalize');
        assert.equal(operators.get(3), 'SoftMax');
        assert.equal(await check_expansion_keys(payload), 2);
    });

test('every expansion key of the sliding-window figure names its operator',
    async (): Promise<void> => {
        assert.equal(await check_expansion_keys(fixture('swa.json')), 2);
    });
