import * as fd from '../../data_structure/Term';
import * as cat from '../../data_structure/Category';

/*
 * The two operators a reverse pass writes for the parts of a morphism that are
 * already LINEAR. Mirrors `para/data_structure/transpose.py`; a term arrives
 * here resolved by `__qualname__` through the `TermDirectory`, so a class that
 * is not here at all fails the render with "Term type not found in
 * TermDirectory".
 *
 * `TermJSONConverter` reconstructs POSITIONALLY - it drops the JSON keys and
 * passes the values in declaration order - so each constructor's parameters are
 * in the Python dataclass' field order, and must stay that way.
 */

export function establish(): void {
    console.log("Loaded Para transpose module.");
}

/*
 * The transpose of a linear operator: the same parameter, read the other way.
 * Its weaves are the forward operator's, swapped.
 *
 * `operator` is the whole operator being transposed, not just its name, so the
 * transpose is an involution and a later pass can tell that a `Linear` and its
 * transpose are the same weight. `name` is the forward operator's own name,
 * carried unchanged - a transpose does not rename a matrix, so the glyph says
 * so by being mirrored rather than by being relabelled.
 */
@fd.register_term
export class Transpose extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = null,
        readonly operator: cat.Operator | null = null,
    ) { super(name); }
}

/*
 * Sum over the fibre of an affine reindexing - the transpose of a node, and
 * what a transposed convolution is.
 *
 * The reindexing is an argument of the OPERATOR rather than an entry of
 * `Broadcasted.reindexings`, because a reindexing entry always points from the
 * output back to the input and this is the other direction. That is why the box
 * for it cannot use `BroadcastDisplayType.NODE`, which reads
 * `target.reindexings[0]`, and draws the node itself instead.
 */
@fd.register_term
export class ReindexTranspose<A extends cat.Axis> extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = null,
        readonly reindexing: cat.StrideCategory<A> | null = null,
    ) { super(name); }
}
