export {
    ProdObject,
    Morphism,
    Block,
    Composed,
    ProductOfMorphisms,
    Rearrangement,
    BlockAesthetics,
    BlockTag,
} from './ProductCategory';

export {
    Axis,
    RawAxis,
    StrideMorphism,
} from './StrideCategory';

export {
    Datatype,
    Reals,
    Natural,
    Array,
    WeaveMode,
    Weave,
    Operator,
    Broadcasted,
} from './BroadcastedCategory';

import * as pc from './ProductCategory';
import * as sc from './StrideCategory';
import * as bc from './BroadcastedCategory';
import * as ops from './Operators';

export function establish(): void {
    ops.Einops;
    console.log("Loaded Category module.");
}

export type ProdCategory<L, M extends pc.Morphism<L>> =
    M | pc.Rearrangement<L>
    | pc.ProductOfMorphisms<L, ProdCategory<L, M>>
    | pc.Composed<L, ProdCategory<L, M>>
    | pc.Block<L, ProdCategory<L, M>>;

export type StrideCategory<A extends sc.Axis> =
    ProdCategory<A, sc.StrideMorphism<A>>;

export type BroadcastedCategory<B extends bc.Datatype, A extends sc.Axis> =
    ProdCategory<bc.Array<B,A>, bc.Broadcasted<B,A>>;