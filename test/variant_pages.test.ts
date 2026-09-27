// Claude Opus 5.5 (1M context), effort 40.
/*
 * A page carrying several variants of a model: the decoding of one variant's
 * records from the shared repository in `src/data_transfer/json_compression.ts`,
 * the reader of the `tsncd-variants` element in
 * `src/data_transfer/embedded_variants.ts`, and the switch and the selector state
 * of `src/advanced_display/variantSelector.ts` over the figures
 * `src/advanced_display/variantFigures.ts` builds.
 */
import * as assert from 'node:assert/strict';
import {test} from 'node:test';

import {REGISTERED_MODULES} from './registered_terms';
import * as cat from '../src/data_structure/Category';
import * as json_compression from '../src/data_transfer/json_compression';
import * as embedded_variants from '../src/data_transfer/embedded_variants';
import * as variant_figures from '../src/advanced_display/variantFigures';
import * as variant_selector from '../src/advanced_display/variantSelector';
import * as page_choices from '../src/advanced_display/pageChoices';
import type * as display_selector from '../src/advanced_display/displaySelector';
import type {JSONType} from '../src/data_transfer/json';

void REGISTERED_MODULES;

/* `values` compressed into one repository in the form `pyncd`'s
 * `json_compression.compress_json_values` writes, with equal values sharing a
 * record. */
function compressed(values: unknown[]): {records: unknown[]; roots: number[]} {
    const records: unknown[] = [];
    const known = new Map<string, number>();
    const reference = (value: unknown): number => {
        const record = Array.isArray(value)
            ? [1, value.map(reference)]
            : value !== null && typeof value === 'object'
                ? [2, Object.entries(value).flatMap(([key, part]) =>
                    [reference(key), reference(part)])]
                : [0, value];
        const key = JSON.stringify(record);
        const found = known.get(key);
        if (found !== undefined) {
            return found;
        }
        records.push(record);
        known.set(key, records.length - 1);
        return records.length - 1;
    };
    return {records, roots: values.map(reference)};
}

test('one root decodes only the records it reaches', (): void => {
    const {records, roots} = compressed([{a: [1, 2]}, {b: 'x'}]);
    const decoded: JSONType[] = [];

    assert.deepEqual(json_compression.decompress_root(records, roots[1], decoded), {b: 'x'});
    assert.ok(!(0 in decoded));
    assert.deepEqual(json_compression.decompress_root(records, roots[0], decoded), {a: [1, 2]});
});

test('two roots share the containers of the records they share', (): void => {
    const shared = {deep: [1, 2, 3]};
    const {records, roots} = compressed([{one: shared}, {two: shared}]);
    const decoded: JSONType[] = [];

    const one = json_compression.decompress_root(records, roots[0], decoded) as any;
    const two = json_compression.decompress_root(records, roots[1], decoded) as any;

    assert.equal(one.one, two.two);
});

test('a reference to the record itself or a later one is refused', (): void => {
    assert.throws(() => json_compression.decompress_root([[1, [1]], [0, 1]], 0, []),
        /Invalid JSON reference 1/);
    assert.throws(() => json_compression.decompress_root([[0, 1]], 3, []),
        /Invalid JSON reference 3/);
});

/* A term the importer reads: the identity on one array of reals. */
function identity_document(): object {
    return {
        uid_repository: {},
        data: {
            __type__: 'Rearrangement', mapping: [0],
            _dom: [{__type__: 'Array', datatype: {__type__: 'Reals'}, _shape: []}],
        },
    };
}

function message(title: string): object {
    return {
        msgType: 'dataUpdate', data: identity_document(),
        settings: {title, darkMode: false}, auxiliary: {legend: []},
    };
}

function page_variants(): embedded_variants.EmbeddedVariants {
    const {records, roots} = compressed([message('A'), message('B')]);
    return embedded_variants.checked_variants({
        version: 1,
        settings: {form: 'all-broadcasted', darkMode: false},
        initial: 'a',
        groups: [{id: 'decode', title: 'Decode'}, {id: 'cached', title: 'Cached'}],
        variants: [
            {id: 'a', group: 'decode', title: 'Quantised', detail: 'd', message: roots[0]},
            {id: 'b', group: 'decode', title: 'Other', message: roots[1]},
            {id: 'c', group: 'cached', title: 'Unquantised', derivedFrom: 'a',
             functor: 'dequantise', settings: {title: 'C'}},
        ],
        value_repository: records,
    });
}

test('the reader refuses a variants element whose facts do not hold', (): void => {
    const valid = page_variants() as unknown as Record<string, unknown>;
    const variants = valid.variants as Record<string, unknown>[];
    const cases: [Record<string, unknown>, RegExp][] = [
        [{...valid, version: 2}, /version 2/],
        [{...valid, initial: 'z'}, /initial variant "z"/],
        [{...valid, variants: [...variants, {...variants[0]}]}, /distinct ids/],
        [{...valid, variants: [{...variants[0], group: 'x'}]}, /group x/],
        [{...valid, variants: [{...variants[0], derivedFrom: 'b', functor: 'dequantise'}]},
            /both a message and a derivation/],
        [{...valid, variants: [variants[0], {...variants[2], derivedFrom: 'c'}]},
            /derived from c, which carries no message/],
    ];
    cases.forEach(([element, reason]) => assert.throws(
        () => embedded_variants.checked_variants(element),
        (error: unknown) => error instanceof embedded_variants.MalformedVariants
            && reason.test(error.message)));
});

test('a message is decoded as it is written, and the page applies its address', (): void => {
    const repository = new embedded_variants.VariantRepository(page_variants());

    const decoded = repository.message_of(repository.variant('a'));

    assert.deepEqual(decoded.settings, {title: 'A', darkMode: false});
});

test('the address names a variant the page offers and refuses any other', (): void => {
    const offered = page_variants().variants.map((variant) => variant.id);

    assert.equal(page_choices.choice_requested_by_address(
        'https://example.org/p.html?variant=c&form=arrows-and-boxes', offered).variant, 'c');
    assert.throws(
        () => page_choices.choice_requested_by_address(
            'https://example.org/p.html?variant=z', offered),
        (error: unknown) => error instanceof page_choices.RefusedChoice
            && error.refusal.parameter === 'variant' && error.refusal.value === 'z');
});

test('a variant keeps the form and the theme of the figure on display', (): void => {
    const own = {title: 'B', form: 'arrows-and-boxes' as const, darkMode: true};

    assert.equal(variant_selector.settings_for_variant(own, undefined).form, 'arrows-and-boxes');
    const kept = variant_selector.settings_for_variant(own, {
        form: 'all-broadcasted', darkMode: false, title: 'A'});
    assert.deepEqual([kept.form, kept.darkMode, kept.title], ['all-broadcasted', false, 'B']);
});

test('a form and a theme named with a variant win over the ones on display', (): void => {
    const own = {title: 'B', form: 'arrows-and-boxes' as const, darkMode: true};

    const chosen = variant_selector.settings_for_variant(
        own, {form: 'all-broadcasted', darkMode: false}, {form: 'arrows-and-broadcasted'});

    assert.deepEqual([chosen.form, chosen.darkMode], ['arrows-and-broadcasted', false]);
});

test('the selector reads in the theme of each draw', (): void => {
    assert.equal(variant_selector.selector_colours({darkMode: false}).accent, '#750014');
    assert.notEqual(variant_selector.selector_colours({darkMode: true}).surface,
        variant_selector.selector_colours({darkMode: false}).surface);
});

interface SwitchRecord {
    switch_: variant_selector.VariantSwitch;
    announced: string[];
    drawn: string[];
    titles: (string | undefined)[];
    chosen: display_selector.DisplayChoice[];
    figures: variant_figures.VariantFigures;
}

function switch_over_page(): SwitchRecord {
    const repository = new embedded_variants.VariantRepository(page_variants());
    const figures = new variant_figures.VariantFigures(repository);
    const record: SwitchRecord = {
        announced: [], drawn: [], titles: [], chosen: [], figures,
        switch_: undefined as never,
    };
    record.switch_ = variant_selector.make_variant_switch({
        figures,
        draw: (_id, figure, chosen) => {
            record.titles.push(figure.settings.title);
            record.chosen.push(chosen);
        },
        announce: async (text) => {
            record.announced.push(text);
        },
        dismiss: () => undefined,
        report_failure: () => undefined,
        settled: async () => undefined,
        drawn: (id) => record.drawn.push(id),
    });
    return record;
}

test('a variant is loaded, drawn and kept', async (): Promise<void> => {
    const record = switch_over_page();

    await record.switch_.variant('a');
    await record.switch_.variant('b');
    await record.switch_.variant('a');

    assert.deepEqual(record.drawn, ['a', 'b', 'a']);
    assert.deepEqual(record.titles, ['A', 'B', 'A']);
    assert.deepEqual(record.announced, [
        'Loading Decode, Quantised…', 'Drawing Decode, Quantised…',
        'Loading Decode, Other…', 'Drawing Decode, Other…',
        'Drawing Decode, Quantised…',
    ]);
    assert.equal(record.switch_.current(), 'a');
});

test('a derived variant says it applies the dequantisation functor', async (): Promise<void> => {
    const record = switch_over_page();

    await record.switch_.variant('c');

    assert.deepEqual(record.announced, [
        'Loading Decode, Quantised…', 'Applying Dequantization Functor...',
        'Drawing Cached, Unquantised…',
    ]);
    assert.deepEqual(record.titles, ['C']);
    assert.ok(record.figures.is_built('a') && record.figures.is_built('c'));
    assert.deepEqual(record.figures.timings.map((timing) => timing.step),
        ['decode', 'import', 'functor']);
});

test('the variant asked for last is the one drawn', async (): Promise<void> => {
    const record = switch_over_page();

    const first = record.switch_.variant('a');
    const second = record.switch_.variant('b');
    await Promise.all([first, second]);

    assert.deepEqual(record.drawn, ['b']);
});

test('the variant on display is drawn again for a form or a theme and not for neither',
     async (): Promise<void> => {
    const record = switch_over_page();

    await record.switch_.variant('a');
    await record.switch_.variant('a');
    await record.switch_.variant('a', {form: 'arrows-and-boxes'});

    assert.deepEqual(record.drawn, ['a', 'a']);
    assert.deepEqual(record.chosen, [{}, {form: 'arrows-and-boxes'}]);
});

test('a choice made with a replaced request is kept for the variant drawn',
     async (): Promise<void> => {
    const record = switch_over_page();

    const first = record.switch_.variant('a', {form: 'arrows-and-boxes'});
    const second = record.switch_.variant('b', {darkMode: true});
    await Promise.all([first, second]);

    assert.deepEqual(record.drawn, ['b']);
    assert.deepEqual(record.chosen, [{form: 'arrows-and-boxes', darkMode: true}]);
});

test('a variant the page does not carry is refused', async (): Promise<void> => {
    const record = switch_over_page();

    await assert.rejects(record.switch_.variant('z'), /No variant has the id "z"/);
    assert.deepEqual(record.drawn, []);
});

test('the figure of a variant is the term its message carries', async (): Promise<void> => {
    const record = switch_over_page();

    const figure = await record.figures.figure_of('a', async () => undefined);

    assert.ok(figure.term instanceof cat.Rearrangement);
    assert.deepEqual(figure.auxiliary, {legend: []});
});

test('an auxiliary supplied for a derived variant is carried across the functor', async (): Promise<void> => {
    const block = {title: 'Cast', formula: null, description: 'BF16 to FP32', references: []};
    const supplied = {
        legend: [{latex: 'm', text: 'm', size: 8, codeName: 'dim', sizeCodeName: null, uids: [1]}],
        blocks: {'17': block},
    };
    const {records, roots} = compressed([message('A'), supplied]);
    const repository = new embedded_variants.VariantRepository(
        embedded_variants.checked_variants({
            version: 1, initial: 'a',
            groups: [{id: 'decode', title: 'Decode'}],
            variants: [
                {id: 'a', group: 'decode', title: 'Quantised', message: roots[0]},
                {id: 'c', group: 'decode', title: 'Unquantised', derivedFrom: 'a',
                 functor: 'dequantise', auxiliary: roots[1]},
            ],
            value_repository: records,
        }));
    const figures = new variant_figures.VariantFigures(repository);

    const figure = await figures.figure_of('c', async () => undefined);

    assert.deepEqual(figure.auxiliary, {legend: supplied.legend, blocks: {}});
});
