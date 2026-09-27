/*
 * Written by Claude Opus 5.5 (1M context), effort 40.
 *
 * The operator an array passes through to be kept for the passes that follow.
 *
 * Mirrors `caching/data_structure/Caching.py`. The operand is the array a pass
 * computes for its own tokens, on the axis `x`, and the result is the same
 * array over every token the cache holds once the operand is saved, on the
 * axis `P + x`, which is an `AxisConcatenation.ConcatenatedAxis`. Every other
 * axis is broadcast. `name` names the cache, and `cachingBoxes.ts` draws it.
 *
 * `pyncd/obsidian/08-caching/Caching Between Passes.md` states the feature.
 */

import * as fd from '../../data_structure/Term';
import * as cat from '../../data_structure/Category';

export function establish(): void {
    console.log("Loaded the caching operator.");
}

@fd.register_term
export class Caching extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = null,
    ) { super(name); }
}
