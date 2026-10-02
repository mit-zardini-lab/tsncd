// Claude Opus 5 (1M context), effort high.
// Revised by Claude Opus 5.5 (1M context), effort 40: the keys of the naturals
// and the clauses of the line of free indices.
/*
 * What the legend and the inspection boxes rest on outside the browser: the
 * size an axis label is drawn at, the axes a legend row is named from, the
 * naturals a row of the second table is linked to by the key of their bound,
 * the clauses of the line under a formula, the table of icons a code reference
 * is drawn with, and the wording written onto the auxiliary information a
 * figure was rendered with. The drawing itself needs a document and is checked
 * by rendering a figure.
 */
import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as cat from '../src/data_structure/Category';
import * as fd from '../src/data_structure/Term';
import * as nm from '../src/data_structure/Numeric';
import * as rhs from '../src/display/Render/RenderHandlerSettings';
import * as find_axes_by_uid from '../src/data_structure_processing/find_axes_by_uid';
import * as find_naturals_by_key from '../src/data_structure_processing/find_naturals_by_key';
import * as Quantization from '../src/quantization/data_structure/Quantization';
import * as freeIndexLine from '../src/advanced_display/freeIndexLine';
import * as referenceIcons from '../src/advanced_display/referenceIcons';
import * as localisedDescriptions from '../src/advanced_display/localisedDescriptions';
import type * as aux from '../src/advanced_display/AuxiliaryInformation';
import {read_embedded_message} from '../src/data_transfer/embedded_message';

function axis(name: string, id: number): cat.RawAxis {
    return new cat.RawAxis(
        new fd.UID({'__registered__': 'type', 'repr': 'RawAxis'}, id,
                   new fd.DynamicName(name)));
}

test('an axis label is drawn at 0.8 em unless the message asks otherwise',
     (): void => {
    assert.equal(rhs.axis_label_font_size({}), rhs.AXIS_LABEL_FONT_SIZE);
    assert.equal(rhs.axis_label_font_size({}), 0.8);
    assert.equal(rhs.axis_label_font_size({axisLabelFontSize: 0.65}), 0.65);
    assert.equal(rhs.defaultRenderHandlerSettings.axisLabelFontSize, 0.8);
});

test('every axis of a term is found by its uid, once for each uid', (): void => {
    const m = axis('m', 11);
    const d = axis('d', 12);
    const shared = new cat.Array(new cat.Reals(), [m, d]);
    const found = find_axes_by_uid.find_axes_by_uid(
        new cat.ProdObject([shared, shared, new cat.Array(new cat.Reals(), [m])]));
    assert.deepEqual([...found.keys()].sort(), [m.uid._id, d.uid._id].sort());
    assert.equal(found.get(m.uid._id), m);
    assert.equal(found.get(d.uid._id), d);
});

function symbol(name: string, id: number): nm.FreeNumeric {
    return new nm.FreeNumeric(
        new fd.UID({'__registered__': 'type', 'repr': 'FreeNumeric'}, id,
                   new fd.DynamicName(name)));
}

test('the key of a bound is written as pyncd writes it', (): void => {
    const hashed = symbol('v', 1151854266);
    assert.equal(find_naturals_by_key.natural_key(symbol('v', 1495078367)),
                 '#1495078367');
    assert.equal(find_naturals_by_key.natural_key(new nm.Integer(63)), '63');
    assert.equal(find_naturals_by_key.natural_key(new nm.Integer(-1)), '-1');
    assert.equal(find_naturals_by_key.natural_key(new nm.Integer(2 ** 70)),
                 '1180591620717411303424');
    const power = new nm.Power(new nm.Integer(2), new nm.Integer(63));
    assert.equal(find_naturals_by_key.natural_key(power), '^(2,63)');
    assert.equal(
        find_naturals_by_key.natural_key(new nm.Multiplication(
            [power, new nm.Power(hashed, new nm.Integer(-1))])),
        '*(^(2,63),^(#1151854266,-1))');
    assert.equal(
        find_naturals_by_key.natural_key(new nm.Addition(
            [symbol('x_{new}', 271053727), symbol('x_{old}', 2106987274)])),
        '+(#271053727,#2106987274)');
    assert.equal(find_naturals_by_key.natural_key(new nm.Constant()), '?');
});

test('the naturals of a term are found in its arrays, inside a quantisation '
     + 'too, once for each key', (): void => {
    const x = axis('x', 21);
    const tokens = new cat.Natural(symbol('v', 31));
    const quantised = new Quantization.Quantified(
        new cat.Natural(symbol('p', 32)), new nm.Integer(32));
    const found = find_naturals_by_key.find_naturals_by_key(new cat.ProdObject([
        new cat.Array(tokens, [x]),
        new cat.Array(new cat.Natural(symbol('v', 31)), [x]),
        new cat.Array(quantised, [x]),
        new cat.Array(new cat.Reals(), [x]),
    ]));
    assert.deepEqual([...found.keys()].sort(), ['#31', '#32']);
    assert.equal(found.get('#31'), tokens);
    assert.deepEqual(
        find_naturals_by_key.naturals_of_datatype(quantised), [quantised.wraps]);
    assert.deepEqual(find_naturals_by_key.naturals_of_datatype(new cat.Reals()), []);
});

test('a clause under a formula names the index and the axis it ranges over',
     (): void => {
    const record = {index: 'j_{d}', axis: 'd'};
    assert.equal(freeIndexLine.clause_latex(record), 'j_{d} \\in d');
    assert.equal(freeIndexLine.tooltip_interval_latex(record),
                 '[0, \\lvert d \\rvert)');
});

test('a guarded index is written over the positions of its axis that hold a value',
     (): void => {
    const windowed = {index: 'j_{w|x}', axis: 'w|x',
                      range: '[0, \\min(i_{x}, |w| - 1)]',
                      condition: 'j_{w|x} \\le i_{x}'};
    assert.equal(freeIndexLine.clause_latex(windowed),
                 'j_{w|x} \\in [0, \\min(i_{x}, |w| - 1)]');
    const strided = {index: 'i_{P|x}', axis: 'P|x',
                     condition: '|u|\\, i_{P|x} \\le k_{x}'};
    assert.equal(freeIndexLine.clause_latex(strided), 'i_{P|x} \\in P|x');
});

test('a reference draws the icon it names and nothing for a name the table '
     + 'does not hold', (): void => {
    const logo = referenceIcons.REFERENCE_ICONS['huggingface'];
    assert.ok(logo.startsWith('<svg'));
    assert.ok(logo.includes('viewBox="0 0 95 88"'));
    assert.equal(referenceIcons.REFERENCE_ICONS['github'], undefined);
});

function auxiliary_with_an_expansion(): aux.DiagramAuxiliary {
    return {
        blocks: {
            '11': {title: 'N', description: 'the norm', references: []},
            '12': {title: 'M', description: null, references: []},
        },
        expansions: {
            '3': {
                operator: 'SoftMax',
                latex: null,
                formula: 's',
                description: 'the softmax',
                expansion: '{}',
                auxiliary: {
                    blocks: {
                        '13': {title: 'S', description: 'a sum', references: []},
                    },
                },
            },
        },
    };
}

test('a wording writes the descriptions it carries onto the auxiliary '
     + 'information and leaves the titles alone', (): void => {
    const auxiliary = auxiliary_with_an_expansion();
    const localisations =
        new localisedDescriptions.DescriptionLocalisations(auxiliary);
    localisations.apply_localisation({
        blocks: {'11': 'ノルム', '12': '積'},
        expansions: {
            '3': {
                description: 'ソフトマックス',
                auxiliary: {blocks: {'13': '和'}, expansions: {}},
            },
        },
    });
    assert.equal(auxiliary.blocks!['11'].description, 'ノルム');
    assert.equal(auxiliary.blocks!['12'].description, '積');
    assert.equal(auxiliary.blocks!['11'].title, 'N');
    assert.equal(auxiliary.expansions!['3'].description, 'ソフトマックス');
    assert.equal(auxiliary.expansions!['3'].formula, 's');
    assert.equal(
        auxiliary.expansions!['3'].auxiliary.blocks!['13'].description, '和');
});

test('a wording is written over the one before it, and the exported '
     + 'descriptions come back', (): void => {
    const auxiliary = auxiliary_with_an_expansion();
    const localisations =
        new localisedDescriptions.DescriptionLocalisations(auxiliary);
    localisations.apply_localisation({
        blocks: {'11': 'ノルム', '12': '積'},
        expansions: {'3': {description: 'ソフトマックス'}},
    });
    localisations.apply_localisation({
        blocks: {'11': 'la norme'}, expansions: {},
    });
    assert.equal(auxiliary.blocks!['11'].description, 'la norme');
    assert.equal(auxiliary.blocks!['12'].description, null);
    assert.equal(auxiliary.expansions!['3'].description, 'the softmax');
    localisations.apply_localisation(undefined);
    assert.equal(auxiliary.blocks!['11'].description, 'the norm');
    assert.equal(auxiliary.blocks!['12'].description, null);
});

test('a wording naming a block the figure does not hold changes nothing',
     (): void => {
    const auxiliary = auxiliary_with_an_expansion();
    const localisations =
        new localisedDescriptions.DescriptionLocalisations(auxiliary);
    localisations.apply_localisation({
        blocks: {'99': 'a block of another figure'},
        expansions: {'99': {description: 'an operator of another figure'}},
    });
    assert.equal(auxiliary.blocks!['99'], undefined);
    assert.equal(auxiliary.expansions!['99'], undefined);
    assert.equal(auxiliary.blocks!['11'].description, 'the norm');
});


test('the fast display mode is the default and the message is read as written',
     (): void => {
    assert.equal(rhs.defaultRenderHandlerSettings.displayMode, 'fast');
    const message = {msgType: 'dataUpdate', data: '{}', settings: {width: 900}};
    const document = {
        URL: 'file:///figure.html?displayMode=slow',
        getElementById: () => ({textContent: JSON.stringify(message)}),
    } as unknown as Document;
    assert.deepEqual(read_embedded_message(document), message);
});
