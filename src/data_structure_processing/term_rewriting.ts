// Claude Opus 5.5 (1M context), effort 40.
/*
 * A term rebuilt with some of its parts replaced, as `pyncd`'s
 * `fd.Term.reconstruct` and `fd.deep_reconstruct` in `data_structure/Term.py`
 * rebuild one.
 *
 * A term here is immutable, so a rewrite returns a new term and leaves the one
 * it read alone. A term is an immutable directed acyclic graph with heavy
 * sharing, and `MemoisedRewrite` enters each node once and returns the node
 * itself wherever nothing under it changed, which keeps the sharing a rebuild
 * would otherwise turn into a tree.
 */
import * as fd from '../data_structure/Term';

/**
 * `term` with the fields named in `changes` replaced and every other field
 * kept.
 *
 * The copy is made on the prototype of `term` rather than through its
 * constructor. `TermJSONConverter` builds a term positionally in the order of
 * its fields, and a copy through the constructor would depend on the order of
 * `Object.keys` matching that order for every class. A field the constructor
 * derives from the others keeps the value it was derived with, which the
 * rewrites of this package never change.
 */
export function reconstruct<T extends fd.Term>(term: T, changes: Partial<T>): T {
    return Object.assign(Object.create(Object.getPrototypeOf(term)), term, changes);
}

/**
 * `target` with `rewrite` applied to each of its parts, and `target` itself
 * where every part came back as the object it went in as. The parts of a term
 * are its fields and the parts of an array are its entries. Anything else has
 * no parts.
 */
export function deep_reconstruct<T>(target: T, rewrite: (part: unknown) => unknown): T {
    if (Array.isArray(target)) {
        const parts = target.map(rewrite);
        return parts.some((part, index) => part !== target[index])
            ? parts as T : target;
    }
    if (!(target instanceof fd.Term)) {
        return target;
    }
    const fields = target as unknown as Record<string, unknown>;
    const changes: Record<string, unknown> = {};
    let changed = false;
    Object.keys(fields).forEach((key) => {
        const part = rewrite(fields[key]);
        if (part !== fields[key]) {
            changes[key] = part;
            changed = true;
        }
    });
    return changed ? reconstruct(target, changes as Partial<typeof target>) as T : target;
}

/** A term a rewrite returned, beside `images`, which holds every object of
 * the term it was given against what that object became. */
export interface RewrittenTerm<T> {
    term: T;
    images: ReadonlyMap<object, unknown>;
}

/**
 * A rewrite of every object under a term, which enters each object once.
 *
 * `rewrite_object` says what one object becomes, and calls `apply` on the
 * parts it needs rewritten first. `images` holds every object entered beside
 * what it became, so a caller can follow what a node of the term it gave
 * became in the term it received.
 */
export class MemoisedRewrite {
    readonly images = new Map<object, unknown>();

    constructor(
        private readonly rewrite_object: (
            target: object, apply: (part: unknown) => unknown) => unknown,
    ) {}

    apply = (target: unknown): unknown => {
        if (target === null || typeof target !== 'object') {
            return target;
        }
        if (this.images.has(target)) {
            return this.images.get(target);
        }
        const image = this.rewrite_object(target, this.apply);
        this.images.set(target, image);
        return image;
    };
}
