import * as cat from '../data_structure/Category';
import * as ut from '../utilities/utilities';

export type Mappable = cat.Rearrangement<any>
    | cat.ProductOfMorphisms<any, Mappable>
    | cat.Composed<any, Mappable>
    | cat.Block<any, Mappable>;

/*
 * The morphism that is drawn where `target` stands: the body of a block whose
 * aesthetics say `BlockDrawing.BODY_IN_PLACE`, and `target` itself otherwise.
 *
 * A reindexing arrives inside such a block where `pyncd`'s
 * `notebooks/display/explain_reindexings.py` has wrapped it to carry the title,
 * the formula and the description its inspection box shows. The block draws
 * nothing of its own, so every reader that decides how a morphism is drawn from
 * what the morphism is reads it through here and answers what it would have
 * answered for the reindexing alone.
 */
export function drawn_morphism<L>(target: cat.Morphism<L>): cat.Morphism<L> {
    return (target instanceof cat.Block
            && cat.draws_body_in_place(target.aesthetics))
        ? drawn_morphism(target.body)
        : target;
}

export function is_mappable(
    target: cat.Morphism<any>
): target is Mappable {
    const drawn = drawn_morphism(target);
    if (drawn instanceof cat.Rearrangement) {
        return true;
    }
    if (drawn instanceof cat.ProductOfMorphisms
     || drawn instanceof cat.Composed) {
        return drawn.content.every(is_mappable);
    }
    return false;
}

export function apply_mapping<T>(
    mapping: number[],
    target: T[]
): T[] {
    return mapping.map(i => target[i]);
}

export function get_mapping(
    target: Mappable
): number[] {
    if (!is_mappable(target)) {
        throw new Error("Target is not mappable");
    }
    const drawn = drawn_morphism(target);
    if (drawn instanceof cat.Rearrangement) {
        return drawn.mapping;
    }
    if (drawn instanceof cat.ProductOfMorphisms) {
        let offset = 0;
        const mapping = [];
        for (const morph of drawn.content) {
            mapping.push(...get_mapping(morph).map((x) => x + offset));
            offset += morph.dom().length;
        }
        return mapping;
    }
    if (drawn instanceof cat.Composed) {
        let mapping = get_mapping(drawn.content[0]);
        for (const morph of drawn.content.slice(1)) {
            mapping = apply_mapping(get_mapping(morph), mapping);
        }
        return mapping;
    }
    throw new Error("Unreachable code reached in get_mapping");
}

export function mapping_of<T>(
    target: Mappable
): undefined | ((xs: T[]) => T[]) {
    if (!is_mappable(target)) {
        return undefined;
    }
    return (xs: T[]) => apply_mapping(get_mapping(target), xs);
}

export function isIdentity<L>(
    target: cat.Morphism<L>,
): boolean {
    const drawn = drawn_morphism(target);
    if (drawn instanceof cat.Rearrangement) {
        return drawn.mapping.every((x, i) => x === i);
    }
    if (drawn instanceof cat.ProductOfMorphisms) {
        return drawn.content.every(isIdentity);
    }
    if (drawn instanceof cat.Composed) {
        // TODO: Proper equals
        return drawn.content.every(isIdentity);
    }
    return false;
}

export function identityReindexings(
    target: cat.Broadcasted<any, any>,
): boolean {
    return target.reindexings.every(r => isIdentity(r));
}