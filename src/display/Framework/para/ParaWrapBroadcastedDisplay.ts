import * as cat from '../../../data_structure/Category';
import * as cr from '../CategoryRenderer';
import * as bb from '../BroadcastedCategoryRenderer';
import * as pwt from '../../../para/data_structure/ParaWrap';
import { ParaWrapBox } from './ParaWrapDisplay';

export function establish(): void {
    console.log("Loaded ParaWrap broadcasted display module.");
}

/*
 * A `ParaWrap` whose body is a `Broadcasted`: the grabbed operands feed the
 * OPERATOR from above, and the dropped results leave it below.
 *
 * `ParaWrapBox` on its own would put the body in the core with every operand
 * in its left column and run the tapes into that column through elbows -
 * right for a rearrangement, where there is nothing to feed but the wire, and
 * a waste of the box for an operator. The point of writing a grab onto an
 * `Einops` is to see the grabbed array enter the contraction: its contracted
 * axis tied to the operand it pairs with by the same cup that ties two
 * left-hand operands, and its degree axes routed round the operator like any
 * other broadcast.
 *
 * So the inner box is a `BroadcastedBox` built with a `WrapLayout`, which
 * moves the grabbed inputs out of its left column and onto a `RowMeridian`
 * along its top edge (and the dropped outputs onto one along its bottom),
 * passes the same layout to its `OperationBox`, and links row to row. The
 * operator's own glyph then sees the operand arriving from above - `EinopsBox`
 * draws the cup as a quarter turn from the row to the column, and any other
 * box simply has the wire arrive at its top. `ParaWrapBox` finds the rows on
 * the inner box and draws only the tape at them.
 *
 */
export function wrap_layout<L, M extends cat.Morphism<L>>(
    target: pwt.ParaWrap<L, M>,
): bb.WrapLayout {
    return {
        grabbed: target.grabs.map((g) => g !== null),
        dropped: target.drops.map((d) => d !== null),
    };
}

export class ParaWrapBroadcastedBox<B extends cat.Datatype, A extends cat.Axis>
    extends ParaWrapBox<cat.Array<B, A>, cat.Broadcasted<B, A>, A | B> {

    static create<B extends cat.Datatype, A extends cat.Axis>(
        categoryRenderer: cr.CategoryRenderer<cat.Array<B, A>, any, A | B>,
        base: bb.BroadcastedRenderer<B, A>,
        target: pwt.ParaWrap<cat.Array<B, A>, cat.Broadcasted<B, A>>,
    ): ParaWrapBroadcastedBox<B, A> {
        const inner = bb.broadcasted_box<B, A>(
            base,
            target.body as cat.Broadcasted<B, A>,
            wrap_layout(target));
        return new ParaWrapBroadcastedBox<B, A>(categoryRenderer, target, inner);
    }
}

/*
 * The box for a `ParaWrap`: the broadcast form where the body is a
 * `Broadcasted` and the renderer underneath draws those, the general form
 * otherwise.
 */
export function display_para_wrap<L, M extends cat.Morphism<L>, A>(
    categoryRenderer: cr.CategoryRenderer<L, any, A>,
    base: cr.CategoryRenderer<L, M, A>,
    target: pwt.ParaWrap<L, M>,
): ParaWrapBox<L, M, A> {
    if (target.body instanceof cat.Broadcasted
        && base instanceof bb.BroadcastedRenderer) {
        return ParaWrapBroadcastedBox.create(
            categoryRenderer as cr.CategoryRenderer<any, any, any>,
            base,
            target as pwt.ParaWrap<any, any>,
        ) as unknown as ParaWrapBox<L, M, A>;
    }
    return new ParaWrapBox<L, M, A>(categoryRenderer, target);
}
