import * as fd from '../../data_structure/Term';
import * as cat from '../../data_structure/Category';

/*
 * The operator a reverse pass needs that a forward one never writes. A repeat
 * - the dual of a sum - is an `ops.View` whose reindexing drops the repeated
 * axis, so it needs nothing here.
 * Mirrors `para/data_structure/contraction.py`; a term arrives here resolved by
 * `__qualname__` through the `TermDirectory`, so a class that is not here at all
 * fails the render with "Term type not found in TermDirectory".
 */

export function establish(): void {
    console.log("Loaded Para contraction module.");
}

/*
 * The dual of deleting a wire: zeros of the given shape, from no input at all.
 */
@fd.register_term
export class Zero extends cat.Operator {}
