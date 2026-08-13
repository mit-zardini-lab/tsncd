import * as fd from './Term';
import * as pc from './ProductCategory';
import * as nm from './Numeric';
import * as util from '../utilities/utilities';
import * as sc from './StrideCategory';

export abstract class Datatype extends fd.Term {
    to_latex(): string | undefined {
        return undefined;
    }
}

@fd.register_term
export class Reals extends Datatype {}

@fd.register_term
export class Natural extends Datatype {
    constructor(
        readonly max_value: nm.Numeric
    ) {
        super();
    }
    to_latex(): string | undefined {
        return this.max_value.to_latex()
    }
}

@fd.register_term
export class Array<B extends Datatype, A extends sc.Axis> extends fd.Term {
    constructor(
        readonly datatype: B,
        readonly _shape: A[] = [],
    ) {super();}

    shape(): pc.ProdObject<A> {
        return new pc.ProdObject<A>(this._shape);
    }
}

export enum WeaveMode {
    type = 'WeaveMode',
    TILED = 'TILED',
}
fd.register_enum(WeaveMode);

@fd.register_term
export class Weave<B extends Datatype, A extends sc.Axis> extends fd.Term {
    constructor(
        readonly datatype: B,
        readonly _shape: (A | WeaveMode)[] = [],
    ) {super();}

    imprint_to_degree(target: Iterable<A>): Array<B, A> {
        const iterator = target[Symbol.iterator]();
        return new Array<B, A>(
            this.datatype,
            this._shape.map(s => 
                s instanceof sc.Axis 
                ? s : iterator.next().value
            ),
        );
    }

    select_degree<T>(target: T[]): T[] {
        return util.zip(this._shape, target).flatMap(
            ([s, t]) => s instanceof sc.Axis ? [] : [t]
        );
    }

    select_target<T>(target: T[]): T[] {
        return util.zip(this._shape, target).flatMap(
            ([s, t]) => s instanceof sc.Axis ? [t] : []
        );
    }

    target(): Array<B, A> {
        return new Array<B, A>(
            this.datatype,
            this.select_target(this._shape) as A[],
        )
    }
}

export abstract class Operator extends fd.Term {
    constructor(
        readonly name: fd.DynamicName | null = null,
    ) {
        super();
    }
}

@fd.register_term
export class Broadcasted<B extends Datatype, A extends sc.Axis, Op extends Operator = any> extends pc.Morphism<Array<B, A>> {
    constructor(
        readonly operator: Op,
        readonly input_weaves: Weave<B, A>[],
        readonly output_weaves: Weave<B, A>[],
        readonly reindexings: sc.StrideCategory<A>[],
    ) {
        super();
    }

    degree(): pc.ProdObject<A> {
        if (this.reindexings.length === 0) {
            return new pc.ProdObject<A>([]);
        }
        return this.reindexings[0].dom();
    }

    dom(): pc.ProdObject<Array<B, A>> {
        return new pc.ProdObject(
            util.zip(this.input_weaves, this.reindexings).map(
                ([weave, reindexing]) => 
                    weave.imprint_to_degree(reindexing.cod())
            )
        );
    }

    cod(): pc.ProdObject<Array<B, A>> {
        return new pc.ProdObject(
            this.output_weaves.map(
                weave => weave.imprint_to_degree(this.degree())
            )
        );
    }
}