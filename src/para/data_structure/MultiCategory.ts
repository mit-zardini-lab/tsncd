import * as fd from '../../data_structure/Term';
import * as cat from '../../data_structure/Category';
import * as contra from './Contravariant';

/*
 * Several expressions read side by side, each one covariant or contravariant.
 * Mirrors `para/data_structure/MultiCategory.py`, and `Taped` mirrors the
 * subclass in `para/processing/backprop.py`, whose first row is a forward
 * pass and whose second row is the backward pass in a `Contravariant`.
 *
 * `TermJSONConverter` reconstructs positionally, so the constructor parameters
 * are in the Python dataclass' field order and must stay that way.
 */

export function establish(): void {
    console.log("Loaded multicategory module.");
}

export type MultiCategoryElement<L, M extends cat.Morphism<L>> =
    cat.ProdCategory<L, M> | contra.Contravariant<L, cat.ProdCategory<L, M>>;

@fd.register_term
export class MultiObject<L> extends fd.Term {
    constructor(
        readonly content: cat.ProdObject<L>[],
    ) { super(); }
}

@fd.register_term
export class MultiCategory<L, M extends cat.Morphism<L>> extends fd.Term {
    constructor(
        readonly content: MultiCategoryElement<L, M>[],
    ) { super(); }

    dom(): MultiObject<L> {
        return new MultiObject(this.content.map((m) => m.dom()));
    }
    cod(): MultiObject<L> {
        return new MultiObject(this.content.map((m) => m.cod()));
    }
}

@fd.register_term
export class Taped<L, M extends cat.Morphism<L>> extends MultiCategory<L, M> {}
