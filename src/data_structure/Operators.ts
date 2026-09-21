import * as fd from './Term';
import * as nm from './Numeric';
import * as cat from './Category';

@fd.register_term
export class GenericOperator extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('\\sigma'),
    ) { super(name);}
}

@fd.register_term
export class Elementwise extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('\\sigma'),
    ) { super(name);}
}

@fd.register_term
export class BlockOperator<B extends cat.Datatype, A extends cat.Axis> extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('BlockOp'),
        readonly block: cat.Block<cat.Array<B, A>,cat.Broadcasted<B, A>>,
    ) { super(name); }
}

/*
 * An elementwise map given by a formula in `x`. The fields mirror pyncd's
 * dataclass order - `name`, `operator`, `formula` - because the JSON decoder
 * hands them to the constructor positionally. The name is the formula's
 * latex, filled in on the Python side, so `ElementwiseBox` draws it as is.
 */
@fd.register_term
export class Arithmetic extends Elementwise {
    constructor(
        readonly name: fd.DynamicName | null = null,
        readonly operator: string | null = 'arithmetic',
        readonly formula: nm.Numeric = new nm.FreeInput(),
    ) { super(name); }
}

@fd.register_term
export class View extends Elementwise {
    constructor(
        readonly name: fd.DynamicName | null = null,
    ) { super(name); }
}

@fd.register_term
export class SoftMax extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('SoftMax'),
        readonly contracted: boolean = false,
    ) { super(name); }
}

/**
 * The division of an array by the sum of its values over the one axis the
 * operator consumes, mirroring `ops.L1Norm`. The divisor is the sum and never
 * the mean, and `epsilon` is the number added to it, which is zero on a
 * normalisation whose model adds nothing.
 */
@fd.register_term
export class L1Norm extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('L^{1}'),
        readonly contracted: boolean = false,
        readonly epsilon: nm.Numeric = new nm.Integer(0),
    ) { super(name); }
}

/** The division of an array by the root of the sum of its squares, over the
 * axes the operator consumes. A `Normalize` divides by the root of the mean of
 * the squares instead, and multiplies by a learned gain, so a normalisation a
 * model applies with no learned weight is written with this operator. */
@fd.register_term
export class L2Norm extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('L^{2}'),
    ) { super(name); }
}

@fd.register_term
export class Einops extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('einops'),
        readonly signature: fd.int[][] = [],
    ) { super(name); }
}

@fd.register_term
export class Linear extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('L'),
        readonly bias: boolean = false,
    ) { super(name); }
}

@fd.register_term
export class Embedding extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('E'),
    ) { super(name); }
}

@fd.register_term
export class AdditionOp extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('+'),
    ) { super(name); }
}

/** A nullary constant emitting `value` (default zero). Used as a streaming
 * initializer: the identity a fold accumulates onto - e.g. 0 to seed a sum.
 * The `Op` suffix separates the operator from `nm.Constant`, which is the
 * numeric naming a mathematical constant such as Euler's number. */
@fd.register_term
export class ConstantOp extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('ConstantOp'),
        readonly value: nm.Numeric = new nm.Integer(0),
    ) { super(name); }
}

/**
 * `y = gamma * x * (mean(x^2) + epsilon)^{-1/2} + beta` over the axes the
 * operator consumes, mirroring `ops.Normalize`. `gain` says that the learned
 * `gamma` multiplies the result and `bias` that the learned `beta` is added
 * after it, and each learned array reaches the operator as a leading operand,
 * the gain first. `epsilon` is the number added under the root.
 */
@fd.register_term
export class Normalize extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('RMSNorm'),
        readonly gain: boolean = true,
        readonly bias: boolean = false,
        readonly epsilon: nm.Numeric = new nm.FreeNumeric(),
    ) { super(name); }
}

@fd.register_term
export class WeightedTriangularLower extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('wtril'),
    ) { super(name); }
}

@fd.register_term
export class ReLU extends Elementwise {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('R'),
    ) { super(name); }
}

@fd.register_term
export class Dropout extends Elementwise {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('\\lightning'),
    ) { super(name); }
}

/** The positions of an axis as an array over that axis, which holds `i_x` at
 * index `i_x` of the axis `x`. It has no operands, and the datatype of its
 * result is `Natural(|x|)`. `Arrange.template` names it after the index it
 * holds, so the default name reaches a diagram only from an `Arrange` built by
 * hand. */
@fd.register_term
export class Arrange extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('\\mathrm{arrange}'),
    ) { super(name); }
}

@fd.register_term
export class Maximum extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('\\max')
    ) { super(name); }
}

/** The bitwise exclusive or of every entry along the one axis the operator
 * consumes, which is a reduction whose unit is zero. Its operand and its result
 * are `Natural(2^N)`. */
@fd.register_term
export class BitwiseXor extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('\\oplus'),
    ) { super(name); }
}

/** The remainder of the first operand divided by the second, entry by entry.
 * The remainder is below the divisor, so the result carries the divisor's
 * datatype. */
@fd.register_term
export class Modulo extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('\\bmod'),
    ) { super(name); }
}

/** The identity on values, read into another datatype. The datatype wire on
 * each side of the map carries the bound that side holds. */
@fd.register_term
export class Cast extends Elementwise {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('\\mathrm{cast}'),
        readonly operator: string | null = 'cast',
    ) { super(name); }
}

/** An array the model reads and never learns, such as the multipliers, the
 * primes and the offsets of a hash. It has no operands, and the axes of the
 * array stand in the target of its output weave. A `Linear` with no operands is
 * a learned array and draws as a weight, and this operator draws as the
 * pentagon of a nullary source. */
@fd.register_term
export class FixedArray extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('\\mathrm{fixed}'),
    ) { super(name); }
}