// Claude Opus 5 (1M context), effort high.
/*
 * What the legend and the inspection boxes rest on outside the browser: the
 * size an axis label is drawn at, the axes a legend row is named from, the
 * table of icons a code reference is drawn with, and the wording written onto
 * the auxiliary information a figure was rendered with. The drawing itself
 * needs a document and is checked by rendering a figure.
 */
import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as cat from '../src/data_structure/Category';
import * as fd from '../src/data_structure/Term';
import * as rhs from '../src/display/Render/RenderHandlerSettings';
import * as find_axes_by_uid from '../src/data_structure_processing/find_axes_by_uid';
import * as referenceIcons from '../src/advanced_display/referenceIcons';
import * as localisedDescriptions from '../src/advanced_display/localisedDescriptions';
import type * as aux from '../src/advanced_display/AuxiliaryInformation';

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
