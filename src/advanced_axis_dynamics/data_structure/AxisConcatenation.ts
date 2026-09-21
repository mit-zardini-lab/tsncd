/*
 * Written by Claude Opus 5, effort high.
 *
 * The axis an `aops.ConcatenateAxes` produces, holding the axes it is made
 * from.
 *
 * Mirrors `advanced_axis_dynamics/data_structure/AxisConcatenation.py`. The
 * positions of `parts` lie end to end along the axis, in order, so its size is
 * the sum of the parts' sizes. `pyncd` writes that sum onto `_size` whenever it
 * builds or rebuilds the axis, and the wire carries the sum, so nothing here
 * recomputes it.
 *
 * The uid carries no name. A part is replaced by the axis composition aligns it
 * with, so a name captured at construction would go stale, and the label is
 * read off the parts instead by `concatenatedAxisLabels.ts`.
 *
 * `pyncd/obsidian/02-categories/Advanced Axis Dynamics.md` states the feature.
 */

import * as fd from '../../data_structure/Term';
import * as nm from '../../data_structure/Numeric';
import * as sc from '../../data_structure/StrideCategory';

export function establish(): void {
    console.log("Loaded the axis concatenation module.");
}

/* What `pyncd` writes between the labels of two parts. */
export const PART_SEPARATOR = ' + ';

@fd.register_term
export class ConcatenatedAxis extends sc.Axis {
    constructor(
        readonly uid: fd.UID,
        readonly _size: nm.Numeric = new nm.Integer(0),
        readonly parts: sc.Axis[] = [],
    ) {
        super(uid, _size);
    }
}
