import * as highlightTokens from '../Render/highlightTokens';
import * as rh from '../Render/RenderHandler';
import * as contra from '../../para/data_structure/Contravariant';
import * as cat from '../../data_structure/Category';
import * as ut from '../../utilities/utilities';
import * as dhd from '../Render/DrawHandler';
import * as crs from './CategoryRendererSettings';
import * as pt from '../../utilities/Point';
import * as nm from '../../data_structure/Numeric'
import * as nmr from './NumericRenderer';
import * as utcr from '../../utilities/ConstructorRegistry';

import { Separated } from '../../utilities/Separated';
import { Color } from '../../utilities/Color';
import * as Curve from '../../utilities/Curve';

// The settings are:
// - L (the long objects of the category)
// - M (the base morphism of the category)
// - A (the anchor type of the category, defaults to L)

// OBJECTS

export abstract class Meridian<A> extends rh.DiagramElement {
    public anchors: Anchor<A>[] = [];
    constructor(
        public categoryRenderer: CategoryRenderer<any, any, A>,
    ) {
        super(categoryRenderer.renderHandler);
    }
    get settings() {
        return this.categoryRenderer.settings;
    }
    public link(next: Meridian<A>, reversed: boolean = false): void {
        if (reversed) {
            return next.link(this, false);
        }
        ut.zip(
            this.anchors, next.anchors).map(
            ([a1, a2]) => a1.anchor_link(a2)
        );
    }
    static generic_link<A>(left: Meridian<A> | Anchor<A>[], right: Meridian<A> | Anchor<A>[]): void {
        const left_anchors = left instanceof Meridian ? left.anchors : left;
        const right_anchors = right instanceof Meridian ? right.anchors : right;
        ut.zip(
            left_anchors, right_anchors).map(
            ([a1, a2]) => a1.anchor_link(a2)
        );
    }
    public enableAnnotation(): void {}
}
/*
 * The wire between two anchors.
 *
 * Two anchors that face the same way are joined by an S-curve, whose control
 * points are displaced along the direction they face: `flatCurve` for two
 * column anchors, `verticalCurve` for two on ROWS, one above the other. The
 * second is what a wrapped operator's row draws to the operator's own row
 * below it. Drawing that pair flat gives the wire horizontal tangents, so it
 * meets each anchor at a right angle to the tape running into it.
 *
 * An anchor on a ROW - `RowMeridian`, along a box's top or bottom edge - faces
 * vertically, and a wire between it and a column anchor is a quarter turn:
 * it leaves the row anchor straight down (or up) and arrives at the column
 * anchor straight from the side. The turn is a quarter of a CIRCLE of
 * radius `radius` - `turn_radius` in the settings - at the corner where the
 * two headings meet, with straight legs from each anchor to it, so every
 * turn in a figure is the same turn. Where the anchors are closer than the
 * radius in either direction the circle shrinks to fit and a leg vanishes.
 * One rule for every such pair, wherever it arises - a grabbed operand's
 * degree axis reaching the right column, an `Einops` cup between a grabbed
 * axis and the operand it contracts with, a row feeding a node.
 */
export const TURN_KAPPA = 0.5523;
export const TURN_RADIUS = 10;

export function wire_curve(
    p0: pt.Point, p1: pt.Point,
    horizontal0: boolean, horizontal1: boolean,
    radius: number = TURN_RADIUS,
): Curve.Curve {
    if (horizontal0 && horizontal1) {
        return Curve.verticalCurve(p0, p1);
    }
    if (horizontal0 === horizontal1) {
        return Curve.flatCurve(p0, p1);
    }
    // The row anchor leaves vertically, so the corner is under (or over) it
    // at the column anchor's height; the path is row -> corner -> column.
    const [row, column] = horizontal0 ? [p0, p1] : [p1, p0];
    const corner = {x: row.x, y: column.y};
    const r = Math.min(radius,
                       Math.abs(column.y - row.y), Math.abs(column.x - row.x));
    const sy = Math.sign(corner.y - row.y), sx = Math.sign(column.x - corner.x);
    const arc_in = {x: corner.x, y: corner.y - sy * r};
    const arc_out = {x: corner.x + sx * r, y: corner.y};
    const pieces: Curve.Curve[] = [
        new Curve.StraightLine(row, arc_in),
        new Curve.CubicBezierSegment(
            arc_in,
            {x: arc_in.x, y: arc_in.y + sy * r * TURN_KAPPA},
            {x: arc_out.x - sx * r * TURN_KAPPA, y: arc_out.y},
            arc_out),
        new Curve.StraightLine(arc_out, column),
    ];
    if (!horizontal0) {
        pieces.reverse();
    }
    return new Curve.CurveSequence(
        horizontal0 ? pieces : pieces.map(reverse_curve));
}

/* A curve run the other way, for a path built row-first and drawn from the
 * column end. */
function reverse_curve(curve: Curve.Curve): Curve.Curve {
    if (curve instanceof Curve.StraightLine) {
        return new Curve.StraightLine(curve.end, curve.start);
    }
    const c = curve as Curve.CubicBezierSegment;
    return new Curve.CubicBezierSegment(c.end, c.control1, c.control0, c.start);
}

export interface AnchorAnnotation {
    annotation: rh.AnnotationElement;
    minimum_gap_width: number;
    rows: number;
    placement?: 'above' | 'below';
    /* How far right of the gap's left edge the label starts. See
     * `Anchor.gap_label_inset`. */
    left_inset?: number;
}

/* The stroke width of a halo drawn under a wire stroked with `attributes`,
 * `extra` px wider than the wire. */
export function halo_stroke_width(
    attributes: Partial<dhd.LineAttrs>,
    extra: number,
): string {
    const width = Number.parseFloat(attributes['stroke-width'] ?? '1');
    return `${(Number.isFinite(width) ? width : 1) + extra}px`;
}

/*
 * A halo under a wire: the wire's own curve and colour, wider by `extra`, and
 * invisible until a highlight turns it on. The caller links it to a highlight
 * with `link_halo`.
 */
export function draw_wire_halo(
    draw: dhd.DrawHandler<any> | undefined,
    curve: Curve.Curve,
    attributes: Partial<dhd.LineAttrs>,
    extra: number,
    layer: 'main' | 'broadcast' = 'main',
): dhd.DrawElement | undefined {
    const halo = draw?.curve(
        curve, {...attributes, 'stroke-width': halo_stroke_width(attributes, extra)},
        undefined, layer);
    halo?.set_attr({'stroke-opacity': '0', 'pointer-events': 'none'});
    return halo;
}

/*
 * A halo lit while any of `tokens` is active. Two tokens may light one halo,
 * as a tape's halo answers to both its slot and its axis.
 */
export function link_halo(
    renderHandler: rh.RenderHandler,
    halo: dhd.DrawElement | undefined,
    tokens: readonly string[],
    opacity: number,
): void {
    if (halo === undefined) {
        return;
    }
    const active = new Set<string>();
    tokens.forEach((token) => renderHandler.register_highlight(token, (lit) => {
        if (lit) { active.add(token); } else { active.delete(token); }
        halo.set_attr({'stroke-opacity': active.size > 0 ? String(opacity) : '0'});
    }));
}

export abstract class Anchor<A> extends Meridian<A> {
    public wire_layer: 'main' | 'broadcast' = 'main';
    /*
     * Whether a wire is painted along the links this anchor holds.
     *
     * A wire is painted where the flag holds at both of its ends, so clearing
     * it on one anchor takes every wire at that anchor out of the figure and
     * leaves the links themselves in place for `next_terminal`,
     * `prior_terminal` and the terminal walk of `wire_connections` to read.
     * Reading both ends is what makes the rule hold under a mirror, which
     * exchanges `prior` and `further` and so exchanges which of the two anchors
     * paints the wire between them.
     *
     * `NodeAnchor` is the anchor that clears it. See `StrideMorphismBox`.
     */
    public paints_wires: boolean = true;
    public auxiliary_annotations: AnchorAnnotation[] = [];
    public further: Anchor<A>[] = [];
    protected prior: Anchor<A>[] = [];
    /* On a row along a box's top or bottom edge, rather than in a column:
     * the wire leaves it vertically. Set by `RowMeridian`. */
    public horizontal: boolean = false;

    protected curve_attributes: Partial<dhd.LineAttrs> = {}; 
    constructor(
        public categoryRenderer: CategoryRenderer<any, any, A>,
    ){
        super(categoryRenderer);
        this.children = [new rh.CoreElement(
            this.renderHandler, 
            {x: 0, y: this.settings.anchor_height})];
        this.anchors = [this];
    }
    public anchor_link(target: Anchor<A>): void {
        this.further.push(target);
        target.prior.push(this);
    }
    /*
     * Links are stored in drawing order - `further` is drawn to, `skipped`
     * asks `prior` - so a mirrored anchor exchanges the two. Every link an
     * anchor holds at mirror time is internal to the box being mirrored, since
     * the box is mirrored before its neighbours' gaps link to it, and the
     * links made after run in the mirrored drawing order already.
     */
    public mirror(): void {
        super.mirror();
        [this.prior, this.further] = [this.further, this.prior];
    }

    // SKIP MANAGEMENT
    private _allow_skip: boolean = true;
    private _loose: boolean = false;
    get loose(): boolean {
        return this._loose;
    }
    set loose(value: boolean) {
        this._loose = value;
    }
    get allow_skip(): boolean {
        return this._allow_skip;
    }
    set allow_skip(value: boolean) {
        this._allow_skip = value;
    }
    public skipped(): boolean {
        return this.loose && this.allow_skip && this.prior.length > 0;
    }

    /*
     * Did the wire reaching this anchor come out of a rearrangement, with no
     * seed morphism since?
     *
     * Set outright by `RearrangementBox` on both of its own columns, and
     * carried outwards from there by `ComposedGap.inherit_rearranged` - so an
     * anchor on the boundary of a `Composed`, `Block` or product answers for
     * whatever is at the end of the chain INSIDE it, however deep, and a seed
     * morphism ends the chain by building fresh columns that inherit nothing.
     * Read by `lock_consecutive_rearrangement` and by
     * `annotate_after_rearrangement`.
     *
     * Kept on the anchor rather than looked up from the boxes because a
     * rearrangement need not be a whole column: it is often one factor of a
     * product, so the box on either side of a gap is a `ProductBox` and only
     * some of its rows are rearranged. Per anchor, that question still has an
     * answer.
     */
    public rearranged: boolean = false;

    /*
     * Is this anchor one of a rearrangement's OWN two columns?
     *
     * `rearranged` answers the softer question - did the wire arriving here
     * come out of a rearrangement, however many containers back - and is
     * inherited outwards in order to answer it. This one is never inherited:
     * `RearrangementBox.loosen` sets it and nothing else does, so it stays
     * false on the boundary of a `Composed`, `Block` or product that merely
     * CONTAINS a rearrangement.
     *
     * `lock_consecutive_rearrangement` needs that distinction; the two other
     * readers of `rearranged` want the inherited answer and keep it.
     */
    public rearrangement_column: boolean = false;

    /*
     * May a `ComposedGap` rest this anchor's name on its wire?
     *
     * True for every anchor but the ones a box has undertaken to name itself.
     * `ParaWrapBox` is the case: a tape leaves (or arrives at) one of the
     * wrap's own column anchors, and the name belongs at the top of that tape
     * rather than out on the wire beside it - so the wrap clears the flag and
     * places the annotation where the tape is.
     *
     * A flag rather than a race. One `AnnotationElement` placed twice leaves
     * two boxes in the annotation layer, since `addAnnotation` only tracks the
     * last one it made, and which of the two placements is the last depends on
     * whether the gap concerned is left or right of the wrap. Saying who owns
     * the name settles it either way round.
     *
     * A box that has undertaken that its own gaps say nothing about an anchor
     * clears it too. `JunctionOfPartsBox` is that case: a concatenation names
     * the axis it fills and the parts that fill it, and the axes it is
     * broadcast over are named by the rest of the figure.
     */
    public annotate_in_gap: boolean = true;

    /*
     * Whether this anchor's own name is drawn in the gaps beside it. An anchor
     * that answers false still carries its `auxiliary_annotations` there, so a
     * gap can hold the label of an array and none of the names of its axes.
     * `ThinTypeConvertBox` in `quantization/quantisationLabels.ts` clears it on
     * the result of a conversion drawn as no glyph: the axes are named in the
     * gap the operand came from, and the gap the conversion writes into holds
     * the format alone.
     */
    public names_itself_in_gap: boolean = true;

    /*
     * How far right of a gap's left edge this anchor's name starts, in px.
     *
     * A gap hangs every name it carries off its own left edge, which is where
     * the anchor on its left stands, so a mark that anchor draws on itself and
     * the first glyph of the name land on the same few pixels.
     * `JunctionOfPartsBox` insets the name of the axis its circle sits on past
     * the circle. The inset applies to the anchor at the gap's left edge and to
     * no other, `ComposedGap.select_annotations` naming the one it took the
     * names from.
     */
    public gap_label_inset: number = 0;

    private _add_dot: boolean = false;
    set add_dot(value: boolean) {
        this._add_dot = value;
    }

    /*
     * Whether the dot that marks several wires meeting is drawn here. Cleared
     * where the figure marks the meeting some other way, which the junction
     * circle of a concatenation does, so that the two marks are not drawn one
     * over the other. `AxisAnchor.update` sets `add_dot` from the wires it
     * finds, so the refusal is a flag of its own rather than a value the dot
     * could be set to.
     */
    public draws_meeting_dot: boolean = true;

    /*
     * How the wire leaving this anchor is stroked - the colour a datatype gave
     * it, the dashes a separator gave it.
     *
     * Public because a box may have to draw something that continues the wire
     * without owning the anchor it comes from: `TapeBox` in
     * `para/ParaCategoryRenderer` draws the stub a grab's wire arrives along,
     * and a black stub beside a coloured wire reads as a second wire rather
     * than as more of the same one.
     */
    public wire_attributes(): Partial<dhd.LineAttrs> {
        return {...this.curve_attributes};
    }

    /*
     * The deletion dot belongs to the wire it sits on, so a subclass that
     * colours its wire can colour the dot to match rather than leaving a black
     * mark on a coloured line. Stroke is given explicitly alongside fill:
     * `defaultCircleAttrs` would otherwise put a black 1px outline on a dot of
     * radius 2, which is most of the dot.
     */
    protected dot_attributes(): Partial<dhd.CircleAttrs> {
        return {fill: 'black', stroke: 'black', radius: 2};
    }

    /*
     * Whether this anchor has a wire of its own. A column asks before drawing
     * the wire to the next terminal, and `ParaWrapBox` asks before drawing a
     * tape to the anchor on a row, so an anchor that draws no wire in a column
     * draws no tape either.
     */
    public draws_wire(): boolean {
        return true;
    }

    update(): void {
        if (this.skipped() || !this.draws_wire()) {
            return;
        }
        if (this._add_dot && this.draws_meeting_dot) {
            this.draw?.circle(
                this.rectangle().midpoint(),
                this.dot_attributes()
            )
        }
        for (const {anchor: next, layer} of this.painted_wire_connections()) {
            this.draw_wire(
                wire_curve(this.location()!, next.location()!,
                           this.horizontal, next.horizontal,
                           this.settings.turn_radius),
                layer);
        }
    }

    /* The connections of `wire_connections` whose two ends both paint. */
    private painted_wire_connections(
    ): {anchor: Anchor<A>; layer: 'main' | 'broadcast'}[] {
        return this.paints_wires
            ? this.wire_connections().filter(({anchor}) => anchor.paints_wires)
            : [];
    }

    /*
     * One wire leaving this anchor, on `layer`. A subclass that puts something
     * under the wire, as `AxisAnchor` puts a halo, draws it here.
     */
    protected draw_wire(
        curve: Curve.Curve,
        layer: 'main' | 'broadcast',
    ): dhd.DrawElement | undefined {
        return this.draw?.curve(curve, {...this.curve_attributes}, undefined, layer);
    }

    public wire_connections(): {anchor: Anchor<A>; layer: 'main' | 'broadcast'}[] {
        return this.further.flatMap((anchor) =>
            anchor.terminal_wire_connections(this.wire_layer));
    }

    private terminal_wire_connections(
        incoming_layer: 'main' | 'broadcast',
    ): {anchor: Anchor<A>; layer: 'main' | 'broadcast'}[] {
        const layer = incoming_layer === 'broadcast' ? incoming_layer : this.wire_layer;
        return this.skipped() && this.further.length > 0
            ? this.further.flatMap((anchor) => anchor.terminal_wire_connections(layer))
            : [{anchor: this, layer}];
    }


    private next_terminal_poll(): Anchor<A>[] {
        if (this.skipped() && this.further.length > 0) {
            return this.further.flatMap((a) => a.next_terminal_poll());
        }
        return [this];
    }
    public next_terminal(): Anchor<A>[] {
        return this.further.flatMap(
            (a) => a.next_terminal_poll()
        );
    }

    private prior_terminal_poll(): Anchor<A>[] {
        if (this.skipped() && this.prior.length > 0) {
            return this.prior.flatMap((a) => a.prior_terminal_poll());
        }
        return [this];
    }
    public prior_terminal(): Anchor<A>[] {
        return this.prior.flatMap(
            (a) => a.prior_terminal_poll()
        );
    }

    public getAnnotation(): rh.AnnotationElement | undefined {
        return undefined;
    }

    public get_gap_annotation(): rh.AnnotationElement | undefined {
        return this.getAnnotation();
    }

    public gap_annotations(): AnchorAnnotation[] {
        const annotation = this.names_itself_in_gap
            ? this.get_gap_annotation() : undefined;
        return [
            ...(annotation ? [{
                annotation, minimum_gap_width: this.label_width(), rows: 1,
            }] : []),
            ...this.auxiliary_annotations,
        ];
    }

    /*
     * How wide a `ComposedGap` has to be for this anchor's label to end before
     * the next gap's labels begin. Zero for an anchor whose label fits the
     * gap's own width, which is every axis name.
     */
    public label_width(): number {
        return 0;
    }
}
export class SeparatorAnchor<A> extends Anchor<A> {
    constructor(
        public categoryRenderer: CategoryRenderer<any, any, A>,
    ) {
        super(categoryRenderer);
        this.curve_attributes = this.settings.separator_settings?.separator_curve_attributes || {};
        this.setBorderColor('red');
    }
}

export class ConcatMeridian<A> extends Meridian<A> {
    constructor(
        public categoryRenderer: CategoryRenderer<any, any, A>,
        public content: Meridian<A>[],
    ) {
        super(categoryRenderer);
        this.anchors = this.content.flatMap((x) => x.anchors);
    }
}

/*
 * A meridian turned on its side: the same anchors, laid out left to right
 * along a box's top or bottom edge instead of top to bottom along its side.
 *
 * This is what a grabbed or dropped object is drawn as - see
 * `para/ParaWrapDisplay`. The anchors are the ones the lone meridians already
 * built, so they keep their processors, colours and labels; only their extent
 * changes, from `anchor_height` tall and zero wide to `spacing` wide and zero
 * tall, and they are re-parented into one `Horizontal`. The meridians they
 * came from are kept as `lone_elements` for whoever needs to ask which anchor
 * belongs to which object, but are not children and are never rendered.
 *
 * `anchors` keeps the logical order - the objects' own, which is what
 * anything indexing the row positionally relies on. `order` is what is LAID
 * OUT, left to right, and defaults to the anchors in that same order. It is a
 * list of elements rather than of anchors, so a caller can put an EMPTY SLOT
 * where this row has no anchor: two rows that have to line up anchor for
 * anchor - the operator's target row under the full array's row above it -
 * are given a slot each per position, and centring both on the same core then
 * puts each anchor over its partner. `BroadcastedCategoryRenderer`'s
 * `vertical_product` builds both rows that way.
 */
export class RowMeridian<A> extends Meridian<A> {
    /*
     * The separators between one lone element and the next, where the row was
     * built with them. A row is a product read along a box's edge, so it is
     * separated as a column is, and `anchors` holds them interleaved in lone
     * order for whoever reads the row against its weaves. `order` is where
     * they are drawn, which is a question for whoever built the row.
     */
    public separated?: Separated<Meridian<A>, SeparatorAnchor<A>>;
    constructor(
        public categoryRenderer: CategoryRenderer<any, any, A>,
        public lone_elements: Meridian<A>[],
        spacing: number,
        order?: rh.DiagramElement[],
        separated?: Separated<Meridian<A>, SeparatorAnchor<A>>,
    ) {
        super(categoryRenderer);
        this.separated = separated;
        this.anchors = (separated?.content ?? this.lone_elements)
            .flatMap((m) => m.anchors);
        for (const anchor of this.anchors) {
            anchor.horizontal = true;
            anchor.children = [new rh.CoreElement(
                this.renderHandler, {x: spacing, y: 0})];
        }
        this.children = [new rh.Horizontal(
            this.renderHandler, order ?? [...this.anchors])];
    }
    public enableAnnotation(): void {
        this.lone_elements.forEach((el) => el.enableAnnotation());
    }
}

/*
 * The children of a box with anchors on four sides:
 * `Horizontal(left, Vertical(top, core, bottom), right)`.
 *
 * The columns stay at the box's two sides as for any `MorphismBox`; the rows
 * sit over and under the core, which the `Vertical` centres them on. A row
 * wider than the core widens it, so the box is as wide as whatever it holds
 * and a row never overflows its edge. Rows are zero tall, so a box with rows
 * is exactly as tall as one without. With no rows this is the ordinary
 * `[left, core, right]`.
 */
export function four_sided(
    renderHandler: rh.RenderHandler,
    left: rh.DiagramElement,
    core: rh.CoreElement,
    right: rh.DiagramElement,
    top?: rh.DiagramElement,
    bottom?: rh.DiagramElement,
): rh.DiagramElement[] {
    if (!top && !bottom) {
        return [left, core, right];
    }
    core.width = Math.max(core.dims.x, top?.dims.x ?? 0, bottom?.dims.x ?? 0);
    return [
        left,
        new rh.Vertical(renderHandler, [
            ...(top ? [top] : []), core, ...(bottom ? [bottom] : [])]),
        right,
    ];
}

export class ProdObjectMeridian<L, A=L> extends Meridian<A> {
    public lone_elements: Meridian<A>[];
    public separated?: Separated<Meridian<A>, SeparatorAnchor<A>>;
    constructor(
        public categoryRenderer: CategoryRenderer<L, any, A>,
        public target: cat.ProdObject<L> | Meridian<A>[],
        public no_separator: boolean = false,
    ) {
        super(categoryRenderer);
        if (target instanceof cat.ProdObject) {
            this.lone_elements = target.map(
                (l) => this.categoryRenderer.display_lone(l)
            );
        } else {
            this.lone_elements = target;
        }
        let content: Meridian<A>[];
        if (!this.no_separator && this.settings.separator_settings) {
            this.separated = new Separated(
                this.lone_elements,
                () => new SeparatorAnchor<A>(this.categoryRenderer),
            );
            content = this.separated.content;
        } else {
            content = this.lone_elements;
        }
        this.children = [new rh.Vertical(this.renderHandler, content)];
        this.anchors = content.flatMap((x) => x.anchors);
    }
    public enableAnnotation(): void {
        this.lone_elements.forEach((el) => el.enableAnnotation());
    }
}

/*
    MORPHISMS
*/
export abstract class AnchoredBox<A> extends rh.DiagramElement {
    public left_anchors!: Meridian<A>;
    public right_anchors!: Meridian<A>;
    constructor(
        public categoryRenderer: CategoryRenderer<any, any, A>,
    ) {
        super(categoryRenderer.renderHandler);
    }
    get settings() {
        return this.categoryRenderer.settings;
    }
    public swap_anchors(): void {
        if (this.settings.reversed) {
            [this.left_anchors, this.right_anchors] = [this.right_anchors, this.left_anchors];
        }
    }
    /*
     * The two names are positional - `left_anchors` is whatever is drawn on
     * the left - so mirroring the layout re-points them. A composed gap then
     * still reads its neighbour's facing column, whichever end of the algebra
     * that column now holds.
     */
    public mirror(): void {
        super.mirror();
        [this.left_anchors, this.right_anchors] = [this.right_anchors, this.left_anchors];
    }
}
export abstract class MorphismBox<L, M extends cat.Morphism<L>, A=L> extends AnchoredBox<A> {
    public left_anchors!: ProdObjectMeridian<L, A>;
    public right_anchors!: ProdObjectMeridian<L, A>;
    constructor(
        public categoryRenderer: CategoryRenderer<L, M, A>,
        public target: cat.ProdCategory<L, M>,
        public build: boolean = true,
    ) {
        super(categoryRenderer);
    }
    get settings() {
        return this.categoryRenderer.settings;
    }
    highlight(): void {}
    dehighlight(): void {}
}

// Placeholder for Morphisms
class DefaultMorphismBox<L, M extends cat.Morphism<L>, A=L> extends MorphismBox<L, M, A> {
    constructor(
        public categoryRenderer: CategoryRenderer<L, M, A>,
        public target: cat.ProdCategory<L, M>,
        public build: boolean = true,
    ) {
        super(categoryRenderer, target, build);
        this.left_anchors = this.categoryRenderer.display_prod_object(this.target.dom());
        this.right_anchors = this.categoryRenderer.display_prod_object(this.target.cod());
        if (this.settings.reversed) {
            console.log('reverse!');
            const placeholder = this.left_anchors;
            this.left_anchors = this.right_anchors;
            this.right_anchors = placeholder;
        }
        this.children = [
            this.left_anchors,
            new rh.CoreElement(this.renderHandler, {x:50,y:50}),
            this.right_anchors,
        ];
        this.setBorderColor('black');
    }
}

export const blocksRegistry = new utcr.ConstructorRegistry<
    cat.BlockAesthetics | null,
    BlockProcessor,
    [CategoryRenderer<any, any, any>,
     cat.BlockAesthetics | null,
     MorphismBox<any, any, any> | null]
>();

/*
 * How much of a block's body is drawn.
 *
 * FULL is the ordinary block. The other two are for a body whose later members
 * are the same machinery wherever the block appears, so that drawing them says
 * the same thing every time and costs rows to say it.
 */
export enum BlockBody {
    /* Every member. */
    FULL = 'FULL',
    /*
     * Every member but the last, which must be a `Block`. What `pyncd` puts
     * there is a reduction's exchange loop, behind the operation whose partial
     * it completes: `Composed(operation, loop(Shuffle, accumulate))`. Dropping
     * it leaves the operation, drawn where it would have been drawn anyway,
     * inside the reduction's own box with `label()` written over it. The
     * composition is arranged so that what is left has the block's own domain
     * and codomain - an exchange hands back the partial it was given - so the
     * wiring outside is unaffected.
     */
    LEADING = 'LEADING',
    /* Nothing: the domain wired straight to the codomain. */
    NONE = 'NONE',
}

/*
 * Which of those a block gets.
 *
 * Asked before the block is built, which is why it goes through a processor
 * with no box in it: whether to recurse into the body is decided by the
 * aesthetics alone, and building the body to find out would defeat the point.
 * The processor's constructor may not read `morphismBox` for this reason.
 */
export function block_body_display(
    categoryRenderer: CategoryRenderer<any, any, any>,
    target: cat.Block<any, any>,
): BlockBody {
    return blocksRegistry.getConstructor(target.block_tag.aesthetics)(
        categoryRenderer, target.block_tag.aesthetics, null,
    ).body_display();
}

/*
 * The body a `BlockBody.LEADING` block draws: its members but the last. Only a
 * `Composed` ending in a `Block` has one to drop - anything else is handed back
 * whole, so a block that asks for LEADING and holds something unexpected draws
 * in full rather than losing a member that was carrying data.
 */
export function leading_body<L, M extends cat.Morphism<L>>(
    body: cat.ProdCategory<L, M>,
): cat.ProdCategory<L, M> {
    if (!(body instanceof cat.Composed)
        || body.content.length < 2
        || !(body.content[body.content.length - 1] instanceof cat.Block)) {
        return body;
    }
    const leading = body.content.slice(0, -1);
    return (leading.length === 1 ? leading[0] : new cat.Composed(leading)) as
        cat.ProdCategory<L, M>;
}

@blocksRegistry.registerDefaultClass
export class BlockProcessor<T extends cat.BlockAesthetics | null=cat.BlockAesthetics> {
    constructor(
        public categoryRenderer: CategoryRenderer<any, any, any>,
        public aesthetics: T,
        // Null while `block_collapses` is asking, so nothing here may read it
        // from a constructor.
        public morphismBox: MorphismBox<any, any, any> | null,
    ) {}

    get settings() {
        return this.categoryRenderer.settings;
    }

    placement_padding(): pt.Point {
        return this.settings.block_padding;
    }
    rectangle_padding(): pt.Point {
        return {x: 0, y: 0};
    }
    /*
     * How much of the body to draw - all of it, all but a trailing block, or
     * none of it. See `BlockBody`.
     */
    body_display(): BlockBody {
        return BlockBody.FULL;
    }
    /*
     * LaTeX written across the middle of the box, over whatever of the body is
     * drawn. What a block says when its body does not say it.
     */
    label(): string | null {
        return null;
    }
    label_dims(): pt.Point | null {
        const label = this.label();
        return label ? rh.estimated_label_dims(
            [label], this.settings.block_label_font_size) : null;
    }
    title_dims(font_size: number): pt.Point | null {
        const title = this.aesthetics?.title;
        return title ? rh.estimated_label_dims([title], font_size) : null;
    }
    /*
     * That label drawn in the box's top left corner, during `update`, against a
     * rectangle the caller has measured. Not centred, as `CollapsedBlockBox`
     * puts it: a block that draws a body has an operation in the middle, and a
     * label written over it lands on the glyph. The corner is the one place
     * inside a block that is reliably empty, and reads as a mark ON the box
     * rather than a thing IN it.
     *
     * `BlockBox`, the first fragment of a `PartialBlock` and `EncompassingBox`
     * all draw their label through here, so a tag says the same thing wherever
     * its block ends up.
     */
    draw_label(rectangle: pt.Rectangle): void {
        const label = this.label();
        if (!label) {
            return;
        }
        const renderHandler = this.categoryRenderer.renderHandler;
        renderHandler.annotation_handler.addAnnotation(
            rectangle,
            new rh.AnnotationElement(
                renderHandler,
                label,
                {font_size: this.settings.block_label_font_size,
                 vertical_align: 'start',
                 horizontal_align: 'left'},
            ),
        );
    }
    fill_color(): string {
        return this.aesthetics?.fill_color || 'none';
    }
    /* Read with `from_css` rather than `from_hex`, because `pyncd` writes a
     * block's colour as a CSS name in several places and `explicit_accumulator`
     * writes `white`. */
    parsed_fill_color(): Color {
        const color = Color.from_css(this.fill_color());
        if (color === undefined) {
            throw new Error(`A block's fill color is ${this.fill_color()}.`);
        }
        return color;
    }
    fill_color_dark(): string {
        return Color.from_h360sv(this.parsed_fill_color().hue360, 1, 0.5).hex();
    }
    fill_color_highlight(): string {
        const highlight_color = Color.from_h360sv(
            this.parsed_fill_color().hue360, 0.5, 1
        );
        return highlight_color.hex();
    }
    highlight_attributes(): Partial<dhd.PolygonAttrs> {
        return {
            fill: this.fill_color_highlight(),
            fillRole: 'tint',
            surfaceTint: this.categoryRenderer.renderHandler.settings.blockHoverIntensity ?? 0.12,
        };
    }
    stroke(): string {
        return 'none'
    }
    polygon_aux_attrs(): [Partial<dhd.PolygonAttrs>, Partial<dhd.AuxAttrs>] {
        return [
            { 
                fill: this.fill_color(), 
                stroke: this.stroke(),
            },
            {dropShadow: true}
        ]
    }
}

/*
 * A block's domain taken straight to its codomain: the body is never built, so
 * nothing inside it is measured, laid out or drawn. What stands in its place is
 * `label`, centred, and whatever fill the block's processor gives - `BlockBox`
 * still draws that, since a collapsed block is an ordinary block from the
 * outside and only differs in what it holds.
 *
 * Domain and codomain are linked pairwise, which is exactly right for the
 * blocks this is for: a reduction's exchange returns the partial it was handed,
 * one wire in and the same wire out.
 */
export class CollapsedBlockBox<L, A=L> extends MorphismBox<L, any, A> {
    constructor(
        public categoryRenderer: CategoryRenderer<L, any, A>,
        public target: cat.Block<L, any>,
        public label: string | null = null,
    ) {
        super(categoryRenderer, target);
        this.left_anchors = categoryRenderer.display_prod_object(target.dom());
        this.right_anchors = categoryRenderer.display_prod_object(target.cod());
        this.swap_anchors();
        this.left_anchors.link(this.right_anchors);
        this.children = [
            this.left_anchors,
            new rh.CoreElement(
                this.renderHandler,
                {x: this.settings.collapsed_block_width}),
            this.right_anchors,
        ];
        this.setBorderColor('yellow');
    }
    update(): void {
        super.update();
        if (!this.label) {
            return;
        }
        this.renderHandler.annotation_handler.addAnnotation(
            this.rectangle(),
            new rh.AnnotationElement(
                this.renderHandler,
                this.label,
                {font_size: 0.9,
                 vertical_align: 'center',
                 horizontal_align: 'center'},
            ),
        );
    }
}

/*
 * A `Contravariant` drawn as its body mirrored: the composition order appears
 * reversed, and each operation shows its codomain on the left, while every
 * glyph and every label is drawn the ordinary way round inside its own
 * rectangle. `DiagramElement.mirror` states the mechanism. A negative
 * transform scale was tried on 2026-09-01 and rejected, because it reverses
 * the operator glyphs and their names with the geometry.
 *
 * After the mirror the body's `left_anchors` is its codomain column, which is
 * `Contravariant.dom()`, so this box wires into a composition without any
 * exchange of its own. A mirrored reversed reindexing is the figure of the
 * reverse reindexing, which is what a contravariant node denotes.
 *
 * Defined here rather than in a module of its own because `display_category`
 * dispatches to it. A separate module importing this one back is an ES module
 * cycle, and `MorphismBox` is undefined at class definition time.
 */
export class ContravariantBox<L, M extends cat.Morphism<L>, A=L>
        extends MorphismBox<L, M, A> {
    private inner_box: MorphismBox<L, cat.ProdCategory<L, M>, A>;
    /**
     * `_inner_box` is the body drawn by the caller rather than by
     * `display_category`. `Multiline`'s `multiline_render` passes the body
     * already split into rows, which is how a contravariant row wraps at the
     * width the covariant rows beside it wrap at.
     */
    constructor(
        public categoryRenderer: CategoryRenderer<L, M, A>,
        public contravariant_target: contra.Contravariant<L, cat.ProdCategory<L, M>>,
        public capped: boolean = true,
        _inner_box?: MorphismBox<L, cat.ProdCategory<L, M>, A>,
    ) {
        super(categoryRenderer, contravariant_target as cat.ProdCategory<L, M>);
        this.inner_box = _inner_box ?? categoryRenderer.display_category(
            this.contravariant_target.body, capped);
        this.inner_box.mirror();
        this.left_anchors = this.inner_box.left_anchors;
        this.right_anchors = this.inner_box.right_anchors;
        this.children = [new rh.CoreElement(
            this.renderHandler, this.inner_box.dims, [this.inner_box])];
    }

}


export class BlockBox<L, M extends cat.Morphism<L>, A=L> extends MorphismBox<L, M, A> {
    private outer_box: rh.DiagramElement;
    private inner_box: MorphismBox<L, cat.ProdCategory<L, M>, A>;
    private iteration_annotation?: rh.AnnotationElement;
    private processor: BlockProcessor;
    constructor(
        public categoryRenderer: CategoryRenderer<L, M, A>,
        public target: cat.Block<L, cat.ProdCategory<L, M>>,
        public capped: boolean = true,
        _inner_box?: MorphismBox<L, cat.ProdCategory<L, M>, A>,
    ) {
        super(categoryRenderer, target);
        // Built before the body, because it is what decides whether there is
        // going to be one.
        this.processor = blocksRegistry.getConstructor(target.block_tag.aesthetics)(
            categoryRenderer, target.block_tag.aesthetics, this
        );
        this.inner_box = _inner_box ?? this.build_inner_box(capped);
        this.left_anchors = this.inner_box.left_anchors;
        this.right_anchors = this.inner_box.right_anchors;

        const padding = this.processor.placement_padding();
        const title_dims = this.processor.title_dims(
            this.settings.block_title_font_size);
        const label_dims = this.processor.label_dims();
        const title_padding = this.settings.block_title_padding;
        const outer_width = Math.max(
            this.inner_box.dims.x + padding.x,
            (title_dims?.x ?? 0) + 2 * title_padding.x,
            (label_dims?.x ?? 0) + 2 * title_padding.x);
        const title_at_bottom = title_dims !== null && this.processor.label() !== null;
        const title_room = title_dims === null ? 0 : title_dims.y + title_padding.y;
        const top_padding = title_at_bottom ? padding.y / 2 : title_dims
            ? Math.max(padding.y / 2, title_dims.y + title_padding.y)
            : padding.y / 2;
        const bottom_padding = title_at_bottom
            ? Math.max(padding.y / 2, title_room) : padding.y / 2;
        const outer_height = this.inner_box.dims.y + top_padding + bottom_padding;
        this.outer_box = new rh.CoreElement(
            this.renderHandler,
            {
                x: outer_width,
                y: outer_height,
            },
            [this.inner_box]
        );
        this.inner_box.transform.offset = {
            x: (outer_width - this.inner_box.dims.x) / 2,
            y: top_padding};
        this.children = [this.outer_box];
        this.setBorderColor('red');
        this.right_anchors.anchors.forEach((a) => a.allow_skip = false);
    }

    private build_inner_box(
        capped: boolean,
    ): MorphismBox<L, cat.ProdCategory<L, M>, A> {
        switch (this.processor.body_display()) {
            case BlockBody.NONE:
                return new CollapsedBlockBox<L, A>(
                    this.categoryRenderer, this.target, this.processor.label());
            case BlockBody.LEADING:
                return this.categoryRenderer.display_category(
                    leading_body(this.target.body), capped);
            default:
                return this.categoryRenderer.display_category(
                    this.target.body, capped);
        }
    }

    private core_rectangle: dhd.DrawElement<any> | undefined;

    protected draw_core(): void {
        if (!this.target.aesthetics) {
            return;
        }
        if (this.target.aesthetics.title) {
            this.renderHandler.annotation_handler.addAnnotation(
                this.rectangle(),
                new rh.AnnotationElement(
                    this.renderHandler,
                    // The title is latex as given - `R[e^{x}]` needs the math, and a
                    // prose title writes its own \text{} wrapper.
                    this.target.aesthetics.title || '',
                    // A box that also draws a label in its top left corner, as a
                    // reduction box draws `R^{2}_{dm}`, takes its title along the
                    // bottom edge instead, where the two cannot overlap.
                    {font_size: this.settings.block_title_font_size,
                    vertical_align: this.processor.label() ? 'end' : 'start',
                    horizontal_align: 'center'
                    }
                )
            );
        }
        this.core_rectangle = this.draw?.drawRectangle(
            this.rectangle().pad(this.processor.rectangle_padding()),
            ...this.processor.polygon_aux_attrs(),
            'background'
        );
        if (this.core_rectangle) {
            const token = highlightTokens.block_highlight_token(this.target.block_tag);
            this.renderHandler.register_highlight(token, (active) =>
                active ? this.highlight() : this.dehighlight());
            this.events?.addHover(
                this.core_rectangle,
                () => this.renderHandler.set_highlight(token, this.diagram_id, true),
                () => this.renderHandler.set_highlight(token, this.diagram_id, false),
            );
        }
    }
    highlight(): void {
        this.core_rectangle?.set_attr(this.processor.highlight_attributes());
    }
    dehighlight(): void {
        this.core_rectangle?.set_attr({fill: this.processor.fill_color()});
    }

    protected draw_label(): void {
        this.processor.draw_label(this.rectangle());
    }

    protected draw_left_bracket(): void {
        const rect = this.rectangle();
        const bracket_depth: number = 5;
        /*
         * The count sits in a box wide enough for a compound repetition
         * (`N/64`, not just `4`) and is pushed against that box's right edge,
         * so a long one grows leftwards away from the bracket instead of
         * spreading over it from a centred 20px slot.
         */
        const annotation_width: number = 60;
        const annotation_gap: number = 4;
        this.iteration_annotation = this.iteration_annotation ??
            new rh.AnnotationElement(
                this.renderHandler,
                nmr.numeric_string(this.target.repetition) || '',
                {
                    font_size: 1,
                    vertical_align: 'center',
                    horizontal_align: 'right',
                }
            );
        this.iteration_annotation?.place(
            new pt.Rectangle(
                {
                    x: rect.left - annotation_width - annotation_gap,
                    y: rect.top
                },
                {x: annotation_width, y: 20}
            )
        );
        this.draw?.polyline(
            [
                {x: rect.left + bracket_depth, y: rect.top},
                {x: rect.left, y: rect.top + bracket_depth},
                {x: rect.left, y: rect.bottom - bracket_depth},
                {x: rect.left + bracket_depth, y: rect.bottom},
            ],
            {stroke: 'black', 'stroke-width': '3px'},
            'main'
        )
    }
    protected draw_right_bracket(): void {
        const rect = this.rectangle();
        const bracket_depth: number = 5;
        this.draw?.polyline(
            [
                {x: rect.right - bracket_depth, y: rect.top},
                {x: rect.right, y: rect.top + bracket_depth},
                {x: rect.right, y: rect.bottom - bracket_depth},
                {x: rect.right - bracket_depth, y: rect.bottom}
            ],
            {stroke: 'black', 'stroke-width': '3px'},
            'main'
        )
    }
    super_update(): void {
        super.update();
    }
    update(): void {
        if (!this.target.aesthetics) {
            super.update();
            return;
        }
        this.draw_core();
        super.update();
        const display = this.processor.body_display();
        if (display === BlockBody.NONE) {
            // A collapsed block does not draw the body the repetition counts,
            // so a bracket round it would be counting nothing visible - and
            // `CollapsedBlockBox` writes its own label.
            return;
        }
        this.draw_label();
        if ((this.target.repetition instanceof nm.Integer)
            && (this.target.repetition._value === 1)) {
            return;
        }
        this.draw_left_bracket();
        this.draw_right_bracket();
    }
}

/*
    COMPOSED RENDERING
*/
export class ComposedGap<L, A=L> extends AnchoredBox<A> {
    constructor(
        public categoryRenderer: CategoryRenderer<L, any, A>,
        public dom: Meridian<A>,
        public cod: Meridian<A>,
        target_width?: number,
        public annotated: boolean = true,
    ) {
        super(categoryRenderer);
        this.left_anchors = dom;
        this.right_anchors = cod;
        for (const [left, right] of this.aligned_anchors()) {
            left.link(right);
            this.inherit_rearranged(left, right);
            this.lock_consecutive_rearrangement(left, right);
        }
        const dims = {
            x: Math.max(
                0,
                target_width ?? this.settings.composed_gap_dims.x,
                this.widest_label()),
            y: this.settings.composed_gap_dims.y,
        }
        this.children = [new rh.CoreElement(
            this.renderHandler,
            dims
        )];
        this.height = Math.max(
            this.settings.anchor_height * this.left_anchors.anchors.length,
            this.settings.anchor_height * this.right_anchors.anchors.length);
        
        this.setBorderColor('blue');
    }
    set width(value: number) {
        const width = Math.max(0, value, this.widest_label());
        this._width = width;
        this.children[0].width = width;
    }

    /*
     * Carry `rearranged` one link along, so that the question "did this come
     * out of a rearrangement" can be asked of a container's boundary.
     *
     * A `Composed`, a `Block` and a product all answer it by what is INSIDE
     * them, and the answer has to be found by recursing until something is
     * either a rearrangement or a seed morphism. This is that recursion, done
     * as the boxes are built rather than as a walk afterwards. Boxes are
     * constructed bottom-up - a `ComposedBox` builds its members before its own
     * caps, a `BlockBox` its body before itself - so by the time a container
     * caps its last member, that member has already inherited from ITS last
     * member, and so on down. One `||=` per link therefore resolves a chain of
     * any depth, and each anchor is resolved once.
     *
     * The gaps BETWEEN morphisms use the same rule and want it: a wire crossing
     * a rearrangement into the next morphism arrives there out of one. What
     * ends the chain is that a seed morphism builds its own two columns and
     * links them internally - by `Meridian.link`, not through a gap - so
     * nothing crosses it, and its output answers `false` however its input
     * arrived.
     *
     * One direction only, the direction the link runs, which is the direction
     * "came out of" is asked in.
     */
    protected inherit_rearranged(left: Anchor<A>, right: Anchor<A>): void {
        right.rearranged ||= left.rearranged;
    }

    /*
     * A rearrangement arriving at a rearrangement: pin the second one's entry.
     *
     * `RearrangementBox.loosen` hands every wire crossing a rearrangement to
     * `next_terminal`, which draws one straight line from the morphism before
     * to the morphism after. That is right for one rearrangement. For two in a
     * row it is not: both columns and both of their neighbours' columns are
     * loose, so `next_terminal` walks the whole run and draws a SINGLE line
     * across the pair. The two crossings are composed into one, the line
     * arrives at an angle neither rearrangement describes, and where it sits
     * mid-run depends only on how far apart its two endpoints are - the jitter
     * that shows up as soon as a run gets longer.
     *
     * Locking the second one's entry column breaks that into one line per
     * rearrangement, each drawn between the columns it actually crosses. It is
     * `allow_skip`, not `loose`, that does it, for two reasons: it is the
     * codebase's word for an anchor that must stay visible, and
     * `make_composed_gap` sets `loose` on whichever side of a gap is shorter -
     * after this runs, and it would put the skip straight back.
     *
     * Only ONE column per gap is locked - the one on the right of it, which is
     * the second rearrangement's entry in the ordinary reading. The other stays
     * loose, so the wire leaves for the next morphism the way a lone
     * rearrangement's does, and a run of n rearrangements is drawn as n lines
     * rather than one. Under `reversed` the pair is the same pair and the
     * locked one is the other of the two, which moves the joint by the width of
     * a rearrangement and changes nothing else.
     *
     * Both sides are read off `rearrangement_column`, not `rearranged`, so the
     * lock fires only between two rearrangements that really are adjacent. The
     * inherited flag is too generous: a rearrangement is often one factor of a
     * product, and `ProductBox` wraps a narrow factor in a `SpreadBox` whose
     * right cap carries `rearranged` out onto the product's own boundary. That
     * boundary then locks the entry of whatever rearrangement follows the
     * product - and there is nothing to repair, because the cap is already
     * pinned (`SpreadBox` sets `allow_skip = false` on both of its columns, as
     * block edges do on theirs), so the run was broken there anyway. The lock
     * only adds a second joint, at the following rearrangement's own column;
     * that box is short and centred in a row as tall as the product, so the
     * wire leaves the top of the product, dives to the middle to meet the
     * joint, and climbs back out. The separator beside it stays straight,
     * having no `rearranged` to inherit - which is what the kink looks like
     * from the outside.
     */
    protected lock_consecutive_rearrangement(
        left: Anchor<A>,
        right: Anchor<A>,
    ): void {
        if (left.rearrangement_column && right.rearrangement_column) {
            right.allow_skip = false;
        }
    }

    aligned_anchors(): [Anchor<A>, Anchor<A>][] {
        return ComposedGap.align(
            this.left_anchors.anchors, this.right_anchors.anchors);
    }

    public widest_label(): number {
        return Math.max(0, ...this.aligned_anchors().flatMap(
            ([left, right]) => this.annotations_for_anchors(left, right)
                .map((label) => label.minimum_gap_width)));
    }

    static required_width<L, M extends cat.Morphism<L>, A=L>(
        categoryRenderer: CategoryRenderer<L, M, A>,
        dom: Meridian<A>,
        cod: Meridian<A>,
        target_width: number = categoryRenderer.settings.composed_gap_dims.x,
    ): number {
        return Math.max(0, target_width,
            ...ComposedGap.align(dom.anchors, cod.anchors).flatMap(
                ([left, right]) => ComposedGap.select_annotations(left, right, {
                    annotated: true,
                    annotate_after_rearrangement:
                        categoryRenderer.settings.annotate_after_rearrangement,
                }).map((label) => label.minimum_gap_width)));
    }

    private annotations_for_anchors(
        left_anchor: Anchor<A>,
        right_anchor: Anchor<A>,
    ): AnchorAnnotation[] {
        return ComposedGap.select_annotations(left_anchor, right_anchor, {
            annotated: this.annotated,
            annotate_after_rearrangement: this.settings.annotate_after_rearrangement,
        });
    }

    private static select_annotations<A>(
        left_anchor: Anchor<A>,
        right_anchor: Anchor<A>,
        settings: {annotated: boolean; annotate_after_rearrangement: boolean},
    ): AnchorAnnotation[] {
        if (!settings.annotated
            || !left_anchor.annotate_in_gap
            || !right_anchor.annotate_in_gap) {
            return [];
        }
        const cap_of_mirrored_box = left_anchor.mirrored && !right_anchor.mirrored;
        if (!settings.annotate_after_rearrangement
            && left_anchor.rearranged
            && !cap_of_mirrored_box) {
            return [];
        }
        const left_annotations = left_anchor.gap_annotations();
        if (left_annotations.length === 0) {
            return right_anchor.gap_annotations();
        }
        return left_anchor.gap_label_inset === 0
            ? left_annotations
            : left_annotations.map((annotation) => ({
                ...annotation, left_inset: left_anchor.gap_label_inset}));
    }

    /*
     * The pairing itself, without a gap to hold it - `make_composed_gap` has to
     * ask which anchor faces which BEFORE it builds one.
     */
    static align<A>(
        left_anchors: Anchor<A>[],
        right_anchors: Anchor<A>[],
    ): [Anchor<A>, Anchor<A>][] {
        let i = 0, j = 0;
        const aligned_anchors: [Anchor<A>, Anchor<A>][] = [];
        while (i < left_anchors.length && j < right_anchors.length) {
            let left_anchor = left_anchors[i];
            let right_anchor = right_anchors[j];
            if (left_anchor instanceof SeparatorAnchor && !(right_anchor instanceof SeparatorAnchor)) {
                i++;
                continue;
            }
            if (!(left_anchor instanceof SeparatorAnchor) && (right_anchor instanceof SeparatorAnchor)) {
                j++;
                continue;
            }
            i++; j++;
            aligned_anchors.push([left_anchor, right_anchor]);
        }
        return aligned_anchors;
    }
    
    update(): void {
        super.update();
        if (this.annotated) {
            this.update_anchor_annotations();
        }
    }

    /*
     * Every name in this gap, hung off the LEFT of it and resting on its wire.
     *
     * One rule, not three. The label goes at the gap's left edge, and the only
     * question left is how high - which `wire_height` answers by asking the
     * curve. That is the same question the old left/right/centre choice was
     * answering indirectly, by picking whichever END of the gap was drawn and
     * hanging the label off that; and it got it wrong whenever the wire moved
     * across the gap, because an anchor's slot is only on the wire when the
     * anchor is drawn. Reading the height off the curve makes the answer exact
     * at any x, so the x can be chosen for how the figure reads instead - one
     * column of names down the left of every gap, all aligned, rather than a
     * mix of left- and right-justified ones.
     *
     */
    protected update_anchor_annotations(): void {
        const this_rect = this.rectangle();
        for (const [left_anchor, right_anchor] of this.aligned_anchors()) {
            const annotations = this.annotations_for_anchors(left_anchor, right_anchor);
            if (annotations.length === 0) {
                continue;
            }
            const y = this.wire_height(left_anchor, right_anchor, this_rect.left);
            if (y === undefined) {
                continue;
            }
            let above_bottom = y + this.settings.annotation_drop;
            let below_top = y + this.settings.annotation_drop;
            for (const {annotation, rows, placement = 'above',
                        left_inset = 0} of annotations) {
                const height = rows * this.settings.anchor_height;
                annotation.annotationSettings.horizontal_align = 'left';
                annotation.annotationSettings.vertical_align = placement === 'below'
                    ? 'start' : 'end';
                this.renderHandler.annotation_handler.addAnnotation(
                    new pt.Rectangle(
                        {x: this_rect.left + left_inset, y: placement === 'below'
                            ? below_top : above_bottom - height},
                        {x: this_rect.width - left_inset, y: height},
                    ),
                    annotation,
                );
                if (placement === 'below') {
                    below_top += height;
                } else {
                    above_bottom -= height;
                }
            }
        }
    }

    /*
     * How high the wire crossing this gap is at `x`.
     *
     * The wire is the one `Anchor.update` draws: a `flatCurve` between the last
     * anchor before this gap that is actually drawn and the first one after it.
     * A skipped anchor still HAS a slot, and that slot is not on the wire - the
     * line runs straight past it to the next real terminal - so each end is
     * resolved through `prior_terminal` / `next_terminal` before the curve is
     * built. An anchor that draws no wire is on no line, so its own slot is
     * used, as for the label of a datatype that stands above its axes. Rebuilding the same curve rather than remembering it is what keeps
     * this honest: it is the drawn line that is sampled, not an estimate of it.
     *
     * `x` is clamped into the span, since a gap's edge can sit outside a curve
     * that starts or ends inside it, and a curve of zero width has no `y(x)` at
     * all - `Curve.y` divides by the span - so a degenerate one falls back to
     * the height it starts at.
     */
    protected wire_height(
        left_anchor: Anchor<A>,
        right_anchor: Anchor<A>,
        x: number,
    ): number | undefined {
        const from = (left_anchor.skipped() && left_anchor.draws_wire()
            ? left_anchor.prior_terminal()[0]
            : left_anchor)?.location();
        const to = (right_anchor.skipped() && right_anchor.draws_wire()
            ? right_anchor.next_terminal()[0]
            : right_anchor)?.location();
        if (!from || !to) {
            return undefined;
        }
        if (to.x <= from.x) {
            return from.y;
        }
        return Curve.flatCurve(from, to).y(
            Math.min(Math.max(x, from.x), to.x)).y;
    }

    /*
     * A wire about to enter a rearrangement is not loosened on its way in.
     *
     * The rule below hands the shorter side of a gap to `next_terminal` so the
     * wire reaches a taller neighbour without a kink, and between two ordinary
     * morphisms that is what it should do. A rearrangement is not an ordinary
     * neighbour: `RearrangementBox.loosen` has already marked BOTH its columns
     * loose, so the wire crossing it is drawn as one long line from the
     * morphism before to the morphism after, whatever this gap decides. All
     * that loosening this side as well can do is move the START of that line -
     * off the array's own boundary and back into the box, onto whatever fed it.
     * For a broadcast that is the operator glyph, or the node stacked above it
     * in a NODE-form box, neither of which is where the array is; the line then
     * leaves at an angle set by the glyph's height rather than the crossing's,
     * and the array's right-hand edge is not on the picture at all.
     *
     * A rearrangement that copies a wire is taller than the morphism feeding
     * it, so this is the common case and not an odd one.
     *
     * Per anchor, not per box, and read off `rearranged` rather than the class
     * of `right`: a rearrangement is often ONE FACTOR of a product, and then
     * the box on this side of the gap is a `ProductBox` whose other rows want
     * the ordinary treatment. That is the same reason `rearranged` lives on the
     * anchor - see its comment. Anchors with no partner at all keep the
     * ordinary treatment, since there is nothing to say they face a
     * rearrangement.
     *
     * One direction only. A rearrangement on the LEFT of a gap is loose by its
     * own hand already, and the column on the right of it keeps the ordinary
     * treatment - `lock_consecutive_rearrangement` pins that one in the single
     * case where it has to stay drawn.
     */
    static make_composed_gap<L, A=L>(
        categoryRenderer: CategoryRenderer<L, any, A>,
        left: AnchoredBox<A>,
        right: AnchoredBox<A>,
    ): ComposedGap<L, A> {
        const dom = left.right_anchors;
        const cod = right.left_anchors;
        const left_height = left.dims.y ?? 0;
        const right_height = right.dims.y ?? 0;
        /*
         * Asked before the gap is built, because building it runs
         * `inherit_rearranged`, which would carry this side's own answer across
         * and report every anchor as facing a rearrangement.
         */
        const facing_rearrangement = new Set(
            ComposedGap.align(dom.anchors, cod.anchors)
                .filter(([, entry]) => entry.rearranged)
                .map(([exit]) => exit)
        );
        //if (categoryRenderer.settings.loose_link) {
        if (left_height < right_height) {
            dom.anchors.forEach(
                (a) => {
                    if (facing_rearrangement.has(a)) {
                        return;
                    }
                    a.loose = true;
                    a.aux.borderColor = 'pink';
                }

            );
        } else if (right_height < left_height) {
            cod.anchors.forEach(
                (a) => {
                    a.loose = true;
                    a.aux.borderColor = 'pink';
                }
            );
        }
        //}
        return new ComposedGap(
            categoryRenderer,
            dom,
            cod,
        )
    }
}
export class ComposedBox<L, M extends cat.Morphism<L>, A=L> extends MorphismBox<L, M, A> {
    private content: MorphismBox<L, M, A>[];
    private separated_content: Separated<MorphismBox<L, M, A>, ComposedGap<L, A>>;
    constructor(
        public categoryRenderer: CategoryRenderer<L, M, A>,
        public target: cat.Composed<L, cat.ProdCategory<L, M>>,
        public capped: boolean = true,
        _content?: MorphismBox<L, M, A>[],
    ) {
        super(categoryRenderer, target);

        this.content = _content ?? target.content.map(
            (item) => categoryRenderer.display_category(
                item, false)
        );
        if (this.settings.reversed) {
            this.content.reverse();
        }
        let caps: undefined | [ComposedGap<L, A>, ComposedGap<L, A>] = undefined;
        if (this.capped) {
            this.left_anchors = categoryRenderer.display_prod_object(
                target.dom()
            );
            this.right_anchors = categoryRenderer.display_prod_object(
                target.cod()
            );
            this.swap_anchors();
            caps = [
                new ComposedGap(
                    categoryRenderer, 
                    this.left_anchors, 
                    this.content[0].left_anchors),
                new ComposedGap(
                    categoryRenderer, 
                    this.content[this.content.length - 1].right_anchors, 
                    this.right_anchors)
                ];
        }
        else {
            this.left_anchors = this.content[0].left_anchors;
            this.right_anchors = this.content[this.content.length - 1].right_anchors;
        }

        this.separated_content = new Separated(
            this.content,
            (i?: number) => ComposedGap.make_composed_gap(
                this.categoryRenderer,
                this.content[i!],
                this.content[i!+1]
            ),
            caps,
        );
        this.children = [
            ...(this.capped ? [this.left_anchors] : []),
            ...this.separated_content.content,
            ...(this.capped ? [this.right_anchors] : []),
        ];
        this.setBorderColor('orange', true);

        // this.children.forEach((c) => {
        //     if (c instanceof ProductBox) {
        //         c.height = this.dims.y;
        //     }
        // });
    }
}

/*
 PRODUCT RENDERING
*/
class ProductGap<L, A=L> extends AnchoredBox<A> {
    constructor(
        public categoryRenderer: CategoryRenderer<L, any, A>,
        public target_width: number = categoryRenderer.settings.product_gap_width ?? 20,
    ) {
        super(categoryRenderer);
        this.left_anchors =  new SeparatorAnchor<A>(categoryRenderer);
        this.right_anchors = new SeparatorAnchor<A>(categoryRenderer);
        (this.left_anchors as SeparatorAnchor<A>).allow_skip = false;
        (this.right_anchors as SeparatorAnchor<A>).allow_skip = false;
        this.left_anchors.link(this.right_anchors);
        this.children = [
            this.left_anchors,
            new rh.CoreElement(this.renderHandler, 
                {x:target_width,
                y:undefined}),
            this.right_anchors,
        ];
        this.setBorderColor('green');
    }
}

export class SpreadBox<L, M extends cat.Morphism<L>, A=L> extends MorphismBox<L, M, A> {
    public left_cap: ComposedGap<L, A>;
    public right_cap: ComposedGap<L, A>;
    constructor(
        public categoryRenderer: CategoryRenderer<L, M, A>,
        public target: cat.ProdCategory<L, M>,
        public body: MorphismBox<L, M, A>,
        public target_width: number | undefined,
        public annotated: boolean = false,
    ) {
        super(categoryRenderer, target);
        const cap_width = this.target_width === undefined
            ? this.settings.composed_gap_dims.x : 0;
        this.left_anchors = categoryRenderer.display_prod_object(
            this.target.dom()
        );
        this.right_anchors = categoryRenderer.display_prod_object(
            this.target.cod()
        );
        this.swap_anchors();
        this.left_cap = new ComposedGap(
            categoryRenderer,
            this.left_anchors,
            this.body.left_anchors,
            cap_width,
            annotated,
        );
        this.right_cap = new ComposedGap(
            categoryRenderer,
            this.body.right_anchors,
            this.right_anchors,
            cap_width,
            annotated,
        )
        this.children = [
            this.left_anchors,
            this.left_cap,
            this.body,
            this.right_cap,
            this.right_anchors,
        ]
        this.left_anchors.anchors.forEach((a) => a.allow_skip = false);
        this.right_anchors.anchors.forEach((a) => a.allow_skip = false);
        if (target_width !== undefined) {
            this.balance_caps(target_width);
        }
    }

    public fit_width(target_width: number): void {
        this.balance_caps(target_width);
    }

    private balance_caps(target_width: number): void {
        const fixed_width = this.dims.x - this.left_cap.dims.x - this.right_cap.dims.x;
        const left_minimum = this.left_cap.widest_label();
        const right_minimum = this.right_cap.widest_label();
        const available_width = Math.max(
            target_width - fixed_width, left_minimum + right_minimum);
        this.set_cap_widths(available_width, available_width / 2);
    }

    protected set_cap_widths(total_width: number, preferred_left_width: number): void {
        const left_minimum = this.left_cap.widest_label();
        const right_minimum = this.right_cap.widest_label();
        const available_width = Math.max(total_width, left_minimum + right_minimum);
        const left_width = Math.max(left_minimum,
            Math.min(preferred_left_width, available_width - right_minimum));
        this.left_cap.width = left_width;
        this.right_cap.width = available_width - left_width;
    }
}

export class ProductBox<L, M extends cat.Morphism<L>, A=L> extends MorphismBox<L, M, A> {
    constructor(
        public categoryRenderer: CategoryRenderer<L, M, A>,
        public target: cat.ProductOfMorphisms<L, cat.ProdCategory<L,M>>,
        capped: boolean = true,
        _morphisms?: MorphismBox<L, M, A>[],
    ) {
        super(categoryRenderer, target);
        let morphisms = _morphisms ?? this.target.content.map(
            (item) => categoryRenderer.display_category(
                item, 
                capped && this.settings.cap_products)
        );
        const max_component_width = Math.max(
            ...morphisms.map((m) => m.dims.x ?? 0)
        );
        const target_width = Math.max(
            0,
            max_component_width * this.settings.product_reduction_m,
            max_component_width - this.settings.product_reduction_c
        );
        morphisms = morphisms.map(
            (m) => (m.dims.x >= target_width) ?
                m :
                new SpreadBox(
                    this.categoryRenderer,
                    m.target,
                    m,
                    target_width
                )
        )
        let content: AnchoredBox<A>[];
        if (this.categoryRenderer.settings.separator_settings !== undefined) {
            content = new Separated(
                morphisms, 
                () => new ProductGap<L, A>(
                    this.categoryRenderer, 
                    target_width)
            ).content;
        }
        else {
            content = morphisms;
        }
        this.left_anchors = new ProdObjectMeridian(
            this.categoryRenderer, content.map((x) => x.left_anchors), true);
        this.right_anchors = new ProdObjectMeridian(
            this.categoryRenderer, content.map((x) => x.right_anchors), true);
        this.children = [new rh.Vertical(
            this.renderHandler, content
        )];
        this.setBorderColor('#50E3C2', true);
    }
    set height(value: number | undefined) {
        this._height = value;
        this.children.forEach((c) => {
            c.height = value;
        })
    }
}

/*
    REARRANGEMENT RENDERING
*/

class RearrangementBox<L, A=L> extends MorphismBox<L, any, A> {
    public core: rh.CoreElement;
    constructor(
        public categoryRenderer: CategoryRenderer<L, any, A>,
        public target: cat.Rearrangement<L>,
    ) {
        super(categoryRenderer, target);
        this.left_anchors =  categoryRenderer.display_prod_object(target.dom());
        this.right_anchors = categoryRenderer.display_prod_object(target.cod());
        this.setup_links();
        this.swap_anchors();
        this.core = new rh.CoreElement(
            this.renderHandler, {x:this.settings.rearrangement_width}
        );
        this.children = [this.left_anchors, this.core, this.right_anchors];
        this.setBorderColor('yellow');
        this.loosen();
    }
    /*
     * A rearrangement never pins a wire down.
     *
     * Its box is two columns of anchors with 30px of nothing between them, so
     * it is nearly always the shortest thing in a composition; being short, it
     * is centred, and a wire arriving from a taller neighbour has to bend in to
     * reach it and straight back out again on the other side. Marking every
     * anchor `loose` hands the wire to `next_terminal`, which walks through
     * both columns to the morphism on the far side and draws ONE line - the
     * crossing the rearrangement describes, without the kink it used to put in
     * the middle of it.
     *
     * `ComposedGap.make_composed_gap` already loosens whichever side of a gap
     * is shorter, which covers a rearrangement between two taller neighbours.
     * What it cannot cover is one that is taller than the morphism on one side
     * and shorter than the other: there each gap loosens the OTHER box, the
     * rearrangement's own column stays pinned, and the wire kinks across it.
     * That case is the whole reason this is unconditional.
     *
     * Three things stay drawn, all because `skipped()` asks for more than
     * looseness. An anchor with no prior is not skipped, so a rearrangement at
     * the very start of a diagram still shows its domain; a deleted domain
     * element sets `allow_skip = false` in `setup_links`, so it keeps the dot
     * the wire has to end in; and a rearrangement following another has its
     * entry column pinned by `ComposedGap.lock_consecutive_rearrangement`, so a
     * run of them is drawn as one line each rather than one line across the
     * lot. `rearrangement_column` is what that reads to find them - set here
     * and only here, which is what keeps the pinning to genuine runs.
     */
    loosen(): void {
        [...this.left_anchors.anchors, ...this.right_anchors.anchors].forEach(
            (anchor) => {
                anchor.loose = true;
                anchor.rearranged = true;
                anchor.rearrangement_column = true;
            }
        );
    }
    setup_links(): void {
        // Setup lone element links
        const doms = this.left_anchors.lone_elements;
        const cods = this.right_anchors.lone_elements;
        const mapping = this.target.mapping;
        const dom_cod_pairs = cods.map(
            (cod, i) => 
                [doms[mapping[i]],
                 cod]
        );
        dom_cod_pairs.forEach(
            ([dom, cod]) => dom.link(cod, this.settings.reversed)
        );
        // Add dots to skipped doms. Above the separator guard below, not after
        // it: a deletion is a deletion whether or not the renderer draws
        // separators, and the StrideRenderer - which is what reindexings are
        // drawn with - sets none, so anything past that return never runs here.
        // The dot is the end of the wire, so the anchor holding it has to be
        // drawn: it refuses the skip `loosen` would otherwise give it.
        doms.forEach((dom, i) => {
            if (mapping.filter((j) => (i == j)).length == 0) {
                dom.anchors.forEach((anchor) => {
                    anchor.add_dot = true;
                    anchor.allow_skip = false;
                });
            }
        });
        // Setup separator links
        if (!this.settings.separator_settings) {
            return;
        }
        /*
         * A separator may only cross the box where it still separates the same
         * cells on both sides. `deconcatenate` finds exactly those places: each
         * pair is a cut the rearrangement splits along, `L` counted in the
         * codomain (it indexes `mapping`) and `R` in the domain. A cut at
         * position N sits after cell N-1, hence the offsets.
         *
         * The two are only interchangeable when the rearrangement is a
         * permutation, where every cut lands at the same index on both sides.
         * A mapping that copies or drops a cell - `[0,1,0,2,3]`, say - shifts
         * them apart, and swapping the two draws a separator diagonally across
         * the box between cells it does not divide.
         */
        const bigI = doms.length;
        const dom_seps = this.left_anchors.separated?.separators ?? [];
        const cod_seps = this.right_anchors.separated?.separators ?? [];
        const crossed: Set<Anchor<A>> = new Set();
        ut.deconcatenate(mapping, bigI).forEach(([L, R]) => {
            const [dom_sep, cod_sep] = [dom_seps[R-1], cod_seps[L-1]];
            if (!dom_sep || !cod_sep) {
                return;
            }
            dom_sep.link(cod_sep, this.settings.reversed);
            crossed.add(dom_sep);
            crossed.add(cod_sep);
        });
        /*
         * Everything else divides cells the rearrangement mixes together, so it
         * has nowhere to go. Marked loose rather than linked somewhere
         * approximate: a separator that cannot cross should read as absent, not
         * as a line to the wrong place.
         */
        [...dom_seps, ...cod_seps].forEach((sep) => {
            if (!crossed.has(sep)) {
                sep.loose = true;
            }
        });
    }
}

export type CatBox<L, M extends cat.Morphism<L>, A=L> = MorphismBox<L, cat.ProdCategory<L, M>, A>;

class ReferencesHandler<L, M extends cat.Morphism<L>, A=L> {
    private _pending_render: cat.ProdCategory<L, M>[] = [];
    add_pending(target: cat.ProdCategory<L, M>): void {
        this._pending_render.push(target);
    }
    pop_pending(): cat.ProdCategory<L, M>[] {
        const temp = this._pending_render.splice(0, this._pending_render.length);
        this._pending_render = [];
        return temp;
    }

    private _registered_tags: Set<number> = new Set();
    clear_references(): void {
        this._pending_render = [];
        this._registered_tags.clear();
    }
    /** Queue `pending` to be drawn as a sub-block the first time its tag is
     * registered, and nothing on a later registration of the same tag. */
    register_block(tag: cat.BlockTag, pending: cat.ProdCategory<L, M> | undefined = undefined): void {
        if (this._registered_tags.has(tag.uid._id)) {
            return;
        }
        this._registered_tags.add(tag.uid._id);
        if (pending) {
            this.add_pending(pending);
        }
    }
}

export abstract class CategoryRenderer<
    L, 
    M extends cat.Morphism<L>,
    A = L> {

    public settings: crs.CategoryRendererSettings<L, M, A>;
    public referencesHandler: ReferencesHandler<L, M> = new ReferencesHandler<L, M>();
    constructor(
        public renderHandler: rh.RenderHandler,
        _settings: Partial<crs.CategoryRendererSettings<L, M, A>> = {},
    ) {
        this.settings = {
            ...crs.DefaultCategoryRendererSettings,
            ..._settings,
        };
        console.log("CategoryRenderer settings:", this.settings);
    }

    public abstract display_lone(target: L): Meridian<A>;
    public display_morphism(target: M): MorphismBox<L, M, A> {
        return new DefaultMorphismBox(this, target);
    }
    public abstract display_prod_object(target: cat.ProdObject<L>): ProdObjectMeridian<L, A>;
    public display_category(
        target: cat.ProdCategory<L, M> | contra.Contravariant<L, cat.ProdCategory<L, M>>,
        capped: boolean = true): MorphismBox<L, M, A> {
        if (target instanceof contra.Contravariant) {
            return new ContravariantBox(this, target, capped);
        }
        if (target instanceof cat.Composed) {
            return new ComposedBox(this, target, capped);
        }
        if (target instanceof cat.ProductOfMorphisms) {
            return new ProductBox(this, target, capped);
        }
        if (target instanceof cat.Block) {
            return new BlockBox(this, target, capped);
        }
        if (capped) {
            return new ComposedBox(
                this, 
                new cat.Composed([target]),
            );
        }
        if (target instanceof cat.Rearrangement) {
            return new RearrangementBox(this, target);
        }
        //return new DefaultMorphismBox(this, target);
        return this.display_morphism(target);
    }
}
