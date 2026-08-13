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
}

@fd.register_term
export class Multiplication extends Associative {
    get sep(): string { return '*'; }
    get unit(): Numeric { return new Integer(1); }
    numeric_hash(): number {
        return this.content.reduce((acc, x) => mod(acc * x.numeric_hash()), 1);
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
    to_latex(): string {
        return `${this.base.to_latex()}^{${this.exponent.to_latex()}}`;
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

export function division(numerator: Numeric, denominator: Numeric): Numeric {
    return Multiplication.template(
        numerator,
        Power.template(denominator, new Integer(-1))
    );
}

export const Zero = new Integer(0);

