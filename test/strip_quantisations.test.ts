// Claude Opus 5.5 (1M context), effort 40.
/*
 * The dequantisation functor of `src/quantization/algebra/strip_quantisations.ts`,
 * the tag sharing of `src/data_structure_processing/share_block_tags.ts`, and the
 * auxiliary information `src/advanced_display/derivedFigures.ts` carries across.
 * Every term the tests read is built in this file.
 */
import * as assert from 'node:assert/strict';
import {test} from 'node:test';

import {REGISTERED_MODULES} from './registered_terms';
import * as cat from '../src/data_structure/Category';
import * as ops from '../src/data_structure/Operators';
import * as nm from '../src/data_structure/Numeric';
import * as fd from '../src/data_structure/Term';
import * as pdt from '../src/para/data_structure/Para';
import * as para_wrap from '../src/para/data_structure/ParaWrap';
import * as deepseek from '../src/deepseek/data_structure';
import * as Quantization from '../src/quantization/data_structure/Quantization';
import * as strip from '../src/quantization/algebra/strip_quantisations';
import * as share from '../src/data_structure_processing/share_block_tags';
import * as derived from '../src/advanced_display/derivedFigures';
import * as dt_json from '../src/data_transfer/json';
import type * as aux from '../src/advanced_display/AuxiliaryInformation';

void REGISTERED_MODULES;

type Datatype = cat.Datatype;
type AnyArray = cat.Array<Datatype, cat.Axis>;
type AnyMorphism = cat.Morphism<AnyArray>;

const REALS = new cat.Reals();

function quantised(size: number, form: Quantization.Encoding): Quantization.Quantified {
    return new Quantization.Quantified(
        REALS, new nm.Integer(size), new nm.Integer(32 / size), form);
}

const BF16 = quantised(16, Quantization.Encoding.BF16);
const FP32 = quantised(32, Quantization.Encoding.FP32);
const E4M3 = new Quantization.Quantified(
    REALS, new nm.Integer(8), new nm.Integer(4), Quantization.Encoding.E4M3,
    new Quantization.BlockScale(Quantization.Encoding.UE8M0, new nm.Integer(32)));

function axis(name: string): cat.RawAxis {
    return new cat.RawAxis(new fd.UID({__registered__: 'type', repr: 'RawAxis'}, undefined,
        new fd.DynamicName(name)));
}

const Q = axis('q');

/* One operation over the axis `q`, reading `source` and writing `target`. */
function operation(
    operator: cat.Operator, source: Datatype, target: Datatype,
): cat.Broadcasted<Datatype, cat.Axis> {
    return new cat.Broadcasted(
        operator,
        [new cat.Weave(source, [Q])],
        [new cat.Weave(target, [Q])],
        [new cat.Rearrangement([], [])]);
}

function cast(source: Datatype, target: Datatype): cat.Broadcasted<Datatype, cat.Axis> {
    return operation(new Quantization.TypeConvert(null, source, target), source, target);
}

function sigma(datatype: Datatype): cat.Broadcasted<Datatype, cat.Axis> {
    return operation(new ops.Einops(new fd.DynamicName('f'), [[0]]), datatype, datatype);
}

function tag(title: string): cat.BlockTag {
    return new cat.BlockTag(fd.UID.template('BlockTag'), new nm.Integer(1),
        new cat.BlockAesthetics(title));
}

function box(title: string, body: AnyMorphism): cat.Broadcasted<Datatype, cat.Axis> {
    const block = new cat.Block(body, tag(title));
    const dom = body.dom().content[0].datatype;
    const cod = body.cod().content[0].datatype;
    return operation(new ops.BlockOperator(null, block as any), dom, cod);
}

function composed(...content: AnyMorphism[]): cat.Composed<AnyArray, AnyMorphism> {
    return new cat.Composed(content);
}

function holds(term: unknown, found: (node: object) => boolean): boolean {
    const entered = new Set<object>();
    const unentered: unknown[] = [term];
    while (unentered.length) {
        const node = unentered.pop();
        if (node === null || typeof node !== 'object' || entered.has(node)) {
            continue;
        }
        entered.add(node);
        if (found(node)) {
            return true;
        }
        Object.values(node).forEach((part) => unentered.push(part));
    }
    return false;
}

const holds_a_quantisation = (term: unknown): boolean =>
    holds(term, (node) => node instanceof Quantization.Quantified);
const holds_a_cast = (term: unknown): boolean => holds(term, (node) =>
    node instanceof cat.Broadcasted && node.operator instanceof Quantization.TypeConvert);

test('every quantisation is taken off, under whatever wrappers hold it', (): void => {
    const complex = new deepseek.Complex(BF16);

    assert.deepEqual(strip.without_quantisations(complex), new deepseek.Complex(REALS));
    assert.equal(strip.quantisation_of(new deepseek.Complex(E4M3)), E4M3);
    assert.equal(strip.quantisation_of(REALS), null);
});

test('a cast that becomes an identity is simplified out of a composition', (): void => {
    const term = composed(sigma(BF16), cast(BF16, FP32), sigma(FP32));

    const result = strip.strip_quantisations(term).term as cat.Composed<AnyArray, AnyMorphism>;

    assert.ok(result instanceof cat.Composed);
    assert.equal(result.content.length, 2);
    assert.ok(!holds_a_quantisation(result) && !holds_a_cast(result));
    assert.deepEqual(result.content[0].cod().content, result.content[1].dom().content);
});

test('the box explaining a cast is the identity once the cast is', (): void => {
    const explained = box('Cast', cast(BF16, E4M3));
    const term = composed(sigma(BF16), explained, sigma(E4M3));

    const result = strip.strip_quantisations(term).term as cat.Composed<AnyArray, AnyMorphism>;

    assert.equal(result.content.length, 2);
    assert.ok(!holds(result, (node) => node instanceof ops.BlockOperator));
});

test('identities layer upwards through blocks, compositions and products', (): void => {
    const only_casts = new cat.Block(
        composed(cast(BF16, FP32), cast(FP32, BF16)), tag('Round Trip'));
    const product = new cat.ProductOfMorphisms([cast(BF16, FP32), cast(E4M3, BF16)]);

    assert.ok(strip.is_identity(strip.strip_quantisations(only_casts).term));
    const inside = strip.strip_quantisations(composed(sigma(BF16), only_casts)).term;
    assert.ok(inside instanceof cat.Broadcasted);
    const stripped_product = strip.strip_quantisations(product).term;
    assert.ok(stripped_product instanceof cat.Rearrangement);
    assert.deepEqual(stripped_product.mapping, [0, 1]);
    const composition = strip.strip_quantisations(
        composed(cast(BF16, FP32), cast(FP32, BF16))).term;
    assert.ok(composition instanceof cat.Rearrangement);
});

test('a product keeps its other factors and an identity in place of a cast', (): void => {
    const product = new cat.ProductOfMorphisms([cast(BF16, FP32), sigma(BF16)]);

    const result = strip.strip_quantisations(product).term as cat.ProductOfMorphisms<
        AnyArray, AnyMorphism>;

    assert.ok(result instanceof cat.ProductOfMorphisms);
    assert.ok(result.content[0] instanceof cat.Rearrangement);
    assert.ok(result.content[1] instanceof cat.Broadcasted);
});

test('a wrap that grabs keeps the identity as its body', (): void => {
    const slot = new pdt.TapeSlot(fd.UID.template('TapeSlot'));
    const wrap = new para_wrap.ParaWrap(cast(BF16, FP32), [slot], [null]);

    const result = strip.strip_quantisations(composed(wrap as never, sigma(FP32))).term;

    assert.ok(result instanceof cat.Composed);
    const kept = result.content[0] as para_wrap.ParaWrap<AnyArray, AnyMorphism>;
    assert.ok(kept instanceof para_wrap.ParaWrap);
    assert.ok(kept.body instanceof cat.Rearrangement);
    assert.equal(kept.grabs[0], slot);
});

test('a cast that still converts once dequantised stays', (): void => {
    const bound = new cat.Natural(new nm.Integer(8));
    const wider = new cat.Natural(new nm.Integer(16));
    const index_cast = cast(
        new Quantization.Quantified(bound, new nm.Integer(64)),
        new Quantization.Quantified(wider, new nm.Integer(32)));

    const result = strip.strip_quantisations(composed(index_cast, sigma(wider))).term;

    assert.ok(holds_a_cast(result));
    assert.ok(!holds_a_quantisation(result));
});

test('a term holding no quantisation and no identity comes back as itself', (): void => {
    const term = composed(sigma(REALS), sigma(REALS));

    assert.equal(strip.strip_quantisations(term).term, term);
});

test('a subterm reached along two paths is rewritten once', (): void => {
    const shared = sigma(BF16);
    const term = new cat.ProductOfMorphisms([shared, shared]);

    const result = strip.strip_quantisations(term).term as cat.ProductOfMorphisms<
        AnyArray, AnyMorphism>;

    assert.equal(result.content[0], result.content[1]);
    assert.notEqual(result.content[0], shared);
});

test('blocks the functor made equal share the tag of the first', (): void => {
    const first = new cat.Block(sigma(BF16), tag('Norm'));
    const second = new cat.Block(sigma(FP32), tag('Norm'));
    const other = new cat.Block(sigma(FP32), tag('Other'));
    const term = composed(first, cast(BF16, FP32), second, other);

    const result = share.share_tags_between_equal_blocks(
        strip.strip_quantisations(term).term).term as cat.Composed<AnyArray, AnyMorphism>;

    const tags = result.content.map((part) => (part as cat.Block<any, any>).block_tag);
    assert.equal(tags.length, 3);
    assert.equal(tags[0], first.block_tag);
    assert.equal(tags[1], first.block_tag);
    assert.equal(tags[2], other.block_tag);
});

/* A document the importer reads, holding a composition of a map in BF16, a cast
 * boxed to explain it, and a map in FP32, so the importer numbers the three
 * outer broadcasts 0, 1 and 3 and the cast inside the box 2. */
function quantised_document(): object {
    const numeric = (value: number): object => ({__type__: 'Integer', _value: value});
    const datatype = (size: number, form: string): object => ({
        __type__: 'Quantified', wraps: {__type__: 'Reals'}, size: numeric(size),
        vector: numeric(32 / size), form: {__registered__: 'enum', type: 'Encoding', name: form},
        scale: null,
    });
    const name = (body: string): object => ({
        __type__: 'DynamicName', body, subscript: null, settings: null,
        code_form: null, exponent: null,
    });
    const weave = (d: object): object => ({__type__: 'Weave', datatype: d, _shape: []});
    const broadcast = (operator: object, source: object, target: object): object => ({
        __type__: 'Broadcasted', operator, input_weaves: [weave(source)],
        output_weaves: [weave(target)],
        reindexings: [{__type__: 'Rearrangement', mapping: [], _dom: []}],
        backup_degree: null,
    });
    const bf16 = datatype(16, 'BF16');
    const fp32 = datatype(32, 'FP32');
    const map = (d: object): object => broadcast(
        {__type__: 'Einops', name: name('f'), signature: [[0]]}, d, d);
    const cast_box = broadcast({
        __type__: 'BlockOperator', name: null,
        block: {
            __type__: 'Block',
            body: broadcast({__type__: 'TypeConvert', name: null, source: bf16, target: fp32},
                bf16, fp32),
            block_tag: {__ref__: 77},
        },
    }, bf16, fp32);
    return {
        uid_repository: {
            77: {
                __type__: 'BlockTag',
                uid: {__type__: 'UID', _type: {__registered__: 'type', repr: 'BlockTag'},
                    _id: 77, _name: null},
                repetition: numeric(1),
                aesthetics: {__type__: 'BlockAesthetics', title: 'Cast', description: null,
                    fill_color: null, references: null, formula: null, drawing: null},
            },
        },
        data: {__type__: 'Composed', content: [map(bf16), cast_box, map(fp32)]},
    };
}

function expansion(operator: string): aux.OperatorExpansion {
    return {
        operator, latex: null, formula: '', description: operator,
        expansion: '{}', auxiliary: {},
    };
}

test('the derived figure keeps the records of what it still holds', async (): Promise<void> => {
    const term = await dt_json.TermJSONConverter.import(quantised_document());
    const auxiliary: aux.DiagramAuxiliary = {
        legend: [],
        blocks: {77: {title: 'Cast', description: null, references: []}},
        expansions: {0: expansion('Einops'), 2: expansion('TypeConvert'), 3: expansion('Einops')},
    };

    const figure = derived.dequantised_figure({term: term as never, auxiliary});

    const result = figure.term as cat.Composed<AnyArray, AnyMorphism>;
    assert.equal(result.content.length, 2);
    assert.deepEqual(
        result.content.map((part) => dt_json.broadcast_occurrence(part)), [0, 3]);
    assert.deepEqual(Object.keys(figure.auxiliary?.blocks ?? {}), []);
    assert.deepEqual(Object.keys(figure.auxiliary?.expansions ?? {}), ['0', '3']);
    assert.equal(figure.auxiliary?.expansions?.['0'].functor, derived.DEQUANTISE);
    assert.equal(dt_json.broadcast_occurrence((term as never as cat.Composed<any, any>)
        .content[2]), 3);
});

test('an unknown functor is refused by name', (): void => {
    assert.throws(() => derived.figure_functor('toString'), /No functor is named "toString"/);
});
