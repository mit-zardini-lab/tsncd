import * as fd from '../../data_structure/Term';
import * as nm from '../../data_structure/Numeric';
import * as cat from '../../data_structure/Category';

export function establish(): void {
    console.log("Loaded Para module.");
}

@fd.register_term
export class TapeSlot extends fd.UTerm {
    constructor(
        readonly uid: fd.UID,
    ) { super(uid); }
}

export abstract class ParaMorphism<L> extends cat.Morphism<L> {
    constructor(
        readonly tape: TapeSlot,
        readonly size: L,
    ) { super(); }
}

@fd.register_term
export class Grab<L> extends ParaMorphism<L> {
    dom(): cat.ProdObject<L> {
        return new cat.ProdObject<L>([]);
    }
    cod(): cat.ProdObject<L> {
        return new cat.ProdObject<L>([this.size]);
    }
}

@fd.register_term
export class Drop<L> extends ParaMorphism<L> {
    dom(): cat.ProdObject<L> {
        return new cat.ProdObject<L>([this.size]);
    }
    cod(): cat.ProdObject<L> {
        return new cat.ProdObject<L>([]);
    }
}

/*
 * The seeds of a loop variable, mirroring `para/data_structure/Para.py`. A
 * `StreamGrab` reads the value the slot held when the iteration started, and a
 * `StreamDrop` writes the value the next iteration starts from, so where the
 * drop stands in the body carries no meaning.
 */
@fd.register_term
export class StreamGrab<L> extends Grab<L> {}

@fd.register_term
export class StreamDrop<L> extends Drop<L> {}

/* A slot as a loop variable: the entry a `ParaWrap` holds for a `StreamGrab` on
 * its grab side and a `StreamDrop` on its drop side. */
@fd.register_term
export class StreamSlot extends fd.Term {
    constructor(
        readonly slot: TapeSlot,
    ) { super(); }
}

/*
 * The seeds of a slot indexed by the iteration of a repeated block, mirroring
 * `para/data_structure/Para.py`. A `LoopGrab` reads the member of its slot that
 * the iteration `index` wrote, and a `LoopDrop` writes the member the iteration
 * `index` holds, where `index` is a numeric over the counter of a repeated
 * block around the seed. A drop and a grab carrying the same counter name the
 * member one iteration writes and that same iteration reads, and an index that
 * is an expression of the counter names the member of another iteration.
 */
@fd.register_term
export class LoopGrab<L> extends Grab<L> {
    constructor(
        readonly tape: TapeSlot,
        readonly size: L,
        readonly index: nm.Numeric,
    ) { super(tape, size); }
}

@fd.register_term
export class LoopDrop<L> extends Drop<L> {
    constructor(
        readonly tape: TapeSlot,
        readonly size: L,
        readonly index: nm.Numeric,
    ) { super(tape, size); }
}

/* A slot at one iteration of a repeated block: the entry a `ParaWrap` holds for
 * a `LoopGrab` on its grab side and a `LoopDrop` on its drop side. */
@fd.register_term
export class LoopSlot extends fd.Term {
    constructor(
        readonly slot: TapeSlot,
        readonly index: nm.Numeric,
    ) { super(); }
}

/*
 * The seeds of a reduction exchanged across processors, mirroring
 * `para/data_structure/Para.py`. Every processor holds its own copy of the
 * slot, and the exchange folds the copies together over several rounds. A
 * `ReductionGrab` reads a partner processor's copy, which the partner's
 * `ReductionDrop` wrote in the round before, and a `ReductionDrop` writes this
 * processor's folded partial for the next round.
 */
@fd.register_term
export class ReductionGrab<L> extends Grab<L> {}

@fd.register_term
export class ReductionDrop<L> extends Drop<L> {}

/* A slot exchanged between processors: the entry a `ParaWrap` holds for a
 * `ReductionGrab` on its grab side and a `ReductionDrop` on its drop side. */
@fd.register_term
export class ReductionSlot extends fd.Term {
    constructor(
        readonly slot: TapeSlot,
    ) { super(); }
}

export type NamedEntry = TapeSlot | StreamSlot | LoopSlot | ReductionSlot;
export type SlotEntry = NamedEntry | null;

export function slot_of(entry: NamedEntry): TapeSlot {
    return entry instanceof TapeSlot ? entry : entry.slot;
}

/* The iteration `entry` names, and null for an entry naming no iteration. */
export function index_of(entry: NamedEntry): nm.Numeric | null {
    return entry instanceof LoopSlot ? entry.index : null;
}

export function entry_of<L>(seed: ParaMorphism<L>): NamedEntry {
    if (seed instanceof StreamGrab || seed instanceof StreamDrop) {
        return new StreamSlot(seed.tape);
    }
    if (seed instanceof LoopGrab || seed instanceof LoopDrop) {
        return new LoopSlot(seed.tape, seed.index);
    }
    if (seed instanceof ReductionGrab || seed instanceof ReductionDrop) {
        return new ReductionSlot(seed.tape);
    }
    return seed.tape;
}

export type Para<L, M extends cat.Morphism<L>> =
    cat.ProdCategory<L, M | Grab<L> | Drop<L>>;
