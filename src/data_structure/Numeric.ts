import * as fd from './Term';

const HASH_MODULO = 2**16 - 1;

/** Python-style modulo, so negative values wrap into [0, modulo). */
function mod(value: number, modulo: number = HASH_MODULO): number {
    return ((value % modulo) + modulo) % modulo;
}

/** Structural stand-in for Python's dataclass hash, keyed off the latex form. */
function string_hash(target: string): number {
    let hash = 0;
    for (let i = 0; i < target.length; i++) {
        hash = mod(hash * 31 + target.charCodeAt(i));
    }
    return hash;
}

export abstract class Numeric extends fd.Term {
    abstract to_latex(): string;

    numeric_hash(): number {
        return string_hash(this.to_latex());
    }
    equals(other: Numeric): boolean {
        return this.numeric_hash() === other.numeric_hash();
    }

    // Typescript has no operator overloading, so the python dunders become
    // methods.
    add(other: Numeric | fd.int): Numeric {
        return Addition.template(this, as_numeric(other));
    }
    mul(other: Numeric | fd.int): Numeric {
        return Multiplication.template(this, as_numeric(other));
    }
    pow(exponent: Numeric | fd.int): Numeric {
        return Power.template(this, as_numeric(exponent));
    }
    div(other: Numeric | fd.int): Numeric {
        return division(this, as_numeric(other));
    }
}

export function as_numeric(target: Numeric | fd.int): Numeric {
    return target instanceof Numeric ? target : new Integer(target);
}

@fd.register_term
export class FreeNumeric extends Numeric {
    constructor(
        readonly uid: fd.UID<FreeNumeric> = fd.UID.template<FreeNumeric>('FreeNumeric'),
    ) {
        super();
    };
    numeric_hash(): number {
        return mod(this.uid._id + 12435);
    }
    to_latex(): string {
        return this.uid._name?.to_latex() || '';
    }
}

@fd.register_term
export class Integer extends Numeric {
    constructor(
        readonly _value: fd.int = 0,
    ) { super(); }
    numeric_hash(): number {
        return mod(this._value);
    }
    to_latex(): string {
        return this._value.toString();
    }
}

/** The one variable of a formula - pyncd's `FreeInput`. No uid: every
 * FreeInput is the same input, printed `x` wherever it sits. */
@fd.register_term
export class FreeInput extends Numeric {
    constructor() { super(); }
    numeric_hash(): number {
        return string_hash('x');
    }
    to_latex(): string {
        return 'x';
    }
}

/** The constants a `Constant` names. Each value is the latex it prints as, and
 * each member key matches the pyncd `ConstantSymbol` member the json carries. */
export enum ConstantSymbol {
    type = 'ConstantSymbol',
    EULER = 'e',
    PI = '\\pi',
    IMAGINARY_UNIT = '\\mathrm{i}',
    INFINITY = '\\infty',
}
fd.register_enum(ConstantSymbol);

/** A mathematical constant, named by its symbol. The default symbol is Euler's
 * number, so `Power(new Constant(), x)` is the exponential. */
@fd.register_term
export class Constant extends Numeric {
    constructor(
        readonly symbol: ConstantSymbol = ConstantSymbol.EULER,
    ) { super(); }
    to_latex(): string {
        return this.symbol;
    }
}

type AssociativeConstructor<T extends Associative> = new (content?: Numeric[]) => T;

/** Flattens terms of the same class into one list and drops units. */
function expand_associative<T extends Associative>(
    cls: AssociativeConstructor<T>,
    target: Numeric,
): Numeric[] {
    const unit = new cls([]).unit;
    const recurse = (x: Numeric): Numeric[] => {
        if (x instanceof cls) {
            return (x as Associative).content.flatMap(recurse);
        }
        if (x.equals(unit)) {
            return [];
        }
        return [x];
    };
    return recurse(target);
}

export abstract class Associative extends Numeric {
    constructor(
        readonly content: Numeric[] = [],
    ) { super(); }

    // Getters rather than fields, so they stay off `keys()` and out of the
    // constructor arguments the json converter reconstructs from.
    abstract get sep(): string;
    abstract get unit(): Numeric;

    /** Builds a normalized term: flattened, unit-free, and unwrapped if trivial. */
    static template<T extends Associative>(
        this: AssociativeConstructor<T>,
        ...xs: Numeric[]
    ): Numeric {
        const expanded = xs.flatMap(x => expand_associative(this, x));
        if (expanded.length === 0) {
            return new this([]).unit;
        }
        if (expanded.length === 1) {
            return expanded[0];
        }
        return new this(expanded);
    }
    static expand<T extends Associative>(
        this: AssociativeConstructor<T>,
        target: Numeric,
    ): Numeric[] {
        return expand_associative(this, target);
    }
    to_latex(): string {
        return this.content.map(x => x.to_latex()).join(` ${this.sep} `);
    }
}

@fd.register_term
export class Addition extends Associative {
    get sep(): string { return '+'; }
    get unit(): Numeric { return new Integer(0); }
    numeric_hash(): number {
        return mod(this.content.reduce((acc, x) => acc + x.numeric_hash(), 0));
    }
    to_latex(): string {
        const [head, ...tail] = this.content;
        return head.to_latex() + tail.map(signed_latex).join('');
    }
}

/** Whether `target` is written with a minus sign in front of it: an `Integer`
 * below zero, or a product holding an odd number of negative factors. */
export function is_negative(target: Numeric): boolean {
    if (target instanceof Integer) {
        return target._value < 0;
    }
    if (target instanceof Multiplication) {
        return target.content.filter(is_negative).length % 2 === 1;
    }
    return false;
}

/** `target` with the minus sign taken off every negative factor, so `-2 * -x`
 * and `-2 * x` both become `2 * x`. A term `is_negative` reports as negative
 * equals the negation of the result, and any other term equals the result. */
export function without_sign(target: Numeric): Numeric {
    if (target instanceof Integer) {
        return new Integer(Math.abs(target._value));
    }
    if (target instanceof Multiplication) {
        return Multiplication.template(...target.content.map(without_sign));
    }
    return target;
}

/** One term of a sum with the sign that joins it to the term before. */
export function signed_latex(target: Numeric): string {
    const sign = is_negative(target) ? '-' : '+';
    return ` ${sign} ${juxtaposed_latex(without_sign(target))}`;
}

/** One factor of a product, bracketed where it is a sum. */
function product_part_latex(target: Numeric): string {
    return target instanceof Addition
        ? `(${target.to_latex()})` : target.to_latex();
}

/** The factors of `unsigned` side by side, where `unsigned` holds no negative
 * factor. `Multiplication.to_latex` cannot write them itself, because it writes
 * the sign first and would be called again on the product it had unsigned. */
function juxtaposed_latex(unsigned: Numeric): string {
    return unsigned instanceof Multiplication
        ? unsigned.content.map(product_part_latex).join(' ')
        : product_part_latex(unsigned);
}

@fd.register_term
export class Multiplication extends Associative {
    get sep(): string { return '*'; }
    get unit(): Numeric { return new Integer(1); }
    numeric_hash(): number {
        return this.content.reduce((acc, x) => mod(acc * x.numeric_hash()), 1);
    }
    to_latex(): string {
        const sign = is_negative(this) ? '-' : '';
        return sign + juxtaposed_latex(without_sign(this));
    }
}

@fd.register_term
export class Power extends Numeric {
    constructor(
        readonly base: Numeric,
        readonly exponent: Numeric,
    ) { super(); }
    static template(base: Numeric, exponent: Numeric): Numeric {
        if (exponent.numeric_hash() === 0) {
            return new Integer(1);
        }
        if (exponent.numeric_hash() === 1) {
            return base;
        }
        return new Power(base, exponent);
    }
    // TODO: This will not work properly as x^-y will be <1, so it falls back
    // to the structural hash.
    to_latex(): string {
        const base = this.base instanceof Associative
            ? `(${this.base.to_latex()})` : this.base.to_latex();
        return `${base}^{${this.exponent.to_latex()}}`;
    }
}

@fd.register_term
export class Logarithm extends Numeric {
    constructor(
        readonly base: Numeric,
        readonly argument: Numeric,
    ) { super(); }
    to_latex(): string {
        return `log_{${this.base.to_latex()}}(${this.argument.to_latex()})`;
    }
}

/** The complex conjugate of the argument, printed `\overline{argument}`. The
 * conjugate of `e^{\mathrm{i} y}` for a real angle `y` is `e^{-\mathrm{i} y}`,
 * so a turn clockwise through an angle is the conjugate of the turn
 * counterclockwise through the same angle. The table of an inverse rotary
 * embedding is written that way. */
@fd.register_term
export class Conjugate extends Numeric {
    constructor(
        readonly argument: Numeric = new FreeInput(),
    ) { super(); }
    to_latex(): string {
        return `\\overline{${this.argument.to_latex()}}`;
    }
}

/** The logistic function, printed `\sigma(x)`. pyncd writes its derivative as
 * `\sigma(u) (1 - \sigma(u))`, so a formula and its derivative hold the same
 * term. */
@fd.register_term
export class Sigmoid extends Numeric {
    constructor(
        readonly argument: Numeric = new FreeInput(),
    ) { super(); }
    to_latex(): string {
        return `\\sigma(${this.argument.to_latex()})`;
    }
}

/** One where the argument is above zero and zero elsewhere, printed as the
 * indicator `\mathbbm{1}_{x > 0}`. pyncd differentiates it to zero. */
@fd.register_term
export class IsPositive extends Numeric {
    constructor(
        readonly argument: Numeric = new FreeInput(),
    ) { super(); }
    to_latex(): string {
        return `\\mathbbm{1}_{${this.argument.to_latex()} > 0}`;
    }
}

/** The rectified linear function, printed `\mathrm{ReLU}(x)`. pyncd expands it
 * to `x \mathbbm{1}_{x > 0}`. The class carries the function's full name because
 * `ops.ReLU` carries the short one, and a class name is registered once. */
@fd.register_term
export class RectifiedLinear extends Numeric {
    constructor(
        readonly argument: Numeric = new FreeInput(),
    ) { super(); }
    to_latex(): string {
        return `\\mathrm{ReLU}(${this.argument.to_latex()})`;
    }
}

/** The argument where it lies between `lower` and `upper`, `lower` below them
 * and `upper` above them, printed between corner brackets. The clamp to the
 * unit interval is the default and prints between the brackets alone. Any
 * other pair of bounds is written on the closing bracket, `lower` as its
 * subscript and `upper` as its superscript. */
@fd.register_term
export class Clamp extends Numeric {
    constructor(
        readonly argument: Numeric = new FreeInput(),
        readonly lower: Numeric = new Integer(0),
        readonly upper: Numeric = new Integer(1),
    ) { super(); }
    clamps_to_unit_interval(): boolean {
        return this.lower.equals(new Integer(0))
            && this.upper.equals(new Integer(1));
    }
    to_latex(): string {
        const clamped = `\\ulcorner ${this.argument.to_latex()} \\lrcorner`;
        if (this.clamps_to_unit_interval()) {
            return clamped;
        }
        return `${clamped}_{${this.lower.to_latex()}}^{${this.upper.to_latex()}}`;
    }
}

/** The standard normal cumulative distribution function, printed `\Phi(x)`. */
@fd.register_term
export class CumulativeGaussian extends Numeric {
    constructor(
        readonly argument: Numeric = new FreeInput(),
    ) { super(); }
    to_latex(): string {
        return `\\Phi(${this.argument.to_latex()})`;
    }
}

/** One above zero, minus one below zero and zero at zero, printed
 * `\operatorname{sign}(x)`. pyncd expands it to the difference of the indicator
 * of the argument and the indicator of its negation. */
@fd.register_term
export class Sign extends Numeric {
    constructor(
        readonly argument: Numeric = new FreeInput(),
    ) { super(); }
    to_latex(): string {
        return `\\operatorname{sign}(${this.argument.to_latex()})`;
    }
}

/** The magnitude of the argument, printed between the bars `\lvert x \rvert`.
 * pyncd expands it to the argument times its sign. */
@fd.register_term
export class AbsoluteValue extends Numeric {
    constructor(
        readonly argument: Numeric = new FreeInput(),
    ) { super(); }
    to_latex(): string {
        return `\\lvert ${this.argument.to_latex()} \\rvert`;
    }
}

/** The larger of `first` and `second`, printed `\max(first, second)`. The class
 * carries the name of what it returns because `ops.Maximum` is the reduction
 * operator and a class name is registered once. The second value defaults to
 * zero, so the term with one argument written is the larger of it and zero. */
@fd.register_term
export class LargerOf extends Numeric {
    constructor(
        readonly first: Numeric = new FreeInput(),
        readonly second: Numeric = new Integer(0),
    ) { super(); }
    to_latex(): string {
        return `\\max(${this.first.to_latex()}, ${this.second.to_latex()})`;
    }
}

/** The square root of the argument, printed under the radical `\sqrt{x}`.
 * pyncd expands it to the power `x^{1/2}`, which `Power.to_latex` prints as the
 * same root, so the two spellings read alike and hold different terms. */
@fd.register_term
export class SquareRoot extends Numeric {
    constructor(
        readonly argument: Numeric = new FreeInput(),
    ) { super(); }
    to_latex(): string {
        return `\\sqrt{${this.argument.to_latex()}}`;
    }
}

export function division(numerator: Numeric, denominator: Numeric): Numeric {
    return Multiplication.template(
        numerator,
        Power.template(denominator, new Integer(-1))
    );
}

export const Zero = new Integer(0);

// TODO: Rest of the numerics.
