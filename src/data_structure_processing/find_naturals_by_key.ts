// Claude Opus 5.5 (1M context), effort 40.
/*
 * The key of a natural's bound, and the naturals a term's arrays carry, indexed
 * by that key.
 *
 * A row of the second table of the legend stands for a `cat.Natural` that is the
 * datatype of an array of the term. The sender cannot name the natural by a
 * uid, because a natural has none, so it sends the structure of the bound as a
 * key. `pyncd`'s `websocket_transfer/auxiliary_information.py::natural_key`
 * writes the key, and `natural_key` here writes it the same way, so the row and
 * the wires of the figure are linked by equal strings. A symbol is written as
 * `#` and its uid, an integer as its digits, a sum, a product and a power as
 * `+`, `*` and `^` followed by the keys of their parts in brackets, and any other
 * numeric as `?`.
 *
 * The walk enters each node of the term once, for the reason
 * `find_axes_by_uid.ts` gives.
 */
import * as cat from '../data_structure/Category';
import * as fd from '../data_structure/Term';
import * as nm from '../data_structure/Numeric';

export function natural_key(bound: nm.Numeric): string {
    if (bound instanceof nm.FreeNumeric) {
        return `#${bound.uid._id}`;
    }
    if (bound instanceof nm.Integer) {
        return integer_digits(bound._value);
    }
    if (bound instanceof nm.Addition) {
        return `+(${bound.content.map(natural_key).join(',')})`;
    }
    if (bound instanceof nm.Multiplication) {
        return `*(${bound.content.map(natural_key).join(',')})`;
    }
    if (bound instanceof nm.Power) {
        return `^(${natural_key(bound.base)},${natural_key(bound.exponent)})`;
    }
    return '?';
}

/* The decimal digits of an integer, which `String` writes in exponent notation
 * from 10^21 upwards. Python writes every digit, and the two keys must agree. */
function integer_digits(value: fd.int): string {
    return Number.isInteger(value) && !Number.isSafeInteger(value)
        ? BigInt(value).toString() : String(value);
}

/**
 * Every `cat.Natural` that is the datatype of an array or a weave of `term`, or
 * that such a datatype holds, as a quantisation holds the natural it wraps. The
 * first natural met under a key stands for the key.
 */
export function find_naturals_by_key(term: fd.Term): Map<string, cat.Natural> {
    const carriers: (cat.Array<any, any> | cat.Weave<any, any>)[] = [];
    enter_node(term, new Set<object>(), (node: object): void => {
        if (node instanceof cat.Array || node instanceof cat.Weave) {
            carriers.push(node);
        }
    });
    const found = new Map<string, cat.Natural>();
    const searched = new Set<object>();
    carriers.forEach((carrier) => enter_node(
        carrier.datatype, searched, (node: object): void => {
            if (node instanceof cat.Natural) {
                const key = natural_key(node.max_value);
                if (!found.has(key)) {
                    found.set(key, node);
                }
            }
        }));
    return found;
}

/** The naturals `datatype` is or holds, which is the natural itself, the
 * natural a quantisation wraps, and none for the reals. */
export function naturals_of_datatype(datatype: cat.Datatype): cat.Natural[] {
    const naturals: cat.Natural[] = [];
    enter_node(datatype, new Set<object>(), (node: object): void => {
        if (node instanceof cat.Natural) {
            naturals.push(node);
        }
    });
    return naturals;
}

function enter_node(
    node: unknown,
    entered: Set<object>,
    visit: (node: object) => void,
): void {
    if (node === null || typeof node !== 'object' || entered.has(node)) {
        return;
    }
    entered.add(node);
    if (Array.isArray(node)) {
        node.forEach((entry: unknown) => enter_node(entry, entered, visit));
        return;
    }
    visit(node);
    if (!(node instanceof fd.Term)) {
        return;
    }
    Object.values(node.dict()).forEach(
        (field: unknown) => enter_node(field, entered, visit));
}
