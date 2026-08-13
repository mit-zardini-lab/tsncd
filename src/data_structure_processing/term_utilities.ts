import * as cat from '../data_structure/Category';
import * as ut from '../utilities/utilities';

export type Mappable = cat.Rearrangement<any>
    | cat.ProductOfMorphisms<any, Mappable>
    | cat.Composed<any, Mappable>;

export function is_mappable(
    target: cat.Morphism<any>
): target is Mappable {
    if (target instanceof cat.Rearrangement) {
        return true;
    }
    if (target instanceof cat.ProductOfMorphisms
     || target instanceof cat.Composed) {
        return target.content.every(is_mappable);
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
    if (target instanceof cat.Rearrangement) {
        return target.mapping;
    }
    if (target instanceof cat.ProductOfMorphisms) {
        let offset = 0;
        const mapping = [];
        for (const morph of target.content) {
            mapping.push(...get_mapping(morph).map((x) => x + offset));
            offset += morph.dom().length;
        }
        return mapping;
    }
    if (target instanceof cat.Composed) {
        let mapping = get_mapping(target.content[0]);
        for (const morph of target.content.slice(1)) {
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
    if (target instanceof cat.Rearrangement) {
        return target.mapping.every((x, i) => x === i);
    }
    if (target instanceof cat.ProductOfMorphisms) {
        return target.content.every(isIdentity);
    }
    if (target instanceof cat.Composed) {
        return target.content.every(isIdentity);
    }
    return false;
}

export function identityReindexings(
    target: cat.Broadcasted<any, any>,
): boolean {
    return target.reindexings.every(r => isIdentity(r));
}