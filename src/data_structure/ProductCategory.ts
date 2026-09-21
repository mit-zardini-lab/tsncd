import * as fd from './Term';
import * as nm from './Numeric';
import * as util from '../utilities/utilities';

export type ProdCategory<L, M extends Morphism<L>> =
    M | Rearrangement<L>
    | ProductOfMorphisms<L, ProdCategory<L, M>>
    | Composed<L, ProdCategory<L, M>>
    | Block<L, ProdCategory<L, M>>;

@fd.register_term
export class ProdObject<L> extends fd.Term {
    constructor(
        readonly content: L[],
    ) { super(); }

    *[Symbol.iterator](): Iterator<L> {
        yield *this.content
    }
    get length(): fd.int {
        return this.content.length
    }
    map<T>(func: (target: L) => T): T[] {
        return this.content.map(func);
    }
    identity(): Rearrangement<L> {
        return new Rearrangement<L>(
            util.range(this.content.length),
            this.content,
        );
    }
}

export abstract class Morphism<L> extends fd.Term {
    abstract dom(): ProdObject<L>;
    abstract cod(): ProdObject<L>;
}

/**
 * A place in a codebase a block stands for, drawn as a link beside the block's
 * title. `path` is relative to the root of the repository the reference names,
 * and `line` and `end_line` bound the lines it points at. `url` is where a
 * browser opens it. Mirrors `pyncd`'s `data_structure/ProductCategory.py`.
 */
@fd.register_term
export class CodeReference extends fd.Term {
    constructor(
        readonly label: string,
        readonly url: null | string = null,
        readonly path: null | string = null,
        readonly line: null | fd.int = null,
        readonly end_line: null | fd.int = null,
    ) { super(); }
}

/*
 * How a block is drawn, mirroring `BlockDrawing` in `pyncd`'s
 * `data_structure/ProductCategory.py`. `BOX` is the enclosure with a title and
 * a fill a block has always been drawn as. `BODY_IN_PLACE` draws the block's
 * body where the block stands and nothing of the block itself, so an operator
 * the sender wrapped in a block to carry a description and an inspection box
 * reads as the bare operator. A block carrying no drawing is drawn as a `BOX`,
 * which is what every block sent before the field existed carries.
 */
export enum BlockDrawing {
    type = 'BlockDrawing',
    BOX = 'BOX',
    BODY_IN_PLACE = 'BODY_IN_PLACE',
}
fd.register_enum(BlockDrawing);

@fd.register_term
export class BlockAesthetics extends fd.Term {
    constructor(
        readonly title: null | string = null,
        readonly description: null | string = null,
        readonly fill_color: null | string = null,
        // The last three stand in the order `pyncd` declares them, because a
        // term is reconstructed positionally in field order and a sender from
        // before one of them existed writes the fields before it alone.
        // `formula` is the LaTeX of what the block computes, which the block's
        // inspection box draws under the title.
        readonly references: null | CodeReference[] = null,
        readonly formula: null | string = null,
        readonly drawing: null | BlockDrawing = null,
    ) { super(); }
}

/** Whether `aesthetics` asks for the block's body to be drawn where the block
 * stands, which is the one drawing that is not a box. */
export function draws_body_in_place(
    aesthetics: null | BlockAesthetics | undefined,
): boolean {
    return aesthetics?.drawing === BlockDrawing.BODY_IN_PLACE;
}

@fd.register_term
export class BlockTag extends fd.UTerm {
    constructor(
        readonly uid: fd.UID,
        readonly repetition: nm.Numeric = new nm.Integer(1),
        readonly aesthetics: null | BlockAesthetics = null
    ) { super(uid); }
}

@fd.register_term
export class Block<L, M extends Morphism<L>> extends Morphism<L> {
    constructor(
        readonly body: M,
        readonly block_tag: BlockTag,
        readonly _display_order?: fd.int,
    ) { super(); }

    dom(): ProdObject<L> {
        return this.body.dom();
    }
    cod(): ProdObject<L> {
        return this.body.cod();
    }
    get repetition(): nm.Numeric {
        return this.block_tag.repetition;
    }
    get aesthetics(): null | BlockAesthetics {
        return this.block_tag.aesthetics;
    }
}

@fd.register_term
export class Composed<L, M extends Morphism<L>> extends Morphism<L> {
    constructor(
        readonly content: M[],
    ) { super(); }

    dom(): ProdObject<L> {
        return this.content[0].dom();
    }
    cod(): ProdObject<L> {
        return this.content[this.content.length - 1].cod();
    }
}

@fd.register_term
export class ProductOfMorphisms<L, M extends Morphism<L>> extends Morphism<L> {
    constructor(
        readonly content: M[],
    ) { super(); }
    dom(): ProdObject<L> {
        return new ProdObject<L>(
            this.content.flatMap(m => m.dom().content));
    }
    cod(): ProdObject<L> {
        return new ProdObject<L>(
            this.content.flatMap(m => m.cod().content));
    }
    *partition<T>(target: T[]): Iterable<[M, T[]]> {
        var start = 0;
        for (const m of this.content) {
            const end = start + m.dom().length;
            yield [m, target.slice(start, end)];
            start = end;
        }
    }
}

/**
 * The statement that `left_hand_side` is defined to be `right_hand_side`,
 * drawn as the two morphisms with `:=` between them. Mirrors `pyncd`'s
 * `data_structure/ProductCategory.py`.
 *
 * The two sides share a domain and a codomain, and `pyncd`'s `template` raises
 * where they do not. A definition is a term and is not a morphism, so it is
 * drawn and is not composed. `display/diagramRenderTarget.ts` renders each side
 * as a figure of its own, which is why the sides are typed as whole morphisms
 * rather than as anything a `MorphismBox` could hold.
 */
@fd.register_term
export class DefinedExpression<L, M extends Morphism<L>> extends fd.Term {
    constructor(
        readonly left_hand_side: ProdCategory<L, M>,
        readonly right_hand_side: ProdCategory<L, M>,
    ) { super(); }

    sides(): ProdCategory<L, M>[] {
        return [this.left_hand_side, this.right_hand_side];
    }
}

@fd.register_term
export class Rearrangement<L> extends Morphism<L> {
    constructor(
        readonly mapping: fd.int[],
        readonly _dom: L[],
    ) { super(); }

    dom(): ProdObject<L> {
        return new ProdObject<L>(this._dom);
    }
    cod(): ProdObject<L> {
        return new ProdObject<L>(this.apply(this._dom));
    }
    apply<T>(target: T[]): T[] {
        return this.mapping.map(i => target[i]);
    }
    invert<T>(target: T[]): T[] {
        return Array(this._dom.length).map(
            i => util.iallequals(
                util.zip(target, this.mapping)
                .filter(([_, j]) => j === i)
                .map(([x, _]) => x)
            )
        )
    }
}