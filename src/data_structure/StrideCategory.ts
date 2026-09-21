import * as fd from './Term';
import * as pc from './ProductCategory';
import * as nm from './Numeric';
import * as utils from '../utilities/utilities';

export type StrideCategory<A extends Axis> = 
    pc.ProdCategory<A, StrideMorphism<A>>;

export abstract class Axis extends fd.UTerm {
    constructor(
        readonly uid: fd.UID,
        readonly _size: nm.Numeric = new nm.FreeNumeric(),
    ) {
        super(uid);
    }
}

@fd.register_term
export class RawAxis extends Axis {}

/*
 * A codomain axis, the stride it takes along each domain axis, and the offset
 * added afterwards: `cod_i = sum_j stride_ij * dom_j + shift_i`.
 *
 * The triple mirrors `pyncd`'s `_cod_stride_shift` field, and the shift is the
 * third member there, so it must be the third member here - `TermJSONConverter`
 * rebuilds tuples positionally.
 */
export type CodStrideShift<A extends Axis> = [A, nm.Numeric[], nm.Numeric];

@fd.register_term
export class StrideMorphism<A extends Axis> extends pc.Morphism<A> {
    constructor(
        readonly _dom: A[],
        readonly _cod_stride_shift: CodStrideShift<A>[],
        readonly name: null | fd.DynamicName = null,
    ) {
        super();
    }
    dom(): pc.ProdObject<A> {
        return new pc.ProdObject<A>(this._dom);
    }
    cod(): pc.ProdObject<A> {
        return new pc.ProdObject<A>(
            this._cod_stride_shift.map(([axis, _stride, _shift]) => axis));
    }
    /*
     * One row per codomain axis, one entry per domain axis. Defaulted rather
     * than indexed straight through: a term serialised by a `pyncd` older than
     * the shift arrives as a pair, and a missing row should read as no stride
     * rather than throw halfway through a render.
     */
    strides(): nm.Numeric[][] {
        return this._cod_stride_shift.map(
            ([_axis, stride, _shift]) => stride ?? []);
    }
    shifts(): nm.Numeric[] {
        return this._cod_stride_shift.map(
            ([_axis, _stride, shift]) => shift ?? nm.Zero);
    }
}