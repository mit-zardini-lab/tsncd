import * as highlightTokens from '../../Render/highlightTokens';
import * as rh from '../../Render/RenderHandler';
import * as cr from '../CategoryRenderer';
//import * as bm from '../BroadcastedMeridian';
import * as ut from '../../../utilities/utilities';
import * as cat from '../../../data_structure/Category';
import * as ops from '../../../data_structure/Operators';
import { Separated } from '../../../utilities/Separated';
//import * as cr from '../StandardCategoryRenderer';
import * as crs from '../CategoryRendererSettings';
import * as pt from '../../../utilities/Point';
import * as utcr from '../../../utilities/ConstructorRegistry';
import * as bb from '../BroadcastedCategoryRenderer';
import * as nm from '../../../data_structure/Numeric';
import * as nmr from '../NumericRenderer';
import * as tu from '../../../data_structure_processing/term_utilities';
import * as dhd from '../../Render/DrawHandler';
import * as scr from '../StrideCategoryRenderer';
import * as TextEstimator from '../../Render/TextEstimator';

import { Color } from '../../../utilities/Color';
import * as gb from './GlyphBox';

export const ELEMENTWISE_ARROW_GAP = 3;
export const ELEMENTWISE_ARROW_LENGTH = 10;
export const ELEMENTWISE_ARROW_HALF_HEIGHT = 5;
export const ELEMWNTWISE_ARROW_BITE = 3

/* The room an arrow takes beside the name it points at, which is the arrow
 * and the gap between it and the name. */
export const ELEMENTWISE_ARROW_ROOM =
    ELEMENTWISE_ARROW_LENGTH + ELEMENTWISE_ARROW_GAP;

/*
 * The arrowhead a wire ends in where it feeds an operator, pointing right,
 * with its tip at `tip` and its base `ELEMENTWISE_ARROW_LENGTH` behind, in the
 * form `deltaPolygon` reads. The base carries a bite, so the head reads as an
 * arrow drawn on the wire rather than as a triangle standing on it.
 */
export function feeding_arrowhead(tip: pt.Point): pt.Point[] {
    return [
        tip,
        {x: -ELEMENTWISE_ARROW_LENGTH, y: -ELEMENTWISE_ARROW_HALF_HEIGHT},
        {x: ELEMWNTWISE_ARROW_BITE, y: ELEMENTWISE_ARROW_HALF_HEIGHT},
        {x: -ELEMWNTWISE_ARROW_BITE, y: ELEMENTWISE_ARROW_HALF_HEIGHT},
    ];
}

/* The notch of a `feeding_arrowhead` whose tip is at `tip`, which is where the
 * bite in its base reaches on the line the arrow stands on. */
export function feeding_arrowhead_notch(tip: pt.Point): pt.Point {
    return {
        x: tip.x - ELEMENTWISE_ARROW_LENGTH + ELEMWNTWISE_ARROW_BITE,
        y: tip.y,
    };
}

/* The `feeding_arrowhead` whose notch is at `notch`, which is the head a wire
 * ending there runs into. */
export function feeding_arrowhead_from_notch(notch: pt.Point): pt.Point[] {
    return feeding_arrowhead({
        x: notch.x + ELEMENTWISE_ARROW_LENGTH - ELEMWNTWISE_ARROW_BITE,
        y: notch.y,
    });
}

/*
 * Where the wires of an elementwise map meet its arrows: the arriving wire at
 * the base of the input arrowhead, the leaving wire at the tip of the output
 * one, on the line the wire is drawn at.
 *
 * Both are measured from the text KaTeX drew, so the arrows stand against the
 * name wherever the estimate the core was sized from put the name. The
 * distance from there to the column is what `ElementwiseBox` leads the wire
 * over. The user asked on 2026-09-17 for the datatypes to feed the operator
 * box near the arrows.
 */
export function input_elementwise_arrow_base(
    text_rectangle: pt.Rectangle, line: number,
): pt.Point {
    return {x: text_rectangle.left - ELEMENTWISE_ARROW_ROOM, y: line};
}

export function output_elementwise_arrow_tip(
    text_rectangle: pt.Rectangle, line: number,
): pt.Point {
    return {x: text_rectangle.right + ELEMENTWISE_ARROW_ROOM, y: line};
}

/*
 * Where each wire of an elementwise map runs to inside its arrow, which is the
 * notch the bite in the arrow's base leaves.
 *
 * A wire that stops at the two back corners leaves the bite between itself and
 * the arrow, and the two read as a triangle standing near a line. Run into the
 * notch, the wire fills the bite and the pair read as one stroke that ends in a
 * point. The user ruled on 2026-09-17 that the wires go into the arrows.
 */
export function input_elementwise_arrow_notch(
    text_rectangle: pt.Rectangle, line: number,
): pt.Point {
    const base = input_elementwise_arrow_base(text_rectangle, line);
    return feeding_arrowhead_notch(
        {x: base.x + ELEMENTWISE_ARROW_LENGTH, y: line});
}

export function output_elementwise_arrow_notch(
    text_rectangle: pt.Rectangle, line: number,
): pt.Point {
    return feeding_arrowhead_notch(
        output_elementwise_arrow_tip(text_rectangle, line));
}

export function input_elementwise_arrow(
    text_rectangle: pt.Rectangle, line: number,
): pt.Point[] {
    const base = input_elementwise_arrow_base(text_rectangle, line);
    return feeding_arrowhead({x: base.x + ELEMENTWISE_ARROW_LENGTH, y: line});
}

export function output_elementwise_arrow(
    text_rectangle: pt.Rectangle, line: number,
): pt.Point[] {
    return feeding_arrowhead(output_elementwise_arrow_tip(text_rectangle, line));
}

/* The size the name inside a plain rectangle is written at. */
const NAMED_RECTANGLE_FONT_SIZE = 1;

/*
 * The name of an operator written inside a plain white rectangle, which the
 * wires of its operands and its results run into.
 *
 * `GenericOperatorBox` is the operator the diagram does not expand, and
 * `NaturalArithmeticBox` is an arithmetic operation whose operands are all
 * whole numbers.
 */
export class NamedRectangleBox<
    B extends cat.Datatype, A extends cat.Axis, Op extends cat.Operator>
    extends bb.OperationBox<B, A, Op> {
    public annotation: rh.AnnotationElement;
    constructor(
        categoryRenderer: bb.BroadcastedRenderer<B, A>,
        target: cat.Broadcasted<B, A, Op>,
        latex: string,
    ) {
        super(categoryRenderer, target);
        this.annotation = new rh.AnnotationElement(
            this.renderHandler,
            latex,
            {font_size: NAMED_RECTANGLE_FONT_SIZE},
        );
        this.reserve_annotation_room(this.annotation);
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        this.draw?.drawRectangle(
            rect,
            {fill: '#FFFFFF', 'stroke-width': '1px'},
            {dropShadow: true}
        );
        this.annotation.place(rect);
    }
}

@bb.opsRegistry.registerClass(ops.GenericOperator)
export class GenericOperatorBox<B extends cat.Datatype, A extends cat.Axis>
    extends NamedRectangleBox<B, A, ops.GenericOperator> {
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.GenericOperator>,
    ) {
        super(categoryRenderer, target, target.operator.name?.to_latex() ?? 'F');
    }
}

/*
 * The two ends of a cup between two anchors on the same row, ordered so that
 * the clockwise arc dips below them. Both anchors hang off a stub descending
 * from the tape above, so an arc rising over the row would cross the stubs and
 * meet each one from the wrong side.
 */
function row_cup(start: pt.Point, end: pt.Point): [pt.Point, pt.Point] {
    return start.x > end.x ? [start, end] : [end, start];
}

/* How far apart in pixels two anchors may stand and still count as sharing a
 * column or a row. A column lays its anchors out at one x and a row lays its
 * out at one y, so the tolerance absorbs the rounding `rectangle()` returns
 * and nothing else. */
const CUP_ALIGNMENT = 1;

/* The point half way along a cup and the direction of travel there, read from
 * the `left` anchor round to the `right` one. */
export interface CupMidpoint {
    point: pt.Point;
    angle: number;
}

/* The same half way point, travelled in the other direction. */
function reverse_cup(midpoint: CupMidpoint): CupMidpoint {
    return {point: midpoint.point, angle: midpoint.angle + Math.PI};
}

/*
 * The point half way along the semicircle `arcCurve` draws between `start` and
 * `end`, and the direction of travel there.
 *
 * The radius the cup asks for is half the chord, so the centre is the middle
 * of the chord and the arc is half a circle. The arc sweeps clockwise on the
 * page, so the half way point is the start turned a quarter circle clockwise
 * about the centre, and the travel there points from the start at the centre.
 */
function arc_midpoint(start: pt.Point, end: pt.Point): CupMidpoint {
    const centre = {x: (start.x + end.x) / 2, y: (start.y + end.y) / 2};
    return {
        point: {x: centre.x - (start.y - centre.y),
                y: centre.y + (start.x - centre.x)},
        angle: Math.atan2(centre.y - start.y, centre.x - start.x),
    };
}

/*
 * The cup between two anchors, wherever the layout has put them, stroked as
 * `attributes` says and reporting where its half way point is.
 *
 * Two anchors of one column are joined by an arc. Two anchors of one row are
 * joined by the same arc turned on its side. An anchor of a row and an anchor
 * of a column are joined by the quarter turn `wire_curve` draws, which is the
 * Penrose cup between an operand that enters from above and one that enters
 * from the left. A `ParaWrap` moves a grabbed operand onto the row, so a pair
 * of operands that stood in one column stands in a column and a row as soon as
 * one of the two is grabbed.
 *
 * The arc sweeps clockwise from its first point, so the cup bulges towards the
 * glyph only while the contracted column is on the glyph's left. A mirrored box
 * exchanges the endpoints rather than the sweep flag, which is the same arc read
 * from the other end, and `row_cup` orders a cup along a row by the same rule.
 * The angle reported is the direction of travel from `left` to `right`, so a
 * mirror turns it through half a circle and not the cup.
 */
export function draw_cup_between_anchors<A>(
    box: bb.OperationBox<any, any, any>,
    left: cr.Anchor<A>,
    right: cr.Anchor<A>,
    attributes: Partial<dhd.PolygonAttrs> = {fill: 'none'},
): CupMidpoint | undefined {
    const [first, second] = box.mirrored ? [right, left] : [left, right];
    const start = first.location();
    const end = second.location();
    if (!start || !end) {
        return undefined;
    }
    const read_from_left = (drawn: CupMidpoint): CupMidpoint => box.mirrored
        ? reverse_cup(drawn) : drawn;
    if (Math.abs(start.x - end.x) < CUP_ALIGNMENT) {
        box.draw?.arcCurve(start, end, (start.y - end.y) / 2, false, attributes);
        return read_from_left(arc_midpoint(start, end));
    }
    if (Math.abs(start.y - end.y) < CUP_ALIGNMENT) {
        const [from, to] = row_cup(start, end);
        box.draw?.arcCurve(from, to, (from.x - to.x) / 2, false, attributes);
        const drawn = arc_midpoint(from, to);
        return read_from_left(from === start ? drawn : reverse_cup(drawn));
    }
    const curve = cr.wire_curve(
        start, end, first.horizontal, second.horizontal,
        box.settings.turn_radius);
    box.draw?.curve(curve, attributes);
    return read_from_left(curve.midpoint());
}

@bb.opsRegistry.registerClass(ops.Einops)
export class EinopsBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.Einops> {
    private cups: cr.Anchor<A>[][];
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.Einops>,
    ) {
        super(categoryRenderer, target, {x: categoryRenderer.settings.operation_core_dims.x, y: 0});
        this.cups = this.setup_cups();
        this.setup_datatype();
    }
    private setup_datatype(): void {
        const left_datatypes = this.input_meridians.flatMap(
            (segment) => segment.datatype_anchor ?? []);
        const right_datatypes = this.output_meridians.flatMap(
            (segment) => segment.datatype_anchor ?? []);
        for (const left_datatype of left_datatypes) {
            for (const right_datatype of right_datatypes) {
                this.pass_anchor_through(left_datatype, right_datatype);
            }
        }
    }
    /*
     * The datatype anchors of the left column that no anchor of the right
     * column continues. The operator reads such a datatype and writes none
     * like it, so `setup_datatype` has nothing to pass the anchor through to.
     * The `Natural` positions of an `Arrange` entering a product of reals are
     * the case.
     */
    private unanswered_datatypes(): cr.Anchor<A | B>[] {
        if (this.output_meridians.some((meridian) => meridian.datatype_anchor)) {
            return [];
        }
        return this.input_meridians.flatMap(
            (meridian) => meridian.datatype_anchor ?? []);
    }
    /*
     * The arrowhead an unanswered datatype wire ends in, over the anchor the
     * wire reaches and pointing into the box. An `Einops` that contracts
     * nothing draws no figure, so without the arrowhead the wire stops in
     * mid-air. The user ruled on 2026-09-17 that a dangling natural carries a
     * big arrowhead at the end its wire arrives by.
     *
     * The head takes the wire's end at its notch rather than at its tip. A
     * wire is stroked square across its end, so an end at the tip leaves a
     * stub of wire the width of the stroke sticking out of the point.
     */
    private draw_unanswered_datatype_arrows(): void {
        for (const anchor of this.unanswered_datatypes()) {
            const end = anchor.location();
            if (end) {
                this.draw?.deltaPolygon(
                    feeding_arrowhead_from_notch(end),
                    {fill: 'black', stroke: 'none'});
            }
        }
    }
    private setup_cups(): cr.Anchor<A>[][] {
        const operator = this.target.operator as ops.Einops;
        const cups = [
            ...new Set(operator.signature.flatMap((x)=>x))
        ].map((x) => [] as cr.Anchor<A>[]);
        ut.zip(
            this.input_axes,
            operator.signature,
        ).forEach(
            ([segment_anchors, segment_signature]) =>
                ut.zip(
                    segment_anchors,
                    segment_signature,
                ).forEach(
                    ([anchor, sig]) => cups[sig].push(anchor)
                )
        );
        return cups;
    }
    /*
     * A contraction group of three or more operands, drawn as a cup between
     * each operand and the one after it, with a dot where two cups meet.
     *
     * Two operands sharing an index are joined by one cup, which is the
     * Penrose evaluation. Three operands sharing an index sum one product
     * over that index, and the chain of cups says that the three positions
     * are read at one value of it. Without the chain each of the three wires
     * ended in mid-air, which is how the reviewer found the Engram gate of
     * `notebooks/sota/DeepSeekV41FlashIntegrated` on 2026-09-17.
     */
    private draw_shared_index(anchors: cr.Anchor<A>[]): void {
        for (let position = 0; position + 1 < anchors.length; position += 1) {
            draw_cup_between_anchors(this, anchors[position], anchors[position + 1]);
        }
        for (const anchor of anchors.slice(1, -1)) {
            anchor.add_dot = true;
        }
    }
    update(): void {
        for (const cup of this.cups) {
            if (cup.length == 1) {
                const anchor = cup[0];
                anchor.add_dot = true;
            }
            if (cup.length >= 2) {
                this.draw_shared_index(cup);
            }
        }
        this.draw_unanswered_datatype_arrows();
        super.update();
    }
}
/*
 * The triangle a normalisation draws in `rect`: its point on the mid-line of
 * the left edge, its base on the right edge, overhanging `rect` by a sixth of
 * its height above and below. `SoftMaxBox` and `L1NormBox` pass the whole box,
 * so their triangle stretches with the wires they carry, and `L2NormBox`
 * passes the square of its glyph, so its triangle is the same size in every
 * figure. The three are meant to read as one family, because a softmax is an
 * exponential followed by an `L1Norm` and an `L2Norm` divides by the root of
 * the sum of the squares where an `L1Norm` divides by the sum.
 */
export function draw_normalisation_triangle(
    draw: dhd.DrawHandler<any> | undefined,
    rect: pt.Rectangle,
): dhd.DrawElement | undefined {
    return draw?.deltaPolygon(
        [rect.getLocation({x: 0, y: 0.5}),
            {x: rect.width, y: rect.height * 2 / 3},
            {x: 0, y: -rect.height * 4 / 3},
        ],
        {fill: 'white'},
        {dropShadow: true}
    );
}

/* The tick that says a root, drawn across `rect` at `stroke_width` pixels.
 * `NormalizeBox` gives it the square of its circle and `L2NormBox` the part of
 * its triangle that has room for it. */
export function draw_root_tick(
    draw: dhd.DrawHandler<any> | undefined,
    rect: pt.Rectangle,
    stroke_width: string = '1',
): void {
    draw?.polyline(
        rect.getLocations(
            [
                {x: 0.1, y: 0.2},
                {x: 0.5, y: 1},
                {x: 0.9, y: 0.2}
            ]
        ),
        {stroke: 'black', 'stroke-width': stroke_width},
        'main',
    );
}

/* The fraction bar `L1NormBox` draws across the triangle, as shares of the
 * core's width and height. The bar stops clear of the point and clear of the
 * base, so that it reads as a mark lying inside the triangle. A bar running
 * edge to edge sits on the same line as the wires the glyph joins, and in
 * dark mode it takes their colour and reads as a wire passing through. */
const L1NORM_BAR_START = 0.28;
const L1NORM_BAR_END = 0.86;
const L1NORM_BAR_THICKNESS = 0.18;

@bb.opsRegistry.registerClass(ops.SoftMax)
class SoftMaxBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.SoftMax> {
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.SoftMax>,
    ) {
        super(
            categoryRenderer, 
            target, 
            categoryRenderer.settings.operation_softmax_dims);
    }
    update(): void {
        super.update();
        draw_normalisation_triangle(this.draw, this.rectangle());
    }
}

/*
 * The same triangle as a softmax, cut by a horizontal bar on its mid-line.
 * The bar is the fraction bar of `y = x / sum(x)`, and it is what separates
 * the normalisation from the softmax that ends in one.
 */
@bb.opsRegistry.registerClass(ops.L1Norm)
class L1NormBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.L1Norm> {
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.L1Norm>,
    ) {
        super(
            categoryRenderer,
            target,
            categoryRenderer.settings.operation_softmax_dims);
    }
    update(): void {
        super.update();
        const rect: pt.Rectangle = this.rectangle();
        draw_normalisation_triangle(this.draw, rect);
        const thickness = Math.max(2, rect.height * L1NORM_BAR_THICKNESS);
        const start = rect.left + rect.width * L1NORM_BAR_START;
        const end = rect.left + rect.width * L1NORM_BAR_END;
        this.draw?.drawRectangle(
            new pt.Rectangle(
                {x: start, y: rect.top + rect.height / 2 - thickness / 2},
                {x: end - start, y: thickness}),
            {fill: 'black', stroke: 'none'}
        );
    }
}
/* Where the root tick sits inside the normalisation triangle, as shares of the
 * glyph's width and height. The triangle points left, so its room is on the
 * right, and the tick is placed in the part of it that holds the tick's own
 * bounding box clear of the two sloping edges. */
const L2NORM_TICK_LEFT = 0.42;
const L2NORM_TICK_WIDTH = 0.5;
const L2NORM_TICK_TOP = 0.2;
const L2NORM_TICK_HEIGHT = 0.55;

/*
 * The same triangle as a softmax, holding the root tick a `NormalizeBox`
 * draws. The tick says that the sum of the squares is rooted, so a plain
 * triangle reads as a softmax, a triangle cut by a bar as the `L1Norm` and a
 * triangle holding the tick as the `L2Norm`.
 *
 * A `GlyphBox`, because the operator consumes as many axes as the model asks
 * it to: in the mixing coefficients it normalises over two axes, so the box
 * carries two wires on each side and a triangle stretched to it would not read
 * as the same glyph as the one-wire case. The bite is in the top-right corner,
 * which is the corner opposite the one `LinearBox` and `NormalizeBox` take,
 * because an `L2Norm` has no learned weight and the two boxes it stands beside
 * in the mixing coefficients do.
 */
@bb.opsRegistry.registerClass(ops.L2Norm)
class L2NormBox<B extends cat.Datatype, A extends cat.Axis>
    extends gb.GlyphBox<B, A, ops.L2Norm> {
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.L2Norm>,
    ) {
        super(
            categoryRenderer,
            target,
            categoryRenderer.settings.operation_softmax_dims);
    }
    protected get glyph_fill(): string { return '#F1FCFC'; }
    protected get bitten_corner(): gb.Corner { return gb.Corner.TOP_RIGHT; }
    protected draw_glyph(glyph: pt.Rectangle): void {
        draw_normalisation_triangle(this.draw, glyph);
        draw_root_tick(
            this.draw,
            new pt.Rectangle(
                glyph.getLocation(
                    {x: L2NORM_TICK_LEFT, y: L2NORM_TICK_TOP}),
                {x: glyph.width * L2NORM_TICK_WIDTH,
                 y: glyph.height * L2NORM_TICK_HEIGHT}));
    }
}

@bb.opsRegistry.registerClass(ops.Linear)
class LinearBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.Linear> {
    private annotation: rh.AnnotationElement;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.Linear>,
    ) {
        const latex = target.operator.name?.to_latex() ?? 'L';
        const text_dims = TextEstimator.estimate_text_dims(
            [latex], categoryRenderer.settings.linear_label_font_size);
        const padding = categoryRenderer.settings.linear_label_padding;
        super(categoryRenderer, target, {
            x: Math.max(
                categoryRenderer.settings.linear_core_dims.x,
                text_dims.x + 2 * padding.x),
            y: Math.max(
                categoryRenderer.settings.linear_core_dims.y,
                text_dims.y + 2 * padding.y),
        });
        this.annotation = new rh.AnnotationElement(
            this.renderHandler,
            latex,
            {font_size: categoryRenderer.settings.linear_label_font_size},
        );
        this.override_display_type = bb.BroadcastDisplayType.NODE;
        // A grabbed operand is this operator's PARAMETER - its weight - and
        // ends here, so its row stays at the glyph's top edge and the tape
        // runs down onto it. See `OperationBox.raise_rows`.
        this.raise_rows = false;
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        const biteSize = this.settings.operation_multilinear_bite;
        this.renderHandler.draw_handler?.deltaPolygon(
            [rect.top_left,
            {x:rect.dims.x, y: 0},
            {x:0, y:rect.dims.y},
            {x:-rect.dims.x+biteSize, y:0},
            {x:-biteSize, y:-biteSize}],
            {fill: '#E8EEEB', stroke: 'none'},
            {dropShadow: true}
        );
        this.renderHandler.annotation_handler.addAnnotation(
            rect,
            this.annotation,
        )
    }
}

@bb.opsRegistry.registerClass(ops.View)
class ViewBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.View> {
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.View>,
    ) {
        super(categoryRenderer, target, {x: 0, y: 0});
    }
}

/*
 * A merge pentagon, which is the reindexing pentagon `StrideMorphismBox` draws
 * for a `View`'s split, drawn by an operation box over its own rectangle. The
 * strides sit against its flat edge and the name sits hard against its point,
 * and `PentagonPoint` names the side the point is on. The three numbers are
 * `DefaultStrideRendererSettings`'s `reindexing_pentagon_width`, `_tip` and
 * `_pad`, repeated here because an operation box reads the broadcasted
 * renderer's settings and not the stride renderer's.
 */
const MERGE_PENTAGON_WIDTH = 50;
const MERGE_PENTAGON_TIP = 12;
const MERGE_PENTAGON_PAD = 4;

/*
 * The side of its rectangle a merge pentagon points at, where the single wire
 * of that side arrives or leaves, as the split pentagon of a `View` points at
 * the one axis it splits.
 */
export enum PentagonPoint {
    LEFT = 'left',
    RIGHT = 'right',
}

/* Wide enough for `name` at the point beside `edge_labels` on the flat edge.
 * `scr.affine_label_room` measures the pair, so a merge pentagon and the split
 * pentagon `StrideMorphismBox` draws are sized by the same estimate. */
export function merge_pentagon_width_for_labels(
    name: string | undefined,
    edge_labels: string[],
): number {
    return Math.max(
        MERGE_PENTAGON_WIDTH,
        MERGE_PENTAGON_TIP + MERGE_PENTAGON_PAD
            + scr.affine_label_room(edge_labels, name, 1));
}

/* Wide enough for `name` beside the strides of `reindexing`, which are the
 * labels the flat edge carries where the pentagon is drawn for one
 * reindexing. */
export function merge_pentagon_width(
    name: string | undefined,
    reindexing: unknown = undefined,
): number {
    return merge_pentagon_width_for_labels(
        name,
        merge_stride_texts(reindexing).flatMap(
            (text) => text === undefined ? [] : [text]));
}

/* The pentagon across `rect`, inset 5px from its top and bottom, with its
 * point on the mid-line at the side `point` names and its flat edge at the
 * other side. */
export function draw_merge_pentagon(
    draw: dhd.DrawHandler<any> | undefined,
    rect: pt.Rectangle,
    fill: string,
    point: PentagonPoint,
): void {
    const points_right = point === PentagonPoint.RIGHT;
    const point_x = points_right ? rect.right : rect.left;
    const flat_x = points_right ? rect.left : rect.right;
    const shoulder_x = points_right
        ? rect.right - MERGE_PENTAGON_TIP
        : rect.left + MERGE_PENTAGON_TIP;
    const corners = [
        {x: flat_x, y: rect.top + 5},
        {x: shoulder_x, y: rect.top + 5},
        {x: point_x, y: rect.top + rect.height / 2},
        {x: shoulder_x, y: rect.bottom - 5},
        {x: flat_x, y: rect.bottom - 5},
    ];
    draw?.deltaPolygon(
        corners.map((corner, i) => i === 0 ? corner : {
            x: corner.x - corners[i - 1].x,
            y: corner.y - corners[i - 1].y,
        }),
        {fill, stroke: 'none'},
        {dropShadow: true},
    );
}

/* One entry per domain axis of `reindexing`, in its order, carrying the
 * stride that axis contributes as it is written, and undefined where the
 * numeric has no rendering or the operator carries no reindexing.
 *
 * Read off the reindexing alone, with no renderer, so that a box can size
 * itself from its strides in the `super()` call that fixes its core. */
export function merge_stride_texts(reindexing: unknown): (string | undefined)[] {
    if (!(reindexing instanceof cat.StrideMorphism)) {
        return [];
    }
    const strides = reindexing.strides()[0] ?? [];
    return reindexing._dom.map((_axis: cat.Axis, j: number) =>
        strides[j] === undefined ? undefined : nmr.numeric_string(strides[j]));
}

/* The labels `merge_stride_texts` names, ready to place. */
export function merge_stride_annotations(
    renderHandler: rh.RenderHandler<any, any>,
    reindexing: unknown,
): (rh.AnnotationElement | undefined)[] {
    return merge_stride_texts(reindexing).map(
        (text) => text === undefined ? undefined : new rh.AnnotationElement(
            renderHandler, text, {font_size: scr.AFFINE_LABEL_FONT_SIZE}));
}

/*
 * The labels against the flat edge and the name hard against the point, as
 * `StrideMorphismBox` places them. `rows` is indexed as `edge_labels` is. Each
 * label sits on the strip its entry gives, or on an even share of the edge
 * where the entry is missing. A pentagon drawn for one reindexing carries its
 * strides there, and a pentagon drawn for a concatenation the offset of each
 * part.
 */
export function place_merge_annotations(
    renderHandler: rh.RenderHandler<any, any>,
    rect: pt.Rectangle,
    edge_labels: (rh.AnnotationElement | undefined)[],
    rows: (pt.Rectangle | undefined)[],
    name: rh.AnnotationElement | undefined,
    point: PentagonPoint,
): void {
    const points_right = point === PentagonPoint.RIGHT;
    const body_left = points_right
        ? rect.left + MERGE_PENTAGON_PAD
        : rect.left + MERGE_PENTAGON_TIP;
    const body_width = rect.width - MERGE_PENTAGON_TIP - MERGE_PENTAGON_PAD;
    const strip = rect.height / Math.max(edge_labels.length, 1);
    edge_labels.forEach((annotation, j) => {
        if (!annotation) {
            return;
        }
        const row = rows[j] ?? new pt.Rectangle(
            {x: rect.left, y: rect.top + j * strip}, {x: rect.width, y: strip});
        annotation.annotationSettings.horizontal_align =
            points_right ? 'left' : 'right';
        annotation.annotationSettings.vertical_align = 'center';
        renderHandler.annotation_handler.addAnnotation(
            new pt.Rectangle(
                {x: body_left, y: row.top},
                {x: body_width, y: row.height}),
            annotation);
    });
    if (!name) {
        return;
    }
    name.annotationSettings.horizontal_align = points_right ? 'right' : 'left';
    name.annotationSettings.vertical_align = 'center';
    renderHandler.annotation_handler.addAnnotation(
        new pt.Rectangle(
            {x: points_right ? rect.left : rect.left + MERGE_PENTAGON_TIP / 2,
             y: rect.top},
            {x: rect.width - MERGE_PENTAGON_TIP / 2, y: rect.height}),
        name);
}

/*
 * The name of an operator set in bold where its wires meet, with no outline
 * around it. An operator carrying no name of its own is written as
 * `default_latex`.
 */
const BOLD_NAME_FONT_SIZE = 1.2;

class BoldNameBox<B extends cat.Datatype, A extends cat.Axis, Op extends cat.Operator>
    extends bb.OperationBox<B, A, Op> {
    public annotation: rh.AnnotationElement;
    constructor(
        categoryRenderer: bb.BroadcastedRenderer<B, A>,
        target: cat.Broadcasted<B, A, Op>,
        core_dims: pt.Point,
        default_latex: string,
    ) {
        super(categoryRenderer, target, core_dims);
        this.annotation = new rh.AnnotationElement(
            this.renderHandler,
            `\\pmb{${target.operator.name?.to_latex() ?? default_latex}}`,
            {
                font_size: BOLD_NAME_FONT_SIZE,
                horizontal_align: 'left',
            },
        );
    }
    update(): void {
        super.update();
        this.renderHandler.annotation_handler.addAnnotation(
            this.rectangle(),
            this.annotation,
        )
    }
}

class AdditionOpBox<B extends cat.Datatype, A extends cat.Axis>
    extends BoldNameBox<B, A, ops.AdditionOp> {
    constructor(
        categoryRenderer: bb.BroadcastedRenderer<B, A>,
        target: cat.Broadcasted<B, A, ops.AdditionOp>,
    ) {
        super(categoryRenderer, target, {x: 30, y: 30}, '+');
    }
}

/*
 * Whether every operand the operator reads holds whole numbers.
 *
 * An addition of two arrays of reals joins a residual stream to what a module
 * computed from it, and the bold `+` where the two wires meet says that the
 * two values are added. An addition of whole numbers is one step of an integer
 * computation, and the user ruled on 2026-09-19 that such a step is written in
 * a rectangle, as the steps around it are.
 */
export function reads_whole_numbers(
    target: cat.Broadcasted<any, any, any>,
): boolean {
    return target.input_weaves.length > 0 && target.input_weaves.every(
        (weave) => weave.datatype instanceof cat.Natural);
}

/* The name a rectangle carrying `target` writes, which is the operator's own
 * name where it has one and `fallback` otherwise. */
function operator_latex(
    target: cat.Broadcasted<any, any, any>, fallback: string,
): string {
    return target.operator.name?.to_latex() ?? fallback;
}

/* An addition of whole numbers stands in a rectangle and an addition of reals
 * in the bold glyph, by the rule `reads_whole_numbers` states. */
bb.opsRegistry.registerFunction(ops.AdditionOp)(
    <B extends cat.Datatype, A extends cat.Axis>(
        categoryRenderer: bb.BroadcastedRenderer<B, A>,
        target: cat.Broadcasted<B, A, ops.AdditionOp>,
    ): bb.OperationBox<B, A, ops.AdditionOp> =>
        reads_whole_numbers(target)
            ? new NamedRectangleBox(
                categoryRenderer, target, operator_latex(target, '+'))
            : new AdditionOpBox(categoryRenderer, target));

/*
 * `max` is a fold, and it is the same kind of thing as `+`: an accumulator and
 * the value being folded into it go in, one accumulator comes out. So it is
 * drawn in the same idiom - a glyph where the wires meet rather than a box -
 * which makes the two accumulators of an online softmax read alike, and both
 * read differently from the pointwise operations between them.
 *
 * `\max` rather than `max`, because KaTeX sets a bare name in maths italic, as
 * a product of three variables. The operator's own name is used when it has
 * one, so a `Maximum` renamed to `\vee` or `\sqcup` still typesets.
 */
@bb.opsRegistry.registerClass(ops.Maximum)
class MaximumBox<B extends cat.Datatype, A extends cat.Axis>
    extends BoldNameBox<B, A, ops.Maximum> {
    constructor(
        categoryRenderer: bb.BroadcastedRenderer<B, A>,
        target: cat.Broadcasted<B, A, ops.Maximum>,
    ) {
        super(categoryRenderer, target, {x: 40, y: 30}, '\\max');
    }
}

/* The side of the circle an exclusive or is drawn in, the gap between that
 * circle and the name written under it, and the name. The circle carries the
 * cross of the `\oplus` symbol, which a reader who has not met that symbol
 * cannot read, so the user ruled on 2026-09-19 that the operation is named
 * under the glyph. */
const XOR_GLYPH_SIDE = 28;
const XOR_LABEL_GAP = 2;
const XOR_LABEL_FONT_SIZE = 0.7;
const XOR_LABEL = '\\mathrm{XOR}';
const XOR_GLYPH_FILL = '#F1FCFC';
const XOR_OUTLINE_STROKE = '2';
const XOR_CROSS_STROKE = '1.5';

/* The upright cross of the `\oplus` symbol, drawn across the circle that
 * `glyph` is inscribed in, so that each arm ends on the outline. */
export function draw_xor_cross(
    draw: dhd.DrawHandler<any> | undefined, glyph: pt.Rectangle,
): void {
    const attributes = {stroke: 'black', 'stroke-width': XOR_CROSS_STROKE};
    draw?.polyline(
        glyph.getLocations([{x: 0, y: 0.5}, {x: 1, y: 0.5}]),
        attributes, 'main');
    draw?.polyline(
        glyph.getLocations([{x: 0.5, y: 0}, {x: 0.5, y: 1}]),
        attributes, 'main');
}

/*
 * The exclusive or folds the values along one axis into one value, and is
 * drawn as the symbol for that fold over the name of the operation: a circle
 * the size of the one a `Normalize` takes, carrying an upright cross, with
 * `XOR` written under it.
 *
 * A `GlyphBox`, for the reason that class gives: the circle is the same size
 * in every figure, and the box grows past it with the wires the operator
 * reads. The bite is in the corner an `L2Norm` takes, which is the corner
 * opposite `LinearBox`'s, because the exclusive or reads no learned weight.
 */
@bb.opsRegistry.registerClass(ops.BitwiseXor)
class BitwiseXorBox<B extends cat.Datatype, A extends cat.Axis>
    extends gb.GlyphBox<B, A, ops.BitwiseXor> {
    private annotation: rh.AnnotationElement;
    private label_dims: pt.Point;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.BitwiseXor>,
    ) {
        const label_dims = rh.estimated_label_dims(
            [XOR_LABEL], XOR_LABEL_FONT_SIZE);
        super(categoryRenderer, target, {
            x: Math.max(XOR_GLYPH_SIDE, label_dims.x),
            y: XOR_GLYPH_SIDE + XOR_LABEL_GAP + label_dims.y,
        });
        this.label_dims = label_dims;
        this.annotation = new rh.AnnotationElement(
            this.renderHandler, XOR_LABEL, {font_size: XOR_LABEL_FONT_SIZE});
    }
    /* The height of the strip under the circle that the name is written in. */
    private label_strip(): number {
        return XOR_LABEL_GAP + this.label_dims.y;
    }
    /* The wires run into the circle and not into the name under it, so the
     * circle rather than the whole box is set on the line the box is placed
     * against. */
    public vertical_alignment_shift(): number {
        return this.label_strip() / 2;
    }
    protected get glyph_fill(): string { return XOR_GLYPH_FILL; }
    protected get bitten_corner(): gb.Corner { return gb.Corner.TOP_RIGHT; }
    protected glyph_square(): pt.Rectangle {
        const rect = this.rectangle();
        const over_the_name = new pt.Rectangle(
            rect.top_left, {x: rect.width, y: rect.height - this.label_strip()});
        return gb.centred_square(
            over_the_name,
            Math.min(XOR_GLYPH_SIDE, over_the_name.width, over_the_name.height));
    }
    protected glyph_room(): pt.Rectangle {
        return gb.centred_rectangle(this.rectangle(), this.core_dims);
    }
    protected draw_glyph(glyph: pt.Rectangle): void {
        this.draw?.circle(
            glyph.midpoint(),
            {radius: glyph.height / 2,
             'stroke-width': XOR_OUTLINE_STROKE,
             fill: XOR_GLYPH_FILL},
            {dropShadow: true},
        );
        draw_xor_cross(this.draw, glyph);
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        this.annotation.place(new pt.Rectangle(
            {x: rect.left, y: this.glyph_square().bottom + XOR_LABEL_GAP},
            {x: rect.width, y: this.label_dims.y}));
    }
}

/* The remainder reads two operands and returns one value, as `+` does, so it
 * takes the glyph an `AdditionOp` takes and writes `\bmod` in it. */
class ModuloBox<B extends cat.Datatype, A extends cat.Axis>
    extends BoldNameBox<B, A, ops.Modulo> {
    constructor(
        categoryRenderer: bb.BroadcastedRenderer<B, A>,
        target: cat.Broadcasted<B, A, ops.Modulo>,
    ) {
        super(categoryRenderer, target, {x: 40, y: 30}, '\\bmod');
    }
}

/* A remainder of whole numbers stands in a rectangle, by the rule
 * `reads_whole_numbers` states. Every remainder `Modulo.template` builds reads
 * two naturals, so the glyph is what a remainder written by hand on another
 * datatype takes. */
bb.opsRegistry.registerFunction(ops.Modulo)(
    <B extends cat.Datatype, A extends cat.Axis>(
        categoryRenderer: bb.BroadcastedRenderer<B, A>,
        target: cat.Broadcasted<B, A, ops.Modulo>,
    ): bb.OperationBox<B, A, ops.Modulo> =>
        reads_whole_numbers(target)
            ? new NamedRectangleBox(
                categoryRenderer, target, operator_latex(target, '\\bmod'))
            : new ModuloBox(categoryRenderer, target));

@bb.opsRegistry.registerClass(ops.Elementwise)
class ElementwiseBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.Elementwise> {
    public annotation: rh.AnnotationElement;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.Elementwise>,
    ) {
        super(categoryRenderer, target, {
            x: 30, y: 10
        });
        this.parent_gap = 0;
        /*
         * A box with an anchor in either column is placed by its anchors, as
         * every other operator box is: `BroadcastedBox.glyph_line` reads the
         * height of the wires the operator carries and the default
         * `glyph_positioning` centres the glyph on it, which puts a map with a
         * drawn datatype on its datatype wire. The user ruled on 2026-09-17
         * that the datatype anchors place the box.
         *
         * A map between two implicit datatypes has no anchor to be placed by,
         * since `Reals` draws no wire and every axis of the two weaves is
         * broadcast over. It is the one case with a rule of its own: the glyph
         * rests its bottom edge on the top degree wire, so the name rides that
         * wire rather than being cut by it.
         */
        if (!this.carries_an_anchor()) {
            this.glyph_positioning = {x: -0.5, y: -1};
        }
        this.setBorderColor('#E8EEEB');
        this.annotation = new rh.AnnotationElement(
            this.renderHandler,
            `${target.operator.name?.to_latex()}`
        );
        this.reserve_annotation_room(this.annotation);
        this.reserve_arrow_room();
    }
    /* Whether either column holds a wire the glyph can be placed against. */
    private carries_an_anchor(): boolean {
        return [...this.input_meridians, ...this.output_meridians].some(
            (meridian) => meridian.anchors.length > 0);
    }
    private datatype_anchors(
        meridians: bb.ArrayMeridian<B, A>[],
    ): bb.DatatypeAnchor<B>[] {
        return meridians.flatMap((meridian) => meridian.datatype_anchor ?? []);
    }
    /* Room for an arrow and its gap on each side of the name, beside the room
     * the name took, so both arrows stand inside the glyph and clear of what
     * is drawn beside it. */
    private reserve_arrow_room(): void {
        this.core_dims = {
            x: this.core_dims.x + 2 * ELEMENTWISE_ARROW_ROOM,
            y: this.core_dims.y,
        };
        this.core.width = this.core_dims.x;
    }
    update(): void {
        super.update();
        this.annotation.place(this.rectangle());
        const text_rectangle = this.annotation.text_rectangle();
        this.draw_arriving_arrow(text_rectangle);
        this.draw_leaving_arrow(text_rectangle);
    }
    /*
     * The arrow the operand is read at, on the line of the wire that carries
     * it, with that wire led over the distance between the column it ends at
     * and the notch of the arrow. A map whose operand is implicitly typed has
     * no such wire, so the arrow stands on the name's own mid-line and nothing
     * is led in.
     */
    private draw_arriving_arrow(text_rectangle: pt.Rectangle): void {
        const [anchor] = this.datatype_anchors(this.input_meridians);
        const wire_end = anchor?.location();
        const line = wire_end?.y ?? text_rectangle.midpoint().y;
        this.draw?.deltaPolygon(
            input_elementwise_arrow(text_rectangle, line),
            {fill: 'black', stroke: 'none'}
        );
        if (anchor && wire_end) {
            this.lead_wire(anchor, wire_end,
                           input_elementwise_arrow_notch(text_rectangle, line));
        }
    }
    /* The arrow the result leaves by, with the wire led on from its notch to
     * the column, which is `draw_arriving_arrow` the other way round. The wire
     * runs under the head to its tip and out the far side, so no gap opens
     * between the two at any zoom. */
    private draw_leaving_arrow(text_rectangle: pt.Rectangle): void {
        const [anchor] = this.datatype_anchors(this.output_meridians);
        const wire_start = anchor?.location();
        const line = wire_start?.y ?? text_rectangle.midpoint().y;
        this.draw?.deltaPolygon(
            output_elementwise_arrow(text_rectangle, line),
            {fill: 'black', stroke: 'none'}
        );
        if (anchor && wire_start) {
            this.lead_wire(anchor,
                           output_elementwise_arrow_notch(text_rectangle, line),
                           wire_start);
        }
    }
    /*
     * The wire from `from` to `to`, stroked and layered as `anchor` strokes and
     * layers its own, so the lead-in is that wire continued rather than a line
     * of the box's own. Nothing is drawn where the arrow already stands at or
     * past the column, which is a name KaTeX drew wider than the estimate the
     * core was sized from.
     */
    private lead_wire(
        anchor: bb.DatatypeAnchor<B>, from: pt.Point, to: pt.Point,
    ): void {
        if (to.x <= from.x) {
            return;
        }
        this.draw?.polyline(
            [from, to], anchor.wire_attributes(), anchor.wire_layer);
    }
}

// ReLU and Dropout are Elementwise subclasses with their own constructors;
// the registry keys by exact constructor name, so without registrations of
// their own they draw as literally nothing - wires with a gap (the state
// Maximum was in until 2026-08-09).
bb.opsRegistry.registerClass(ops.ReLU)(ElementwiseBox);
bb.opsRegistry.registerClass(ops.Dropout)(ElementwiseBox);
// An Arithmetic's name is its formula, with `x` where the input goes.
bb.opsRegistry.registerClass(ops.Arithmetic)(ElementwiseBox);
// A Cast is the identity on values, and the two datatype anchors the box
// stands between carry the bound each side holds.
bb.opsRegistry.registerClass(ops.Cast)(ElementwiseBox);

/* The depth of the point on the left edge of a nullary operator's pentagon,
 * the size the label inside it is written at, and the box a short label is
 * drawn in. */
const NULLARY_POINT_DEPTH = 10;
const NULLARY_LABEL_FONT_SIZE = 1;
const NULLARY_CORE_DIMS: pt.Point = {x: 40, y: 30};

/* The latex a `ConstantOp` writes in its box, which is `NumericRenderer`'s
 * rendering of the value where it has one and the value's own latex
 * otherwise. */
function constant_value_latex(value: nm.Numeric): string {
    return nmr.numeric_string(value) ?? value.to_latex();
}

/*
 * Room for `latex` beside the point, and never less than the box a short label
 * is drawn in.
 *
 * The label is the whole content of the operator, so a long formula widens the
 * box rather than running outside it. `Multiline` widens every row of a figure
 * to hold an operation it cannot split, which is what a label wider than the
 * wrap width comes to.
 */
function nullary_core_dims(latex: string): pt.Point {
    const text_dims = rh.estimated_label_dims([latex], NULLARY_LABEL_FONT_SIZE);
    return {
        x: Math.max(NULLARY_CORE_DIMS.x, text_dims.x + NULLARY_POINT_DEPTH),
        y: Math.max(NULLARY_CORE_DIMS.y, text_dims.y),
    };
}

/*
 * An operator that reads nothing, drawn as a pentagon whose left edge collapses
 * to a point, which marks a source feeding rightwards. `latex` is written in
 * the body of the pentagon.
 */
class NullaryPentagonBox<B extends cat.Datatype, A extends cat.Axis, Op extends cat.Operator>
    extends bb.OperationBox<B, A, Op> {
    private annotation: rh.AnnotationElement;
    constructor(
        categoryRenderer: bb.BroadcastedRenderer<B, A>,
        target: cat.Broadcasted<B, A, Op>,
        latex: string,
    ) {
        super(categoryRenderer, target, nullary_core_dims(latex));
        this.annotation = new rh.AnnotationElement(
            this.renderHandler,
            latex,
            {font_size: NULLARY_LABEL_FONT_SIZE},
        );
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        this.draw?.deltaPolygon(
            [rect.getLocation({x: 0, y: 0.5}),
            {x: NULLARY_POINT_DEPTH, y: -rect.height/2},
            {x: rect.width - NULLARY_POINT_DEPTH, y: 0},
            {x: 0, y: rect.height},
            {x: -rect.width + NULLARY_POINT_DEPTH, y: 0}],
            {fill: '#E8EEEB', stroke: 'none'},
            {dropShadow: true}
        );
        // Centred on the body rather than the full rectangle, so the point does
        // not drag the label off-centre.
        this.annotation.place(new pt.Rectangle(
            {x: rect.left + NULLARY_POINT_DEPTH, y: rect.top},
            {x: rect.width - NULLARY_POINT_DEPTH, y: rect.height}
        ));
    }
}

@bb.opsRegistry.registerClass(ops.ConstantOp)
class ConstantBox<B extends cat.Datatype, A extends cat.Axis>
    extends NullaryPentagonBox<B, A, ops.ConstantOp> {
    constructor(
        categoryRenderer: bb.BroadcastedRenderer<B, A>,
        target: cat.Broadcasted<B, A, ops.ConstantOp>,
    ) {
        super(categoryRenderer, target, constant_value_latex(target.operator.value));
    }
}

/* An array the model reads and never learns holds a different value at every
 * position, and the pentagon carries its name. A `Linear` with no operands
 * draws as a weight on the operation it feeds, and this operator is no learned
 * array, so it takes the pentagon of a nullary source instead. */
@bb.opsRegistry.registerClass(ops.FixedArray)
class FixedArrayBox<B extends cat.Datatype, A extends cat.Axis>
    extends NullaryPentagonBox<B, A, ops.FixedArray> {
    constructor(
        categoryRenderer: bb.BroadcastedRenderer<B, A>,
        target: cat.Broadcasted<B, A, ops.FixedArray>,
    ) {
        super(categoryRenderer, target,
              target.operator.name?.to_latex() ?? '\\mathrm{fixed}');
    }
}

/*
 * The positions of an axis, drawn as the cup of an `Einops` read the other way
 * round.
 *
 * An `Einops` cups two anchors of its left column, which is the contraction of
 * two operands it reads. An `Arrange` reads nothing and emits two wires: the
 * axis, and the datatype carrying the positions of that axis. The arc joins
 * the two in the right column and bulges over the core, so the figure is the
 * contraction turned around. The user ruled on 2026-09-17 that an `Arrange` is
 * drawn as a reversed einops cup.
 *
 * The positions leave along the datatype wire, so the arc is the first stretch
 * of that wire and is stroked and marked as the rest of it is: the anchor's own
 * attributes, and the direction triangle half way along. The user ruled on
 * 2026-09-17 that the cup reads as a natural datatype wire.
 */
@bb.opsRegistry.registerClass(ops.Arrange)
class ArrangeBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.Arrange> {
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.Arrange>,
    ) {
        // The arc between two anchors one `anchor_height` apart reaches half
        // that deep, and the core carries the arc alone.
        super(categoryRenderer, target,
              {x: categoryRenderer.settings.anchor_height, y: 0});
    }
    update(): void {
        super.update();
        const [meridian] = this.output_meridians;
        const datatype_anchor = meridian?.datatype_anchor;
        const [axis_anchor] = meridian?.axes_anchors.anchors ?? [];
        if (!datatype_anchor || !axis_anchor) {
            return;
        }
        // The lower anchor first, which is the order that sweeps the arc away
        // from its column - see `draw_cup_between_anchors`.
        const attributes = datatype_anchor.wire_attributes();
        const cup = draw_cup_between_anchors<A | B>(
            this, datatype_anchor, axis_anchor, {...attributes, fill: 'none'});
        if (!cup) {
            return;
        }
        // The positions travel from the axis round the cup and out along the
        // datatype wire, which is the arc read against the order it is drawn in.
        const travel = cup.angle + Math.PI;
        bb.draw_datatype_direction_triangle(
            this.draw, bb.datatype_triangle_tip_centred_on(cup.point, travel),
            travel, attributes.stroke);
    }
}

/* The stroke widths a `NormalizeBox` draws the outline of its circle and its
 * root tick at. A normalisation that multiplies by a learned gain is drawn
 * with the heavier pair, per the user's ruling of 2026-09-18, so a reader
 * tells the weighted form from the plain one by the weight of the glyph. The
 * two are the same circle at the same radius, so a figure holding both keeps
 * its layout. */
const NORMALIZE_OUTLINE_STROKE = '2';
const NORMALIZE_TICK_STROKE = '1';
const NORMALIZE_GAINED_OUTLINE_STROKE = '3';
const NORMALIZE_GAINED_TICK_STROKE = '2';

/*
 * A normalization, drawn as a circle over a root-mean-square tick, bold where
 * the operator carries a gain.
 *
 * A `GlyphBox`, for the reason that class gives: a `Normalize` with a gain has
 * two operands, and a circle centred on one anchor gives the second nowhere to
 * arrive. The bite is in the same corner `LinearBox` takes, since a normalize
 * with a gain is parametric as a linear is.
 */
@bb.opsRegistry.registerClass(ops.Normalize)
class NormalizeBox<B extends cat.Datatype, A extends cat.Axis>
    extends gb.GlyphBox<B, A, ops.Normalize> {
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.Normalize>,
    ) {
        super(categoryRenderer, target);
        // The grabbed gain ends at the glyph - see `LinearBox`.
        this.raise_rows = false;
    }
    protected get glyph_fill(): string { return '#F1FCFC'; }
    protected get bitten_corner(): gb.Corner { return gb.Corner.BOTTOM_LEFT; }
    private get outline_stroke(): string {
        return this.target.operator.gain
            ? NORMALIZE_GAINED_OUTLINE_STROKE
            : NORMALIZE_OUTLINE_STROKE;
    }
    private get tick_stroke(): string {
        return this.target.operator.gain
            ? NORMALIZE_GAINED_TICK_STROKE
            : NORMALIZE_TICK_STROKE;
    }
    protected draw_glyph(glyph: pt.Rectangle): void {
        this.draw?.circle(
            glyph.midpoint(),
            {radius: glyph.height/2,
             'stroke-width': this.outline_stroke,
             fill: '#F1FCFC'},
            {dropShadow: true}
        );
        draw_root_tick(this.draw, glyph, this.tick_stroke);
    }
}

@bb.opsRegistry.registerClass(ops.WeightedTriangularLower)
class WeightedTriangularLowerBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.WeightedTriangularLower> {
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.WeightedTriangularLower>,
    ) {
        super(categoryRenderer, target);
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        const gap = rect.height - rect.width;
        const core_rect = new pt.Rectangle(
            {x: rect.left, y: rect.top + gap * 0.5},
            {x: rect.width, y: rect.width}
        );
        this.draw?.drawRectangle(
            core_rect,
            {fill: '#F9CBDF', stroke: 'none', fillRole: 'contrast'},
            {dropShadow: true}
        );
        this.draw?.deltaPolygon(
            [core_rect.top_left,
            {x: core_rect.width, y: 0},
            {x: 0, y: core_rect.height}],
            {fill: '#808080', stroke: 'none', fillRole: 'surface'},
        );
        this.draw?.drawRectangle(
            core_rect,
            {fill: 'none', stroke: 'black', 'stroke-width': '1'},
        );

    }
}

@bb.opsRegistry.registerClass(ops.Embedding)
class EmbeddingBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.Embedding> {
    private annotation: rh.AnnotationElement;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.Embedding>,
    ) {
        super(categoryRenderer, target, {x: 30, y: 30});
        this.annotation = new rh.AnnotationElement(
            this.renderHandler,
            target.operator.name?.to_latex() ?? 'L',
            {font_size: 1.2},
        );
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        const biteSize = this.settings.operation_multilinear_bite;
        this.renderHandler.draw_handler?.deltaPolygon(
            [rect.top_left,
            {x:rect.dims.x, y: 0},
            {x:0, y:rect.dims.y},
            {x:-rect.dims.x+biteSize, y:0},
            {x:-biteSize, y:-biteSize}],
            {fill: '#E8EEEB', stroke: 'none'},
            {dropShadow: true}
        );
        this.renderHandler.annotation_handler.addAnnotation(
            rect,
            this.annotation,
        )
    }
}

/* Exported so that `ParaCategoryRenderer` can register it for
 * `ParaBlockOperator`, which is a `BlockOperator` carrying the tape seeds of
 * its body and draws exactly as one. */
@bb.opsRegistry.registerClass(ops.BlockOperator)
export class BlockOperatorBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.BlockOperator<B, A>> {
    private annotation: rh.AnnotationElement;
    private processor: cr.BlockProcessor;
    private block: cat.Block<cat.Array<B, A>,cat.Broadcasted<B, A>> =
        this.target.operator.block;
    private block_tag = this.block.block_tag;
    private block_aesthetics = this.block_tag.aesthetics;

    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.BlockOperator<B, A>>,
    ) {
        const latex = target.operator.name?.to_latex() ?? 'BOp';
        const estimated = TextEstimator.estimate_text_dims([latex], 1.2);
        super(categoryRenderer, target, {
            x: Math.max(60, rh.estimated_label_width([latex], 1.2)),
            y: Math.max(35, estimated.y),
        });
        this.block = this.target.operator.block;
        this.annotation = new rh.AnnotationElement(
            this.renderHandler,
            latex,
            {font_size: 1.2},
        );
        this.categoryRenderer.referencesHandler.register_block(this.block_tag, this.block);
        this.processor = cr.blocksRegistry.getConstructor(this.block_aesthetics)(
            categoryRenderer, this.block_aesthetics, this
        );
        if (this.right_anchors.lone_elements.length > 1) {
            this.override_display_type = bb.BroadcastDisplayType.NODE;
        }
    }
    private core_rectangle: dhd.DrawElement<any> | undefined;
    protected draw_core(): void {
        if (!this.block_aesthetics) { return; }

        const rect = this.rectangle();
        const bite_size = this.settings.anchor_height / 2;
        const [attributes, aux] = this.processor.polygon_aux_attrs();
        this.core_rectangle = this.draw?.deltaPolygon(
            [rect.top_left, 
                {x: rect.width - bite_size, y: 0}, 
                {x: bite_size, y: bite_size},
                {x: 0, y: rect.height - bite_size},
                {x: -rect.width + bite_size, y: 0},
                {x: -bite_size, y: -bite_size}],
            {
                ...attributes,
                stroke: this.halo_color(),
                'stroke-width': `${this.settings.block_operator_halo_width}px`,
            },
            aux,
        );
    }
    protected halo_color(): string {
        return Color.from_css(this.processor.fill_color_highlight())
            ?.with_minimum_luminance(0.3).hex() ?? '#707070';
    }
    protected set_hovered(active: boolean): void {
        this.renderHandler.set_highlight(
            highlightTokens.block_highlight_token(this.block_tag), this.diagram_id, active);
    }
    highlight(): void {
        this.core_rectangle?.set_attr({
            ...this.processor.highlight_attributes(),
            stroke: this.halo_color(),
            'stroke-width': `${this.settings.block_operator_halo_highlight_width}px`,
        });
    }
    dehighlight(): void {
        this.core_rectangle?.set_attr({
            fill: this.processor.fill_color(),
            stroke: this.halo_color(),
            'stroke-width': `${this.settings.block_operator_halo_width}px`,
        });
    }
    update(): void {
        super.update();
        this.draw_core();
        this.annotation.place(this.rectangle());
        this.renderHandler.register_highlight(
            highlightTokens.block_highlight_token(this.block_tag),
            (active) => active ? this.highlight() : this.dehighlight());
        if (this.core_rectangle) {
            this.events?.addHover(
                this.core_rectangle,
                () => this.set_hovered(true),
                () => this.set_hovered(false),
            );
        }
        this.events?.addHover(
            this.annotation,
            () => this.set_hovered(true),
            () => this.set_hovered(false),
        );
    }
}
