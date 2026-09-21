import * as fd from '../../data_structure/Term';
import * as cat from '../../data_structure/Category';

/*
 * Putting a selection's cotangent back on the axis it was selected from.
 * Mirrors `para/data_structure/inject.py`; a term arrives here resolved by
 * `__qualname__` through the `TermDirectory`, so a class that is not here at
 * all fails the render with "Term type not found in TermDirectory".
 *
 * `TermJSONConverter` reconstructs POSITIONALLY - it drops the JSON keys and
 * passes the values in declaration order - so the constructor's parameters are
 * in the Python dataclass' field order, and must stay that way.
 */

export function establish(): void {
    console.log("Loaded Para inject module.");
}

/*
 * The reverse derivative of a selection: `[R, k/n] -> [R, n]`, writing each
 * surviving cotangent at the position its value came from and zero everywhere
 * else. `TopK` is the forward half, and the two are drawn as one glyph turned
 * over, in `deepseek/display_deepseek.ts`.
 *
 * One field, `name`, so the inherited `Operator` constructor is the right
 * shape. The count is not a field: the sparse axis on the input weave already
 * carries `activity` of `_size`, so an operator field repeating it would be a
 * second copy of a number the wire states.
 */
@fd.register_term
export class Inject extends cat.Operator {}
