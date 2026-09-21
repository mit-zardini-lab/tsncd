// Claude Opus 5 (1M context), effort high.
/*
 * Where `DynamicName.to_latex` draws the exponent a name carries.
 *
 * `pyncd`'s `algebra.write_axis_exponents` writes the size a configuration
 * assigned an axis into the exponent of that axis's name, and
 * `DynamicNameSettings.exponent_placement` says whether the figure raises that
 * size after the name or lowers it into the subscript. The two sides have to
 * agree character for character, because a figure drawn here is compared
 * against the latex `pyncd` prints for the same name.
 */

import * as assert from 'node:assert/strict';
import {test} from 'node:test';

import * as fd from '../src/data_structure/Term';

function settings(
    placement: fd.ExponentPlacement,
    absolute: boolean = false,
): fd.DynamicNameSettings {
    return new fd.DynamicNameSettings(false, false, absolute, false, placement);
}

/** A name with `body`, the subscript `subscript` where one is given, and the
 * integer `size` as its exponent. */
function sized_name(
    body: string,
    size: string,
    subscript: string | null,
    name_settings: fd.DynamicNameSettings | null,
): fd.DynamicName {
    return new fd.DynamicName(
        body,
        subscript === null ? null : new fd.DynamicName(subscript),
        name_settings,
        null,
        new fd.DynamicName(size));
}

test('a raised exponent stands after the subscript', (): void => {
    assert.equal(
        sized_name('q', '512', 'Td', settings(fd.ExponentPlacement.SUPERSCRIPT))
            .to_latex(),
        'q_{Td}^{512}');
});

test('a lowered exponent joins the subscript after a colon', (): void => {
    assert.equal(
        sized_name('q', '512', 'Td', settings(fd.ExponentPlacement.SUBSCRIPT))
            .to_latex(),
        'q_{Td:512}');
});

test('a lowered exponent is the whole subscript where the name has none',
    (): void => {
        assert.equal(
            sized_name('m', '5120', null,
                       settings(fd.ExponentPlacement.SUBSCRIPT)).to_latex(),
            'm_{5120}');
    });

test('a lowered exponent stands outside the absolute bars', (): void => {
    assert.equal(
        sized_name('k', '6', null,
                   settings(fd.ExponentPlacement.SUBSCRIPT, true)).to_latex(),
        '|k|_{6}');
});

/* A JSON export made before `pyncd` gained the field carries four settings
 * fields, and the figure it holds was drawn with the exponent raised. */
test('settings built without a placement raise the exponent', (): void => {
    const older = new fd.DynamicNameSettings(false, false, false, false);
    assert.equal(older.exponent_placement, fd.ExponentPlacement.SUPERSCRIPT);
    assert.equal(sized_name('m', '5120', null, older).to_latex(), 'm^{5120}');
});
