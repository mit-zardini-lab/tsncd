/*
 * Written by Claude Opus 5 (1M context), effort high.
 *
 * The boxes for the operators of `advanced_axis_dynamics`, mirroring
 * `advanced_axis_dynamics/data_structure/Operators.py`. `CovariantView` and
 * `ConcatenateAxes` read a reindexing covariantly, and `DeconcatenateAxes`
 * reads the reindexings a concatenation of the same parts holds the other way.
 *
 * The boxes sit here so that no module of `display/Framework` outside this
 * folder imports `advanced_axis_dynamics/data_structure/`.
 */

import * as rh from '../../Render/RenderHandler';
import * as cat from '../../../data_structure/Category';
import * as cr from '../CategoryRenderer';
import * as scr from '../StrideCategoryRenderer';
import * as bb from '../BroadcastedCategoryRenderer';
import * as ut from '../../../utilities/utilities';
import * as aops from '../../../advanced_axis_dynamics/data_structure/Operators';

export function establish(): void {
    console.log("Loaded the covariant operator boxes.");
}

/*
 * `aops.CovariantView` is a reindexing read covariantly. Its reindexing is a
 * field of the operator rather than a weave reindexing, because a weave
 * reindexing points from the output back to the input and this one runs the
 * other way, so nothing else draws it. The box builds the figure itself, as
 * `ReindexTransposeBox` in `para/ParaCategoryRenderer.ts` does and for the same
 * reason. `scr.CovariantStrideRenderer` draws the reindexing with its domain on
 * the left and its codomain on the right, so the axes the operator merges
 * arrive on the flat edge each beside its stride, and the point aims at the
 * axis they are merged into. The node is a `StrideMorphismBox` like every other
 * reindexing in the figure, and reserves the same `minimum_reindexing_height`.
 *
 * Only the target axes reach the node. An operand carries its degree axes
 * beside them, and `BroadcastedBox` routes those round the glyph in the WEAVE
 * form and reserves the room for them above it in `core_room`.
 *
 * The operator moves each value to a new position without changing it. The
 * operand and the result therefore have the same datatype, and the datatype
 * wire passes the pentagon as a degree axis does, through
 * `pass_anchor_through`. A `CovariantView` over the reals has no datatype
 * anchor on either side, so there is nothing to link.
 *
 * A merge with an empty domain has no operand, and its node has an empty left
 * column with nothing to link to. `StrideMorphismBox.points_left` turns the
 * point onto that empty side, which is how `A^{0}` of DeepSeek-V4.1-Flash is
 * drawn.
 */
@bb.opsRegistry.registerClass(aops.CovariantView)
export class CovariantViewBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, aops.CovariantView<A>> {
    private node_box?: cr.MorphismBox<A, cat.StrideMorphism<A>, A>;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, aops.CovariantView<A>>,
    ) {
        super(categoryRenderer, target, {x: 0, y: 0});
        const reindexing = target.operator.reindexing;
        if (reindexing === null || reindexing === undefined) { return; }
        this.node_box = new scr.CovariantStrideRenderer<A>(
            this.renderHandler, this.categoryRenderer.strideRenderer.settings)
            .display_category(reindexing, false);
        this.link_merged_axes(this.node_box);
        this.core = new rh.CoreElement(
            this.renderHandler,
            {
                x: this.node_box.dims.x + 2 * this.settings.broadcast_offset_x,
                y: Math.max(this.left_anchors.dims.y,
                            this.right_anchors.dims.y,
                            this.node_box.dims.y),
            },
            [this.node_box],
        );
        this.children = [this.left_anchors, this.core, this.right_anchors];
        this.pass_datatype_through();
    }
    /*
     * The axes the operator merges onto the node's left column, and the node's
     * right column onto the axis the operator produces.
     *
     * An operand carrying fewer axes than the reindexing merges leaves the
     * node's last left anchors with nothing arriving at them, which is the
     * merge `CovariantView.broadcast_over_absent_axes_and_merge` builds: the
     * axes the operand carries lead the reindexing's domain, the merge is
     * broadcast over the rest, and linking pairs the two columns by position.
     *
     * A merge fans in, so the node has to be visibly where the wires meet and
     * none of the four columns may be skipped through. The pin is `allow_skip`
     * rather than `loose`, for the reason `BroadcastedBox.link_node` gives:
     * `ComposedGap.make_composed_gap` sets `loose` after this constructor has
     * run and would set it again.
     */
    private link_merged_axes(
        node_box: cr.MorphismBox<A, cat.StrideMorphism<A>, A>,
    ): void {
        const merged = this.input_axes[0] ?? [];
        const produced = this.output_axes[0] ?? [];
        cr.Meridian.generic_link(merged, node_box.left_anchors);
        cr.Meridian.generic_link(node_box.right_anchors, produced);
        for (const anchor of [
            ...merged, ...produced,
            ...node_box.left_anchors.anchors,
            ...node_box.right_anchors.anchors,
        ]) {
            anchor.allow_skip = false;
        }
    }
    private pass_datatype_through(): void {
        const operand_datatype = this.input_meridians[0]?.datatype_anchor;
        const result_datatype = this.output_meridians[0]?.datatype_anchor;
        if (operand_datatype && result_datatype) {
            this.pass_anchor_through(operand_datatype, result_datatype);
        }
    }
}

/*
 * The target anchors of each array, which are the anchors of the axes the
 * operator reads. A meridian built from the array carries an anchor at every
 * position, and the weave beside it says which of those positions the operator
 * is broadcast over.
 */
function target_anchors<B extends cat.Datatype, A extends cat.Axis>(
    weaves: cat.Weave<B, A>[],
    meridians: bb.ArrayMeridian<B, A>[],
): cr.Anchor<A>[][] {
    return ut.zip(weaves, meridians).map(
        ([weave, meridian]) => weave.select_target(meridian.axes_anchors.anchors));
}

/*
 * The shared figure of a concatenation and a deconcatenation: every axis of
 * one side runs to every axis of the other, the single wire of the axis they
 * all meet on carries a white junction circle, and the datatype passes from
 * each operand to each result unchanged.
 *
 * The figure is drawn on the anchors of the `BroadcastedBox` that holds the
 * operator rather than on anchors of this box. The user asked on 2026-09-17
 * for the circle to sit on the holder's own anchor of the axis the parts meet
 * on, so `link_holder_anchors` wires that box's two columns to each other and
 * this box takes a core of no size and keeps its own anchors out of the
 * wiring. A wire therefore runs from the part's anchor in the holder's left
 * column to the whole's anchor in its right column, and the circle is drawn
 * where that anchor stands.
 *
 * The two operators differ in which side holds the one axis. A concatenation
 * takes one part per operand and produces the whole, so its junction is on the
 * result. A deconcatenation takes the whole and produces one part per result,
 * so its junction is on the operand. Each subclass names its own side and the
 * geometry is written once.
 */
abstract class JunctionOfPartsBox<
    B extends cat.Datatype,
    A extends cat.Axis,
    O extends cat.Operator,
> extends bb.OperationBox<B, A, O> {
    /* The holder's anchors the junction circle is drawn on, which stay empty
     * until the holder hands its columns over. */
    private junction_anchors: cr.Anchor<A>[] = [];
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, O>,
    ) {
        super(categoryRenderer, target, {x: 0, y: 0});
    }
    public link_holder_anchors(holder: bb.BroadcastedBox<B, A>): boolean {
        const operands = target_anchors(
            this.target.input_weaves, holder.input_meridians);
        const results = target_anchors(
            this.target.output_weaves, holder.output_meridians);
        for (const operand of operands.flat()) {
            for (const result of results.flat()) {
                operand.link(result);
            }
        }
        this.link_datatypes(holder);
        this.leave_the_broadcast_axes_unnamed(holder);
        this.junction_anchors = this.junction_axes(operands, results);
        for (const anchor of this.junction_anchors) {
            // The circle marks the wires meeting, so the dot that marks the
            // same thing is not drawn under it, and the name of the axis begins
            // past the circle rather than over it.
            anchor.draws_meeting_dot = false;
            anchor.gap_label_inset = 2 * CONCATENATION_JUNCTION_RADIUS;
        }
        return true;
    }
    /*
     * Take the names of the axes the operator is broadcast over out of the gaps
     * on either side of this box.
     *
     * Those axes are copied from each operand to each result, so a
     * deconcatenation into two parts writes each of them twice on its right and
     * the names pile up on the names of the parts. The user ruled on 2026-09-17
     * that a concatenation names the axis it fills and its parts and nothing
     * else. Every other gap of the figure names them as it did.
     */
    private leave_the_broadcast_axes_unnamed(
        holder: bb.BroadcastedBox<B, A>,
    ): void {
        const broadcast_over = [
            ...ut.zip(this.target.input_weaves, holder.input_meridians),
            ...ut.zip(this.target.output_weaves, holder.output_meridians),
        ].flatMap(([weave, meridian]) => weave.select_degree(
            meridian.axes_anchors.anchors));
        broadcast_over.forEach((anchor) => anchor.annotate_in_gap = false);
    }
    /* The anchors of the axis the parts meet on, which is the side holding one
     * array against the other side's one per part. */
    protected abstract junction_axes(
        operands: cr.Anchor<A>[][],
        results: cr.Anchor<A>[][],
    ): cr.Anchor<A>[];
    /* Each operand carries the values of each result, so the datatype crosses
     * the box once per pair. One of the two sides holds a single array in
     * either operator, so the pairs are that array against each of the other
     * side's. */
    private link_datatypes(holder: bb.BroadcastedBox<B, A>): void {
        for (const operand of holder.input_meridians) {
            for (const result of holder.output_meridians) {
                if (operand.datatype_anchor && result.datatype_anchor) {
                    operand.datatype_anchor.link(result.datatype_anchor);
                }
            }
        }
    }
    /* The holder, whose rectangle is the strip the parts meet in. This box is
     * drawn on the holder's anchors and has none of its own, so its rectangle
     * has no width and cannot be rested on. */
    public region_element(holder: bb.BroadcastedBox<B, A>): rh.DiagramElement {
        return holder;
    }
    update(): void {
        super.update();
        for (const axis of this.junction_anchors) {
            this.draw?.circle(
                axis.rectangle().midpoint(),
                {fill: 'white', stroke: 'black', 'stroke-width': '2px',
                 radius: CONCATENATION_JUNCTION_RADIUS},
                undefined,
                JUNCTION_CIRCLE_LAYER,
            );
        }
    }
}

/* The parts arrive and the axis they fill leaves, so the junction sits on the
 * result. */
@bb.opsRegistry.registerClass(aops.ConcatenateAxes)
export class ConcatenateAxesBox<B extends cat.Datatype, A extends cat.Axis>
    extends JunctionOfPartsBox<B, A, aops.ConcatenateAxes<A>> {
    protected junction_axes(
        _operands: cr.Anchor<A>[][],
        results: cr.Anchor<A>[][],
    ): cr.Anchor<A>[] {
        return results.flat();
    }
}

/* The axis being cut arrives and its parts leave, so the junction sits on the
 * operand. */
@bb.opsRegistry.registerClass(aops.DeconcatenateAxes)
export class DeconcatenateAxesBox<B extends cat.Datatype, A extends cat.Axis>
    extends JunctionOfPartsBox<B, A, aops.DeconcatenateAxes<A>> {
    protected junction_axes(
        operands: cr.Anchor<A>[][],
        _results: cr.Anchor<A>[][],
    ): cr.Anchor<A>[] {
        return operands.flat();
    }
}

export const CONCATENATION_JUNCTION_RADIUS = 5;

/*
 * The layer the junction circle is painted on.
 *
 * `RenderHandler.update` reaches the core, where this box draws, between the
 * holder's left column and its right one. A concatenation's junction stands on
 * a right column anchor, and that anchor paints the wire leaving the box after
 * the core has drawn, so on the main layer the wire is painted over the circle
 * from its centre outwards. The broadcast layer is painted over the main one,
 * which puts the circle over every wire that meets it, as the mark of a meeting
 * should be.
 */
const JUNCTION_CIRCLE_LAYER: 'main' | 'broadcast' = 'broadcast';
