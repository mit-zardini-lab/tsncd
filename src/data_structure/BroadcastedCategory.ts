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

// TODO: Register enums
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
        /*
         * The degree of a morphism whose own domain is empty, which has no
         * reindexing to derive one from, and null for every other morphism.
         * Mirrors pyncd. A morphism built with an empty domain and no degree is
         * given the empty one, so `backup_degree !== null` and
         * `has_empty_domain()` report the same condition. `link_weaves` dots
         * every degree anchor no reindexing names, so such a degree is drawn
         * dotted throughout.
         */
        readonly backup_degree: pc.ProdObject<A> | null = null,
    ) {
        super();
        if (this.has_empty_domain()) {
            if (this.backup_degree === null) {
                this.backup_degree = new pc.ProdObject<A>([]);
            }
        } else if (this.backup_degree !== null) {
            throw new Error(
                'backup_degree belongs to a Broadcasted with an empty domain '
                + "alone; with inputs the degree is the reindexings' domain.");
        }
    }

    has_empty_domain(): boolean {
        return this.input_weaves.length === 0;
    }

    degree(): pc.ProdObject<A> {
        if (this.backup_degree !== null) {
            return this.backup_degree;
        }
        return this.reindexings[0].dom();
        // TODO: implement all equals
        // return util.iallequals(this.reindexings.map(r => r.dom()));
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