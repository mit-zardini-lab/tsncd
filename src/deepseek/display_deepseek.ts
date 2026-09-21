
import * as rh from '../display/Render/RenderHandler';
import * as cr from '../display/Framework/CategoryRenderer';
//import * as bm from '../BroadcastedMeridian';
import * as ut from '../utilities/utilities';
import * as cat from '../data_structure/Category';
import * as fd from '../data_structure/Term';
import * as ops from '../data_structure/Operators';
import { Separated } from '../utilities/Separated';
//import * as cr from '../StandardCategoryRenderer';
import * as crs from '../display/Framework/CategoryRendererSettings';
import * as pt from '../utilities/Point';
import * as utcr from '../utilities/ConstructorRegistry';
import * as bb from '../display/Framework/BroadcastedCategoryRenderer';
import * as tu from '../data_structure_processing/term_utilities';

import { Color } from '../utilities/Color';
import * as scr from '../display/Framework/StrideCategoryRenderer';

import * as ds from './data_structure';
import * as pinj from '../para/data_structure/Inject';
import * as dh from '../display/Render/DrawHandler';
import * as cv from '../utilities/Curve';
import * as gb from '../display/Framework/Operations/GlyphBox';
import * as aob from '../display/Framework/Operations/additionalOperationBoxes';

const RADIUS = 22.5;
// Each successive arc is this much wider than the previous (chirp / rotary embedding effect)
const ARC_SCALE = 1.2;
const NUM_ARCS  = 4;

/*
 * How far inside the right edge of the circle the wires leaving a rotary table
 * start, so that they run out of the glyph rather than out of the gap beside
 * it. The core is the circle itself, so the inset is measured from its edge.
 */
const ROTARY_WIRE_INSET = 12.5;

/*
 * The size the name of a rotary table is set at, and the gap between the foot
 * of the name and the top of the circle.
 *
 * The user asked on 2026-09-18 for every table to be named, so that a RoPE
 * table, a YaRN table and a table a caller names are told apart. The name was
 * set at 0.28 in a cap inside the circle until then, where the arc left room
 * for about four characters. Above the circle it has the whole width of the
 * figure, and at 0.6 it is set a little smaller than an axis label and reads
 * at the scale the rest of the figure is read at.
 */
const ROTARY_NAME_FONT_SIZE = 0.6;
const ROTARY_NAME_GAP = 2;

/*
 * The room the name of `operator` takes above the circle, which is the height
 * of the text and the gap under it. A table with no name takes none.
 */
function rotary_name_room(operator: RotaryTable<any>): number {
    const name = operator.name?.to_latex();
    if (!name) {
        return 0;
    }
    return rh.estimated_label_dims([name], ROTARY_NAME_FONT_SIZE).y
        + ROTARY_NAME_GAP;
}

/*
 * The core of a rotary table: the circle, with the room its name takes added
 * above it and again below it.
 *
 * A box centres its core on the mid-line of the wires it carries, so room
 * added above the circle alone would carry the circle off that line and the
 * wires would leave the glyph above its centre. The room is therefore added at
 * both ends, and the name is written into the strip above.
 */
function rotary_core_dims(operator: RotaryTable<any>): pt.Point {
    return {x: 2 * RADIUS, y: 2 * RADIUS + 2 * rotary_name_room(operator)};
}

/** Widths of NUM_ARCS arcs in geometric progression, summing to 2 * radius. */
function arcWidths(radius: number): number[] {
    const scaleSum = Array.from({length: NUM_ARCS}, (_, i) => Math.pow(ARC_SCALE, i))
                         .reduce((a, b) => a + b, 0);
    const w0 = 2 * radius / scaleSum;
    return Array.from({length: NUM_ARCS}, (_, i) => w0 * Math.pow(ARC_SCALE, i));
}

/** Maximum y-amplitude the circle permits at horizontal position x. */
function maxAmpAt(x: number, cx: number, radius: number): number {
    return Math.sqrt(Math.max(0, radius * radius - (x - cx) * (x - cx)));
}

/**
 * Chirp sine: half-arch segments (cy → cy), arches alternating up/down.
 * Amplitude at each arch peak is clamped to the circle it is drawn inside.
 *
 * Every rotary table turns counterclockwise, so the first arch rises. An
 * inverse rotary embedding is the conjugate of a table of this kind, and pyncd
 * writes the conjugate as one elementwise map after the table rather than as a
 * table turning the other way.
 */
export function chirpSine(
    center: pt.Point,
    radius: number,
): cv.CurveSequence {
    const amp = radius / 2;
    const cp_ratio = 4 / 3;
    const widths = arcWidths(radius);
    const segments: cv.CubicBezierSegment[] = [];
    let x = center.x - radius;
    for (let i = 0; i < NUM_ARCS; i++) {
        const w = widths[i];
        const sign = i % 2 === 0 ? -1 : 1;
        const xEnd = x + w;
        const clampedAmp = Math.min(amp, maxAmpAt(x + w / 2, center.x, radius));
        const cp = clampedAmp * cp_ratio;
        segments.push(new cv.CubicBezierSegment(
            {x,            y: center.y},
            {x: x + w / 3, y: center.y + sign * cp},
            {x: xEnd - w / 3, y: center.y + sign * cp},
            {x: xEnd,      y: center.y},
        ));
        x = xEnd;
    }
    return new cv.CurveSequence(segments);
}

/**
 * Chirp cosine: S-curve segments between successive extrema (±amp → ∓amp).
 * Tangents are horizontal at both endpoints (cosine dy/dx = 0 at extrema).
 * Amplitude at each boundary is clamped to the circle.
 */
export function chirpCosine(center: pt.Point, radius: number): cv.CurveSequence {
    const amp = radius / 2;
    const widths = arcWidths(radius);
    const segments: cv.CubicBezierSegment[] = [];
    let x = center.x - radius;
    for (let i = 0; i < NUM_ARCS; i++) {
        const w = widths[i];
        const signStart = i % 2 === 0 ? -1 : 1;   // first arch starts at top (−y)
        const signEnd   = -signStart;
        const xEnd = x + w;
        const yStart = center.y + signStart * Math.min(amp, maxAmpAt(x,    center.x, radius));
        const yEnd   = center.y + signEnd   * Math.min(amp, maxAmpAt(xEnd, center.x, radius));
        segments.push(new cv.CubicBezierSegment(
            {x,            y: yStart},
            {x: x + w / 3, y: yStart},    // horizontal tangent at start
            {x: xEnd - w / 3, y: yEnd},   // horizontal tangent at end
            {x: xEnd,      y: yEnd},
        ));
        x = xEnd;
    }
    return new cv.CurveSequence(segments);
}

/*
 * The three tables of complex factors a rotary embedding multiplies its channel
 * pairs by, which one circle stands for.
 */
type RotaryTable<B extends cat.Datatype> = ds.ComplexRotary<B> | ds.Rotary;

/*
 * A rotary table drawn as a white circle holding a chirped sine and cosine: the
 * angle a table holds runs faster along the positions for an early channel pair
 * than for a late one, and the two waves widening from left to right say so.
 *
 * Every table writes its own name over the circle, which the user asked for on
 * 2026-09-18. A RoPE table, a YaRN table and a table a caller names are drawn
 * alike otherwise, and the name is what tells a reader which of them the glyph
 * stands for. The circle keeps the room the name takes below it as well as
 * above it, per `rotary_core_dims`.
 *
 * `this.circle` is the square the circle is drawn in, a child of the core
 * translated past the strip the name stands in. The pointer answers on that
 * square, so an inspection box opens from the glyph the reader sees rather
 * than from the name or from the column of wires the table emits, which for a
 * table of three is 60 px against the circle's 45.
 *
 * The wires leaving the table start inside the circle, at `ROTARY_WIRE_INSET`
 * from its right edge.
 */
@bb.opsRegistry.registerClass(ds.ComplexRotary)
class ComplexRotaryBox<B extends cat.Datatype, A extends cat.Axis> extends bb.OperationBox<B, A, RotaryTable<B>> {
    private name_room: number;
    private circle: rh.CoreElement;
    private name_label?: rh.AnnotationElement;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, RotaryTable<B>>,
    ) {
        super(categoryRenderer, target, rotary_core_dims(target.operator));
        this.name_room = rotary_name_room(target.operator);
        this.circle = new rh.CoreElement(
            this.categoryRenderer.renderHandler,
            {x: 2 * RADIUS, y: 2 * RADIUS});
        this.circle.transform.offset = {x: 0, y: this.name_room};
        this.core.children = [this.circle];
        const name = target.operator.name?.to_latex();
        if (name) {
            this.name_label = new rh.AnnotationElement(
                this.categoryRenderer.renderHandler,
                name,
                {font_size: ROTARY_NAME_FONT_SIZE});
        }
    }
    public region_element(_holder: bb.BroadcastedBox<B, A>): rh.DiagramElement {
        return this.circle;
    }
    /* The strip above the circle the name is written in, as wide as the name
     * needs and centred on the circle. */
    private name_strip(
        circle: pt.Rectangle,
        label: rh.AnnotationElement,
    ): pt.Rectangle {
        const width = label.estimated_text_dims().x;
        return new pt.Rectangle(
            {x: circle.midpoint().x - width / 2,
             y: circle.top - this.name_room},
            {x: width, y: this.name_room - ROTARY_NAME_GAP});
    }
    update(): void {
        this.right_anchors.transform.offset = {x: -ROTARY_WIRE_INSET, y: 0};
        super.update();
        const circle = this.circle.rectangle();
        const midpoint = circle.midpoint();
        this.draw?.circle(
            midpoint,
            {radius: RADIUS, fill: 'white'},
            {dropShadow: true}
        );
        this.draw?.curve(
            chirpSine(midpoint, RADIUS),
            {'stroke': '#2255cc', 'stroke-width': '1.5px'});
        this.draw?.curve(chirpCosine(midpoint, RADIUS),
            {'stroke': '#cc4422', 'stroke-width': '1.5px'});
        const midline = new cv.StraightLine(
            {x: midpoint.x - RADIUS, y: midpoint.y},
            {x: midpoint.x + RADIUS, y: midpoint.y}
        );
        this.draw?.curve(midline,
            {'stroke': 'black', 'stroke-width': '1px', 'stroke-dasharray': '1,2'});
        if (this.name_label) {
            this.name_label.place(this.name_strip(circle, this.name_label));
        }
    }
}

/*
 * The registry keys on the exact class name, so each of the three tables is
 * registered by hand. A `ds.YarnRotary` inherits from `ds.Rotary` and is looked
 * up under its own name alone.
 */
bb.opsRegistry.registerClass(ds.Rotary)(ComplexRotaryBox);
bb.opsRegistry.registerClass(ds.YarnRotary)(ComplexRotaryBox);

/* How deep the point of a pairing chevron stands out of its flat edge, and how
 * far the shape is drawn past the anchors it spans. */
const COMPLEX_PAIRING_DEPTH = 5;
const COMPLEX_PAIRING_PAD = 2;

/*
 * Which side of its rectangle a pairing chevron points at. `Decomplex` points
 * right, at the two reals a complex number becomes, and `PairsAsComplex` points
 * left, back at the two reals it reads, so the two boxes read as one shape
 * turned over.
 */
enum ChevronPoint {
    LEFT = 'left',
    RIGHT = 'right',
}

/* The band of wires a pairing chevron spans, in page coordinates. */
interface ChevronStrip {
    top: number;
    bottom: number;
}

/*
 * The chevron the two complex pairings are drawn as: a flat edge down one side
 * with a notch of `COMPLEX_PAIRING_DEPTH` cut into it, and a point of the same
 * depth on the middle of the other side.
 *
 * `strip` bounds the wires the chevron spans, and the side the point is on is
 * the whole of the difference between the two operators.
 */
function draw_pairing_chevron(
    box: bb.OperationBox<any, any, any>,
    strip: ChevronStrip,
    point: ChevronPoint,
): void {
    const rect = box.rectangle();
    const span = rect.width + 2 * COMPLEX_PAIRING_PAD;
    const half_height = (strip.bottom - strip.top) / 2;
    const towards_point = point === ChevronPoint.RIGHT ? 1 : -1;
    const flat_x = point === ChevronPoint.RIGHT
        ? rect.left - COMPLEX_PAIRING_PAD
        : rect.right + COMPLEX_PAIRING_PAD;
    box.draw?.deltaPolygon(
        [{x: flat_x, y: strip.top},
         {x: towards_point * (span - COMPLEX_PAIRING_DEPTH), y: 0},
         {x: towards_point * COMPLEX_PAIRING_DEPTH, y: half_height},
         {x: -towards_point * COMPLEX_PAIRING_DEPTH, y: half_height},
         {x: -towards_point * (span - COMPLEX_PAIRING_DEPTH), y: 0},
         {x: towards_point * COMPLEX_PAIRING_DEPTH, y: -half_height},
        ],
        {fill: Color.from_h360sv(0, 0.5, 1).hex(), stroke: 'black',
         'stroke-width': '1px'},
        {dropShadow: true}
    );
}

/*
 * The band of wires a pairing chevron spans, which is the column carrying the
 * complex array: a complex wire is a datatype wire beside the axis, where the
 * real side carries the axis alone. A column with fewer than two wires falls
 * back to the box's own rectangle.
 */
function complex_column_strip(
    box: bb.OperationBox<any, any, any>,
    complex_column: cr.Meridian<any>,
): ChevronStrip {
    const rect = box.rectangle();
    const anchors = complex_column.anchors;
    const first = anchors[0]?.location()?.y;
    const last = anchors[anchors.length - 1]?.location()?.y;
    if (first === undefined || last === undefined || anchors.length < 2) {
        return {top: rect.top, bottom: rect.bottom};
    }
    return {top: Math.min(first, last) - COMPLEX_PAIRING_PAD,
            bottom: Math.max(first, last) + COMPLEX_PAIRING_PAD};
}

@bb.opsRegistry.registerClass(ds.Decomplex)
class DecomplexBox<B extends cat.Datatype, A extends cat.Axis> extends bb.OperationBox<B, A, ds.Decomplex> {
    private annotation: rh.AnnotationElement;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ds.Decomplex>,
    ) {
        super(categoryRenderer, target, {x: 30, y: 25});
        this.annotation = new rh.AnnotationElement(
            this.categoryRenderer.renderHandler,
            '\\mathbb{R}^2',
            {font_size: 1});
    }
    update(): void {
        super.update();
        draw_pairing_chevron(
            this,
            complex_column_strip(this, this.input_meridians[0]),
            ChevronPoint.RIGHT);
        this.annotation.place(this.rectangle());
    }
}

/*
 * `PairsAsComplex` reads adjacent pairs of reals as complex numbers, which is
 * the inverse of `Decomplex`, so it is drawn as the same chevron pointing the
 * other way. The complex array leaves the operator, so the chevron spans the
 * result's column, and the annotation names the datatype the operator
 * produces.
 */
@bb.opsRegistry.registerClass(ds.PairsAsComplex)
class PairsAsComplexBox<B extends cat.Datatype, A extends cat.Axis> extends bb.OperationBox<B, A, ds.PairsAsComplex> {
    private annotation: rh.AnnotationElement;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ds.PairsAsComplex>,
    ) {
        super(categoryRenderer, target, {x: 30, y: 25});
        this.annotation = new rh.AnnotationElement(
            this.categoryRenderer.renderHandler,
            '\\mathbb{C}',
            {font_size: 1});
    }
    update(): void {
        super.update();
        draw_pairing_chevron(
            this,
            complex_column_strip(this, this.output_meridians[0]),
            ChevronPoint.LEFT);
        this.annotation.place(this.rectangle());
    }
}

/*
 * A wire drawn across an operator says that the operator is broadcast over the
 * axis the wire carries. The axis a selection runs over is read by the
 * operator, so it is a target of every weave of the `TopK` and no wire crosses
 * the diamond. The operand's axis ends at the left column and each result's
 * axis starts from the right column. The two are never linked, whatever the
 * relation between them, and the rule holds in all four forms of `TopK`. In
 * the `WEIGHTS` form the result rides the sparse axis `k/n` and in the other
 * three it rides a dense axis of size `k`.
 *
 * Until 2026-09-16 the operand's axis was linked to the first target axis of
 * every result with `pass_anchor_through`, on the reading that `n` before the
 * selection and `k/n` after it are the same wire read twice. The user rejected
 * that reading. A wire passing through an operator is the mark of a degree
 * axis, so drawing a consumed axis with it says that the selection is
 * broadcast over the entries it chooses among. The degree axes go on crossing
 * the box, which is what `BroadcastDisplayType.NODE` draws into the glyph, so
 * the picture now distinguishes the two.
 */
@bb.opsRegistry.registerClass(ds.TopK)
class TopKBox<B extends cat.Datatype, A extends cat.Axis> extends gb.GlyphBox<B, A, ds.TopK> {
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ds.TopK>,
    ) {
        super(categoryRenderer, target, {x: 30, y: 30});
        /*
         * As `LinearBox` does: draw the `n -> k/n` selection as an explicit
         * node rather than routing the degree around the operator. The
         * reindexing is the whole content of a TopK, so hiding it in the weave
         * loses what the box is for.
         */
        this.override_display_type = bb.BroadcastDisplayType.NODE;
    }
    protected get glyph_fill(): string { return SELECTION_GREEN; }
    protected get bitten_corner(): gb.Corner { return gb.Corner.BOTTOM_LEFT; }
    protected draw_glyph(glyph: pt.Rectangle): void {
        drawSelectionGlyph(this.draw, glyph, SELECTION_KEEPS);
    }
}

/*
 * Which half of the selection glyph the grey diamond fills, as the y direction
 * its point faces. The two values are the whole of the difference between a
 * selection and its reverse, so they are named rather than written as +1 and -1
 * at the two call sites.
 *
 * A selection takes n entries and keeps k, so its grey half sits above the
 * centre. Its reverse takes k entries and returns n, so its grey half sits
 * below, and the two boxes read as one shape turned over.
 */
const SELECTION_KEEPS = 1;
const SELECTION_RETURNS = -1;

/* The green a selection and its reverse are drawn in, glyph and background. */
const SELECTION_GREEN = '#7ED321';

/*
 * A green diamond with a smaller grey diamond filling the half `tip` faces, and
 * a line down the vertical axis. `TopKBox` and `InjectBox` are the two callers.
 *
 * The outer diamond is symmetric under the flip and the grey one is not, so the
 * grey half is the only mark that says which way the box is being read. It is
 * the same device `TransposeBox` uses in
 * `display/Framework/para/ParaCategoryRenderer.ts`, where a bite in one corner
 * of a rectangle moves to the opposite corner.
 */
export function drawSelectionGlyph(
    draw: dh.DrawHandler<any> | undefined,
    rect: pt.Rectangle,
    tip: number,
): void {
    const square_size = Math.min(rect.width / 2, rect.height / 2);
    const middle = rect.midpoint();
    draw?.deltaPolygon(
        [{x: middle.x, y: middle.y - tip * square_size},
         {x:  square_size, y:  tip * square_size},
         {x: -square_size, y:  tip * square_size},
         {x: -square_size, y: -tip * square_size},
        ],
        {fill: SELECTION_GREEN}
    );
    draw?.deltaPolygon(
        [{x: middle.x, y: middle.y - tip * square_size},
         {x:  square_size/2, y:  tip * square_size/2},
         {x: -square_size/2, y:  tip * square_size/2},
         {x: -square_size/2, y: -tip * square_size/2},
        ],
        {fill: '#D8D8D8'}
    );
    draw?.polyline([
        {x: middle.x, y: middle.y - square_size},
        {x: middle.x, y: middle.y + square_size},
    ]);
}

/*
 * The reverse derivative of a selection: `[R, k/n] -> [R, n]`, declared in
 * `para/data_structure/Inject.ts` and written by
 * `deepseek/registries/derivative.py`.
 *
 * The box lives here rather than beside the other `para` boxes, because a
 * reader compares it against `TopKBox` and the two share `drawSelectionGlyph`.
 * `ParaCategoryRenderer` keeps the class in its `PARA_OPERATORS` list so the
 * bundle does not shake the term out.
 *
 * `NODE`, as `TopKBox` sets: the `k/n -> n` map is the whole content of the
 * operator, and drawing it as a node the degree wires pass into is what the box
 * is for.
 *
 * The bite sits in the top-left corner where `TopKBox`'s sits in the
 * bottom-left, which is the flip `drawSelectionGlyph` gives the grey half, so
 * the two boxes read as one shape turned over. `raise_rows` is false for the
 * reason it is false on `LinearBox`: the selector ends at the glyph rather
 * than cupping into a column, so the tape runs down onto the rectangle the
 * `GlyphBox` draws behind the diamond.
 */
@bb.opsRegistry.registerClass(pinj.Inject)
class InjectBox<B extends cat.Datatype, A extends cat.Axis> extends gb.GlyphBox<B, A, pinj.Inject> {
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, pinj.Inject>,
    ) {
        super(categoryRenderer, target, {x: 30, y: 30});
        this.override_display_type = bb.BroadcastDisplayType.NODE;
        this.raise_rows = false;
    }
    protected get glyph_fill(): string { return SELECTION_GREEN; }
    protected get bitten_corner(): gb.Corner { return gb.Corner.TOP_LEFT; }
    protected draw_glyph(glyph: pt.Rectangle): void {
        drawSelectionGlyph(this.draw, glyph, SELECTION_RETURNS);
    }
}

/* The slash `pyncd`'s `SparseAxis.template` writes between the axis's own
 * letter and the letter of the axis its entries are chosen from. */
const PARENT_SLASH = '/';

/*
 * The parent half of a sparse axis's label: the letter after the slash of the
 * axis's own name, carrying the exponent the name holds.
 *
 * `pyncd`'s `algebra.write_axis_exponents` writes the integer an axis's local
 * size comes to as the exponent of that axis's name, and the local size of a
 * sparse axis is its parent's size, so the name `k/e` with the exponent 384 says
 * that the six experts are chosen from 384. The exponent belongs to the parent
 * letter, which gives `e^{384}`. `null` where the name holds no slash or no
 * exponent.
 *
 * The parent is built as a `DynamicName` carrying the exponent and the name's
 * settings, and asked for its latex, rather than having the exponent appended
 * to it here, so that the placement the settings declare is applied in the one
 * place that applies it everywhere else. The size lowered into the subscript
 * reads `e_{384}`.
 */
export function sparse_parent_latex(name: fd.DynamicName): string | null {
    const slash = (name.body ?? '').indexOf(PARENT_SLASH);
    if (slash < 0 || name.exponent_group_latex() === '') {
        return null;
    }
    const parent = new fd.DynamicName(
        (name.body ?? '').slice(slash + PARENT_SLASH.length), name.subscript,
        name.settings, null, name.exponent);
    return parent.to_latex();
}

/*
 * A sparse axis carries `activity` of its `_size` entries, and both numbers are
 * worth reading off the wire, so it labels itself "k of n" where every other
 * axis shows the size alone. `pyncd`'s `SparseAxis.template` names the axis
 * 'k/n' as decoration, and the two numerics are the fact.
 *
 * The activity half is the activity numeric's own latex, so an activity a
 * configuration assigned 6 reads `|k|^{6}`, and `|k|_{6}` where the name's
 * settings lower the size into the subscript. The parent half is
 * `sparse_parent_latex`, and the parent's size numeric where the name carries no
 * exponent for it to read. The size numeric is taken rather than `size_text()`,
 * which for a non-integer size reads the axis's own name, and the axis's own
 * name is the 'k/n' placeholder the whole label replaces.
 * `pyncd/obsidian/08-backends/Compound Axis Labels.md` states the rule for a
 * label holding several symbols.
 *
 * An anonymous free numeric prints as nothing, and half a label is worse than
 * the axis's own name, which is 'k/n' by default, so an empty half falls back to
 * it.
 *
 * Only the text changes. A sparse axis is still a plain black wire, since the
 * sparsity is a fact about the data rather than about where it is computed.
 */
@scr.axesRegistry.registerClass(ds.SparseAxis)
class SparseAxisProcessor<A extends ds.SparseAxis> extends scr.AxisProcessor<A> {
    annotation_text(): string {
        const name = this.axis.uid._name;
        const activity = this.axis.activity.to_latex();
        const parent = name == null ? null : sparse_parent_latex(name);
        const entries = parent ?? this.axis._size.to_latex();
        if (!activity || !entries) {
            return super.annotation_text();
        }
        return `${activity} \\text{ of } ${entries}`;
    }
}

/*
 * The cup a gather is drawn as: one cup from the first of `cup` to the last,
 * where the index arrives at the top and the axis it reads along at the
 * bottom.
 *
 * Anchors run top to bottom and the arc's sweep is fixed, so first to last is
 * the direction that bulges rightwards, which is the way the wires arrive
 * from the left and turn back into each other.
 * `additionalOperationBoxes.draw_cup_between_anchors` is the same cup
 * `EinopsBox` draws, and it draws the quarter turn instead where a `ParaWrap`
 * has put one of the two ends on the row along the box's top edge.
 */
function draw_gather_cup<A>(
    box: bb.OperationBox<any, any, any>,
    cup: cr.Anchor<A>[],
): void {
    const index = cup[0];
    const read_along = cup[cup.length - 1];
    if (cup.length >= 2 && index && read_along) {
        aob.draw_cup_between_anchors(box, index, read_along);
    }
}

/*
 * `IndexSelect` is the expanded `Select`: the selection no longer rides a
 * sparse axis but arrives as an explicit `Natural(n)` index operand, and the
 * payload keeps its dense axis.
 *
 * Drawn as an einops cup rather than as a box, because it states the same kind
 * of fact - no glyph, just that these wires meet. `EinopsBox` groups its left
 * anchors by the index each one carries and cups every group; a gather has no
 * signature to group by, so there is a single group holding every target left
 * anchor, and one arc spans the lot: the index's `k` at the top down to the
 * payload's `n` at the bottom. The output leaves the far side on its own, the
 * way an einops output does.
 */
@bb.opsRegistry.registerClass(ds.IndexSelect)
class IndexSelectBox<B extends cat.Datatype, A extends cat.Axis> extends bb.OperationBox<B, A, ds.IndexSelect> {
    /*
     * The anchors the cup spans, read off the operand meridians in the
     * constructor rather than off the left column at update time.
     *
     * `OperationBox.apply_wrap` rebuilds `left_anchors` around the operands a
     * `ParaWrap` left in the column, so an index grabbed off a tape is no
     * longer there and the column holds the payload's axis alone. The
     * meridians are built once and keep their anchors whichever side the
     * layout deals them onto, which is what `apply_wrap` relies on for
     * `EinopsBox`'s cups as well.
     */
    private cup: cr.Anchor<B | A>[];
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ds.IndexSelect>,
    ) {
        // Zero height, as `EinopsBox` takes: the cup is drawn between the
        // anchors, so a core sized to hold a glyph would only push them apart.
        super(
            categoryRenderer,
            target,
            {x: categoryRenderer.settings.operation_core_dims.x, y: 0},
        );
        this.cup = this.input_meridians.flatMap((meridian) => meridian.anchors);
    }
    update(): void {
        draw_gather_cup(this, this.cup);
        super.update();
    }
}

/* The narrowest a `MergedPositionsBox` is drawn, and the room it leaves
 * between each vertical edge and the stride label against it. */
const MERGED_POSITIONS_WIDTH = 50;
const MERGED_POSITIONS_PAD = 4;

/* Wide enough for `name` in the middle with the strides of `reindexing` at the
 * two edges. `scr.affine_label_room` measures a name beside a set of strides,
 * so this box and the merge pentagon of `additionalOperationBoxes` are sized
 * by one estimate. */
function merged_positions_width(
    name: string | undefined,
    reindexing: unknown,
): number {
    return Math.max(
        MERGED_POSITIONS_WIDTH,
        2 * MERGED_POSITIONS_PAD + scr.affine_label_room(
            aob.merge_stride_texts(reindexing).flatMap(
                (text) => text === undefined ? [] : [text]),
            name, 1));
}

/* The side of a box a stride label is placed against. */
type StrideSide = 'left' | 'right';

/* The stride `annotation` placed inside `rect` against `side`, on the strip
 * `row` gives it, or across the whole height where the box has no row for
 * it. */
function place_stride_against_edge(
    renderHandler: rh.RenderHandler<any, any>,
    rect: pt.Rectangle,
    row: pt.Rectangle | undefined,
    annotation: rh.AnnotationElement,
    side: StrideSide,
): void {
    annotation.annotationSettings.horizontal_align = side;
    annotation.annotationSettings.vertical_align = 'center';
    const strip = row ?? rect;
    renderHandler.annotation_handler.addAnnotation(
        new pt.Rectangle(
            {x: rect.left + MERGED_POSITIONS_PAD, y: strip.top},
            {x: rect.width - 2 * MERGED_POSITIONS_PAD, y: strip.height}),
        annotation);
}

/*
 * `MergedPositions` computes the positions a selected block covers, per
 * `deepseek.merged_positions`. One block number arrives, a rank-0 `Natural`
 * counting the blocks of the split axis. An array of positions leaves, a
 * `Natural` counting the entries of the axis the split was taken from, and it
 * carries the offset axes as its target, because each position it holds is a
 * function of an offset. The two arrays carry different datatypes over
 * different shapes.
 *
 * The box is drawn as a rectangle in the selection family's green with the
 * operator's name in the middle, as `GenericOperatorBox` draws an operator
 * that computes. The wire carrying the block number ends at the left edge, the
 * wire carrying the positions starts at the right edge, and no anchor links
 * the two, so the figure says that the operator reads one array and writes
 * another.
 *
 * The pentagon this box drew until 2026-09-15 is the glyph a reindexing is
 * drawn as. The thick datatype wire entering its point and the thick datatype
 * wire leaving its flat edge then read as one wire crossing a split, which is
 * how an axis crosses the pentagon of a `View`.
 *
 * Each stride sits at the edge the index it multiplies is drawn at. The stride
 * of the axis at `selected_position` multiplies the block number, which
 * arrives on the left. The stride of each offset multiplies an offset axis of
 * the result, which leaves on the right.
 */
@bb.opsRegistry.registerClass(ds.MergedPositions)
class MergedPositionsBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ds.MergedPositions> {
    private stride_annotations: (rh.AnnotationElement | undefined)[];
    private name_annotation?: rh.AnnotationElement;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ds.MergedPositions>,
    ) {
        super(categoryRenderer, target,
              {x: merged_positions_width(target.operator.name?.to_latex(),
                                         target.operator.reindexing),
               y: 30});
        this.stride_annotations = aob.merge_stride_annotations(
            this.renderHandler, target.operator.reindexing);
        const name = target.operator.name?.to_latex();
        this.name_annotation = name
            ? new rh.AnnotationElement(this.renderHandler, name)
            : undefined;
    }
    /* One entry per domain axis of the reindexing, in its order, carrying the
     * row that axis is drawn on and the side of the box it is drawn at. The
     * axis at `selected_position` is the block number on the operand, and the
     * rest are the result's target axes in order, per
     * `deepseek.merged_positions`. */
    private stride_rows(): {row?: pt.Rectangle, side: StrideSide}[] {
        const selected = this.target.operator.selected_position;
        const offsets = this.output_axes[0] ?? [];
        return this.stride_annotations.map((_stride, j) => j === selected
            ? {row: this.input_meridians[0]?.datatype_anchor?.rectangle(),
               side: 'left' as StrideSide}
            : {row: offsets[j < selected ? j : j - 1]?.rectangle(),
               side: 'right' as StrideSide});
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        this.draw?.drawRectangle(
            rect,
            {fill: Color.from_h360sv(96, 0.25, 1).hex(), 'stroke-width': '1px'},
            {dropShadow: true});
        this.name_annotation?.place(rect);
        for (const [annotation, {row, side}] of ut.zip(
            this.stride_annotations, this.stride_rows())) {
            if (annotation) {
                place_stride_against_edge(
                    this.renderHandler, rect, row, annotation, side);
            }
        }
    }
}

/* The radius of the dot a selection meets at, against the 2 of a copy's. A
 * green fill needs the room to be read as green, and the dot is the whole of
 * the figure. */
const SELECTION_DOT_RADIUS = 4;

/*
 * Whether a `Select` reads its payload at positions held as data, which is
 * `deepseek.data_structure.Select.at_positions`. It mirrors that module's
 * `reads_at_positions`, and the test is the same one: two operands, the first
 * of them carrying `Natural` positions.
 *
 * A `Select` in the other form, which is `Select.template`, reads no positions
 * from a wire. Its sparse axis carries the one-hot matrix itself.
 */
function reads_at_positions(target: cat.Broadcasted<any, any, ds.Select>): boolean {
    return target.input_weaves.length === 2
        && target.input_weaves[0].datatype instanceof cat.Natural;
}

/*
 * `Select` on a sparse axis is drawn as a reindexing that copies an axis is
 * drawn. Every wire of every operand runs to one dot and the result leaves
 * that dot, so the figure says that the selection axis and the parent axis the
 * payload carries are one index.
 *
 * A copy in an einops is the diagonal, and its matrix is one-hot on each
 * index. Reading a payload against the one-hot matrix of a selection is a
 * contraction against that diagonal, and it is the gather the operator
 * computes, so the two figures state the same relation between the two axes.
 * `obsidian/02-categories/Sparse Axes.md` carries both readings.
 *
 * The dot is in the selection family's green, where a copy's dot is black,
 * because a copy identifies the two axes outright and a selection relates them
 * by the positions the sparse axis holds. The axis prints `k of n` at the dot.
 */
class SelectOnSparseAxisBox<B extends cat.Datatype, A extends cat.Axis> extends bb.OperationBox<B, A, ds.Select> {
    /* The dot. It is the result's first anchor, which is its selection axis. */
    private junction?: cr.Anchor<B | A>;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ds.Select>,
    ) {
        // Zero height, as `IndexSelectBox` takes: the figure is where the
        // wires meet, so a core sized to hold a glyph would only push the
        // anchors apart.
        super(
            categoryRenderer,
            target,
            {x: categoryRenderer.settings.operation_core_dims.x, y: 0},
        );
        const [junction, ...leaving] = this.output_meridians.flatMap(
            (meridian) => meridian.anchors);
        this.junction = junction;
        if (!junction) {
            return;
        }
        /*
         * The dot stays inside the box. A loose anchor that has a prior is
         * skipped through, per `Anchor.skipped`, and the operands would then
         * be drawn meeting out in the gap past the result's column.
         */
        junction.allow_skip = false;
        for (const arriving of this.input_meridians.flatMap(
            (meridian) => meridian.anchors)) {
            arriving.anchor_link(junction);
        }
        for (const anchor of leaving) {
            junction.anchor_link(anchor);
        }
    }
    update(): void {
        // After the columns, which draw the wires and the black dot the
        // junction gives itself for fanning out. The green dot covers both.
        super.update();
        const point = this.junction?.location();
        if (point) {
            this.draw?.circle(
                point,
                {fill: SELECTION_GREEN, stroke: 'black', 'stroke-width': '1px',
                 radius: SELECTION_DOT_RADIUS},
            );
        }
    }
}

/*
 * `Select` at positions is the gather `IndexSelectBox` draws, taken over a
 * whole axis of slots at once, and it is drawn as the same cup.
 *
 * The positions arrive on a `Natural` wire, one per slot, and the operator
 * reads the payload along the axis those positions count over. Those two are
 * what the cup joins: the `Natural` datatype anchor of the positions at the
 * top down to the payload's axis at the bottom, which is the arc
 * `IndexSelectBox` draws between the index and the payload.
 *
 * The slot axis is a target of the positions and of the result, so the
 * operator reads it and is not broadcast over it. It therefore ends at the
 * left column and starts again at the right, as every consumed axis does, and
 * the two are not linked. The payload's datatype does cross the box, because
 * the gathered values are the payload's values and the wire carries the same
 * datatype on both sides. Everything else the operator is broadcast over, the
 * channels included, is degree, and `link_weaves` routes it round the cup.
 */
class SelectAtPositionsBox<B extends cat.Datatype, A extends cat.Axis> extends bb.OperationBox<B, A, ds.Select> {
    private cup: cr.Anchor<B | A>[];
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ds.Select>,
    ) {
        super(
            categoryRenderer,
            target,
            {x: categoryRenderer.settings.operation_core_dims.x, y: 0},
        );
        const positions = this.input_meridians[0];
        const payload = this.input_meridians[1];
        const result = this.output_meridians[0];
        if (payload?.datatype_anchor && result?.datatype_anchor) {
            this.pass_anchor_through(
                payload.datatype_anchor, result.datatype_anchor);
        }
        this.cup = [
            ...(positions?.datatype_anchor ? [positions.datatype_anchor] : []),
            ...(this.input_axes[1] ?? []),
        ];
    }
    update(): void {
        draw_gather_cup(this, this.cup);
        super.update();
    }
}

/*
 * The box for a `Select`, by the form the term is in. The registry keys on the
 * operator's class alone, and the two forms share it, so the choice is made
 * here rather than by a third box that dispatches inside itself.
 */
bb.opsRegistry.registerFunction(ds.Select)(
    <B extends cat.Datatype, A extends cat.Axis>(
        categoryRenderer: bb.BroadcastedRenderer<B, A>,
        target: cat.Broadcasted<B, A, ds.Select>,
    ): bb.OperationBox<B, A, ds.Select> =>
        reads_at_positions(target)
            ? new SelectAtPositionsBox(categoryRenderer, target)
            : new SelectOnSparseAxisBox(categoryRenderer, target));
