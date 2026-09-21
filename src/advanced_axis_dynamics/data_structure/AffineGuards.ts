/*
 * Written by Claude Opus 5 (1M context), effort high.
 *
 * An axis whose live positions are stated by an affine form of its position.
 *
 * Mirrors `advanced_axis_dynamics/data_structure/AffineGuards.py`. A codomain
 * index of a `StrideMorphism` outside `[0, size)` of its axis names no position
 * and a read there yields the universal unit, and `AffineSparseAxis` records
 * the consequence on the array read: position `j` of the axis, at positions `i`
 * of its `guides`, holds a value where
 * `0 <= sum(guide_strides * i) + stride * j + shift < extent`, and the unit
 * elsewhere.
 *
 * `pyncd` captures the name `w|x` on the uid, the axis letter and its guide
 * letters, so the label already says which axes the form reads.
 * `display/Framework/advanced_axis_dynamics/guardedAxisLabels.ts` registers the
 * processor that draws it, and the one thing that processor changes is where an
 * assigned size is written. The tests the Python side writes in these fields -
 * `crosses_start`, `crosses_end`, `empty_end` - are algebra and stay there.
 *
 * `pyncd/obsidian/02-categories/Advanced Axis Dynamics.md` states the feature.
 */

import * as fd from '../../data_structure/Term';
import * as nm from '../../data_structure/Numeric';
import * as sc from '../../data_structure/StrideCategory';

export function establish(): void {
    console.log("Loaded the affine guards module.");
}

/*
 * Which end of an `AffineSparseAxis` holds the unit at the guide positions
 * where some of its positions do.
 *
 * The member names are the ones the JSON carries, because `TermJSONConverter`
 * writes an enum as its Python member name and reads it back through
 * `EnumDirectory`. No field of a term holds one today, and the enum is
 * mirrored so that the two trees read side by side and so that one arriving
 * later resolves.
 */
export enum EmptyEnd {
    type = 'EmptyEnd',
    FIRST = 'first',
    LAST = 'last',
    BOTH = 'both',
}
fd.register_enum(EmptyEnd);

@fd.register_term
export class AffineSparseAxis extends sc.Axis {
    constructor(
        readonly uid: fd.UID,
        readonly _size: nm.Numeric = new nm.FreeNumeric(),
        readonly guides: sc.Axis[] = [],
        readonly guide_strides: nm.Numeric[] = [],
        readonly stride: nm.Numeric = new nm.Integer(1),
        readonly shift: nm.Numeric = new nm.Integer(0),
        readonly extent: nm.Numeric | null = null,
    ) {
        super(uid, _size);
    }
}
