/*
 * Written by Claude Opus 5 (1M context), effort high.
 *
 * The operators that read a reindexing covariantly.
 *
 * Mirrors `advanced_axis_dynamics/data_structure/Operators.py`. An `ops.View`
 * reads its reindexing contravariantly, sending each output position to the
 * input position it reads, which is the direction every `reindexings` entry of
 * a `Broadcasted` points. The two operators here read a reindexing the other
 * way, sending each input position to the output position it writes, so each
 * one carries its reindexings as a field of the operator.
 *
 * `CovariantView` is one reindexing read that way, which is the merge of a
 * split. `ConcatenateAxes` is one reindexing per input read that way, each
 * writing one axis at unit stride onto one shared axis at the offset the
 * sizes of the parts before it sum to, so the images are disjoint runs in
 * order that fill the shared axis. The window scores `[h, x, w]` and the
 * selected-entry scores `[h, x, s]` of DeepSeek-V4.1-Flash concatenate into
 * `[h, x, t]` with `|t| = |w| + |s|`. `DeconcatenateAxes` holds the same
 * reindexings and reads each of them contravariantly, so it takes one axis and
 * cuts it into the parts that fill it.
 *
 * `covariantOperatorBoxes.ts` draws all three, and
 * `pyncd/obsidian/02-categories/Advanced Axis Dynamics.md` states the feature.
 */

import * as fd from '../../data_structure/Term';
import * as nm from '../../data_structure/Numeric';
import * as cat from '../../data_structure/Category';

export function establish(): void {
    console.log("Loaded the advanced axis dynamics operators.");
}

@fd.register_term
export class CovariantView<A extends cat.Axis> extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = null,
        readonly reindexing: cat.StrideMorphism<A> | null = null,
    ) { super(name); }
}

@fd.register_term
export class ConcatenateAxes<A extends cat.Axis> extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('\\Vert'),
        readonly part_reindexings: cat.StrideMorphism<A>[] = [],
    ) { super(name); }

    /* The axis each part reindexing writes into the concatenated axis. */
    parts(): A[] {
        return this.part_reindexings.map((reindexing) => reindexing._dom[0]);
    }

    /* The axis the parts fill. */
    concatenated_axis(): A | undefined {
        const [row] = this.part_reindexings[0]?._cod_stride_shift ?? [];
        return row?.[0];
    }

    /* The position of the concatenated axis at which each part starts, which
     * is the shift of that part's one row. */
    offsets(): (nm.Numeric | undefined)[] {
        return this.part_reindexings.map(
            (reindexing) => reindexing._cod_stride_shift[0]?.[2]);
    }
}

/*
 * One axis cut into the parts that fill it, one reindexing per output, which
 * is the mirror image of `ConcatenateAxes`.
 *
 * The reindexings are the ones a concatenation of the same parts holds. A
 * concatenation reads each of them covariantly, from its part onto the whole,
 * and a deconcatenation reads them contravariantly, from the whole back onto
 * each part, which is the direction an `ops.View` reads. The 512 channels of a
 * DeepSeek-V4.1-Flash latent deconcatenate into the 448 channels the rotary
 * embedding leaves alone and the 64 it rotates.
 */
@fd.register_term
export class DeconcatenateAxes<A extends cat.Axis> extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('\\Vert^{-1}'),
        readonly part_reindexings: cat.StrideMorphism<A>[] = [],
    ) { super(name); }

    /* The axis each part reindexing reads out of the axis being cut. */
    parts(): A[] {
        return this.part_reindexings.map((reindexing) => reindexing._dom[0]);
    }

    /* The axis the parts are cut from. */
    concatenated_axis(): A | undefined {
        const [row] = this.part_reindexings[0]?._cod_stride_shift ?? [];
        return row?.[0];
    }

    /* The position of the axis being cut at which each part starts, which is
     * the shift of that part's one row. */
    offsets(): (nm.Numeric | undefined)[] {
        return this.part_reindexings.map(
            (reindexing) => reindexing._cod_stride_shift[0]?.[2]);
    }
}
