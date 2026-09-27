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
import * as pt from '../../../utilities/Point';
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
        this.names_itself = true;
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
    /* The holder's anchors on which the junction circle is drawn, and its
     * anchors of the parts meeting there, which stay empty until the holder
     * hands its columns over. */
    private junction_anchors: cr.Anchor<A>[] = [];
    private part_anchors: cr.Anchor<A>[] = [];
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, O>,
    ) {
        super(categoryRenderer, target, {x: 0, y: 0});
    }
    /*
     * The rows asked for by a `ParaWrap`, holding none of this box's anchors.
     *
     * The holder builds a row of its own wherever this box has one, and links
     * the target anchors of its row to this box's row. `link_holder_anchors`
     * has already wired a part on the holder's row to the axis on which the
     * parts meet, so a second link would fan the part's wire out to an anchor
     * that draws nothing, and the fan would put a dot where the tape reaches
     * the row. The holder's link to a row with no anchors pairs nothing. The
     * columns stay as `OperationBox.apply_wrap` builds them, so this box is as
     * tall as the columns of the kept operands.
     */
    apply_wrap(wrap: bb.WrapLayout): void {
        super.apply_wrap(wrap);
        const row_with_no_anchors = (): cr.RowMeridian<B | A> =>
            new cr.RowMeridian<B | A>(this.categoryRenderer, [], 0);
        this.top_anchors = this.top_anchors && row_with_no_anchors();
        this.bottom_anchors = this.bottom_anchors && row_with_no_anchors();
        this.children = cr.four_sided(
            this.renderHandler, this.left_anchors, this.core,
            this.right_anchors, this.top_anchors, this.bottom_anchors);
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
        this.part_anchors = [...operands.flat(), ...results.flat()].filter(
            (anchor) => !this.junction_anchors.includes(anchor));
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
    /*
     * Gives the wire of each part on a row a turn of no radius where the circle
     * stands on the corner, so the circle covers the whole turn and the part's
     * wire enters it straight. The wire between a part on a row and the
     * junction is painted by the anchor it leaves, which is the part in a
     * concatenation and the junction in a deconcatenation, so both anchors are
     * given the radius. The corner is known only once the browser has laid the
     * holder out, and the wires are drawn before this box's own `update`, so
     * the radius is set here.
     */
    post_placement(): void {
        super.post_placement();
        for (const axis of this.junction_anchors) {
            const junction = axis.location()!;
            const centre = this.junction_centre(axis);
            const circle_on_the_corner = centre.x !== junction.x
                || centre.y !== junction.y;
            for (const anchor of [axis, ...this.part_anchors.filter(
                (part) => part.horizontal)]) {
                anchor.wire_turn_radius = circle_on_the_corner ? 0 : undefined;
            }
        }
    }
    update(): void {
        super.update();
        for (const axis of this.junction_anchors) {
            this.draw?.circle(
                this.junction_centre(axis),
                {fill: 'white', stroke: 'black', 'stroke-width': '2px',
                 radius: CONCATENATION_JUNCTION_RADIUS},
                undefined,
                JUNCTION_CIRCLE_LAYER,
            );
        }
    }
    /*
     * The point at which the circle of the junction at `axis` is drawn. It is
     * the anchor itself unless a `ParaWrap` has put a part on a row of the
     * holder.
     *
     * A part on a row meets the junction's line at the corner of its wire,
     * because `cr.wire_curve` turns a wire between a row anchor and a column
     * anchor at the row anchor's x and the column anchor's y. The circle goes
     * on that corner, so a part grabbed off the tape runs straight down from
     * its tape into the circle, and a part dropped onto the tape leaves the
     * circle straight down. The parts in the column reach the corner along the
     * junction's line only where they stand level with the junction, and the
     * circle stays on the anchor otherwise.
     */
    private junction_centre(axis: cr.Anchor<A>): pt.Point {
        const junction = axis.location()!;
        if (axis.horizontal) {
            return junction;
        }
        const parts = this.part_anchors.filter((part) => part.location() !== undefined);
        const on_rows = parts.filter((part) => part.horizontal).map(
            (part) => part.location()!);
        const in_columns_level = parts.filter((part) => !part.horizontal).every(
            (part) => Math.abs(part.location()!.y - junction.y) < LEVEL_TOLERANCE);
        return in_columns_level
            ? junction_corner(junction, on_rows) : junction;
    }
}

/*
 * The corner nearest `junction` at which a wire from one of `row_parts`
 * turns onto the junction's line, and the junction itself where no part stands
 * on a row. Of several parts on rows, the one nearest the junction is taken,
 * because every other part has joined the line before its corner.
 */
export function junction_corner(
    junction: pt.Point,
    row_parts: readonly pt.Point[],
): pt.Point {
    if (row_parts.length === 0) {
        return junction;
    }
    const nearest = row_parts.reduce((closest, part) =>
        Math.abs(part.x - junction.x) < Math.abs(closest.x - junction.x)
            ? part : closest);
    return {x: nearest.x, y: junction.y};
}

/* The distance in px within which two anchors count as level, allowing for
 * the fractional pixels of a browser's layout. */
const LEVEL_TOLERANCE = 0.5;

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
