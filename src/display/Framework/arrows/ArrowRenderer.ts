// Claude Opus 5.5 (1M context), effort max.
/*
 * The broadcasted category with each array between two operators drawn as one
 * arrow, which `RenderHandlerSettings.form` selects under
 * `arrows-and-broadcasted`. `BoxRenderer.ts` draws the same arrows under
 * `arrows-and-boxes`.
 *
 * An arrow is one anchor for a whole array. Its wire is stroked in the colour
 * of a plain axis wire and heavier than one, and it carries a direction
 * triangle, as a datatype wire does. A composed gap carries its label, which is
 * the array's shape above the wire and its datatype below it, as
 * `arrowLabels.ts` writes and places them.
 *
 * `ArrowRenderer` answers `display_lone` and `display_prod_object` with arrows,
 * so every composition, product, rearrangement, block, spread and multiline row
 * that the generic `CategoryRenderer` code builds carries one arrow per array.
 * A `Broadcasted` is drawn by the ordinary `bb.BroadcastedBox`, built by the
 * `bb.BroadcastedRenderer` the arrow renderer holds, because an operator such
 * as an `Einops` has no figure apart from the anchors of the axes it reads.
 * `ArrowCappedBox` stands a column of arrows on either side of that box, and
 * each arrow opens into the wires of its array's axes. It stands the box on a
 * plate, writes on the plate the name given by `plateNames.ts`, which the box
 * form writes over its box as well, and names the axes where they enter and
 * leave the box.
 *
 * An elementwise map is drawn by a rule of its own. The axis form writes its
 * name between two small heads, and `ElementwiseArrowBox` writes the name and
 * the heads on one arrow that runs straight through the map.
 *
 * A tape reaches an arrow. `ArrowParaCategoryRenderer` draws a `ParaWrap` over
 * a `Broadcasted` with every array of the operator in the columns of its box,
 * and `pwd.ParaWrapBox` bends the tape of each taped array into the array's
 * arrow along a level leg that carries the arrow's label. Every other grab and
 * drop is drawn with its tapes running to the arrows of the wrap's own columns.
 */
import * as rh from '../../Render/RenderHandler';
import * as rhs from '../../Render/RenderHandlerSettings';
import * as dhd from '../../Render/DrawHandler';
import * as travelDirection from '../../Render/travelDirection';
import * as cat from '../../../data_structure/Category';
import * as ops from '../../../data_structure/Operators';
import * as pwt from '../../../para/data_structure/ParaWrap';
import * as cr from '../CategoryRenderer';
import * as crs from '../CategoryRendererSettings';
import * as bb from '../BroadcastedCategoryRenderer';
import * as aob from '../Operations/additionalOperationBoxes';
import * as scr from '../StrideCategoryRenderer';
import * as para from '../para/ParaCategoryRenderer';
import * as pwd from '../para/ParaWrapDisplay';
import * as ut from '../../../utilities/utilities';
import * as pt from '../../../utilities/Point';
import * as Curve from '../../../utilities/Curve';
import * as arrow_labels from './arrowLabels';
import * as plate_names from './plateNames';

export function establish(): void {
    console.log("Loaded the arrow display.");
}

/* The colour an arrow's wire is stroked in, which is the colour of a plain
 * axis wire. The theme draws black in the foreground colour. */
const PLAIN_LINE_COLOR = 'black';

/* How many straight steps draw each quarter turn of a rounded corner. */
const ROUNDED_CORNER_STEPS = 6;

/*
 * The outline of `rect` with its corners rounded to `radius`, in the form
 * `deltaPolygon` reads: the first point absolute and each later one a step
 * from the one before. The draw handler has no rounded rectangle, so each
 * corner is a quarter turn drawn in `ROUNDED_CORNER_STEPS` steps, clockwise
 * from the top edge. A radius larger than half a side is cut to it.
 */
function rounded_rectangle(rect: pt.Rectangle, radius: number): pt.Point[] {
    const round = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
    const corners = [
        {x: rect.right - round, y: rect.top + round, first_angle: -Math.PI / 2},
        {x: rect.right - round, y: rect.bottom - round, first_angle: 0},
        {x: rect.left + round, y: rect.bottom - round, first_angle: Math.PI / 2},
        {x: rect.left + round, y: rect.top + round, first_angle: Math.PI},
    ];
    const outline = corners.flatMap(({x, y, first_angle}) =>
        ut.range(ROUNDED_CORNER_STEPS + 1).map((step) => {
            const angle = first_angle + Math.PI / 2 * step / ROUNDED_CORNER_STEPS;
            return {x: x + round * Math.cos(angle), y: y + round * Math.sin(angle)};
        }));
    return outline.map((point, i) => i === 0 ? point : {
        x: point.x - outline[i - 1].x,
        y: point.y - outline[i - 1].y,
    });
}

/*
 * The plate an operator stands on, a rounded rectangle over `rect` on the
 * background layer, so that the operator's wires and glyph stand on it. The
 * fill is `arrow_plate_color` with the `tint` role, which the theme blends
 * into its surface at `arrow_plate_tint` in each mode, and the drop shadow is
 * the one an operator's glyph carries, which the theme draws in light mode
 * alone. The plate draws no outline. `ArrowCappedBox` stands an operator's box
 * on one, and `OperatorFaceBox` of the box form is drawn as one.
 */
export function draw_operator_plate(
    draw: dhd.DrawHandler<any> | undefined,
    rect: pt.Rectangle,
    settings: crs.ArrowRendererSettings<any, any>,
): dhd.DrawElement | undefined {
    return draw?.deltaPolygon(
        rounded_rectangle(rect, settings.arrow_plate_radius),
        {
            fill: settings.arrow_plate_color,
            fillRole: 'tint',
            surfaceTint: settings.arrow_plate_tint,
            stroke: 'none',
            'stroke-width': '0',
        },
        {dropShadow: true},
        'background');
}

type WireLayer = 'main' | 'broadcast';

/* The deltas of an arrow's direction triangle, which is the triangle of a
 * datatype wire drawn `scale` times as large, in the form `deltaPolygon`
 * reads before it is turned onto the wire. */
function arrowhead_deltas(scale: number): pt.Point[] {
    return bb.DATATYPE_TRIANGLE_DELTAS.map(
        (delta) => ({x: delta.x * scale, y: delta.y * scale}));
}

/* The anchors of a column of an operator's box whose names are written beside
 * the column, which are the anchors that answer `annotate_in_gap` and
 * `names_itself_in_gap`. A separator is never named. */
function anchors_named_beside<T>(column: cr.Meridian<T>): cr.Anchor<T>[] {
    return column.anchors.filter((anchor) =>
        !(anchor instanceof cr.SeparatorAnchor)
        && anchor.annotate_in_gap && anchor.names_itself_in_gap);
}

/* The width the widest name `anchors` write takes, measured bare and counting
 * the inset an anchor asks its name to begin at, and nothing where they write
 * none. */
function widest_name<T>(anchors: readonly cr.Anchor<T>[]): number {
    return Math.max(0, ...anchors.flatMap((anchor) => anchor.gap_annotations()
        .map(({annotation}) =>
            anchor.gap_label_inset + annotation.estimated_bare_text_width())));
}

/*
 * A halo under a wire `anchor` draws, lit while any of `tokens` is, as
 * `scr.AxisAnchor` draws one under an axis wire. Where the axes of the figure
 * answer the pointer, resting the pointer on the halo sets every one of
 * `tokens`, from `source`.
 */
function draw_lit_halo(
    anchor: cr.Anchor<unknown>,
    curve: Curve.Curve,
    attributes: Partial<dhd.LineAttrs>,
    tokens: readonly string[],
    layer: WireLayer,
    source: string,
): void {
    const renderHandler = anchor.renderHandler;
    if (tokens.length === 0 || !rhs.draws_axis_halos(renderHandler.settings)) {
        return;
    }
    const halo = cr.draw_wire_halo(
        anchor.draw, curve, attributes, anchor.settings.axis_halo_extra_width, layer);
    cr.link_halo(renderHandler, halo, tokens, anchor.settings.halo_opacity);
    if (halo === undefined || !rhs.axes_answer_the_pointer(renderHandler.settings)) {
        return;
    }
    anchor.events?.addHover(
        halo,
        () => tokens.forEach(
            (token) => renderHandler.set_highlight(token, source, true)),
        () => tokens.forEach(
            (token) => renderHandler.set_highlight(token, source, false)));
}

/*
 * Link `from` to `to` where the two anchors carry labels of different types.
 *
 * An arrow carries a whole array and an anchor of the box it opens into
 * carries one axis or one datatype, while `anchor_link` joins two anchors of
 * one label type. A link records the two anchors and reads nothing of what
 * they carry, so each is taken here as an anchor of an unknown label.
 */
function link_across_label_types(
    from: cr.Anchor<unknown>,
    to: cr.Anchor<unknown>,
): void {
    from.anchor_link(to);
}

/*
 * Move `anchor` along its row to the mean x of `targets`, as
 * `cr.align_anchor_height` moves an anchor in a column to their mean height,
 * and leave it where it stands when there are none.
 */
function align_anchor_across(
    anchor: cr.Anchor<unknown>,
    targets: readonly cr.Anchor<unknown>[],
): void {
    const xs = targets
        .map((target) => target.location()?.x)
        .filter((x): x is number => x !== undefined);
    const own = anchor.location();
    if (!xs.length || own === undefined) {
        return;
    }
    anchor.transform.offset = {x: ut.sum(xs) / xs.length - own.x, y: 0};
}

/*
 * Move `arrow` to the middle of the anchors of `fan` that draw a wire, once
 * they are placed, so the fan opens evenly from the arrow. An arrow in a column
 * moves to their mean height and an arrow on a row to their mean x.
 */
function centre_arrow_on_its_fan(
    arrow: cr.Anchor<unknown>,
    fan: readonly cr.Anchor<unknown>[],
): void {
    const drawn = fan.filter((anchor) => anchor.draws_wire());
    if (arrow.horizontal) {
        align_anchor_across(arrow, drawn);
    } else {
        cr.align_anchor_height(arrow, drawn);
    }
}

/*
 * The seed reindexings `reindexing` is built from. A reindexing node draws each
 * one as a pentagon or a hexagon that carries its name.
 */
export function seed_reindexings<A extends cat.Axis>(
    reindexing: cat.StrideCategory<A>,
): cat.StrideMorphism<A>[] {
    if (reindexing instanceof cat.StrideMorphism) {
        return [reindexing];
    }
    if (reindexing instanceof cat.Composed
        || reindexing instanceof cat.ProductOfMorphisms) {
        return reindexing.content.flatMap(
            (part: cat.StrideCategory<A>) => seed_reindexings(part));
    }
    if (reindexing instanceof cat.Block) {
        return seed_reindexings(reindexing.body);
    }
    return [];
}

/*
 * Whether a reindexing node of the box of `target` writes `name`, which it
 * does where one of the seed reindexings of `target` carries that name. The
 * node of a `View` is the whole of its figure, and it carries the name the
 * `View` was given where the reindexing was named alike.
 */
function node_writes_name<B extends cat.Datatype, A extends cat.Axis>(
    target: cat.Broadcasted<B, A>,
    name: string,
): boolean {
    return target.reindexings.flatMap(
        (reindexing: cat.StrideCategory<A>) => seed_reindexings(reindexing))
        .some((reindexing) => reindexing.name?.to_latex() === name);
}

/*
 * One array drawn as one wire.
 *
 * A wire from one arrow to another is a segment of the run that carries the
 * array from one operator to the next, and it is lit by every axis of the
 * array. A run continues through every arrow that one arrow's wire reaches and
 * one wire leaves for one other arrow, which is an arrow in a column of a
 * spread, at the edge of a block or at the edge of a multiline row, so a run
 * holds a segment for each such column it crosses. The longest segment of a
 * run carries the run's direction triangle, as a datatype wire carries one,
 * and the other segments carry none. The triangle stands half way along the
 * stretch of the segment that the arrow's label leaves free, which is the
 * whole segment where the gap holds no label. A run that passes through an
 * elementwise map carries no triangle, because the heads `ElementwiseArrowBox`
 * draws either side of the map's name mark the direction of the run.
 *
 * An arrow's wire is stroked heavier than an axis wire, and its triangle is
 * the triangle of a datatype wire drawn larger, so that it reads as a head on
 * the heavier line.
 *
 * A wire from an arrow to an anchor of an operator's box is one branch of the
 * fan in which the arrow opens into its array's axes. The branch is the start
 * of the wire of the anchor it reaches, so it is stroked as that wire is. It
 * carries no triangle, and its halo is lit by the one axis it reaches.
 *
 * The anchor draws its dot and its wires in `update` and does not call
 * `cr.Anchor.update`, so the dot a `Rearrangement` asks for through `add_dot`
 * is recorded here.
 */
export class ArrayArrowAnchor<B extends cat.Datatype, A extends cat.Axis>
    extends cr.Anchor<cat.Array<B, A>> {
    private shape_annotation?: rh.AnnotationElement;
    private datatype_line?: rh.AnnotationElement;
    private datatype_color?: string;
    private dot_requested: boolean = false;
    /* How many wires this anchor has drawn, which names the source each
     * wire's hover sets its highlights from. */
    private drawn_wires: number = 0;
    /* Whether the wire this arrow draws runs through an elementwise map to the
     * arrow on the map's other side. `ElementwiseArrowBox` sets it on the
     * map's operand, and on the map's result where the map is drawn mirrored,
     * because the wire is drawn from the arrow on its left. */
    public runs_through_a_map: boolean = false;

    constructor(
        public categoryRenderer: ArrowRenderer<B, A>,
        public target: cat.Array<B, A>,
    ) {
        super(categoryRenderer);
        this.curve_attributes = {
            stroke: PLAIN_LINE_COLOR,
            'stroke-width': `${this.settings.arrow_stroke_width}px`,
        };
        this.setBorderColor('purple');
    }

    get settings(): crs.ArrowRendererSettings<B, A> {
        return this.categoryRenderer.settings;
    }

    set add_dot(value: boolean) {
        this.dot_requested = value;
    }

    protected dot_attributes(): Partial<dhd.CircleAttrs> {
        return {
            fill: PLAIN_LINE_COLOR,
            stroke: PLAIN_LINE_COLOR,
            radius: this.settings.arrow_dot_radius,
        };
    }

    /* The shape the label writes above the wire, `[q,\ d]`, and nothing for an
     * array with no axes. */
    public shape_label(): string {
        return arrow_labels.array_shape_label(this.categoryRenderer, this.target);
    }

    /* The datatype the label writes below the wire, which is the array's
     * quantisation where it carries one and `\mathbb{R}` otherwise. */
    public datatype_label(): string {
        return arrow_labels.array_datatype_label(this.target);
    }

    /* The line of the label above the wire, which is the shape, and nothing for
     * an array with no axes. */
    public getAnnotation(): rh.AnnotationElement | undefined {
        const shape = this.shape_label();
        if (shape === '') {
            return undefined;
        }
        this.shape_annotation ??= arrow_labels.arrow_label_line(this.renderHandler, shape);
        return this.shape_annotation;
    }

    /* The line of the label below the wire, which is the datatype, in the
     * colour `write_datatype_in` asked for. */
    public datatype_annotation(): rh.AnnotationElement {
        if (this.datatype_line === undefined) {
            this.datatype_line = arrow_labels.arrow_label_line(
                this.renderHandler, this.datatype_label());
            if (this.datatype_color !== undefined) {
                this.datatype_line.annotationSettings.color = this.datatype_color;
            }
        }
        return this.datatype_line;
    }

    /*
     * Write the datatype below the wire in `color`. A conversion drawn thin
     * writes its result's format in `thin_cast_label_color`, as the axis form
     * writes it, so the colour marks where a value is rounded.
     */
    public write_datatype_in(color: string): void {
        this.datatype_color = color;
        if (this.datatype_line !== undefined) {
            this.datatype_line.annotationSettings.color = color;
        }
    }

    /*
     * The two lines of the label, the shape above the wire and the datatype
     * below it, and the annotations a box has hung off this anchor. A gap that
     * shows the label is as wide as `label_width`, and an anchor that does not
     * name itself in a gap carries its hung annotations alone.
     * `arrowLabels.rest_arrow_label_on_wire` rests the same lines on any other
     * stretch of the wire.
     */
    public gap_annotations(): cr.AnchorAnnotation[] {
        if (!this.names_itself_in_gap) {
            return [...this.auxiliary_annotations];
        }
        const minimum_gap_width = this.label_width();
        const shape = this.getAnnotation();
        return [
            ...(shape === undefined ? [] : [{
                annotation: shape, minimum_gap_width, rows: 1,
            }]),
            {
                annotation: this.datatype_annotation(), minimum_gap_width, rows: 1,
                placement: 'below',
                wire_clearance: this.settings.arrow_datatype_clearance,
            },
            ...this.auxiliary_annotations,
        ];
    }

    /*
     * How wide a composed gap has to be to hold the label and, beyond it, the
     * direction triangle. The label hangs off the gap's left edge, and the
     * triangle stands half way along the stretch beyond the label and its
     * clearance, which holds two triangles.
     */
    public label_width(): number {
        return this.label_room() + 2 * this.head_length();
    }

    /* The length of this arrow's direction triangle along its wire, in px. */
    private head_length(): number {
        return this.settings.arrow_head_scale
            * bb.DATATYPE_TRIANGLE_SHORTEST_WIRE / 2;
    }

    /*
     * The width the wider line of the label, the inset it starts at and its
     * clearance take from the left edge of the gap that shows it.
     */
    private label_room(): number {
        const lines = [this.getAnnotation(), this.datatype_annotation()]
            .filter((line): line is rh.AnnotationElement => line !== undefined);
        return this.gap_label_inset
            + Math.max(...lines.map((line) => line.estimated_bare_text_width()))
            + this.settings.arrow_label_clearance;
    }

    /*
     * Whether the composed gap to the right of this anchor shows its label,
     * read as `cr.ComposedGap.select_annotations` reads it for the anchor at a
     * gap's left edge. A gap after a rearrangement names nothing unless the
     * settings ask it to.
     */
    private shows_label_in_gap(): boolean {
        return this.names_itself_in_gap && this.annotate_in_gap
            && !(this.rearranged && !this.settings.annotate_after_rearrangement);
    }

    update(): void {
        if (this.skipped() || !this.draws_wire()) {
            return;
        }
        if (this.draws_meeting_dot
            && (this.dot_requested || this.forks_into_several_arrows())) {
            this.draw?.circle(this.rectangle().midpoint(), this.dot_attributes());
        }
        for (const {anchor: next, layer} of this.painted_connections()) {
            this.draw_wire_to(next, layer);
        }
    }

    /* The connections of `wire_connections` whose two ends both paint, which
     * are the ones `cr.Anchor.update` draws. */
    private painted_connections(
    ): {anchor: cr.Anchor<cat.Array<B, A>>; layer: WireLayer}[] {
        return this.paints_wires
            ? this.wire_connections().filter(({anchor}) => anchor.paints_wires)
            : [];
    }

    /*
     * Whether the wires at this anchor part for several arrows or meet from
     * several, which is what a `Rearrangement` copying an array draws. The
     * branches of a fan reach the anchors of an operator's box and are not
     * counted, so no dot is drawn where an arrow opens into its axes.
     */
    private forks_into_several_arrows(): boolean {
        const arrows = (anchors: cr.Anchor<cat.Array<B, A>>[]): number =>
            anchors.filter((anchor) => anchor instanceof ArrayArrowAnchor).length;
        return arrows(this.next_terminal()) > 1 || arrows(this.prior_terminal()) > 1;
    }

    /*
     * The arrow the run through this anchor continues to, where exactly one
     * arrow's wire reaches this anchor and one wire leaves it for exactly one
     * other arrow, and nothing where the run ends here. A run ends at an arrow
     * that opens into an operator's axes, at an arrow the axes of a result
     * close into, at the edge of a figure and where a wire forks.
     */
    public run_continues_to(): ArrayArrowAnchor<B, A> | undefined {
        const prior = this.prior_terminal();
        const next = this.next_terminal();
        const passes_through = prior.length === 1 && next.length === 1
            && prior[0] instanceof ArrayArrowAnchor
            && next[0] instanceof ArrayArrowAnchor;
        return passes_through ? next[0] as ArrayArrowAnchor<B, A> : undefined;
    }

    /*
     * Whether the wire from this anchor to `next` is the longest segment of
     * its run, which is the segment that carries the run's direction triangle.
     * A segment is measured from one end to the other, and the first of two
     * equal segments carries the triangle. No segment of a run that passes
     * through an elementwise map carries one.
     */
    private carries_run_triangle(next: ArrayArrowAnchor<B, A>): boolean {
        const before: ArrayArrowAnchor<B, A>[] = [];
        const visited = new Set<ArrayArrowAnchor<B, A>>([this, next]);
        let first: ArrayArrowAnchor<B, A> = this;
        while (first.run_continues_to() !== undefined) {
            const prior = first.prior_terminal()[0] as ArrayArrowAnchor<B, A>;
            if (visited.has(prior)) {
                break;
            }
            visited.add(prior);
            before.unshift(prior);
            first = prior;
        }
        const after: ArrayArrowAnchor<B, A>[] = [];
        let onwards = next.run_continues_to();
        while (onwards !== undefined && !visited.has(onwards)) {
            visited.add(onwards);
            after.push(onwards);
            onwards = onwards.run_continues_to();
        }
        const run = [...before, this, next, ...after];
        if (run.slice(0, -1).some((arrow) => arrow.runs_through_a_map)) {
            return false;
        }
        const lengths = run.slice(1).map((end, i) => {
            const [from, to] = [run[i].location(), end.location()];
            return from && to ? Math.hypot(to.x - from.x, to.y - from.y) : 0;
        });
        return lengths.indexOf(Math.max(...lengths)) === before.length;
    }

    /*
     * The wire from this anchor at `start` to `next` at `end`.
     *
     * A wire from one arrow in a column to the next runs level under the line
     * of this arrow's label that stands on the side it turns towards, which is
     * the datatype below the wire for a wire that falls and the shape above it
     * for one that climbs, and bends to `next` beyond it. Neither line then
     * meets the wire, and each branch of a fork runs level until it parts from
     * the others. A wire whose bend moves less than
     * `arrow_label_wire_tolerance` under the end of that line bends across the
     * whole gap, as every other wire does, because a short bend beyond the
     * label reads as a hook. A narrow gap keeps the bend at least as wide as
     * the height it crosses, and at least two triangles wide, so the level
     * stretch is cut short there rather than the bend drawn as a drop. Every
     * other wire is `cr.wire_curve`.
     */
    private wire_curve_to(
        next: cr.Anchor<cat.Array<B, A>>,
        start: pt.Point,
        end: pt.Point,
    ): Curve.Curve {
        const bend = (from: pt.Point): Curve.Curve => cr.wire_curve(
            from, end, this.horizontal, next.horizontal, this.settings.turn_radius);
        const across_the_gap = bend(start);
        const runs_level_under_label = next instanceof ArrayArrowAnchor
            && !this.horizontal && !next.horizontal && this.shows_label_in_gap()
            && end.x > start.x;
        if (!runs_level_under_label) {
            return across_the_gap;
        }
        const line_turned_towards = end.y > start.y
            ? this.datatype_annotation() : this.getAnnotation();
        const line_end = line_turned_towards === undefined ? 0
            : this.gap_label_inset + line_turned_towards.estimated_bare_text_width()
                + this.settings.arrow_label_clearance;
        const moved_under_line = Math.abs(across_the_gap.y(
            Math.min(start.x + line_end, end.x)).y - start.y);
        if (moved_under_line < this.settings.arrow_label_wire_tolerance) {
            return across_the_gap;
        }
        const least_bend = Math.max(2 * this.head_length(), Math.abs(end.y - start.y));
        const level = Math.min(line_end, end.x - start.x - least_bend);
        if (level <= 0) {
            return across_the_gap;
        }
        const bend_start = {x: start.x + level, y: start.y};
        return new Curve.CurveSequence(
            [new Curve.StraightLine(start, bend_start), bend(bend_start)]);
    }

    private draw_wire_to(next: cr.Anchor<cat.Array<B, A>>, layer: WireLayer): void {
        const start = this.location()!;
        const end = next.location()!;
        const curve = this.wire_curve_to(next, start, end);
        const attributes = next instanceof ArrayArrowAnchor
            ? {...this.curve_attributes} : next.wire_attributes();
        this.drawn_wires += 1;
        draw_lit_halo(
            this, curve, attributes, this.halo_tokens(next), layer,
            `${this.diagram_id}:wire:${this.drawn_wires}`);
        this.draw?.curve(curve, attributes, undefined, layer);
        if (next instanceof ArrayArrowAnchor && this.carries_run_triangle(next)) {
            this.draw_direction_triangle(curve, start, end, next, layer);
        }
    }

    /*
     * The highlights that light the halo of the wire from this anchor to
     * `next`. A wire to another arrow carries the whole array, so every axis of
     * the array lights it. A branch of a fan carries the axis of the anchor it
     * reaches, whether it reaches it directly or through a relay, and a branch
     * to a datatype anchor carries no axis.
     */
    private halo_tokens(next: cr.Anchor<unknown>): string[] {
        if (next instanceof ArrayArrowAnchor) {
            return this.target._shape.map(
                (axis) => scr.axis_highlight_token(axis.uid._id));
        }
        const reached = next instanceof FanRelayAnchor ? next.reached : next;
        return reached instanceof scr.AxisAnchor ? [reached.highlight_token()] : [];
    }

    /*
     * The triangle on a wire to another arrow, drawn as `bb.DatatypeAnchor`
     * draws the one on a datatype wire at `arrow_head_scale` times its size,
     * with its tip half way along the stretch of the wire that the label
     * leaves free. It points the way the array travels, which is right to left
     * along a wire whose two ends are drawn mirrored. A wire shorter than two
     * triangles carries none.
     */
    private draw_direction_triangle(
        curve: Curve.Curve,
        start: pt.Point,
        end: pt.Point,
        next: ArrayArrowAnchor<B, A>,
        layer: WireLayer,
    ): void {
        if (Math.hypot(end.x - start.x, end.y - start.y) < 2 * this.head_length()) {
            return;
        }
        const direction = travelDirection.wire_travel_direction(this, next);
        const mark = this.horizontal === next.horizontal
            ? this.mark_beyond_label(curve, start, end, direction)
            : bb.turning_wire_direction_mark(curve, direction);
        if (mark === undefined) {
            return;
        }
        this.draw?.deltaPolygon(
            [mark.point, ...pt.Point.rotate(
                arrowhead_deltas(this.settings.arrow_head_scale), mark.angle)],
            {stroke: 'none', fill: this.curve_attributes.stroke},
            undefined, layer);
    }

    /*
     * The point half way along the stretch of a flat wire from `start` to
     * `end` that the label leaves free, and the direction there in which the
     * array travels in `direction`. A wire spanning no width is marked at its
     * middle, since a curve is sampled by x.
     */
    private mark_beyond_label(
        curve: Curve.Curve,
        start: pt.Point,
        end: pt.Point,
        direction: travelDirection.TravelDirection,
    ): {point: pt.Point, angle: number} {
        const span = end.x - start.x;
        if (span <= 0) {
            return bb.level_wire_direction_mark(curve, direction);
        }
        const label = this.shows_label_in_gap()
            ? Math.min(this.label_room(), span) : 0;
        const x = start.x + label + (span - label) / 2;
        return {
            point: curve.y(x),
            angle: travelDirection.angle_of_travel(curve.angle(x), direction),
        };
    }
}

/* The rows the label of an arrow takes about its wire, which are the shape's
 * row above the wire and the datatype's row below it. */
export const ARROW_LABEL_ROWS = 2;

/* The room the wires of `array` take in a column of the all-broadcasted form,
 * which is one anchor height per axis, and never less than the
 * `ARROW_LABEL_ROWS` the arrow's label takes. */
export function room_of_array_wires<B extends cat.Datatype, A extends cat.Axis>(
    array: cat.Array<B, A>,
    settings: crs.ArrowRendererSettings<B, A>,
): number {
    return Math.max(ARROW_LABEL_ROWS, array._shape.length) * settings.anchor_height;
}

/*
 * The place of one array in a column, holding the array's one arrow in the
 * middle of the room the array's wires take in the axis form, which is one
 * anchor height per axis and never less than the two rows of the arrow's
 * label.
 *
 * A column of arrows then stands as the axis form's column stands, less its
 * separators. An arrow at a row's edge stands near the middle of the
 * operator's wires it leads to, so the wire between the two bends little under
 * the labels of the gap it crosses. The shape above one arrow and the
 * datatype below the arrow over it take a row each, so an array of one axis or
 * of none takes two rows, one more than its wires, and the column of an
 * `ArrowCappedBox` is taller than the column of the box inside it only there.
 *
 * A column of the box form stands its arrows evenly down the edge of an
 * operator's box, and gives each place the `height` of an equal share of that
 * edge in place of the room of the array's wires.
 */
export class ArrayArrowMeridian<B extends cat.Datatype, A extends cat.Axis>
    extends cr.Meridian<cat.Array<B, A>> {
    public arrow: ArrayArrowAnchor<B, A>;
    constructor(
        public categoryRenderer: ArrowRenderer<B, A>,
        public target: cat.Array<B, A>,
        height: number = room_of_array_wires(target, categoryRenderer.settings),
    ) {
        super(categoryRenderer);
        this.arrow = new ArrayArrowAnchor(categoryRenderer, target);
        const room_either_side = Math.max(
            0, (height - this.settings.anchor_height) / 2);
        this.children = [new rh.Vertical(this.renderHandler, [
            new rh.CoreElement(this.renderHandler, {x: 0, y: room_either_side}),
            this.arrow,
            new rh.CoreElement(this.renderHandler, {x: 0, y: room_either_side}),
        ])];
        this.anchors = [this.arrow];
    }
}

/*
 * The point at which one branch of a fan stops bending towards its arrow and
 * runs level into the anchor of the operator's box it reaches.
 *
 * The branches of a fan bend between the arrow and the heights of the anchors
 * they reach, and a name resting on its wire where the wire bends meets the
 * bend. A relay stands at the height of the anchor it reaches, as far from the
 * column as the names beside the column need, so the branch runs level past
 * the name and bends beyond it. A relay draws the wire it holds as the wire of
 * the anchor it reaches is drawn, with that anchor's halo.
 */
export class FanRelayAnchor<B extends cat.Datatype, A extends cat.Axis>
    extends cr.Anchor<cat.Array<B, A>> {
    constructor(
        public categoryRenderer: ArrowRenderer<B, A>,
        public reached: cr.Anchor<unknown>,
    ) {
        super(categoryRenderer);
        this.allow_skip = false;
        this.setBorderColor('orange');
    }

    public wire_attributes(): Partial<dhd.LineAttrs> {
        return this.reached.wire_attributes();
    }

    /* The highlights that light a wire through this relay, which is the axis of
     * the anchor it reaches, and none for a datatype anchor. */
    public highlight_tokens(): string[] {
        return this.reached instanceof scr.AxisAnchor
            ? [this.reached.highlight_token()] : [];
    }

    protected draw_wire(
        curve: Curve.Curve,
        layer: WireLayer,
    ): dhd.DrawElement | undefined {
        const attributes = this.wire_attributes();
        draw_lit_halo(
            this, curve, attributes, this.highlight_tokens(), layer,
            `${this.diagram_id}:wire`);
        return this.draw?.curve(curve, attributes, undefined, layer);
    }
}

/*
 * A `Broadcasted` drawn as the axis form draws it, between two columns of
 * arrows.
 *
 * The box in the middle is the `bb.BroadcastedBox` the broadcasted renderer
 * builds, with every glyph, cup, degree wire and reindexing node it draws under
 * `all-broadcasted`. Each operand's arrow is linked to every anchor of that operand's
 * array in the inner box, which is the array's axis anchors and its datatype
 * anchor, so the arrow opens into the wires of its axes across a fan room.
 * Every anchor of a result's array in the inner box is linked to that result's
 * arrow, so the axes close into it.
 *
 * The axes are named where they enter and leave the operator. Every anchor of
 * the inner box's two columns that names itself in a gap has its names rested
 * on its wire beside the column, as a composed gap rests them. Each branch of a
 * fan passes through a `FanRelayAnchor` at the height of the anchor it
 * reaches and runs level from the relay to the column, so a name stands on a
 * level stretch of its wire. A fan room is the stretch the names need and,
 * beyond the relays, `arrow_fan_width` in which the branches bend to the
 * arrow. A name therefore ends short of the arrow and of the arrow's own
 * label, which stands in the composed gap beyond the arrow.
 *
 * The inner box stands on a plate, a rounded rectangle reaching
 * `arrow_plate_padding` past it on the background layer, filled and shadowed
 * as an operator's glyph is. Each operator then reads as a surface in a
 * figure whose wires between operators are arrows. The fan rooms stand
 * outside the plate, and the axis wires run onto it at the inner box's
 * columns. An operator that is a `BlockOperator` is drawn as a titled box
 * already and stands on no plate.
 *
 * The plate carries the name given by `plateNames.written_plate_label`, in the
 * small type of a block's title, centred over the inner box, and the box form
 * writes the same name over its box. The name is the operator's plate name
 * where its class registers one, and its own name otherwise, and it is left
 * off where the inner box writes it already. A glyph that writes the
 * operator's own name reports so through `bb.OperationBox.names_itself`, and a
 * reindexing node writes the name carried by its reindexing, as the node of a
 * `View` does. The inner box and the name stand in a
 * `plateNames.PlateNameStack`, and the plate grows to hold the name. The stack
 * keeps the inner box and the arrows either side of it where they stand with
 * no name.
 *
 * A `ParaWrap` over the operator keeps every operand and every result in the
 * two columns, and `pwd.ParaWrapBox` bends the tape of a taped array into its
 * arrow there.
 *
 * The separators of the inner box's columns paint no wire. Under
 * `all-broadcasted` the
 * dashed line of a separator crosses the gap before the box and runs on to the
 * glyph. The arrow form draws no separator in a gap, because one arrow is
 * already one array, and the stub from the column to the glyph would be all
 * that is left of the line.
 *
 * The arrows are pinned with `allow_skip`, because a skipped arrow would pass
 * the wire arriving at it on to the anchors of its fan, and the gap before the
 * box would then hold the fan in place of the arrow.
 */
export class ArrowCappedBox<B extends cat.Datatype, A extends cat.Axis>
    extends cr.MorphismBox<cat.Array<B, A>, cat.Broadcasted<B, A>, cat.Array<B, A>> {
    public left_anchors: cr.ProdObjectMeridian<cat.Array<B, A>, cat.Array<B, A>>;
    public right_anchors: cr.ProdObjectMeridian<cat.Array<B, A>, cat.Array<B, A>>;
    /* The arrow of each operand and of each result, in the operator's order.
     * `left_anchors` and `right_anchors` name the two columns by the side they
     * are drawn on, which a mirror exchanges. */
    public operand_arrows: ArrayArrowAnchor<B, A>[];
    public result_arrows: ArrayArrowAnchor<B, A>[];
    /* The inner box with the plate's name above it. */
    private inner_box_and_name: plate_names.PlateNameStack;
    /* The name carried by the plate, where it carries one. */
    public plate_label?: rh.AnnotationElement;
    /* The rooms in which the operands' arrows open and the results' arrows
     * close. A mirror carries each with the column it stands beside. */
    public operand_fan_room: rh.Horizontal;
    public result_fan_room: rh.Horizontal;
    /* The relay through which each anchor of the inner box's two columns is
     * reached. */
    private relays: Map<cr.Anchor<unknown>, FanRelayAnchor<B, A>> = new Map();

    constructor(
        public categoryRenderer: ArrowRenderer<B, A>,
        public target: cat.Broadcasted<B, A>,
        public inner_box: bb.BroadcastedBox<B, A>,
    ) {
        super(categoryRenderer, target);
        const operands = inner_box.target.dom().map(
            (array) => categoryRenderer.display_lone(array));
        const results = inner_box.target.cod().map(
            (array) => categoryRenderer.display_lone(array));
        this.operand_arrows = operands.map((meridian) => meridian.arrow);
        this.result_arrows = results.map((meridian) => meridian.arrow);
        this.left_anchors = new cr.ProdObjectMeridian(categoryRenderer, operands);
        this.right_anchors = new cr.ProdObjectMeridian(categoryRenderer, results);
        const operand_relays = this.link_operand_fans(inner_box.input_meridians);
        const result_relays = this.link_result_fans(inner_box.output_meridians);
        [...this.operand_arrows, ...this.result_arrows].forEach((arrow) => {
            arrow.allow_skip = false;
        });
        [...inner_box.left_anchors.anchors, ...inner_box.right_anchors.anchors]
            .filter((anchor) => anchor instanceof cr.SeparatorAnchor)
            .forEach((separator) => {
                separator.paints_wires = false;
            });
        this.plate_label = this.label_for_plate();
        this.mark_written_datatypes();
        this.register_plate_region();
        this.inner_box_and_name = new plate_names.PlateNameStack(
            this.renderHandler, inner_box, this.plate_label);
        this.operand_fan_room = new rh.Horizontal(this.renderHandler, [
            this.bend_room(),
            new rh.Vertical(this.renderHandler, operand_relays),
            this.name_stretch(inner_box.left_anchors),
        ]);
        this.result_fan_room = new rh.Horizontal(this.renderHandler, [
            this.name_stretch(inner_box.right_anchors),
            new rh.Vertical(this.renderHandler, result_relays),
            this.bend_room(),
        ]);
        this.children = [
            this.left_anchors,
            this.operand_fan_room,
            this.inner_box_and_name,
            this.result_fan_room,
            this.right_anchors,
        ];
        this.setBorderColor('purple');
    }

    get settings(): crs.ArrowRendererSettings<B, A> {
        return this.categoryRenderer.settings;
    }

    /* Link each operand's arrow to the anchors of its array in the inner box,
     * each through a relay. The relays come back in the column's order. */
    private link_operand_fans(
        meridians: bb.ArrayMeridian<B, A>[],
    ): FanRelayAnchor<B, A>[] {
        return ut.zip(this.operand_arrows, meridians).flatMap(
            ([arrow, meridian]) => meridian.anchors.map((anchor) => {
                const relay = this.relay_for(anchor);
                link_across_label_types(arrow, relay);
                link_across_label_types(relay, anchor);
                return relay;
            }));
    }

    /* Link the anchors of each result's array in the inner box to the result's
     * arrow, each through a relay. The relays come back in the column's
     * order. */
    private link_result_fans(
        meridians: bb.ArrayMeridian<B, A>[],
    ): FanRelayAnchor<B, A>[] {
        return ut.zip(meridians, this.result_arrows).flatMap(
            ([meridian, arrow]) => meridian.anchors.map((anchor) => {
                const relay = this.relay_for(anchor);
                link_across_label_types(anchor, relay);
                link_across_label_types(relay, arrow);
                return relay;
            }));
    }

    private relay_for(reached: cr.Anchor<unknown>): FanRelayAnchor<B, A> {
        const relay = new FanRelayAnchor(this.categoryRenderer, reached);
        this.relays.set(reached, relay);
        return relay;
    }

    /* The room between an arrow and its relays, in which the branches of the
     * fan bend. */
    private bend_room(): rh.CoreElement {
        return new rh.CoreElement(
            this.renderHandler, {x: this.settings.arrow_fan_width});
    }

    /*
     * The level stretch between `column` of the inner box and its relays. It
     * holds the widest name written beside the column `axis_name_inset` clear
     * of the column and `arrow_axis_name_clearance` clear of the relays, and it
     * has no width where the column names nothing.
     */
    private name_stretch(column: cr.Meridian<B | A>): rh.CoreElement {
        const widest = widest_name(anchors_named_beside(column));
        return new rh.CoreElement(this.renderHandler, {
            x: widest === 0 ? 0 : this.axis_name_inset() + widest
                + this.settings.arrow_axis_name_clearance,
        });
    }

    /* The least distance between a column of the inner box and a name written
     * beside it, which puts the name clear of the plate. */
    private axis_name_inset(): number {
        return this.settings.arrow_plate_padding
            + this.settings.arrow_axis_name_clearance;
    }

    /* The name carried by the plate, as given by
     * `plateNames.written_plate_label`, and none where there is no plate. */
    private label_for_plate(): rh.AnnotationElement | undefined {
        if (!this.draws_plate()) {
            return undefined;
        }
        return plate_names.written_plate_label(
            this.renderHandler, this.inner_box.target.operator, this.settings,
            (latex) => this.inner_box_writes_name(latex));
    }

    /*
     * Whether the inner box writes `latex` already. The glyph writes the
     * operator's own name where it reports `names_itself`, and a reindexing
     * node writes the name carried by its reindexing.
     */
    private inner_box_writes_name(latex: string): boolean {
        const glyph_writes_name = this.inner_box.op_box.names_itself
            && latex === this.inner_box.target.operator.name?.to_latex();
        return glyph_writes_name || node_writes_name(this.inner_box.target, latex);
    }

    /*
     * Move each relay to the height of the anchor it reaches, and each arrow to
     * the middle of the anchors its fan reaches, once the inner box is placed.
     * The branches then run level from the relays to the columns, and each fan
     * opens evenly from its arrow. `cr.SpreadBox.post_placement` moves the
     * columns of a spread in the same way.
     */
    post_placement(): void {
        super.post_placement();
        this.relays.forEach(
            (relay, reached) => cr.align_anchor_height<unknown>(relay, [reached]));
        ut.zip(this.operand_arrows, this.inner_box.input_meridians).forEach(
            ([arrow, array]) => centre_arrow_on_its_fan(arrow, array.anchors));
        ut.zip(this.result_arrows, this.inner_box.output_meridians).forEach(
            ([arrow, array]) => centre_arrow_on_its_fan(arrow, array.anchors));
    }

    update(): void {
        super.update();
        this.draw_plate();
        this.name_axes_beside_columns();
    }

    /* Whether the inner box stands on a plate. An operator that is a
     * `BlockOperator`, which a `ParaBlockOperator` is as well, is drawn as a
     * titled box already. */
    public draws_plate(): boolean {
        return !(this.inner_box.target.operator instanceof ops.BlockOperator);
    }

    /*
     * Write the datatype below the arrow of each result in the colour the
     * operator's glyph asks for, which `bb.OperationBox.written_datatype_color`
     * gives. A conversion drawn thin asks for `thin_cast_label_color`, and the
     * datatype it wrote then also opens the conversion's inspection box, as the
     * format it wrote does in the axis form.
     */
    private mark_written_datatypes(): void {
        const color = this.inner_box.op_box.written_datatype_color();
        if (color === undefined) {
            return;
        }
        for (const arrow of this.result_arrows) {
            arrow.write_datatype_in(color);
            this.renderHandler.register_term_region(
                arrow.datatype_annotation(), this.inner_box.region_target);
        }
    }

    /*
     * Register the inner box as a region of the operator, so the inspection
     * box of the operator opens wherever the pointer rests on the plate, as it
     * opens over the whole box of the box form. The glyph registers a smaller
     * region of its own, which the pointer reaches first. A conversion drawn
     * thin has no glyph, and its region in the axis form is the label of its
     * result's axes, which this form does not write, so the plate is the one
     * place the pointer opens its box. A `BlockOperator` stands on no plate and
     * is the region of its titled box already.
     */
    private register_plate_region(): void {
        if (this.draws_plate()) {
            this.renderHandler.register_term_region(
                this.inner_box, this.inner_box.region_target);
        }
    }

    /* The plate under the inner box, which `draw_operator_plate` describes. */
    private draw_plate(): void {
        if (!this.draws_plate()) {
            return;
        }
        draw_operator_plate(this.draw, this.plate_rectangle(), this.settings);
    }

    /* The rectangle the plate covers, which reaches `arrow_plate_padding` past
     * the inner box and the room of the plate's name on every side. */
    private plate_rectangle(): pt.Rectangle {
        const padding = this.settings.arrow_plate_padding;
        const label_room = this.inner_box_and_name.label_room;
        const covered: rh.DiagramElement[] = label_room
            ? [this.inner_box, label_room] : [this.inner_box];
        return pt.Rectangle.bounding_rectangle(
            covered.map((element) => element.rectangle()),
        ).pad({x: padding, y: padding});
    }

    /*
     * The names of the axes where they enter and leave the operator, on the
     * level stretch between each column of the inner box and its relays. A name
     * at the left column ends `arrow_axis_name_clearance` short of the
     * rectangle the plate covers, drawn or not, and a name at the right column
     * starts that far past it and past the inset its anchor asks for. Each
     * rests on its wire with the `annotation_drop` the axis form rests a name
     * with.
     */
    private name_axes_beside_columns(): void {
        const plate = this.plate_rectangle();
        const clearance = this.settings.arrow_axis_name_clearance;
        const row = {
            drop: this.inner_box.settings.annotation_drop,
            height: this.inner_box.settings.anchor_height,
        };
        for (const anchor of anchors_named_beside(this.inner_box.left_anchors)) {
            const at = anchor.location();
            const relay = this.relays.get(anchor)?.location();
            if (at === undefined || relay === undefined) {
                continue;
            }
            cr.rest_annotations_on_wire(
                this.renderHandler, anchor.gap_annotations(),
                {left: relay.x + clearance,
                 width: plate.left - clearance - (relay.x + clearance)},
                at.y, 'right', row);
        }
        for (const anchor of anchors_named_beside(this.inner_box.right_anchors)) {
            const at = anchor.location();
            const relay = this.relays.get(anchor)?.location();
            if (at === undefined || relay === undefined) {
                continue;
            }
            const left = plate.right + clearance + anchor.gap_label_inset;
            cr.rest_annotations_on_wire(
                this.renderHandler, anchor.gap_annotations(),
                {left, width: relay.x - clearance - left},
                at.y, 'left', row);
        }
    }
}

/*
 * Whether `target` is an elementwise map, which the axis form draws with
 * `ElementwiseBox` and which reads one operand and writes one result. The
 * registry keys a glyph on the class of its operator, so an operator is drawn
 * with `ElementwiseBox` where its class has the glyph of `ops.Elementwise`.
 * `ops.View` is an `Elementwise` with a glyph of its own, and a `TypeConvert`
 * is no `Elementwise`.
 */
export function is_elementwise_map<B extends cat.Datatype, A extends cat.Axis>(
    target: cat.Broadcasted<B, A>,
): boolean {
    const glyphs = bb.opsRegistry.classRegistry;
    const elementwise_glyph = glyphs.get(ops.Elementwise.name);
    return elementwise_glyph !== undefined
        && glyphs.get(target.operator.constructor.name) === elementwise_glyph
        && target.input_weaves.length === 1
        && target.output_weaves.length === 1;
}

/*
 * An elementwise map, drawn as its name over one arrow.
 *
 * The map reads each entry of its one operand and writes one entry of its one
 * result, so the box draws no plate, opens no fan and names no axis. The
 * operand's arrow runs straight on to the result's arrow as one heavy wire,
 * and the map's name rests on that wire at `arrow_map_name_font_size`, as
 * `ElementwiseBox` rests the name of a map between two implicit datatypes on
 * the top wire. A small head stands on the wire either side of the name and
 * points along it, as the heads of `ElementwiseBox` stand either side of its
 * name. The heads mark the direction of the run the wire belongs to, and point
 * left where the map is drawn mirrored.
 *
 * The box is as wide as the name and its heads need, and as tall as the room
 * of the operand's arrow. The name stands above that room where the array has
 * fewer than two axes, as the label of an arrow in a composed gap does.
 *
 * `map` is the morphism the box draws and `target` the morphism in the figure.
 * The two differ where a block asks for its body to be drawn in its place, and
 * the pointer then opens the block's inspection box over the name, as it does
 * over the glyph in the axis form.
 */
export class ElementwiseArrowBox<B extends cat.Datatype, A extends cat.Axis>
    extends cr.MorphismBox<cat.Array<B, A>, cat.Broadcasted<B, A>, cat.Array<B, A>> {
    public left_anchors: cr.ProdObjectMeridian<cat.Array<B, A>, cat.Array<B, A>>;
    public right_anchors: cr.ProdObjectMeridian<cat.Array<B, A>, cat.Array<B, A>>;
    public operand_arrow: ArrayArrowAnchor<B, A>;
    public result_arrow: ArrayArrowAnchor<B, A>;
    /* The name of the map, which a map with no name goes without. */
    public map_name?: rh.AnnotationElement;
    /* The room between the two arrows, which holds the name and the heads. */
    private name_room: rh.CoreElement;

    constructor(
        public categoryRenderer: ArrowRenderer<B, A>,
        public target: cat.Broadcasted<B, A>,
        map: cat.Broadcasted<B, A> = target,
    ) {
        super(categoryRenderer, target);
        const [operand] = target.dom().map(
            (array) => categoryRenderer.display_lone(array));
        const [result] = target.cod().map(
            (array) => categoryRenderer.display_lone(array));
        this.operand_arrow = operand.arrow;
        this.result_arrow = result.arrow;
        this.left_anchors = new cr.ProdObjectMeridian(categoryRenderer, [operand]);
        this.right_anchors = new cr.ProdObjectMeridian(categoryRenderer, [result]);
        this.operand_arrow.anchor_link(this.result_arrow);
        this.operand_arrow.runs_through_a_map = true;
        this.operand_arrow.allow_skip = false;
        this.result_arrow.allow_skip = false;
        this.map_name = this.name_of(map);
        this.name_room = new rh.CoreElement(this.renderHandler, {
            x: (this.map_name?.estimated_bare_text_width() ?? 0)
                + 2 * (aob.ELEMENTWISE_ARROW_ROOM + this.settings.arrow_map_margin),
            y: operand.dims.y,
        });
        this.children = [this.left_anchors, this.name_room, this.right_anchors];
        this.renderHandler.register_term_region(this.map_name ?? this.name_room, target);
        this.setBorderColor('purple');
    }

    get settings(): crs.ArrowRendererSettings<B, A> {
        return this.categoryRenderer.settings;
    }

    private name_of(map: cat.Broadcasted<B, A>): rh.AnnotationElement | undefined {
        const latex = map.operator.name?.to_latex();
        return latex ? new rh.AnnotationElement(this.renderHandler, latex, {
            font_size: this.settings.arrow_map_name_font_size,
            vertical_align: 'end',
        }) : undefined;
    }

    /*
     * The wire the map is drawn on runs from the arrow on the map's left,
     * which a mirror makes the result's arrow, so the flag that keeps the run
     * of the wire free of a direction triangle moves to that arrow.
     */
    public mirror(): void {
        super.mirror();
        const operand_ran_through = this.operand_arrow.runs_through_a_map;
        this.operand_arrow.runs_through_a_map = this.result_arrow.runs_through_a_map;
        this.result_arrow.runs_through_a_map = operand_ran_through;
    }

    /*
     * The name and its heads, once the arrow's wire is drawn under them. The
     * heads stand against the text KaTeX drew, as `ElementwiseBox` stands
     * them, and against the middle of the room where the map has no name. A
     * map drawn mirrored reflects both heads across the middle of the name.
     */
    update(): void {
        super.update();
        const line = this.operand_arrow.location()?.y;
        if (line === undefined) {
            return;
        }
        const room = this.name_room.rectangle();
        this.rest_name_on_wire(room, line);
        const beside = this.map_name?.text_rectangle()
            ?? new pt.Rectangle({x: room.midpoint().x, y: line}, {x: 0, y: 0});
        const direction = travelDirection.travel_direction(this);
        for (const head of [aob.input_elementwise_arrow(beside, line),
                            aob.output_elementwise_arrow(beside, line)]) {
            this.draw?.deltaPolygon(
                travelDirection.reflect_polygon_for_travel(
                    head, beside.midpoint().x, direction),
                {fill: PLAIN_LINE_COLOR, stroke: 'none'});
        }
    }

    /* The name, resting on the wire at height `line` across the width of
     * `room`, with the `annotation_drop` an arrow's label rests with. */
    private rest_name_on_wire(room: pt.Rectangle, line: number): void {
        if (this.map_name === undefined) {
            return;
        }
        const height = this.map_name.estimated_text_dims().y;
        this.map_name.place(new pt.Rectangle(
            {x: room.left, y: line + this.settings.annotation_drop - height},
            {x: room.width, y: height}));
    }
}

export class ArrowRenderer<B extends cat.Datatype, A extends cat.Axis>
    extends cr.CategoryRenderer<cat.Array<B, A>, cat.Broadcasted<B, A>, cat.Array<B, A>> {

    public settings: crs.ArrowRendererSettings<B, A>;
    /*
     * The references handler is the broadcasted renderer's, as
     * `para.ParaCategoryRenderer` shares its base's. `BlockOperatorBox` queues
     * a block's body through the renderer that built the box, which is the
     * broadcasted one, and `diagramRenderTarget.render_with_subblock` pops it
     * through the renderer that drew the figure.
     */
    constructor(
        public broadcasted_renderer: bb.BroadcastedRenderer<B, A>,
        _settings: Partial<crs.ArrowRendererSettings<B, A>> = {},
    ) {
        super(broadcasted_renderer.renderHandler, _settings);
        this.settings = {
            ...crs.DefaultArrowRendererSettings,
            ..._settings,
        };
        this.referencesHandler = broadcasted_renderer.referencesHandler;
    }

    public display_lone(target: cat.Array<B, A>): ArrayArrowMeridian<B, A> {
        return new ArrayArrowMeridian(this, target);
    }

    public display_prod_object(
        target: cat.ProdObject<cat.Array<B, A>>,
    ): cr.ProdObjectMeridian<cat.Array<B, A>, cat.Array<B, A>> {
        return new cr.ProdObjectMeridian(this, target);
    }

    /*
     * The box of `target`, which is `ElementwiseArrowBox` where the operator
     * drawn is an elementwise map and `ArrowCappedBox` otherwise. The operator
     * drawn is the body of a block that asks for its body to be drawn in its
     * place, and `target` itself otherwise.
     */
    public display_morphism(
        target: cat.Broadcasted<B, A>,
    ): cr.MorphismBox<cat.Array<B, A>, cat.Broadcasted<B, A>, cat.Array<B, A>> {
        const drawn = bb.body_drawn_in_place(target) ?? target;
        if (is_elementwise_map(drawn)) {
            return new ElementwiseArrowBox(this, target, drawn);
        }
        return new ArrowCappedBox(
            this, target, bb.broadcasted_box(this.broadcasted_renderer, target));
    }
}

type ArrowParaSeed<B extends cat.Datatype, A extends cat.Axis> =
    para.ParaSeed<cat.Array<B, A>, cat.Broadcasted<B, A>>;

/*
 * `Para` over the two arrow forms, whose base is an `ArrowRenderer` or the
 * `BoxRenderer` that extends it.
 *
 * A `ParaWrap` over a `Broadcasted` is drawn by `pwd.ParaWrapBox` around the
 * box the base builds for its body, which is an `ArrowCappedBox`, an
 * `ElementwiseArrowBox` or an `OperatorFaceBox` holding every operand and
 * every result in its columns. Each tape comes down from its free end and
 * turns into the arrow of the grabbed operand, or leaves the arrow of the
 * dropped result and turns down, along a level leg that carries the arrow's
 * label as a composed gap carries it. `pwbd.display_para_wrap` would put the
 * taped arrays on rows along the top and bottom of the box, where a label
 * turned a quarter turn to run down its tape made each tape as tall as the
 * label is wide. The user asked on 2026-09-26 for the level leg.
 *
 * Every other morphism is drawn as `para.ParaCategoryRenderer` draws it. That
 * includes a `Grab`, a `Drop` and a wrap over a `Rearrangement`, whose tapes
 * reach the arrows of the wrap's own columns. A grab's tape there writes no
 * label, because the composed gap after the wrap writes it on the arrow the
 * tape turns into.
 */
export class ArrowParaCategoryRenderer<B extends cat.Datatype, A extends cat.Axis>
    extends para.ParaCategoryRenderer<
        cat.Array<B, A>, cat.Broadcasted<B, A>, cat.Array<B, A>> {
    constructor(
        public base: ArrowRenderer<B, A>,
        _settings: Partial<crs.ParaRendererSettings<
            cat.Array<B, A>, ArrowParaSeed<B, A>, cat.Array<B, A>>> = {},
    ) {
        super(base, {grab_tape_names_its_wire: false, ..._settings});
    }

    public display_morphism(
        target: ArrowParaSeed<B, A>,
    ): cr.MorphismBox<cat.Array<B, A>, ArrowParaSeed<B, A>, cat.Array<B, A>> {
        if (target instanceof pwt.ParaWrap && target.body instanceof cat.Broadcasted) {
            return new pwd.ParaWrapBox<
                cat.Array<B, A>, cat.Broadcasted<B, A>, cat.Array<B, A>>(
                this, target, this.base.display_morphism(target.body));
        }
        return super.display_morphism(target);
    }
}
