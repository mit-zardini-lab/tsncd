// Claude Fable 5.1, effort high.
// Revised by Claude Opus 5.5 (1M context), effort 40: a product writes a factor
// raised to the power -1 after a slash.
/*
 * The minus sign a sum and a product are written with, and the slash a product
 * writes its reciprocal factors after.
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

const x = free_numeric('x');
const d = free_numeric('d');
const n = free_numeric('n');
const i = free_numeric('i');

function reciprocal(base: nm.Numeric): nm.Power {
    return new nm.Power(base, new nm.Integer(-1));
}

test('a product writes one reciprocal factor after a slash', () => {
    assert_written(
        new nm.Multiplication([x, reciprocal(new nm.SquareRoot(d))]),
        'x / \\sqrt{d}');
    assert_written(
        new nm.Multiplication([new nm.Integer(3), x, reciprocal(new nm.Integer(2))]),
        '3 x / 2');
    assert_written(
        new nm.Multiplication([
            new nm.Power(new nm.Integer(2), new nm.Integer(63)), reciprocal(d)]),
        '2^{63} / d');
});

test('a product brackets a divisor that is a sum, and several divisors', () => {
    assert_written(
        new nm.Multiplication([x, reciprocal(new nm.Addition([d, n]))]),
        'x / (d + n)');
    assert_written(
        new nm.Multiplication([x, reciprocal(d), reciprocal(i)]), 'x / (d i)');
    assert_written(
        new nm.Multiplication([reciprocal(d), reciprocal(i)]), '1 / (d i)');
});

test('a product with a reciprocal writes its sign first', () => {
    assert_written(
        new nm.Multiplication(
            [new nm.Integer(-1), x, reciprocal(new nm.Integer(2))]),
        '-x / 2');
    assert_written(
        new nm.Addition([a, new nm.Multiplication([b, reciprocal(new nm.Integer(2))])]),
        'a + b / 2');
});

test('a power of -1 outside a product keeps its exponent', () => {
    assert_written(reciprocal(d), 'd^{-1}');
});

test('a negated sum is bracketed', () => {
    const negated_sum = new nm.Multiplication(
        [new nm.Integer(-1), new nm.Addition([a, b])]);
    assert_written(negated_sum, '-(a + b)');
    assert_written(new nm.Addition([a, negated_sum]), 'a - (a + b)');
});
