// Claude Opus 5 (1M context), effort high.
/*
 * The axes a term holds, indexed by the uid that is an axis's identity.
 *
 * A legend row arrives carrying the uids of the axes it stands for rather than
 * the axes themselves, so a reader that wants to name the row the way the
 * figure names those axes has to find them in the term. A term is an immutable
 * directed acyclic graph with heavy sharing, and a walk that follows paths
 * rather than nodes visits a shared subterm once per path that reaches it, so
 * this walk records the nodes it has entered and enters each one once.
 */
import * as cat from '../data_structure/Category';
import * as fd from '../data_structure/Term';

export function find_axes_by_uid(term: fd.Term): Map<number, cat.Axis> {
    const found = new Map<number, cat.Axis>();
    enter_node(term, found, new Set<object>());
    return found;
}

function enter_node(
    node: unknown,
    found: Map<number, cat.Axis>,
    entered: Set<object>,
): void {
    if (node === null || typeof node !== 'object' || entered.has(node)) {
        return;
    }
    entered.add(node);
    if (Array.isArray(node)) {
        node.forEach((entry: unknown) => enter_node(entry, found, entered));
        return;
    }
    if (node instanceof cat.Axis && !found.has(node.uid._id)) {
        found.set(node.uid._id, node);
    }
    if (!(node instanceof fd.Term)) {
        return;
    }
    Object.values(node.dict()).forEach(
        (field: unknown) => enter_node(field, found, entered));
}
