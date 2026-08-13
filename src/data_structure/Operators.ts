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

@fd.register_term
export class Identity extends Elementwise {
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
 * initializer: the identity a fold accumulates onto - e.g. 0 to seed a sum. */
@fd.register_term
export class Constant extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('Constant'),
        readonly value: nm.Numeric = new nm.Integer(0),
    ) { super(name); }
}

@fd.register_term
export class Normalize extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('RMSNorm'),
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

@fd.register_term
export class Maximum extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('\\max')
    ) { super(name); }
}