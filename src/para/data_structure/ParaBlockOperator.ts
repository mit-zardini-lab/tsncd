/*
 * Written by Claude Opus 5 (1M context), effort high.
 *
 * A boxed block that records the tape seeds standing inside it.
 *
 * Mirrors `para/data_structure/ParaBlockOperator.py`. A `Grab` and a `Drop`
 * have the empty product on one side, so a block holding them has the domain
 * and the codomain it would have without them and `BlockOperator` boxes such a
 * block with no sign that the tape is touched inside. `ParaBlockOperator` is
 * that box with the grabs and the drops of its body listed on the operator.
 *
 * The two lists are there for the algebra, which is `pyncd`'s side of the line,
 * and nothing here reads them: the body already shows every grab and drop it
 * holds when it is drawn as a sub-block. The box is the one `BlockOperator`
 * takes, registered for this class in
 * `display/Framework/para/ParaCategoryRenderer.ts`, because the operator
 * registry keys on the exact constructor name and does not walk superclasses.
 *
 * `pyncd/obsidian/10-para/Para Block Operator.md` holds the mathematics.
 */

import * as fd from '../../data_structure/Term';
import * as cat from '../../data_structure/Category';
import * as ops from '../../data_structure/Operators';
import * as pdt from './Para';

export function establish(): void {
    console.log("Loaded ParaBlockOperator module.");
}

@fd.register_term
export class ParaBlockOperator<B extends cat.Datatype, A extends cat.Axis>
    extends ops.BlockOperator<B, A> {
    constructor(
        readonly name: fd.DynamicName | null = new fd.DynamicName('BlockOp'),
        readonly block: cat.Block<cat.Array<B, A>, cat.Broadcasted<B, A>>,
        readonly grabs: pdt.Grab<cat.Array<B, A>>[] = [],
        readonly drops: pdt.Drop<cat.Array<B, A>>[] = [],
    ) { super(name, block); }
}
