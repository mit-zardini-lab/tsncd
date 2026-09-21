import * as fd from '../../data_structure/Term';
import * as cat from '../../data_structure/Category';
import * as pdt from './Para';

/*
 * A morphism with its grabs and drops written ON it.
 *
 * Mirrors `para/data_structure/ParaWrap.py`. `Para.py` has two seed morphisms,
 * `Grab` and `Drop`, and a parametrised `f` is `Grab ; f` - the right number
 * of cases for the algebra and the wrong number for a picture, where a tape
 * arriving beside an operator and one arriving at a box of its own are two
 * different things to read. A `ParaWrap` says which operands of `body` come
 * off the tape (`grabs[i]` is the slot, or `null`) and which results go back
 * onto it (`drops[j]`). Its own domain and codomain are the operands and
 * results that do NOT: `dom()` filters `body.dom()` by `grabs`, `cod()`
 * filters `body.cod()` by `drops`.
 *
 * It adds nothing mathematically - `pyncd`'s `to_base` writes it back out as
 * grabs, body, drops - and `pyncd`'s `to_para_wrap` is what produces it, as a
 * layering rule applied before a figure is sent. A term arrives here resolved
 * by `__qualname__` through the `TermDirectory`, and its fields in declaration
 * order, which is why the constructor takes (body, grabs, drops).
 */
export function establish(): void {
    console.log("Loaded ParaWrap module.");
}

@fd.register_term
export class ParaWrap<L, M extends cat.Morphism<L>> extends cat.Morphism<L> {
    constructor(
        readonly body: M | cat.Rearrangement<L>,
        readonly grabs: pdt.SlotEntry[],
        readonly drops: pdt.SlotEntry[],
    ) { super(); }

    dom(): cat.ProdObject<L> {
        return new cat.ProdObject<L>(
            this.body.dom().content.filter((_, i) => this.grabs[i] === null));
    }
    cod(): cat.ProdObject<L> {
        return new cat.ProdObject<L>(
            this.body.cod().content.filter((_, i) => this.drops[i] === null));
    }

    /* Positions in `body.dom()` that are grabbed / kept, in order. */
    grabbed(): number[] {
        return this.grabs.flatMap((g, i) => g === null ? [] : [i]);
    }
    kept_inputs(): number[] {
        return this.grabs.flatMap((g, i) => g === null ? [i] : []);
    }
    /* Positions in `body.cod()` that are dropped / kept, in order. */
    dropped(): number[] {
        return this.drops.flatMap((d, i) => d === null ? [] : [i]);
    }
    kept_outputs(): number[] {
        return this.drops.flatMap((d, i) => d === null ? [i] : []);
    }

    /* The old seeds, as wraps over the identity on what they carry. */
    static of_grab<L>(grab: pdt.Grab<L>): ParaWrap<L, cat.Rearrangement<L>> {
        return new ParaWrap<L, cat.Rearrangement<L>>(
            new cat.ProdObject<L>([grab.size]).identity(), [pdt.entry_of(grab)], [null]);
    }
    static of_drop<L>(drop: pdt.Drop<L>): ParaWrap<L, cat.Rearrangement<L>> {
        return new ParaWrap<L, cat.Rearrangement<L>>(
            new cat.ProdObject<L>([drop.size]).identity(), [null], [pdt.entry_of(drop)]);
    }
}

export type ParaWrapped<L, M extends cat.Morphism<L>> =
    pdt.Para<L, M | ParaWrap<L, M>>;
