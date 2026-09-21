import * as fd from '../../data_structure/Term';
import * as cat from '../../data_structure/Category';

/*
 * The contravariant category, in which each morphism exchanges its domain and
 * codomain. Mirrors `para/data_structure/Contravariant.py`, and the mathematics
 * is in `pyncd`'s `obsidian/10-para/Derivatives.md`. A term arrives here
 * resolved by `__qualname__` through the `TermDirectory`, so a class that is
 * not here at all fails the render with "Term type not found in
 * TermDirectory".
 *
 * `TermJSONConverter` reconstructs POSITIONALLY - it drops the JSON keys and
 * passes the values in declaration order - so the constructor's parameters are
 * in the Python dataclass' field order, and must stay that way.
 */

export function establish(): void {
    console.log("Loaded contravariant category module.");
}

/*
 * `dom` and `cod` read the opposite end of `body`. A `Contravariant` says
 * nothing about the value of what it holds, so a copy in the body stays a
 * `cat.Rearrangement` and the enclosing `Contravariant` is what makes the copy
 * denote an addition.
 */
@fd.register_term
export class Contravariant<L, M extends cat.Morphism<L>> extends cat.Morphism<L> {
    constructor(
        readonly body: M,
    ) { super(); }

    dom(): cat.ProdObject<L> {
        return this.body.cod();
    }
    cod(): cat.ProdObject<L> {
        return this.body.dom();
    }
}

export type ContravariantCategory<L, M extends cat.Morphism<L>> =
    Contravariant<L, cat.ProdCategory<L, M>>;
