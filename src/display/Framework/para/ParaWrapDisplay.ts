import * as rh from '../../Render/RenderHandler';
import * as cat from '../../../data_structure/Category';
import * as cr from '../CategoryRenderer';
import * as crs from '../CategoryRendererSettings';
import * as padlock from '../../Render/padlock';
import * as travelDirection from '../../Render/travelDirection';
import * as locked_highlights from '../../Render/locked_highlights';
import * as lockable_plate from '../../Render/lockablePlate';
import * as pdt from '../../../para/data_structure/Para';
import * as pwt from '../../../para/data_structure/ParaWrap';
import * as pt from '../../../utilities/Point';
import * as dhd from '../../Render/DrawHandler';
import * as Curve from '../../../utilities/Curve';
import { Color } from '../../../utilities/Color';
import * as arrow_labels from '../arrows/arrowLabels';

export function establish(): void {
    console.log("Loaded ParaWrap display module.");
}

/*
 * A `ParaWrap` drawn as a box with four sides.
 *
 * The domain is on the left and the codomain on the right, as for any
 * `MorphismBox`; what a wrap adds is tapes leaving through the TOP for the
 * operands that come off the tape and through the BOTTOM for the results that
 * go back onto it.
 *
 * Two bodies, two arrangements:
 *
 *   - a `Rearrangement` body - the identity of the old `GrabBox`/`DropBox`, or
 *     the copy `(0,0)` with one output dropped, which is what a value both
 *     passed on and saved becomes - has no inner box at all. The wrap's own
 *     two columns ARE the rearrangement, linked by its mapping, and a tape is
 *     an elbow off the anchor concerned: down from above into a grabbed
 *     output's anchor, or out from a dropped output's source and down. A copy
 *     is therefore as tall as the wires it copies, with a dot where the tape
 *     leaves it, and a wrap whose wires are shorter than the run its tapes
 *     need is given that run by `tape_run_room`.
 *
 *   - a `Broadcasted` body is drawn by a `BroadcastedBox` given a
 *     `WrapLayout` (`ParaWrapBroadcastedDisplay`), which puts the grabbed
 *     operands on a row along the top edge of the OPERATOR's own box and the
 *     dropped results along its bottom. Each tape is then one straight run
 *     from its free end past the wrap down to the row anchor, crossing
 *     whatever lies between; the operator's glyph takes it from there - an
 *     `Einops` cups it to the operand it contracts with.
 *
 *   - an inner box built with no row for its taped objects keeps them in its
 *     columns, as the two arrow forms build it. Each tape then comes down
 *     from its free end and turns a corner of `turn_radius` into a level leg,
 *     which enters the grabbed operand's anchor in the inner box's left
 *     column, and a drop's tape leaves the dropped result's anchor in the
 *     right column along such a leg and turns down. The label of the object
 *     stands on the leg, as a composed gap writes it on a wire, and the leg is
 *     as long as the label.
 *
 * A wrap drawn mirrored, which is a wrap in the backward pass of a training
 * step, holds its domain on the right and its codomain on the left, because
 * `ContravariantBox` reverses the children of every horizontal element. Every
 * elbow then turns its corner on the other side of its anchor: a grab comes
 * down from above and turns left into its anchor, and a drop leaves its
 * anchor to the left and turns down. The room the legs take moves to the other
 * side of the inner box with the column the legs reach, and the slot name of
 * a leg's tape stands right of its arrowhead, which is where a mirror carries
 * the name of a covariant leg. The user asked for the grabs and drops of a
 * reversed category to be drawn so on 2026-09-27.
 */

/* Where a row of tapes writes the label of each object it reaches. */
export enum TapeObjectLabel {
    /* Beside the tape's vertical run, turned a quarter turn to run down the
     * tape where the label is wider than the room the tape has. */
    ALONG_THE_TAPE = 'along-the-tape',
    /* On the level leg along which the tape enters or leaves an anchor in a
     * column of the inner box. */
    ON_THE_LEG = 'on-the-leg',
    /* Nowhere on the tape, because a composed gap beside the wrap writes it on
     * the wire the tape turns into or leaves. */
    IN_A_GAP = 'in-a-gap',
}

/* Which side of the box the free end of a tape is on. */
export enum TapeEnd {
    ABOVE = -1,
    BELOW = 1,
}

/* The side of its anchor on which an elbow turns its corner. */
export enum ElbowSide {
    LEFT = -1,
    RIGHT = 1,
}

/* The side of its array's tapes on which a slot name stands. */
export enum SlotNameSide {
    LEFT = -1,
    RIGHT = 1,
}

/* The circular-arc constant: how far along each leg a cubic's control point
 * goes to approximate a quarter turn. */
const KAPPA = 0.5523;

function towards(from: pt.Point, to: pt.Point, ratio: number): pt.Point {
    return {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
    };
}

/*
 * What an inner box offers the wrap: rows of its own for the grabbed and
 * dropped objects, whose anchors the tapes run straight down to.
 */
export interface InnerBox<A> extends cr.MorphismBox<any, any, A> {
    top_anchors?: cr.RowMeridian<A>;
    bottom_anchors?: cr.RowMeridian<A>;
    operation_rectangle?(): pt.Rectangle;
}

/* One tape: the anchor it reaches, and the object it is part of - the label
 * is per object. `elbow` is the rearrangement case, where the anchor is in a
 * column and the tape turns a corner beside it. */
interface Tape<A> {
    anchor: cr.Anchor<A>;
    object: number;
    elbow: boolean;
}

interface TapeRow<A> {
    end: TapeEnd;
    tapes: Tape<A>[];
    labels: Map<number, rh.AnnotationElement>;
    /*
     * How far apart the row stands two of its tapes, and the extra room it
     * leaves between one taped array and the next. `vertical_product` gives
     * every anchor of a row a slot of `anchor_height` and every separator
     * between two arrays a slot of its own, so both are `anchor_height` there.
     * The elbows of a rearrangement stand with nothing between one array and
     * the next. A grab's elbows are fanned `anchor_height` apart, which is the
     * room a row of axis names is given on an operator's own row. A drop's
     * elbows write no axis names and are fanned `tape_spacing` apart. The
     * elbows into a column of the inner box are fanned as far apart as a slot
     * name needs, so that each slot name stands between two vertical runs.
     */
    step: number;
    separator_step: number;
    object_label: TapeObjectLabel;
    /*
     * How far the corner of each elbow would stand from its anchor if it were
     * the row's innermost, one entry for each of `tapes`, and the largest
     * radius an elbow turns its corner with. A rearrangement's elbow stands
     * `tape_inset` out and turns through the whole of its leg. An elbow into a
     * column of the inner box stands out as far as the label on its leg and
     * its corner need, and turns with `turn_radius`, so the leg runs level
     * under the label. `fanned_leg_distances` moves an outer corner further
     * out where the corner inside it needs the room.
     */
    leg_lengths: number[];
    corner_radius: number;
    /*
     * The entries of the wrap indexed by `Tape.object`, and the side of its
     * anchor on which each elbow turns its corner. Where the row names neither,
     * a row above indexes the grabs and turns left, and a row below indexes the
     * drops and turns right. A row of the values that stay on their wires and
     * are also dropped names both, because its tapes leave the ports of either
     * column and turn into the box.
     */
    indexed_entries?: pdt.SlotEntry[];
    elbow_side?: ElbowSide;
}

export interface TapeGeometry<A> {
    tape: Tape<A>;
    corner: pt.Point;
    free_end: pt.Point;
    terminal: pt.Point;
    top: number;
}

function tape_label_dims(
    annotation: rh.AnnotationElement,
    settings: crs.ParaRendererSettings<any, any, any>,
): pt.Point {
    const estimated = annotation.estimated_text_dims();
    return {
        x: Math.max(settings.tape_label_dims.x, estimated.x),
        y: Math.max(settings.tape_label_dims.y, estimated.y),
    };
}

export function tape_halo_width(attributes: Partial<dhd.LineAttrs>): string {
    return cr.halo_stroke_width(attributes, 2);
}

/* The highlight a tape slot is named by, set by every grab and drop of it. */
export function slot_highlight_token(entry: pdt.NamedEntry): string {
    return `slot:${pdt.slot_of(entry).uid._id}`;
}

/* The second highlight a locked slot holds, which is what tells a padlock
 * drawn beside a plate to close. The first says that the slot is lit, and a
 * lock lights it as a hovering pointer does. */
export function slot_lock_highlight_token(entry: pdt.NamedEntry): string {
    return `slot-lock:${pdt.slot_of(entry).uid._id}`;
}

export function slot_lock_tokens(entry: pdt.NamedEntry): string[] {
    return [slot_highlight_token(entry), slot_lock_highlight_token(entry)];
}

/* The slots a click has locked, held under a source of their own so that the
 * pointer's hover comes and goes beneath a lock. The set is shared by every
 * figure on the page and by the diagram inside every open inspection box, and
 * `locked_highlights.ts` states how. */
const SLOT_LOCKS = new locked_highlights.LockedHighlights('slot-lock');

/*
 * Where the padlock of a taped array stands: outside the edge of the plate the
 * arrowheads are on, at the end of that edge nearest the slot name, which is
 * the end on `slot_name_side`.
 *
 * The slot name stands beside the plate and the axis names lie between the
 * tapes on the inner side of the arrowheads, so the padlock covers neither of
 * them whichever way the tapes run.
 */
export function padlock_centre(
    region: pt.Rectangle,
    end: TapeEnd,
    dims: pt.Point,
    gap: number,
    slot_name_side: SlotNameSide = SlotNameSide.LEFT,
): pt.Point {
    return {
        x: slot_name_side === SlotNameSide.LEFT
            ? region.left + dims.x / 2 : region.right - dims.x / 2,
        y: end === TapeEnd.ABOVE
            ? region.top - gap - dims.y / 2
            : region.bottom + gap + dims.y / 2,
    };
}

function point_box(point: pt.Point): pt.Rectangle {
    return new pt.Rectangle({x: point.x, y: point.y}, {x: 0, y: 0});
}

/*
 * The rectangle behind the base of a taped array: the strip between its first
 * and last tape, from their arrowheads to the row anchors or elbows they run
 * down to, padded by `padding` on each side. An arrowhead reaches `arrow.x`
 * either side of its tape, and lies between the free end and the run's end,
 * so it widens the strip and never lengthens it. The names written beside the
 * tapes are not part of it, so the slot name to the left of the arrowheads
 * stands outside the plate, as the user asked on 2026-09-16.
 */
export function taped_array_region(
    geometry: readonly TapeGeometry<any>[],
    arrow: pt.Point,
    padding: number,
): pt.Rectangle {
    const runs = geometry.flatMap((placed) => [
        point_box(placed.tape.elbow ? placed.corner : placed.terminal),
        new pt.Rectangle(
            {x: placed.free_end.x - arrow.x, y: placed.free_end.y},
            {x: 2 * arrow.x, y: 0}),
    ]);
    return pt.Rectangle.bounding_rectangle(runs).pad({x: padding, y: padding});
}

/*
 * Which tapes of a row write their axis name over the array's plate: every
 * tape but the last of its array, whose name stands to the right of the last
 * tape and so outside the strip. A name over the plate takes the pointer from
 * it, so it sets the slot as well as its axis.
 */
export function axis_labels_over_the_plate(
    tape_objects: readonly number[],
): boolean[] {
    return tape_objects.map(
        (object, i) => i + 1 < tape_objects.length && tape_objects[i + 1] === object);
}

/*
 * Whether the wire at a row anchor carries on in the tape's own direction
 * towards the operation, which is what lets the tape be drawn past the anchor.
 *
 * `onwards` is what the wire reaches on the operator's side of the anchor. An
 * operand's target axis reaches the operator's own row, which is another row
 * anchor directly below this one. A degree axis reaches a column instead, so
 * the wire turns at the anchor, and a tape drawn past it would lie along the
 * start of that turn as a straight stub.
 */
export function wire_continues_towards_the_operation(
    onwards: {horizontal: boolean}[],
): boolean {
    return onwards.length > 0 && onwards.every((next) => next.horizontal);
}

/*
 * The line a row of elbow tapes carries its free ends on: the edge of the room
 * the box reserved, or further out where that room falls short of the run the
 * row needs.
 *
 * The run is measured from the anchors rather than from the box, so the tapes
 * are as long as the row needs whatever height the layout gave the body. A
 * wrap over the identity on one wire is one anchor tall, and free ends taken
 * from that box would leave the arrowheads sitting in the turn. One line
 * serves the whole row, so its arrowheads stay level however deep in the
 * columns each anchor sits.
 */
export function elbow_row_free_end_y(
    reserved_y: number,
    anchor_ys: readonly number[],
    end: TapeEnd,
    run: number,
): number {
    const needed = anchor_ys.map((anchor_y) => anchor_y + end * run);
    return end === TapeEnd.ABOVE
        ? Math.min(reserved_y, ...needed)
        : Math.max(reserved_y, ...needed);
}

/*
 * How far below the top of a body of height `body_height` the centre of each
 * anchor of a column stands, given the height of each anchor in order and the
 * height of the column. The column stands centred in the body, as flex centres
 * it, and stacks its anchors one below the other.
 */
export function anchor_centre_depths(
    anchor_heights: readonly number[],
    column_height: number,
    body_height: number,
): number[] {
    const column_top = (body_height - column_height) / 2;
    return anchor_heights.map((height, i) => column_top
        + anchor_heights.slice(0, i).reduce((sum, above) => sum + above, 0)
        + height / 2);
}

/*
 * The run a row's tapes have inside a body of height `body_height` before the
 * nearest of them reaches its anchor, given how far below the top of the body
 * each anchor stands. A grab's tapes run down from the top of the body and a
 * drop's run out through its bottom.
 */
export function run_to_the_nearest_anchor(
    anchor_depths: readonly number[],
    body_height: number,
    end: TapeEnd,
): number {
    const runs = anchor_depths.map(
        (depth) => end === TapeEnd.ABOVE ? depth : body_height - depth);
    return Math.min(body_height, ...runs);
}

export function extended_tape_terminal(
    point: pt.Point,
    end: TapeEnd,
    operation: pt.Rectangle | undefined,
): pt.Point {
    if (!operation) {
        return point;
    }
    const spare = end === TapeEnd.ABOVE
        ? operation.top - point.y
        : point.y - operation.bottom;
    return {x: point.x, y: point.y - end * Math.max(0, spare)};
}

export class ParaWrapBox<L, M extends cat.Morphism<L>, A=L>
    extends cr.MorphismBox<L, any, A> {
    public inner?: InnerBox<A>;
    public core: rh.CoreElement;
    protected rows: TapeRow<A>[] = [];
    private top_tape_inset: number = 0;
    private bottom_tape_inset: number = 0;
    /* The room the legs of the elbows into the inner box's columns take on
     * either side of it, which is nothing where the inner box keeps no taped
     * object in its columns. */
    private grab_leg_room: number = 0;
    private drop_leg_room: number = 0;
    /* The room taken on either side of the inner box by the tapes leaving the
     * wrap's own ports, which is nothing where no value is kept and dropped. */
    private operand_port_room: number = 0;
    private result_port_room: number = 0;
    /* Whether the body is too short for the tapes of some row to run down it.
     * A wrap over the identity on one wire is, and so is a grab whose highest
     * anchor stands near the top of the body. `reserve_tape_label_space` reads
     * the body's own height to answer it, before the insets are added. */
    private body_shorter_than_its_tapes: boolean = false;

    get settings(): crs.ParaRendererSettings<L, any, A> {
        return this.categoryRenderer.settings as crs.ParaRendererSettings<L, any, A>;
    }

    constructor(
        public categoryRenderer: cr.CategoryRenderer<L, any, A>,
        public target: pwt.ParaWrap<L, M>,
        inner?: InnerBox<A>,
    ) {
        super(categoryRenderer, target);
        this.left_anchors = categoryRenderer.display_prod_object(target.dom());
        this.right_anchors = categoryRenderer.display_prod_object(target.cod());
        if (target.body instanceof cat.Rearrangement) {
            this.core = this.build_rearrangement(target.body);
        } else {
            this.inner = inner ?? categoryRenderer.display_category(
                target.body as cat.ProdCategory<L, any>, false);
            this.core = this.build_inner(this.inner);
        }
        this.add_kept_and_dropped_rows();
        this.reserve_tape_label_space();
        this.children = [this.left_anchors, this.core, this.right_anchors];
        this.setBorderColor('green');
    }

    /* How far outside the box a tape carries its arrowhead, which is nothing
     * unless the arrows are drawn clear of the separators. */
    private arrow_escape(): number {
        return this.settings.tape_arrows_outside_separators
            ? this.settings.tape_escape : 0;
    }

    private row_slot_label_height(row: TapeRow<A>): number {
        return Math.max(0, ...[...row.labels.values()].map(
            (annotation) => annotation.estimated_text_dims().y));
    }

    private row_axis_label_rooms(row: TapeRow<A>): number[] {
        return axis_label_rooms(
            tape_offsets_along_a_row(
                row.tapes.map((tape) => tape.object),
                row.step,
                row.separator_step),
            this.settings.anchor_height);
    }

    /*
     * Which of a row's tapes write their axis name turned a quarter turn. The
     * annotations are passed in rather than read here, because the caller has
     * them already and `getAnnotation` builds one on first asking.
     */
    private rotated_row_axis_labels(
        row: TapeRow<A>,
        annotations: (rh.AnnotationElement | undefined)[],
    ): boolean[] {
        return rotated_axis_labels(
            row.tapes.map((tape) => tape.object),
            annotations.map(
                (annotation) => annotation?.estimated_bare_text_width() ?? 0),
            this.row_axis_label_rooms(row));
    }

    /*
     * How deep the axis names reach past their line, measured bare: a name
     * written along the row is as deep as its text is tall, and a name turned
     * to run down its tape is as deep as its text is wide.
     */
    private row_axis_label_extent(row: TapeRow<A>): number {
        const annotations = row.tapes.map(
            (tape) => tape_axis_annotation(row, tape));
        const turned = this.rotated_row_axis_labels(row, annotations);
        return Math.max(0, ...annotations.map((annotation, i) => {
            if (!annotation) { return 0; }
            return turned[i] ? annotation.estimated_bare_text_width()
                : annotation.estimated_text_dims().y;
        }));
    }

    /*
     * How far in from the arrowheads the row writes its axis names: past the
     * slot name and a `tape_label_clearance`. A grab centres the slot name
     * `tape_label_drop` below the arrowhead tips and a drop ends it at them,
     * and a grab's line clears the arrowhead itself where the slot name is
     * shallower than one.
     */
    private axis_label_depth(row: TapeRow<A>): number {
        const slot_height = this.row_slot_label_height(row);
        const slot_line = row.end === TapeEnd.ABOVE
            ? Math.max(this.settings.tape_arrow.y,
                       this.settings.tape_label_drop + slot_height / 2)
            : slot_height;
        return slot_line + this.settings.tape_label_clearance;
    }

    /* How tall a tape of the row stands, from its arrowhead's tip to the row
     * anchor it reaches. The vertical run of an elbow into a column of the
     * inner box holds the slot name and the corner, and its label stands on
     * the leg. */
    private row_tape_height(row: TapeRow<A>): number {
        const turn = row.object_label === TapeObjectLabel.ON_THE_LEG
            ? row.corner_radius : 0;
        return Math.max(
            this.settings.tape_base_height,
            this.axis_label_depth(row) + this.row_axis_label_extent(row) + turn);
    }

    /*
     * How far below the top of the body each tape of a rearrangement row
     * reaches its anchor. The distance is known before the browser lays
     * anything out, because a column stands centred in the body and stacks its
     * anchors at the heights the build gave them. A grab's anchors are in the
     * right column and a drop's are in the left. The tapes of a wrap with an
     * inner box reach the inner box's columns, which `inner_column_depths`
     * reads.
     */
    private anchor_depths(row: TapeRow<A>, body_height: number): number[] {
        if (this.inner !== undefined) {
            return this.inner_column_depths(this.inner, row, body_height);
        }
        const column = row.end === TapeEnd.ABOVE
            ? this.right_anchors : this.left_anchors;
        const depths = anchor_centre_depths(
            column.anchors.map((anchor) => anchor.dims.y),
            column.dims.y,
            body_height);
        return row.tapes.flatMap((tape) => {
            const index = column.anchors.indexOf(tape.anchor);
            return index < 0 ? [] : [depths[index]];
        });
    }

    /*
     * How far below the top of the body each tape of a row reaches its anchor
     * in a column of the inner box, read before the browser lays anything out.
     * The inner box stands centred in the body, the column stands centred in
     * the inner box, and the column stacks its meridians and separators one
     * below the other. An arrow of the arrow forms moves to the middle of its
     * fan once it is placed, so the depth is an estimate, and
     * `elbow_row_free_end_y` lengthens a tape that comes out short of its run.
     */
    private inner_column_depths(
        inner: InnerBox<A>,
        row: TapeRow<A>,
        body_height: number,
    ): number[] {
        const column = row.end === TapeEnd.ABOVE
            ? inner.left_anchors : inner.right_anchors;
        const stacked: (cr.Meridian<A> | cr.SeparatorAnchor<A>)[] =
            column.separated?.content ?? column.lone_elements;
        const depths = anchor_centre_depths(
            stacked.map((element) => element.dims.y),
            column.dims.y,
            inner.dims.y);
        const inner_top = (body_height - inner.dims.y) / 2;
        return row.tapes.flatMap((tape) => {
            const index = stacked.findIndex((element) =>
                element instanceof cr.Meridian && element.anchors.includes(tape.anchor));
            return index < 0 ? [] : [inner_top + depths[index]];
        });
    }

    /* The run the tapes of a row have inside the body before the nearest of
     * them reaches its anchor. */
    private run_inside_the_body(row: TapeRow<A>, body_height: number): number {
        return run_to_the_nearest_anchor(
            this.anchor_depths(row, body_height), body_height, row.end);
    }

    /*
     * Whether a row's tapes need more run than the body gives them.
     *
     * A grab's tapes run down inside the body, so a grab row is short when its
     * highest anchor stands nearer the top of the body than its tapes are
     * tall. The top axis of a grabbed array of two axes stands half an anchor
     * down, and its tape would turn into its anchor above the line the row
     * writes its axis names on. A drop's tapes leave the body and run out
     * below it through the room `drop_row_inset` reserves, so a drop row is
     * short only when the whole body is shorter than its tapes.
     */
    private row_shorter_than_its_tapes(row: TapeRow<A>, body_height: number): boolean {
        const run = row.end === TapeEnd.ABOVE
            ? this.run_inside_the_body(row, body_height) : body_height;
        return run < this.row_tape_height(row);
    }

    /*
     * The room a wrap takes beside a body too short to hold its tapes.
     *
     * The columns of such a wrap are moved into the room its tapes did not
     * take, as `post_placement` moves an inner box. The room asked for is the
     * run the row needs less the run it has inside the body, which is half an
     * anchor for a wrap over one wire.
     */
    private tape_run_room(row: TapeRow<A>, body_height: number): number {
        return Math.max(
            0,
            this.row_tape_height(row) - this.run_inside_the_body(row, body_height));
    }

    /*
     * The room the row of grabs takes above the body.
     *
     * A grab's tape runs down into its anchor, so the run lies inside the body
     * and the room above it holds only the part of the slot name that stands
     * higher than the arrowheads. An operator's own box is one exception:
     * `build_inner` puts the grabbed operands on the top edge of the operator,
     * so the whole run stands above the body. A body shorter than the run its
     * tapes need is the other, and takes `tape_run_room`. An elbow into a
     * column of the inner box runs down inside the body as a rearrangement's
     * does, and takes `tape_run_room` too.
     */
    private grab_row_inset(row: TapeRow<A>, body_height: number): number {
        if (row.object_label === TapeObjectLabel.ON_THE_LEG) {
            return this.tape_run_room(row, body_height);
        }
        if (this.inner?.operation_rectangle) {
            return this.row_tape_height(row);
        }
        if (this.body_shorter_than_its_tapes) {
            return this.tape_run_room(row, body_height);
        }
        return Math.max(0, this.row_slot_label_height(row) / 2
                           - this.settings.tape_label_drop);
    }

    /* The room the row of drops takes below the body, which is the whole run,
     * a drop's tape leaving the body and running out to its arrowhead. An
     * elbow out of a column of the inner box turns down inside the body, and
     * takes only the run the body does not give it below the lowest anchor. */
    private drop_row_inset(row: TapeRow<A>, body_height: number): number {
        return this.body_shorter_than_its_tapes
            || row.object_label === TapeObjectLabel.ON_THE_LEG
            ? this.tape_run_room(row, body_height) : this.row_tape_height(row);
    }

    private reserve_tape_label_space(): void {
        const escape = this.arrow_escape();
        const body_height = this.core.height ?? 0;
        const top_rows = this.rows.filter((row) => row.end === TapeEnd.ABOVE);
        const bottom_rows = this.rows.filter((row) => row.end === TapeEnd.BELOW);
        this.body_shorter_than_its_tapes = this.inner === undefined
            && this.rows.some(
                (row) => this.row_shorter_than_its_tapes(row, body_height));
        this.bottom_tape_inset = bottom_rows.length > 0
            ? escape + Math.max(...bottom_rows.map(
                (row) => this.drop_row_inset(row, body_height))) : 0;
        this.top_tape_inset = top_rows.length > 0
            ? escape + Math.max(...top_rows.map(
                (row) => this.grab_row_inset(row, body_height))) : 0;
        this.core.height = body_height
            + this.top_tape_inset + this.bottom_tape_inset;
    }

    /*
     * The rearrangement case: no inner box. The two columns are linked by
     * the mapping, as `RearrangementBox` links its own, and the tapes hang
     * off the anchors concerned. Nothing here is loosened: a tape ends (or
     * starts) at its anchor, so the anchor has to stay drawn, and a copy's
     * source is dotted for the same reason a fan-out is.
     *
     * A grab's tape writes the name of the wire it turns into unless
     * `grab_tape_names_its_wire` says that the gap after the wrap writes it.
     */
    private build_rearrangement(body: cat.Rearrangement<L>): rh.CoreElement {
        const wrap = this.target;
        const doms = this.left_anchors.lone_elements;
        const cods = this.right_anchors.lone_elements;
        const kept_in = wrap.kept_inputs(), kept_out = wrap.kept_outputs();
        const above: Tape<A>[] = [], below: Tape<A>[] = [];
        const grab_label = this.settings.grab_tape_names_its_wire
            ? TapeObjectLabel.ALONG_THE_TAPE : TapeObjectLabel.IN_A_GAP;
        const elbow = {corner_radius: Infinity};
        body.mapping.forEach((source, j) => {
            const k = kept_in.indexOf(source);
            if (!pdt.is_kept(wrap.drops[j])) {
                // Dropped: the tape leaves the source's own anchor, which is
                // a copy of a wire passed on as well if the source is kept.
                if (k >= 0) {
                    doms[k].anchors.forEach((a) => {
                        a.allow_skip = false;
                        a.add_dot = true;
                        below.push({anchor: a, object: j, elbow: true});
                    });
                }
                return;
            }
            const cod = cods[kept_out.indexOf(j)];
            if (k >= 0) {
                doms[k].link(cod);
            } else {
                // Grabbed: the tape arrives at the output's anchor from above.
                cod.anchors.forEach((a) => {
                    a.allow_skip = false;
                    a.annotate_in_gap = grab_label === TapeObjectLabel.IN_A_GAP;
                    above.push({anchor: a, object: source, elbow: true});
                });
            }
        });
        if (above.length) {
            this.rows.push({end: TapeEnd.ABOVE, tapes: above,
                            labels: this.labels(above, wrap.grabs),
                            step: this.settings.anchor_height, separator_step: 0,
                            object_label: grab_label, ...elbow,
                            leg_lengths: above.map(() => this.settings.tape_inset)});
        }
        if (below.length) {
            this.rows.push({end: TapeEnd.BELOW, tapes: below,
                            labels: this.labels(below, wrap.drops, true),
                            step: this.settings.tape_spacing, separator_step: 0,
                            object_label: TapeObjectLabel.IN_A_GAP, ...elbow,
                            leg_lengths: below.map(() => this.settings.tape_inset)});
        }
        const fan_width = Math.max(0, ...this.rows.map(
            (row) => (row.tapes.length - 1) * row.step));
        return new rh.CoreElement(this.renderHandler, {
            x: Math.max(
                this.settings.tape_width,
                2 * this.settings.tape_inset + fan_width),
            y: Math.max(this.left_anchors.dims.y, this.right_anchors.dims.y),
        });
    }

    /*
     * The inner-box case. Where the inner box has put the taped objects on
     * rows of its own, its columns hold the same kept objects in the same
     * order as the wrap's, the columns pass straight through, and the tapes
     * run to the rows. Where the inner box keeps a side's taped objects in its
     * column, the tapes of that side turn into the column along legs, and each
     * kept object's meridian is linked to its own. The legs take room beside
     * the inner box, on the left for the grabs and on the right for the drops.
     */
    private build_inner(inner: InnerBox<A>): rh.CoreElement {
        const wrap = this.target;
        const grabs_in_column = wrap.grabbed().length > 0
            && inner.left_anchors.lone_elements.length === wrap.grabs.length;
        const drops_in_column = wrap.dropped().length > 0
            && inner.right_anchors.lone_elements.length === wrap.drops.length;
        this.link_kept_objects(inner, grabs_in_column, drops_in_column);
        const row_tapes = (row: cr.RowMeridian<A>, objects: number[]) =>
            row.lone_elements.flatMap((m, k) => m.anchors.map(
                (a) => ({anchor: a, object: objects[k], elbow: false})));
        const slotted = {step: this.settings.anchor_height,
                         separator_step: this.settings.anchor_height,
                         object_label: TapeObjectLabel.ALONG_THE_TAPE,
                         corner_radius: Infinity};
        const straight = (tapes: Tape<A>[]): number[] => tapes.map(() => 0);
        if (inner.top_anchors) {
            const tapes = row_tapes(inner.top_anchors, wrap.grabbed());
            this.rows.push({end: TapeEnd.ABOVE, tapes,
                            labels: this.labels(tapes, wrap.grabs), ...slotted,
                            leg_lengths: straight(tapes)});
        }
        if (grabs_in_column) {
            this.rows.push(this.leg_row(
                TapeEnd.ABOVE,
                column_tapes(inner.left_anchors, wrap.grabbed()),
                wrap.grabs));
        }
        if (inner.bottom_anchors) {
            const tapes = row_tapes(inner.bottom_anchors, wrap.dropped());
            this.rows.push({end: TapeEnd.BELOW, tapes,
                            labels: this.labels(tapes, wrap.drops, true),
                            ...slotted, leg_lengths: straight(tapes)});
        }
        if (drops_in_column) {
            this.rows.push(this.leg_row(
                TapeEnd.BELOW,
                column_tapes(inner.right_anchors, wrap.dropped()),
                wrap.drops));
        }
        this.grab_leg_room = this.leg_room(TapeEnd.ABOVE);
        this.drop_leg_room = this.leg_room(TapeEnd.BELOW);
        const pad = this.settings.composed_gap_dims.x / 2;
        return new rh.CoreElement(
            this.renderHandler,
            {
                x: 2 * pad + this.grab_leg_room + inner.dims.x + this.drop_leg_room,
                y: Math.max(inner.dims.y,
                            this.left_anchors.dims.y,
                            this.right_anchors.dims.y),
            },
            [inner],
        );
    }

    /*
     * Link the wrap's columns to the inner box's. A side whose taped objects
     * stand on a row of the inner box is linked anchor by anchor, separators
     * included, because the two columns hold the same objects. A side whose
     * taped objects stand in the inner box's column is linked object by
     * object, each kept object to the meridian of the same object there.
     */
    private link_kept_objects(
        inner: InnerBox<A>,
        grabs_in_column: boolean,
        drops_in_column: boolean,
    ): void {
        const wrap = this.target;
        if (grabs_in_column) {
            wrap.kept_inputs().forEach((position, k) =>
                this.left_anchors.lone_elements[k].link(
                    inner.left_anchors.lone_elements[position]));
        } else {
            this.left_anchors.link(inner.left_anchors);
        }
        if (drops_in_column) {
            wrap.kept_outputs().forEach((position, k) =>
                inner.right_anchors.lone_elements[position].link(
                    this.right_anchors.lone_elements[k]));
        } else {
            inner.right_anchors.link(this.right_anchors);
        }
    }

    /*
     * A row of elbows into a column of the inner box, which write the label of
     * each object on the leg. Each leg holds its own label, the corner and a
     * `tape_label_gap` between the two, which `leg_length_for_label` measures.
     * The vertical runs stand as far apart as the widest slot name needs, so
     * the slot name written left of an arrowhead ends short of the tape to its
     * left.
     */
    private leg_row(
        end: TapeEnd,
        tapes: Tape<A>[],
        slots: pdt.SlotEntry[],
    ): TapeRow<A> {
        tapes.forEach(({anchor}) => {
            anchor.allow_skip = false;
            anchor.annotate_in_gap = false;
        });
        const labels = this.labels(tapes, slots, end === TapeEnd.BELOW);
        const corner_radius = this.settings.turn_radius;
        const row: TapeRow<A> = {
            end,
            tapes,
            labels,
            step: 0,
            separator_step: 0,
            object_label: TapeObjectLabel.ON_THE_LEG,
            leg_lengths: tapes.map(({anchor}) => leg_length_for_label(
                leg_label_inset(anchor, end)
                    + arrow_labels.arrow_label_extent(anchor).width,
                this.settings.tape_label_gap,
                corner_radius)),
            corner_radius,
        };
        return {
            ...row,
            step: Math.max(
                this.settings.anchor_height,
                this.slot_name_room(row) + this.settings.tape_arrow.x),
        };
    }

    /* The row of elbows into the inner box's column on `end`, where there is
     * one. */
    private leg_row_at(end: TapeEnd): TapeRow<A> | undefined {
        return this.rows.find((row) => row.end === end
            && row.object_label === TapeObjectLabel.ON_THE_LEG);
    }

    /*
     * The room the legs of the row on `end` take beside the inner box, which
     * is the distance to the outermost corner. The tapes are fanned in the
     * order they stand in the column, which is the order the browser keeps:
     * a grab's innermost tape reaches the highest anchor and a drop's the
     * lowest. The grabs' room holds the slot name beyond the outermost
     * arrowhead as well, which would otherwise stand over the gap before the
     * wrap. A drop's slot names stand under its legs. A mirror moves the room
     * to the other side of the inner box, and the slot names with it.
     */
    private leg_room(end: TapeEnd): number {
        const row = this.leg_row_at(end);
        if (row === undefined) {
            return 0;
        }
        const innermost_first = end === TapeEnd.ABOVE
            ? row.leg_lengths : [...row.leg_lengths].reverse();
        const legs = Math.max(0, ...fanned_leg_distances(innermost_first, row.step));
        return end === TapeEnd.ABOVE ? legs + this.slot_name_room(row) : legs;
    }

    /* The width a slot name of `row` takes beside its arrowhead, with the
     * clearance `place_slot_label` leaves between the two and the half of the
     * arrowhead that stands on that side of its tape. */
    private slot_name_room(row: TapeRow<A>): number {
        const widest = Math.max(0, ...[...row.labels.values()].map(
            (annotation) => tape_label_dims(annotation, this.settings).x));
        return widest === 0 ? this.settings.tape_arrow.x
            : widest + this.settings.tape_label_gap;
    }

    /*
     * The tapes of the values that stay on their wires and are also dropped,
     * one row for the operands and one for the results. Each tape leaves the
     * anchor of the wrap's own port, turns into the box along the wire, and
     * runs down past the box's bottom edge, as the drop of a copy turns off the
     * copied wire. The wire carries on into the body or out of it, and the
     * tape is the value saved. The anchor carries no dot, because the value is
     * not copied onto a second wire of the figure.
     */
    private add_kept_and_dropped_rows(): void {
        const wrap = this.target;
        const operands = this.port_row(
            port_tapes(this.left_anchors, wrap.kept_inputs(),
                       wrap.kept_and_dropped_inputs()),
            wrap.grabs,
            ElbowSide.RIGHT);
        const results = this.port_row(
            port_tapes(this.right_anchors, wrap.kept_outputs(),
                       wrap.kept_and_dropped_outputs()),
            wrap.drops,
            ElbowSide.LEFT);
        this.rows.push(...[operands, results].filter(
            (row): row is TapeRow<A> => row !== undefined));
        if (this.inner !== undefined) {
            this.operand_port_room = this.port_room(operands);
            this.result_port_room = this.port_room(results);
            this.core.width = this.core.dims.x
                + this.operand_port_room + this.result_port_room;
        }
    }

    private port_row(
        tapes: Tape<A>[],
        entries: pdt.SlotEntry[],
        side: ElbowSide,
    ): TapeRow<A> | undefined {
        if (tapes.length === 0) { return undefined; }
        tapes.forEach(({anchor}) => { anchor.allow_skip = false; });
        return {
            end: TapeEnd.BELOW,
            tapes,
            labels: this.labels(tapes, entries, true),
            step: this.settings.tape_spacing,
            separator_step: 0,
            object_label: TapeObjectLabel.IN_A_GAP,
            leg_lengths: tapes.map(() => this.settings.tape_inset),
            corner_radius: Infinity,
            indexed_entries: entries,
            elbow_side: side,
        };
    }

    /*
     * The room taken beside the inner box by the tapes of a row leaving the
     * wrap's ports, beyond the pad left there by `build_inner`, so that the
     * tape furthest from its port turns down a `tape_spacing` clear of the
     * inner box and crosses none of the wires inside it.
     */
    private port_room(row: TapeRow<A> | undefined): number {
        if (row === undefined) { return 0; }
        const pad = this.settings.composed_gap_dims.x / 2;
        const turned = Math.max(0, ...fanned_leg_distances(row.leg_lengths, row.step));
        return Math.max(0, turned + this.settings.tape_spacing - pad);
    }

    /*
     * One label per taped object, built once here rather than in `update`:
     * an `AnnotationElement` registers itself with the render handler on
     * construction, and one per pass would leave the handler holding a fresh
     * element for every frame. None at all when `tapeLabels` is off. The flag
     * is read off the RENDER handler, whose settings are the ones this send
     * asked for - see `ParaCategoryRenderer`.
     */
    private labels(
        tapes: Tape<A>[],
        slots: pdt.SlotEntry[],
        written: boolean = false,
    ): Map<number, rh.AnnotationElement> {
        const labels = new Map<number, rh.AnnotationElement>();
        if (this.renderHandler.settings.tapeLabels === false) {
            return labels;
        }
        for (const {object} of tapes) {
            const entry = taped_entry(slots[object] ?? null);
            if (entry === null || labels.has(object)) { continue; }
            const slot = pdt.slot_of(entry);
            labels.set(object, new rh.AnnotationElement(
                this.renderHandler,
                entry_latex(entry) + slot_mark(entry, written),
                {
                    font_size: this.settings.tape_label_font_size,
                    color: slot_color(slot, this.settings),
                    background: this.settings.tape_label_background,
                },
            ));
        }
        return labels;
    }

    /*
     * Centre the inner box between the tape insets, and put the wrap's own
     * columns at the same height.
     *
     * Both insets are added to the core's height, so a wrap taped on one side
     * alone holds its inner box half an inset off the core's middle. Flex
     * centres the wrap's columns on the whole core. Leaving them there puts
     * every wire crossing the wrap through two bends inside it, one into the
     * inner box's column and one back out of it. Moving the columns by the
     * same amount as the inner box puts the bend in the composed gap on
     * either side, where wires bend anyway. Only knowable once the browser has
     * laid out, hence here and not in the constructor - the same move as
     * `BroadcastedBox.apply_translation_update`.
     *
     * A wrap whose body is shorter than its tapes has no inner box and moves
     * its columns for the same reason: the room `tape_run_room` asked for is
     * on one side of the body and the layout would give half of it to each.
     *
     * The legs of the elbows into the inner box's columns take room on one
     * side of the inner box each, and the inner box moves across by half the
     * difference, so that each leg room stands on its own side. The tapes
     * leaving the wrap's ports take room the same way. The operands' room is
     * on the left of the inner box, and on the right where the wrap is drawn
     * mirrored.
     */
    post_placement(): void {
        const shift = (this.top_tape_inset - this.bottom_tape_inset) / 2;
        if (this.inner) {
            const core = this.core.rectangle();
            const inner = this.inner.rectangle();
            const operand_room = this.grab_leg_room + this.operand_port_room;
            const result_room = this.drop_leg_room + this.result_port_room;
            const [left_room, right_room] = this.mirrored
                ? [result_room, operand_room] : [operand_room, result_room];
            this.inner.transform.offset = {
                x: core.midpoint().x - inner.left + (left_room - right_room) / 2,
                y: core.midpoint().y + shift - inner.top,
            };
            this.inner.transform.positioning = {x: -0.5, y: -0.5};
        }
        if (this.inner || this.body_shorter_than_its_tapes) {
            for (const column of [this.left_anchors, this.right_anchors]) {
                column.transform.offset = {x: 0, y: shift};
            }
        }
        super.post_placement();
        this.level_kept_wires_beside_legs();
    }

    /*
     * Move each anchor of a column of the wrap to the height of the anchor of
     * the inner box it is linked to, on a side whose tapes turn into the inner
     * box's column. That column holds the taped objects as well as the kept
     * ones, so a kept object stands at another height there than in the
     * wrap's column, and its wire would bend across the legs and the labels on
     * them. Moved, the wire runs level beside the legs and bends in the gap
     * beyond the wrap, as `cr.SpreadBox.post_placement` moves the columns of a
     * spread. The legs of a row stand on the side its elbows turn to, which a
     * mirror exchanges. The column on the left reaches the inner box through
     * the anchors it is drawn to, and the column on the right through the
     * anchors drawn to it.
     */
    private level_kept_wires_beside_legs(): void {
        const leg_sides = this.rows
            .filter((row) => row.object_label === TapeObjectLabel.ON_THE_LEG)
            .map((row) => this.elbow_side(row));
        if (leg_sides.includes(ElbowSide.LEFT)) {
            this.left_anchors.anchors.forEach((anchor) =>
                cr.align_anchor_height(anchor, anchor.next_terminal()));
        }
        if (leg_sides.includes(ElbowSide.RIGHT)) {
            this.right_anchors.anchors.forEach((anchor) =>
                cr.align_anchor_height(anchor, anchor.prior_terminal()));
        }
    }

    /* The side of its anchor on which each elbow of `row` turns its corner,
     * which `elbow_side` gives for a wrap drawn in this wrap's direction. */
    private elbow_side(row: TapeRow<A>): ElbowSide {
        return elbow_side(row, travelDirection.travel_direction(this));
    }

    /*
     * The side of its array's tapes on which a slot name of `row` stands. The
     * name stands left of the arrowheads, except on a row of elbows into a
     * column of the inner box of a wrap drawn mirrored, where it stands right
     * of them. A mirror carries the name of a covariant leg there, so a grab's
     * name stands clear of the leg its tape turns into and a drop's name
     * stands under the legs, as they do in a covariant region.
     */
    private slot_name_side(row: TapeRow<A>): SlotNameSide {
        return row.object_label === TapeObjectLabel.ON_THE_LEG && this.mirrored
            ? SlotNameSide.RIGHT : SlotNameSide.LEFT;
    }

    /*
     * Where each tape runs, for one side.
     *
     * An elbow tape turns beside
     * its anchor, on the side away from the wire's own direction: into the
     * box from a right-column anchor, out of it from a left-column one, and
     * the other way round where the wrap is drawn mirrored. The
     * vertical runs are fanned so that no two coincide, longest-first from
     * the far side inwards, which is what keeps a run from crossing another
     * tape's horizontal leg. A straight tape runs to its row anchor and
     * needs no fanning, the row having fanned it already.
     */
    protected geometry(row: TapeRow<A>): TapeGeometry<A>[] {
        const rect = this.core.rectangle();
        const core_edge = row.end === TapeEnd.ABOVE
            ? rect.top + this.top_tape_inset
            : rect.bottom - this.bottom_tape_inset;
        const escape = this.arrow_escape();
        const reserved = row.end === TapeEnd.ABOVE
            ? this.top_tape_inset : this.bottom_tape_inset;
        const reserved_free_y = reserved > 0
            ? (row.end === TapeEnd.ABOVE ? rect.top : rect.bottom)
            : core_edge + escape * row.end;
        const placed = row.tapes.filter(
            (t) => t.anchor.location() !== undefined && t.anchor.draws_wire());
        const measured_from_anchors = this.body_shorter_than_its_tapes
            || row.object_label === TapeObjectLabel.ON_THE_LEG;
        const free_y = !measured_from_anchors ? reserved_free_y
            : elbow_row_free_end_y(
                reserved_free_y,
                placed.map((tape) => tape.anchor.location()!.y),
                row.end,
                this.row_tape_height(row));
        const elbows = placed.filter((t) => t.elbow).sort(
            (a, b) => Math.abs(b.anchor.location()!.y - free_y)
                    - Math.abs(a.anchor.location()!.y - free_y));
        const innermost_first = [...elbows].reverse();
        const distances = fanned_leg_distances(
            innermost_first.map((tape) => row.leg_lengths[row.tapes.indexOf(tape)]),
            row.step);
        return placed.map((tape) => {
            const point = tape.anchor.location()!;
            if (!tape.elbow) {
                const terminal = this.extended_tape_terminal(tape, row.end);
                return {tape, corner: point,
                        free_end: {x: point.x, y: free_y},
                        terminal,
                        top: Math.min(free_y, terminal.y)};
            }
            const distance = distances[innermost_first.indexOf(tape)];
            const corner_x = point.x + this.elbow_side(row) * distance;
            return {
                tape,
                corner: {x: corner_x, y: point.y},
                free_end: {x: corner_x, y: free_y},
                terminal: point,
                top: Math.min(free_y, point.y),
            };
        });
    }

    private extended_tape_terminal(tape: Tape<A>, end: TapeEnd): pt.Point {
        const point = tape.anchor.location()!;
        const onwards = end === TapeEnd.ABOVE
            ? tape.anchor.next_terminal() : tape.anchor.prior_terminal();
        if (!wire_continues_towards_the_operation(onwards)) {
            return point;
        }
        return extended_tape_terminal(
            point, end, this.inner?.operation_rectangle?.());
    }

    update(): void {
        super.update();
        for (const row of this.rows) {
            const geometry = this.geometry(row);
            for (const placed of geometry) {
                const {tape, corner, free_end, terminal} = placed;
                const attributes = tape.anchor.wire_attributes();
                const anchor = tape.anchor.location()!;
                const curve = tape.elbow
                    ? tape_curve(corner, free_end, anchor, row.end,
                                 row.corner_radius)
                    : new Curve.StraightLine(free_end, terminal);
                const halo_width = tape_halo_width(attributes);
                const line_halo = cr.draw_wire_halo(this.draw, curve, attributes, 2);
                this.draw?.curve(curve, attributes);
                const arrow_halo = draw_arrow_halo(
                    this.draw, free_end, row.end, this.settings.tape_arrow,
                    attributes.stroke ?? 'black', halo_width);
                draw_arrow(this.draw, free_end, row.end,
                           this.settings.tape_arrow,
                           attributes.stroke ?? 'black');
                this.link_tape_halos(row, placed, line_halo, arrow_halo);
            }
            this.place_row_labels(row, geometry);
            this.draw_array_plates(row, geometry);
        }
    }

    private slot_entry(row: TapeRow<A>, object: number): pdt.NamedEntry | undefined {
        const entries = row.indexed_entries
            ?? (row.end === TapeEnd.ABOVE ? this.target.grabs : this.target.drops);
        return taped_entry(entries[object] ?? null) ?? undefined;
    }

    /*
     * The two lines of names a row writes: the slot names against the
     * arrowheads, and the axis names on the line beside them, below the slot
     * names for a grab and above them for a drop. An axis name standing over
     * the array's plate sets the tape's slot under the pointer as well as its
     * axis, because it takes the pointer from the plate.
     */
    private place_row_labels(
        row: TapeRow<A>,
        geometry: TapeGeometry<A>[],
    ): void {
        if (geometry.length === 0) { return; }
        if (row.object_label === TapeObjectLabel.ON_THE_LEG) {
            geometry.forEach((placed) => place_label_on_leg(
                placed, row, this.settings.tape_label_gap));
        }
        const axis_line = this.axis_label_line(row, geometry);
        const annotations = row.tapes.map(
            (tape) => tape_axis_annotation(row, tape));
        const turned = this.rotated_row_axis_labels(row, annotations);
        const over_the_plate = axis_labels_over_the_plate(
            row.tapes.map((tape) => tape.object));
        for (const placed of geometry) {
            const tape = row.tapes.indexOf(placed.tape);
            const annotation = annotations[tape];
            if (!annotation) { continue; }
            const entry = this.slot_entry(row, placed.tape.object);
            if (entry !== undefined && over_the_plate[tape]) {
                annotation.add_hover_token(slot_highlight_token(entry));
            }
            if (turned[tape]) {
                place_rotated_axis_label(placed, axis_line, this.settings, row.end);
            } else {
                place_axis_label(placed, axis_line, this.settings, row.end);
            }
        }
        for (const [object, annotation] of row.labels) {
            place_slot_label(
                annotation,
                geometry.filter((g) => g.tape.object === object),
                this.settings,
                row.end,
                this.slot_name_side(row));
        }
    }

    /*
     * A lockable plate behind the base of each taped array of the row, in the
     * slot's colour, covering the strip between the array's first and last
     * tape, so resting on the tapes or the arrowheads lights every grab and
     * drop of the slot. The padlock stands outside the arrowhead edge of the
     * plate, at the end nearest the slot name.
     */
    private draw_array_plates(
        row: TapeRow<A>,
        geometry: TapeGeometry<A>[],
    ): void {
        for (const object of new Set(geometry.map((placed) => placed.tape.object))) {
            const entry = this.slot_entry(row, object);
            if (entry === undefined) { continue; }
            const region = taped_array_region(
                geometry.filter((placed) => placed.tape.object === object),
                this.settings.tape_arrow,
                this.settings.tape_plate_padding);
            lockable_plate.draw_lockable_plate(this.renderHandler, {
                region,
                color: slot_color(pdt.slot_of(entry), this.settings),
                tint: this.settings.tape_plate_tint,
                highlight_token: slot_highlight_token(entry),
                lock_token: slot_lock_highlight_token(entry),
                locks: SLOT_LOCKS,
                padlock_centre: padlock_centre(
                    region, row.end,
                    padlock.padlock_dims(padlock.DEFAULT_PADLOCK_SHAPE),
                    this.settings.tape_padlock_gap, this.slot_name_side(row)),
                source: `${this.diagram_id}:${row.end}:${object}`,
            });
        }
    }

    /* The line the row keeps for its axis names, which a grab writes down from
     * and a drop writes up to. */
    private axis_label_line(
        row: TapeRow<A>,
        geometry: TapeGeometry<A>[],
    ): number {
        const depth = this.axis_label_depth(row);
        if (row.end === TapeEnd.ABOVE) {
            return Math.max(...geometry.map((g) => g.top)) + depth;
        }
        return Math.max(...geometry.map((g) => g.free_end.y)) - depth;
    }

    /*
     * The tape's halos are lit with the slot the tape reaches and with the
     * axis or the natural the tape carries, so a tape answers the array it
     * belongs to and the wire it continues.
     */
    private link_tape_halos(
        row: TapeRow<A>,
        geometry: TapeGeometry<A>,
        line_halo: dhd.DrawElement | undefined,
        arrow_halo: dhd.DrawElement | undefined,
    ): void {
        const entry = this.slot_entry(row, geometry.tape.object);
        if (entry === undefined) { return; }
        const tokens = [
            slot_highlight_token(entry),
            ...geometry.tape.anchor.wire_highlight_tokens(),
        ];
        cr.link_halo(this.renderHandler, line_halo, tokens, this.settings.halo_opacity);
        cr.link_halo(this.renderHandler, arrow_halo, tokens, this.settings.halo_opacity);
    }
}

/*
 * The mark a slot's label carries beside its name, as `agent_display`'s
 * `slot_text` prints it. A loop variable written for the next iteration
 * carries a prime, so the write reads apart from the grabs of the same slot in
 * the same iteration. An exchanged slot carries a prime on the side that
 * writes this processor's partial for the next round, and a star on the side
 * that reads a partner processor's copy. A cache kept between passes carries a
 * plus on the side that appends the entries of this pass, and no mark on the
 * side that reads the entries of the earlier passes. A slot indexed by the
 * iteration of a repeated block carries no mark, because `entry_latex` writes
 * the iteration into the label and the two sides name the member each touches.
 */
function slot_mark(entry: pdt.NamedEntry, written: boolean): string {
    if (entry instanceof pdt.ReductionSlot) {
        return written ? "'" : '*';
    }
    if (entry instanceof pdt.CacheTapeSlot) {
        return written ? '+' : '';
    }
    return written && entry instanceof pdt.StreamSlot ? "'" : '';
}

/*
 * What a slot label says: the slot's name where it has one, two hex digits of
 * its UID where it does not.
 *
 * The name is preferred, and `pyncd` is why. `para.new_slot` captures
 * `s0, s1, ...` onto the UID in creation order, precisely because a UID is
 * random per process - a figure that printed one would differ between two
 * runs of the same notebook. `UID.to_latex` there makes the same choice, so a
 * slot reads the same in a diagram as in `agent_display`. The fallback is the
 * low byte alone, in `\texttt` since it is a machine number and not a name.
 */
export function slot_latex(slot: pdt.TapeSlot): string {
    const name = slot.uid._name?.to_latex();
    if (name) { return name; }
    return `\\texttt{${(slot.uid._id % 256).toString(16).padStart(2, '0')}}`;
}

/*
 * What an entry's label says: the slot's name, and for a slot indexed by the
 * iteration of a repeated block the iteration in a subscript below it. The name
 * is braced, because it may carry a subscript of its own and two subscripts in
 * a row are not LaTeX.
 */
export function entry_latex(entry: pdt.NamedEntry): string {
    const slot = slot_latex(pdt.slot_of(entry));
    const index = pdt.index_of(entry);
    return index === null ? slot : `{${slot}}_{${index.to_latex()}}`;
}

/*
 * The label's hue, taken off the slot's UID. Saturation and value are pulled
 * back from the pure hue, because text is a thin mark and a full-value yellow
 * does not read on white.
 */
export function slot_color(
    slot: pdt.TapeSlot,
    settings: crs.ParaRendererSettings<any, any, any>,
): string {
    return Color.from_h360sv(
        slot.uid._id, ...settings.tape_label_saturation_value).hex();
}

/*
 * One tape with an elbow in it: along the vertical run from the free end to
 * the corner, round the elbow, and out to the anchor.
 *
 * A sequence rather than a single bezier so that the vertical run is
 * straight and only the corner is round - one bezier from the free end to the
 * anchor bows across the whole box and reads as a diagonal. The corner is a
 * quarter turn of the whole horizontal leg, clamped by the vertical run where
 * that is shorter and by `largest_radius`. A rearrangement's elbow passes
 * `Infinity`, so the tape leaves (or meets) its anchor already curving. An
 * elbow into a column of the inner box passes `turn_radius`, so its leg runs
 * level under the label it carries.
 */
export function tape_curve(
    corner: pt.Point,
    free_end: pt.Point,
    anchor: pt.Point,
    end: TapeEnd,
    largest_radius: number,
): Curve.Curve {
    const radius = Math.min(
        Math.abs(corner.y - free_end.y),
        Math.abs(corner.x - anchor.x),
        largest_radius,
    );
    const from_free: pt.Point = {x: corner.x, y: corner.y + radius * end};
    const to_anchor: pt.Point = {
        x: corner.x + (anchor.x > corner.x ? radius : -radius),
        y: corner.y,
    };
    return new Curve.CurveSequence([
        new Curve.StraightLine(free_end, from_free),
        new Curve.CubicBezierSegment(
            from_free,
            towards(from_free, corner, KAPPA),
            towards(to_anchor, corner, KAPPA),
            to_anchor,
        ),
        new Curve.StraightLine(to_anchor, anchor),
    ]);
}

/*
 * The arrowhead at the free end, always pointing DOWN: a grab's hangs from
 * the top of its tape and points into the diagram, a drop's rests on the
 * bottom of its own and points out of it, so the pair reads as one flow
 * through the tape. Filled with the wire's own stroke, since the wire runs
 * under it.
 */
export function draw_arrow<T, R>(
    draw: dhd.DrawHandler<T, R> | undefined,
    free_end: pt.Point,
    end: TapeEnd,
    arrow: pt.Point,
    color: string,
): dhd.DrawElement<T, R> | undefined {
    const base_y = end === TapeEnd.ABOVE ? free_end.y : free_end.y - arrow.y;
    return draw?.deltaPolygon(
        [
            {x: free_end.x - arrow.x, y: base_y},
            {x: 2 * arrow.x, y: 0},
            {x: -arrow.x, y: arrow.y},
        ],
        {fill: color, stroke: 'none'},
    );
}

function draw_arrow_halo<T, R>(
    draw: dhd.DrawHandler<T, R> | undefined,
    free_end: pt.Point,
    end: TapeEnd,
    arrow: pt.Point,
    color: string,
    width: string,
): dhd.DrawElement<T, R> | undefined {
    const halo = draw_arrow(draw, free_end, end, arrow, color);
    halo?.set_attr({
        fill: 'none',
        stroke: color,
        'stroke-width': width,
        'stroke-opacity': '0',
        'pointer-events': 'none',
    });
    return halo;
}

function label_y(
    top: number,
    dims: pt.Point,
    settings: crs.ParaRendererSettings<any, any, any>,
): number {
    return top + settings.tape_label_drop - dims.y / 2;
}

/* The slot name placed against the arrowheads, on `side` of them, and the box
 * it was written in. */
export function place_slot_label(
    annotation: rh.AnnotationElement,
    geometry: TapeGeometry<any>[],
    settings: crs.ParaRendererSettings<any, any, any>,
    end: TapeEnd = TapeEnd.ABOVE,
    side: SlotNameSide = SlotNameSide.LEFT,
): pt.Rectangle | undefined {
    if (geometry.length === 0) { return undefined; }
    const dims = tape_label_dims(annotation, settings);
    annotation.annotationSettings.horizontal_align = side === SlotNameSide.LEFT
        ? 'right' : 'left';
    annotation.annotationSettings.vertical_align = end === TapeEnd.BELOW
        ? 'end' : 'center';
    const box = new pt.Rectangle(
        {
            x: side === SlotNameSide.LEFT
                ? Math.min(...geometry.map((g) => g.free_end.x))
                    - settings.tape_label_gap - dims.x
                : Math.max(...geometry.map((g) => g.free_end.x))
                    + settings.tape_label_gap,
            y: end === TapeEnd.BELOW
                ? Math.max(...geometry.map((g) => g.free_end.y)) - dims.y
                : label_y(Math.max(...geometry.map((g) => g.top)), dims, settings),
        },
        // Copied, not shared: a `Rectangle` outlives this call and the
        // settings object is not its to hold.
        {x: dims.x, y: dims.y},
    );
    annotation.place(box);
    return box;
}

/*
 * The axis name a tape writes beside its vertical run, where it writes one.
 *
 * A grabbed array arrives from off the figure and the wire below the tape is
 * the first the picture has seen of it, so the tape is where it is named,
 * whichever way the tape reaches its anchor. `build_rearrangement` clears
 * `annotate_in_gap` on exactly those anchors, so the gap just past the wrap
 * does not say it again a few px along the same line. A dropped array leaving
 * an operator's own row is named at the tape for the same reason: the row lies
 * on the edge of the operator's box and no composed gap reaches it. A
 * copy-drop turns an elbow off a wire the figure carries on drawing, and the
 * gap beside that wire names it, so the elbow writes nothing. A row whose
 * label stands on the legs of its elbows writes nothing beside the run either.
 *
 * The degree axes bypassing an operator are named as much as the ones it
 * reads, an array being taped entire.
 */
function tape_axis_annotation<A>(
    row: TapeRow<A>,
    tape: Tape<A>,
): rh.AnnotationElement | undefined {
    return row.object_label === TapeObjectLabel.ALONG_THE_TAPE
        ? tape.anchor.getAnnotation() : undefined;
}

/* The tapes that leave the ports of `column` of the wrap, one for each anchor
 * of the meridian of each object at `positions` of the body's domain or
 * codomain. `kept` lists the positions held by the column, in its order. */
function port_tapes<A>(
    column: cr.ProdObjectMeridian<any, A>,
    kept: readonly number[],
    positions: readonly number[],
): Tape<A>[] {
    return positions.flatMap((position) => column.lone_elements[kept.indexOf(position)]
        .anchors.map((anchor) => ({anchor, object: position, elbow: true})));
}

/* The entry of the slot read or written by the tape of a wrap's entry, which
 * for a `pdt.KeptAndDropped` is the entry named by its `dropped`, and null for
 * a value that stays on its wire alone. */
function taped_entry(entry: pdt.SlotEntry): pdt.NamedEntry | null {
    return entry instanceof pdt.KeptAndDropped ? entry.dropped : entry;
}

/*
 * The side of its anchor on which each elbow of `row` turns its corner, in a
 * wrap whose data travels in `direction`. A wrap drawn mirrored turns every
 * elbow on the other side, because its columns have changed sides: a grab
 * comes down and turns left into its anchor, and a drop leaves its anchor to
 * the left and turns down.
 */
export function elbow_side(
    row: {end: TapeEnd; elbow_side?: ElbowSide},
    direction: travelDirection.TravelDirection,
): ElbowSide {
    const side = row.elbow_side
        ?? (row.end === TapeEnd.ABOVE ? ElbowSide.LEFT : ElbowSide.RIGHT);
    if (direction === travelDirection.TravelDirection.LEFT_TO_RIGHT) {
        return side;
    }
    return side === ElbowSide.LEFT ? ElbowSide.RIGHT : ElbowSide.LEFT;
}

/* The tapes that turn into `column` of an inner box, one for each anchor of
 * the meridian of each object at `positions` of the body's domain or
 * codomain. */
function column_tapes<A>(
    column: cr.ProdObjectMeridian<any, A>,
    positions: readonly number[],
): Tape<A>[] {
    return positions.flatMap((position) => column.lone_elements[position].anchors.map(
        (anchor) => ({anchor, object: position, elbow: true})));
}

/* How far from its anchor the label on a leg of `end` stands, which is the
 * inset the anchor asks a composed gap to begin its label at for a drop, and
 * nothing for a grab. */
function leg_label_inset<A>(anchor: cr.Anchor<A>, end: TapeEnd): number {
    return end === TapeEnd.BELOW ? anchor.gap_label_inset : 0;
}

/*
 * The stretch of an elbow's leg that its label stands on, `gap` clear of the
 * turn and `inset` clear of the anchor. A covariant grab's leg runs right from
 * the corner to the anchor, and a covariant drop's runs right from the anchor
 * to the corner. A mirror turns each corner on the other side of its anchor,
 * and the label keeps the same clearances.
 */
export function leg_label_span(
    geometry: TapeGeometry<any>,
    corner_radius: number,
    gap: number,
    inset: number,
): {left: number; right: number} {
    const {corner, terminal} = geometry;
    return corner.x < terminal.x
        ? {left: corner.x + corner_radius + gap, right: terminal.x - inset}
        : {left: terminal.x + inset, right: corner.x - corner_radius - gap};
}

/* The length of a leg that holds a label `label_width` wide, counting the
 * inset the label begins at, with `gap` between the label and a corner of
 * `corner_radius`. */
export function leg_length_for_label(
    label_width: number,
    gap: number,
    corner_radius: number,
): number {
    return label_width + gap + corner_radius;
}

/*
 * How far the corner of each elbow of a row stands from its anchor, given the
 * length each leg needs, innermost first, and the least distance `step`
 * between two vertical runs. The innermost corner stands as far out as its own
 * leg needs. Each corner outside it stands as far out as its own leg needs and
 * at least `step` beyond the corner inside it, because its vertical run passes
 * outside that corner and must not cross the leg that turns there.
 */
export function fanned_leg_distances(
    legs_innermost_first: readonly number[],
    step: number,
): number[] {
    return legs_innermost_first.reduce<number[]>((distances, leg) => [
        ...distances,
        distances.length === 0 ? leg
            : Math.max(leg, distances[distances.length - 1] + step),
    ], []);
}

/* The label of the object an elbow reaches, resting on the elbow's leg as
 * `arrow_labels.rest_arrow_label_on_wire` rests a label on any level stretch
 * of wire, `gap` clear of the turn. */
function place_label_on_leg<A>(
    geometry: TapeGeometry<A>,
    row: TapeRow<A>,
    gap: number,
): void {
    const anchor = geometry.tape.anchor;
    arrow_labels.rest_arrow_label_on_wire(
        anchor,
        leg_label_span(
            geometry, row.corner_radius, gap, leg_label_inset(anchor, row.end)),
        geometry.terminal.y,
        'left');
}

/*
 * Whether an axis name written along the row fits the room its tape has, which
 * is the room `axis_label_rooms` measures. A name that does not fit is turned
 * by `place_rotated_axis_label` instead.
 */
export function axis_label_fits(estimated_width: number, room: number): boolean {
    return estimated_width <= room;
}

/*
 * Which tapes of a row write their axis name turned a quarter turn: the ones
 * whose array holds a name too wide for the room its tape has. An array is
 * turned entire, so that the reader meets one array's names all the same way
 * round rather than a name along the row beside a name down a tape. A tape
 * carrying no axis name is given a width of zero and turns nothing.
 */
export function rotated_axis_labels(
    tape_objects: readonly number[],
    estimated_widths: readonly number[],
    rooms: readonly number[],
): boolean[] {
    const turned = new Set<number>(tape_objects.filter(
        (object, i) => !axis_label_fits(estimated_widths[i], rooms[i])));
    return tape_objects.map((object) => turned.has(object));
}

/*
 * Where each tape of a row stands along it, given the array each one carries.
 *
 * A row gives every tape a slot of `step` and every change of array a further
 * `separator_step`, which is the slot `vertical_product` leaves for the
 * separator it draws between two arrays.
 */
export function tape_offsets_along_a_row(
    tape_objects: readonly number[],
    step: number,
    separator_step: number,
): number[] {
    let offset = 0;
    return tape_objects.map((object, i) => {
        const first_of_its_array = i === 0 || tape_objects[i - 1] !== object;
        offset += i === 0 ? 0 : step + (first_of_its_array ? separator_step : 0);
        return offset;
    });
}

/*
 * The room each tape of a row leaves for a name written beside it, which is
 * the distance to the next tape. The slot name of the next array stands
 * between the two, and is not counted, because it is written on the other of
 * the two lines the row keeps. The last tape of the row is left `end_room`,
 * which is the slot the row gave it.
 */
export function axis_label_rooms(
    tape_offsets: readonly number[],
    end_room: number,
): number[] {
    return tape_offsets.map((offset, i) => {
        const next = tape_offsets[i + 1];
        return next === undefined ? end_room : next - offset;
    });
}

/*
 * One axis's own name, to the RIGHT of the tape carrying it and left-aligned so
 * that it begins against that tape, on the line the row keeps for axis names.
 * A grab writes the name down from that line and a drop up to it, so that both
 * read from the arrowheads inwards. Returns the box the name was written in.
 */
export function place_axis_label(
    geometry: TapeGeometry<any>,
    axis_line: number,
    settings: crs.ParaRendererSettings<any, any, any>,
    end: TapeEnd,
): pt.Rectangle | undefined {
    const annotation = geometry.tape.anchor.getAnnotation();
    if (!annotation) { return undefined; }
    const dims = tape_label_dims(annotation, settings);
    annotation.annotationSettings.horizontal_align = 'left';
    annotation.annotationSettings.vertical_align = 'center';
    annotation.annotationSettings.rotation = undefined;
    const box = new pt.Rectangle(
        {
            x: geometry.free_end.x + settings.tape_label_gap,
            y: end === TapeEnd.ABOVE ? axis_line : axis_line - dims.y,
        },
        {x: dims.x, y: dims.y},
    );
    annotation.place(box);
    return box;
}

/*
 * The same name turned a quarter turn clockwise, for an axis whose name is
 * wider than the room `axis_label_rooms` gives its tape. The name then runs
 * down the tape and reads in the direction a grab or a drop flows.
 *
 * `HTMLAnnotationHandler` writes the rectangle as a left, a top, a width and a
 * height and applies the rotation as a CSS transform, which turns the box
 * about its own centre. The rectangle placed here is therefore the text's own
 * box, positioned so that the turned box stands where the name goes: its left
 * edge on the tape's own x, since the name runs down beside the tape rather
 * than out from it, and its top on the axis line for a grab or its bottom on
 * that line for a drop.
 *
 * A quarter turn clockwise carries the left of the box to the top. A grab
 * therefore aligns the text left in its box and a drop right, and the name
 * begins or ends on the axis line however wide the estimate of it was.
 * `estimate_text_dims` reads `\mid` wider than KaTeX sets it, and a name
 * holding one has room to spare in its box. Returns the turned box, which is
 * the room the name takes on the page.
 */
export function place_rotated_axis_label(
    geometry: TapeGeometry<any>,
    axis_line: number,
    settings: crs.ParaRendererSettings<any, any, any>,
    end: TapeEnd,
): pt.Rectangle | undefined {
    const annotation = geometry.tape.anchor.getAnnotation();
    if (!annotation) { return undefined; }
    const dims = {x: annotation.estimated_bare_text_width(),
                  y: annotation.estimated_text_dims().y};
    annotation.annotationSettings.horizontal_align = end === TapeEnd.ABOVE
        ? 'left' : 'right';
    annotation.annotationSettings.vertical_align = 'center';
    annotation.annotationSettings.rotation = 90;
    const turned = turned_label_centre(
        geometry.free_end.x, axis_line, dims, end);
    annotation.place(new pt.Rectangle(
        {x: turned.x - dims.x / 2, y: turned.y - dims.y / 2},
        {x: dims.x, y: dims.y},
    ));
    return new pt.Rectangle(
        {x: turned.x - dims.y / 2, y: turned.y - dims.x / 2},
        {x: dims.y, y: dims.x},
    );
}

/* The centre a name turned a quarter turn keeps, given the left edge and the
 * line the turned box is to stand on. */
export function turned_label_centre(
    left: number,
    axis_line: number,
    dims: pt.Point,
    end: TapeEnd,
): pt.Point {
    return {
        x: left + dims.y / 2,
        y: end === TapeEnd.ABOVE
            ? axis_line + dims.x / 2 : axis_line - dims.x / 2,
    };
}
