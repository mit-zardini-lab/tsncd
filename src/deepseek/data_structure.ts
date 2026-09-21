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

/**
 * Adjacent pairs of values read as one complex number each, the first of a
 * pair as the real part, which is `torch.view_as_complex` after an `unflatten`
 * into pairs. `Decomplex` is its inverse. A rotary embedding reads the rotated
 * channels of a latent through it, so that the rotation of a pair is a product
 * of two complex numbers.
 *
 * One field, `name`, so the inherited `Operator` constructor is the right
 * shape - terms deserialize positionally (`data_transfer/json.ts`).
 */
@fd.register_term
export class PairsAsComplex extends cat.Operator {}

/** The outputs a `TopK` hands out, mirroring `deepseek.SelectionForm`. */
export enum SelectionForm {
    type = 'SelectionForm',
    WEIGHTS = 'weights',
    WEIGHTS_SELECT = 'weights_select',
    ONLY_WEIGHTS = 'only_weights',
    ONLY_SELECTION = 'only_selection',
}
fd.register_enum(SelectionForm);

@fd.register_term
export class TopK extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null,
        readonly k: nm.Numeric,
        readonly form: SelectionForm = SelectionForm.WEIGHTS,
    ) {
        super(name);
    }
}

/**
 * Read a payload at the positions a selection names.
 *
 * Unexpanded, its targets are `(k/n), (n) -> (k/n)`: the selection on its
 * `SparseAxis` and the payload on the dense parent, related by the operator
 * rather than by identifying the two axes - so the payload keeps a dense axis
 * and `TopK` keeps a visible `n -> k/n`. Expanded, the selection becomes an
 * explicit operand: `[R, k], [n, k], [R, n] -> [R, k]`.
 *
 * One field, `name`, so the inherited `Operator` constructor is the right
 * shape - terms deserialize positionally (`data_transfer/json.ts`).
 */
@fd.register_term
export class Select extends cat.Operator {}

/**
 * The pure gather: `[Nat(n); k], [R; n] -> [R; k]`, `out[j] = payload[index[j]]`.
 *
 * What a `Select` becomes under pyncd's sparse expansion
 * (`deepseek/sparse_expansion.py`): the selection arrives as the explicit
 * `Natural(n)` index wire `TopK`'s complete form emits, so the data dependence
 * rides the operand's datatype rather than the (affine) reindexing. `TopK`
 * decides, `Select` reads compressed, `IndexSelect` reads expanded. (After
 * `torch.index_select`; briefly `Grab`, renamed because the Para category
 * claims that word for its parameter-slot read.)
 *
 * One field, `name`, so the inherited `Operator` constructor is the right
 * shape - terms deserialize positionally (`data_transfer/json.ts`).
 */
@fd.register_term
export class IndexSelect extends cat.Operator {}

/** The positions a merge writes a selected block's offsets to, mirroring
 * `deepseek.MergedPositions`. */
@fd.register_term
export class MergedPositions extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = null,
        readonly reindexing: any = null,
        readonly selected_position: number = 0,
    ) { super(name); }
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

/**
 * The table of factors a rotary embedding multiplies the channel pairs by,
 * mirroring `deepseek.Rotary`. The operator has no operands, and over the
 * positions `x` and the pairs `t` its result holds
 * `F[i_x, i_t] = e^{i stride i_x theta[i_t]}` with
 * `theta[i_t] = base^{-i_t / |t|}`.
 *
 * `position_stride` is the token position one step along `x` stands for. A
 * compressed entry of a group of `|a|` tokens is rotated at the position of the
 * first token of its group, so the table over those entries has the stride
 * `|a|`.
 *
 * Every table turns counterclockwise. An inverse rotary embedding multiplies
 * by the conjugate of this table, which pyncd writes as one elementwise
 * `ops.Arithmetic` after it rather than as a table of its own.
 */
@fd.register_term
export class Rotary extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null,
        readonly base: nm.Numeric = new nm.Integer(10_000),
        readonly position_stride: nm.Numeric = new nm.Integer(1),
    ) {
        super(name);
    }
}

/**
 * A `Rotary` table whose frequencies YaRN has interpolated, mirroring
 * `deepseek.YarnRotary`. Its frequency is
 * `theta'[i_t] = theta[i_t] (1 - r[i_t] + r[i_t] / factor)`, where the ramp
 * `r[i_t] = clamp((i_t - ramp_start) / (ramp_end - ramp_start), 0, 1)` is zero
 * up to the pair `ramp_start` and one from the pair `ramp_end`.
 *
 * `name`, `base` and `position_stride` are repeated as parameters ahead of the
 * three new ones, because a python dataclass lists an inherited field in the
 * position its base gave it and a term is constructed positionally
 * (`data_transfer/json.ts`).
 */
@fd.register_term
export class YarnRotary extends Rotary {
    constructor(
        readonly name: fd.DynamicName | null,
        readonly base: nm.Numeric = new nm.Integer(10_000),
        readonly position_stride: nm.Numeric = new nm.Integer(1),
        readonly factor: nm.Numeric = new nm.Integer(1),
        readonly ramp_start: nm.Numeric = new nm.Integer(0),
        readonly ramp_end: nm.Numeric = new nm.Integer(1),
    ) {
        super(name, base, position_stride);
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