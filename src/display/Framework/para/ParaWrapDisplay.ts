import * as rh from '../../Render/RenderHandler';
import * as rhs from '../../Render/RenderHandlerSettings';
import * as cat from '../../../data_structure/Category';
import * as cr from '../CategoryRenderer';
import * as crs from '../CategoryRendererSettings';
import * as scr from '../StrideCategoryRenderer';
import * as padlock from '../../Render/padlock';
import * as locked_highlights from '../../Render/locked_highlights';
import * as pdt from '../../../para/data_structure/Para';
import * as pwt from '../../../para/data_structure/ParaWrap';
import * as pt from '../../../utilities/Point';
import * as dhd from '../../Render/DrawHandler';
import * as Curve from '../../../utilities/Curve';
import { Color } from '../../../utilities/Color';

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
 */

/* Which side of the box the free end of a tape is on. */
export enum TapeEnd {
    ABOVE = -1,
    BELOW = 1,
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
     * The elbows of a rearrangement are fanned `tape_spacing` apart with
     * nothing standing between one array and the next.
     */
    step: number;
    separator_step: number;
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
 * arrowheads are on, at the end of that edge nearest the slot name.
 *
 * The slot name stands to the left of the plate and the axis names lie between
 * the tapes on the inner side of the arrowheads, so the padlock covers neither
 * of them whichever way the tapes run.
 */
export function padlock_centre(
    region: pt.Rectangle,
    end: TapeEnd,
    dims: pt.Point,
    gap: number,
): pt.Point {
    return {
        x: region.left + dims.x / 2,
        y: end === TapeEnd.ABOVE
            ? region.top - gap - dims.y / 2
            : region.bottom + gap + dims.y / 2,
    };
}

/* The highlight of the axis an anchor carries, where the anchor is an axis
 * and the settings draw axis halos at all. */
function axis_highlight_tokens<A>(
    anchor: cr.Anchor<A>,
    settings: rhs.RenderHandlerSettings,
): string[] {
    return anchor instanceof scr.AxisAnchor && rhs.draws_axis_halos(settings)
        ? [anchor.highlight_token()] : [];
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
    /* Whether the body is too short for a tape to run down it, which a wrap
     * over the identity on one wire is. `reserve_tape_label_space` reads the
     * body's own height to answer it, before the insets are added. */
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
     * anchor it reaches. */
    private row_tape_height(row: TapeRow<A>): number {
        return Math.max(
            this.settings.tape_base_height,
            this.axis_label_depth(row) + this.row_axis_label_extent(row));
    }

    /*
     * The room a wrap takes beside a body too short to hold its tapes.
     *
     * The columns of such a wrap are moved into the room its tapes did not
     * take, as `post_placement` moves an inner box, so the anchor a tape
     * reaches stands one inset plus half an anchor from the edge the tape runs
     * from. The room asked for is the run less that half anchor.
     */
    private tape_run_room(row: TapeRow<A>): number {
        return Math.max(
            0, this.row_tape_height(row) - this.settings.anchor_height / 2);
    }

    /*
     * The room the row of grabs takes above the body.
     *
     * A grab's tape runs down into its anchor, so the run lies inside the body
     * and the room above it holds only the part of the slot name that stands
     * higher than the arrowheads. An operator's own box is one exception:
     * `build_inner` puts the grabbed operands on the top edge of the operator,
     * so the whole run stands above the body. A body shorter than the run its
     * tapes need is the other, and takes `tape_run_room`.
     */
    private grab_row_inset(row: TapeRow<A>): number {
        if (this.inner?.operation_rectangle) {
            return this.row_tape_height(row);
        }
        if (this.body_shorter_than_its_tapes) {
            return this.tape_run_room(row);
        }
        return Math.max(0, this.row_slot_label_height(row) / 2
                           - this.settings.tape_label_drop);
    }

    /* The room the row of drops takes below the body, which is the whole run,
     * a drop's tape leaving the body and running out to its arrowhead. */
    private drop_row_inset(row: TapeRow<A>): number {
        return this.body_shorter_than_its_tapes
            ? this.tape_run_room(row) : this.row_tape_height(row);
    }

    private reserve_tape_label_space(): void {
        const escape = this.arrow_escape();
        const body_height = this.core.height ?? 0;
        const top_row = this.rows.find((row) => row.end === TapeEnd.ABOVE);
        const bottom_row = this.rows.find((row) => row.end === TapeEnd.BELOW);
        this.body_shorter_than_its_tapes = this.inner === undefined
            && this.rows.some(
                (row) => body_height < this.row_tape_height(row));
        this.bottom_tape_inset = bottom_row
            ? escape + this.drop_row_inset(bottom_row) : 0;
        this.top_tape_inset = top_row
            ? escape + this.grab_row_inset(top_row) : 0;
        this.core.height = body_height
            + this.top_tape_inset + this.bottom_tape_inset;
    }

    /*
     * The rearrangement case: no inner box. The two columns are linked by
     * the mapping, as `RearrangementBox` links its own, and the tapes hang
     * off the anchors concerned. Nothing here is loosened: a tape ends (or
     * starts) at its anchor, so the anchor has to stay drawn, and a copy's
     * source is dotted for the same reason a fan-out is.
     */
    private build_rearrangement(body: cat.Rearrangement<L>): rh.CoreElement {
        const wrap = this.target;
        const doms = this.left_anchors.lone_elements;
        const cods = this.right_anchors.lone_elements;
        const kept_in = wrap.kept_inputs(), kept_out = wrap.kept_outputs();
        const above: Tape<A>[] = [], below: Tape<A>[] = [];
        body.mapping.forEach((source, j) => {
            const k = kept_in.indexOf(source);
            if (wrap.drops[j] !== null) {
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
                    a.annotate_in_gap = false;
                    above.push({anchor: a, object: source, elbow: true});
                });
            }
        });
        const fanned = {step: this.settings.tape_spacing, separator_step: 0};
        if (above.length) {
            this.rows.push({end: TapeEnd.ABOVE, tapes: above,
                            labels: this.labels(above, wrap.grabs), ...fanned});
        }
        if (below.length) {
            this.rows.push({end: TapeEnd.BELOW, tapes: below,
                            labels: this.labels(below, wrap.drops, true),
                            ...fanned});
        }
        const count = Math.max(above.length, below.length);
        return new rh.CoreElement(this.renderHandler, {
            x: Math.max(
                this.settings.tape_width,
                2 * this.settings.tape_inset
                    + Math.max(0, count - 1) * this.settings.tape_spacing),
            y: Math.max(this.left_anchors.dims.y, this.right_anchors.dims.y),
        });
    }

    /*
     * The inner-box case: the columns pass straight through to the inner
     * box's, which hold the same kept objects in the same order, and the
     * tapes run to the rows the inner box has already put the taped objects
     * on.
     */
    private build_inner(inner: InnerBox<A>): rh.CoreElement {
        const wrap = this.target;
        this.left_anchors.link(inner.left_anchors);
        inner.right_anchors.link(this.right_anchors);
        const row_tapes = (row: cr.RowMeridian<A>, objects: number[]) =>
            row.lone_elements.flatMap((m, k) => m.anchors.map(
                (a) => ({anchor: a, object: objects[k], elbow: false})));
        const slotted = {step: this.settings.anchor_height,
                         separator_step: this.settings.anchor_height};
        if (inner.top_anchors) {
            const tapes = row_tapes(inner.top_anchors, wrap.grabbed());
            this.rows.push({end: TapeEnd.ABOVE, tapes,
                            labels: this.labels(tapes, wrap.grabs), ...slotted});
        }
        if (inner.bottom_anchors) {
            const tapes = row_tapes(inner.bottom_anchors, wrap.dropped());
            this.rows.push({end: TapeEnd.BELOW, tapes,
                            labels: this.labels(tapes, wrap.drops, true),
                            ...slotted});
        }
        const pad = this.settings.composed_gap_dims.x / 2;
        return new rh.CoreElement(
            this.renderHandler,
            {
                x: 2 * pad + inner.dims.x,
                y: Math.max(inner.dims.y,
                            this.left_anchors.dims.y,
                            this.right_anchors.dims.y),
            },
            [inner],
        );
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
            const entry = slots[object];
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
     */
    post_placement(): void {
        const shift = (this.top_tape_inset - this.bottom_tape_inset) / 2;
        if (this.inner) {
            const core = this.core.rectangle();
            const inner = this.inner.rectangle();
            this.inner.transform.offset = {
                x: core.midpoint().x - inner.left,
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
    }

    /*
     * Where each tape runs, for one side.
     *
     * An elbow tape turns beside
     * its anchor, on the side away from the wire's own direction: into the
     * box from a right-column anchor, out of it from a left-column one. The
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
        const free_y = !this.body_shorter_than_its_tapes ? reserved_free_y
            : elbow_row_free_end_y(
                reserved_free_y,
                placed.map((tape) => tape.anchor.location()!.y),
                row.end,
                this.row_tape_height(row));
        const elbows = placed.filter((t) => t.elbow).sort(
            (a, b) => Math.abs(b.anchor.location()!.y - free_y)
                    - Math.abs(a.anchor.location()!.y - free_y));
        return placed.map((tape) => {
            const point = tape.anchor.location()!;
            if (!tape.elbow) {
                const terminal = this.extended_tape_terminal(tape, row.end);
                return {tape, corner: point,
                        free_end: {x: point.x, y: free_y},
                        terminal,
                        top: Math.min(free_y, terminal.y)};
            }
            const i = elbows.indexOf(tape);
            const distance = this.settings.tape_inset
                + (elbows.length - 1 - i) * this.settings.tape_spacing;
            const inwards = row.end === TapeEnd.ABOVE;
            const corner_x = inwards ? point.x - distance : point.x + distance;
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
                                 this.settings.tape_elbow_radius)
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
        const entries = row.end === TapeEnd.ABOVE
            ? this.target.grabs : this.target.drops;
        const entry = entries[object];
        return entry === null || entry === undefined ? undefined : entry;
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
                row.end);
        }
    }

    /*
     * A plate behind the base of each taped array of the row, on the
     * background layer under the wires, filled with the slot's colour while
     * the slot is highlighted and invisible otherwise. The plate is the hit
     * target the pointer sets the highlight from, and covers the strip
     * between the array's first and last tape, so resting on the tapes or
     * the arrowheads lights every grab and drop of the slot. A click on the
     * plate locks the slot lit and a second click releases it.
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
            const plate = this.draw?.drawRectangle(region, {
                fill: slot_color(pdt.slot_of(entry), this.settings),
                fillRole: 'tint',
                surfaceTint: this.settings.tape_plate_tint,
                stroke: 'none',
                'stroke-width': '0',
            }, undefined, 'background');
            if (plate === undefined) { continue; }
            plate.set_attr({'fill-opacity': '0'});
            const token = slot_highlight_token(entry);
            this.renderHandler.register_highlight(token, (active) =>
                plate.set_attr({'fill-opacity': active ? '1' : '0'}));
            this.draw_array_padlocks(entry, region, row.end);
            const source = `${this.diagram_id}:plate:${row.end}:${object}`;
            this.events?.addHover(
                plate,
                () => this.renderHandler.set_highlight(token, source, true),
                () => this.renderHandler.set_highlight(token, source, false));
            this.events?.addClick(plate, () => SLOT_LOCKS.toggle(
                slot_lock_tokens(entry), this.renderHandler));
        }
    }

    /*
     * The two padlocks of a taped array, drawn beside its plate in the slot's
     * own colour and painted one at a time.
     *
     * The open one is drawn while the slot is lit and unlocked, which says
     * that a click on the plate under the pointer would lock it. The closed
     * one is drawn while the slot is locked. Both read the slot through the
     * highlight registry rather than through this array's own pointer, so
     * every array of one slot carries the same padlock as the array the
     * pointer rests on, and the padlocks agree with the plates the same
     * highlight lights.
     *
     * A padlock stands outside its plate, so it answers the pointer as the
     * plate does. The reader then keeps the slot lit while moving from the
     * plate onto the padlock, and clicks either of the two.
     */
    private draw_array_padlocks(
        entry: pdt.NamedEntry,
        region: pt.Rectangle,
        end: TapeEnd,
    ): void {
        const shape = padlock.DEFAULT_PADLOCK_SHAPE;
        const centre = padlock_centre(
            region, end, padlock.padlock_dims(shape),
            this.settings.tape_padlock_gap);
        const color = slot_color(pdt.slot_of(entry), this.settings);
        const open = padlock.draw_open_padlock(this.draw, centre, shape, color);
        const closed = padlock.draw_closed_padlock(
            this.draw, centre, shape, color);
        const token = slot_highlight_token(entry);
        const source = `${this.diagram_id}:padlock:${end}:${token}`;
        for (const part of [...open?.parts ?? [], ...closed?.parts ?? []]) {
            this.events?.addHover(
                part,
                () => this.renderHandler.set_highlight(token, source, true),
                () => this.renderHandler.set_highlight(token, source, false));
            this.events?.addClick(part, () => SLOT_LOCKS.toggle(
                slot_lock_tokens(entry), this.renderHandler));
        }
        const slot = {lit: false, locked: false};
        const redraw = (): void => {
            open?.set_drawn(slot.lit && !slot.locked);
            closed?.set_drawn(slot.locked);
        };
        this.renderHandler.register_highlight(
            token, (lit) => { slot.lit = lit; redraw(); });
        this.renderHandler.register_highlight(
            slot_lock_highlight_token(entry),
            (locked) => { slot.locked = locked; redraw(); });
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
     * axis the tape carries, so a tape answers the array it belongs to and the
     * wire it continues.
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
            ...axis_highlight_tokens(geometry.tape.anchor, this.renderHandler.settings),
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
 * that reads a partner processor's copy. A slot indexed by the iteration of a
 * repeated block carries no mark, because `entry_latex` writes the iteration
 * into the label and the two sides name the member each touches.
 */
function slot_mark(entry: pdt.NamedEntry, written: boolean): string {
    if (entry instanceof pdt.ReductionSlot) {
        return written ? "'" : '*';
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
 * full quarter turn: its radius is the whole horizontal leg, so the tape
 * leaves (or meets) the anchor already curving, clamped only by the vertical
 * run where that is shorter. `elbow_radius` is no longer a cap; it is kept
 * for callers that still pass it.
 */
export function tape_curve(
    corner: pt.Point,
    free_end: pt.Point,
    anchor: pt.Point,
    end: TapeEnd,
    elbow_radius: number,
): Curve.Curve {
    const radius = Math.min(
        Math.abs(corner.y - free_end.y),
        Math.abs(corner.x - anchor.x),
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

/* The slot name placed against the arrowheads, and the box it was written in. */
export function place_slot_label(
    annotation: rh.AnnotationElement,
    geometry: TapeGeometry<any>[],
    settings: crs.ParaRendererSettings<any, any, any>,
    end: TapeEnd = TapeEnd.ABOVE,
): pt.Rectangle | undefined {
    if (geometry.length === 0) { return undefined; }
    const dims = tape_label_dims(annotation, settings);
    annotation.annotationSettings.horizontal_align = 'right';
    annotation.annotationSettings.vertical_align = end === TapeEnd.BELOW
        ? 'end' : 'center';
    const box = new pt.Rectangle(
        {
            x: Math.min(...geometry.map((g) => g.free_end.x))
               - settings.tape_label_gap - dims.x,
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
 * The axis name a tape writes, where it writes one.
 *
 * A grabbed array arrives from off the figure and the wire below the tape is
 * the first the picture has seen of it, so the tape is where it is named,
 * whichever way the tape reaches its anchor. `build_rearrangement` clears
 * `annotate_in_gap` on exactly those anchors, so the gap just past the wrap
 * does not say it again a few px along the same line. A dropped array leaving
 * an operator's own row is named at the tape for the same reason: the row lies
 * on the edge of the operator's box and no composed gap reaches it. A
 * copy-drop turns an elbow off a wire the figure carries on drawing, and the
 * gap beside that wire names it, so the elbow writes nothing.
 *
 * The degree axes bypassing an operator are named as much as the ones it
 * reads, an array being taped entire.
 */
function tape_axis_annotation<A>(
    row: TapeRow<A>,
    tape: Tape<A>,
): rh.AnnotationElement | undefined {
    if (row.end === TapeEnd.BELOW && tape.elbow) { return undefined; }
    return tape.anchor.getAnnotation();
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
