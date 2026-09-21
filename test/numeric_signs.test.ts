// Claude Fable 5.1, effort high.
/*
 * The minus sign a sum and a product are written with.
 *
 * `nm.is_negative` says whether a term carries a minus sign and
 * `nm.without_sign` takes the sign off every factor, so a sum writes a negative
 * term as a subtraction and a product writes one sign in front. `to_latex` and
 * `NumericRenderer.numeric_string` write the same string, and `pyncd` asserts
 * the same cases in `data_structure/validate_numeric_signs.py`.
 *
 * `nm.Sign`, `nm.AbsoluteValue`, `nm.LargerOf` and `nm.SquareRoot` are checked
 * here for the same agreement between `to_latex` and `numeric_string`.
 */

import * as assert from 'node:assert/strict';
import {test} from 'node:test';

import * as fd from '../src/data_structure/Term';
import * as nm from '../src/data_structure/Numeric';
import * as nmr from '../src/display/Framework/NumericRenderer';

function free_numeric(name: string): nm.FreeNumeric {
    const type = fd.UID.template<nm.FreeNumeric>('FreeNumeric')._type;
    return new nm.FreeNumeric(
        new fd.UID<nm.FreeNumeric>(type, undefined, new fd.DynamicName(name)));
}

const a = free_numeric('a');
const b = free_numeric('b');

function assert_written(target: nm.Numeric, expected: string): void {
    assert.equal(target.to_latex(), expected);
    assert.equal(nmr.numeric_string(target), expected);
}

test('a sum writes a negative coefficient as a subtraction', () => {
    const negative_two_b = new nm.Multiplication([new nm.Integer(-2), b]);
    assert_written(new nm.Addition([a, negative_two_b]), 'a - 2 b');
});

test('a sum writes a negation and a negative integer as subtractions', () => {
    const negative_b = new nm.Multiplication([new nm.Integer(-1), b]);
    assert_written(new nm.Addition([a, negative_b]), 'a - b');
    assert_written(new nm.Addition([a, new nm.Integer(-3)]), 'a - 3');
});

test('a product of two negative factors carries no sign', () => {
    const negative_a = new nm.Multiplication([new nm.Integer(-1), a]);
    const product = new nm.Multiplication([new nm.Integer(-2), negative_a]);
    assert.equal(nm.is_negative(product), false);
    assert_written(product, '2 a');
});

test('a product of three negative factors carries one sign', () => {
    const negative_a = new nm.Multiplication([new nm.Integer(-1), a]);
    const negative_b = new nm.Multiplication([new nm.Integer(-1), b]);
    const product = new nm.Multiplication(
        [new nm.Integer(-2), negative_a, negative_b]);
    assert.equal(nm.is_negative(product), true);
    assert_written(product, '-2 a b');
});

test('the sign, the magnitude, the larger of two and the root are written alike', () => {
    assert_written(new nm.Sign(a), '\\operatorname{sign}(a)');
    assert_written(new nm.AbsoluteValue(a), '\\lvert a \\rvert');
    assert_written(new nm.LargerOf(a, b), '\\max(a, b)');
    assert_written(new nm.LargerOf(a), '\\max(a, 0)');
    assert_written(new nm.SquareRoot(a), '\\sqrt{a}');
});

test('a negated sum is bracketed', () => {
    const negated_sum = new nm.Multiplication(
        [new nm.Integer(-1), new nm.Addition([a, b])]);
    assert_written(negated_sum, '-(a + b)');
    assert_written(new nm.Addition([a, negated_sum]), 'a - (a + b)');
});
