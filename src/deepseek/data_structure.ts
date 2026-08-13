import * as fd from '../data_structure/Term';
import * as nm from '../data_structure/Numeric';
import * as cat from '../data_structure/Category';

export function establish(): void {
    console.log("Loaded DeepSeek module.");
}

@fd.register_term
export class Complex<B extends cat.Datatype> extends cat.Datatype {
    constructor(
        readonly base: B,
    ) {super();}
    to_latex(): string | undefined {
        const core = this.base.to_latex() ? `(${this.base.to_latex()})` : '';
        return `\\mathbb{C}${core}`;
    }
}

@fd.register_term
export class ComplexRotary<B extends cat.Datatype> extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null,
        readonly frequency: nm.Numeric,
    ) {
        super(name);
    }
}

@fd.register_term
export class Decomplex extends cat.Operator {}

@fd.register_term
export class TopK extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null,
        readonly k: nm.Numeric,
    ) {
        super(name);
    }
}

@fd.register_term
export class RotaryLinear extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null,
        readonly frequency: nm.Numeric,
    ) {
        super(name);
    }
}

@fd.register_term
export class SparseAxis extends cat.Axis {
    constructor(
        readonly uid: fd.UID,
        readonly _size: nm.Numeric = new nm.FreeNumeric(),
        readonly activity: nm.Numeric = new nm.FreeNumeric(),
    ) {
        super(uid, _size);
    }
}