import * as rh from '../Render/RenderHandler';
import * as rhs from '../Render/RenderHandlerSettings';
import * as te from '../Render/TextEstimator';
import * as cat from '../../data_structure/Category';
import {Separated} from '../../utilities/Separated';
import * as cr from './CategoryRenderer';
import * as crs from './CategoryRendererSettings';
import * as ut from '../../utilities/utilities';
import * as pt from '../../utilities/Point';
import * as nm from '../../data_structure/Numeric';
import * as nmr from './NumericRenderer';
import * as dhd from '../Render/DrawHandler';
import * as utcr from '../../utilities/ConstructorRegistry';
import * as tu from '../../data_structure_processing/term_utilities';
import * as contra from '../../para/data_structure/Contravariant';
import * as Curve from '../../utilities/Curve';
import { Color } from '../../utilities/Color';

/*
 * How an axis names itself on a wire when nothing else is registered for it.
 *
 * A concrete size prints as its value; anything else is named by the axis,
 * since a free numeric has no name of its own to print.
 *
 * An axis whose name carries an exponent is named here whatever its size,
 * because `pyncd`'s `notebooks/display/axis_sizes.py` writes the assigned size
 * into that exponent under `AxisSizes.EXPONENT` and the name then reads
 * `m^{5120}`. The integer would state the size a second time, a few pixels from
 * the first.
 */
export function axis_size_text(axis: cat.Axis): string {
    const name = axis.uid._name;
    if (name?.exponent != null) {
        return name.to_latex();
    }
    return axis._size instanceof nm.Integer
        ? axis._size._value.toString()
        : name?.to_latex() || '';
}

/*
 * How an axis is drawn, split out of `AxisAnchor` the way `BlockProcessor` is
 * split out of `BlockBox`: the anchor owns the geometry and the links, the
 * processor owns the paint. An extension that adds an `Axis` subclass carrying
 * something worth showing - a sparse axis, say - registers a processor for it
 * here instead of subclassing the anchor, which the renderer builds
 * unconditionally and so cannot be swapped out per axis.
 */
export const axesRegistry = new utcr.ConstructorRegistry<
    cat.Axis,
    AxisProcessor<any>,
    [cr.CategoryRenderer<any, any, any>,
     cat.Axis,
     AxisAnchor<any> | null,
     cat.Array<any, any> | null]
>();

@axesRegistry.registerDefaultClass
export class AxisProcessor<A extends cat.Axis> {
    constructor(
        public categoryRenderer: cr.CategoryRenderer<A, any, A>,
        public axis: A,
        // The anchor whose wire this axis is drawn on, and `null` for a
        // processor built to name an axis outside the drawing, which
        // `axis_annotation_text` does for the legend.
        public axisAnchor: AxisAnchor<A> | null,
        // The array this axis was drawn as part of, when there is one. A lone
        // axis - the ones inside a reindexing node - has none.
        public array: cat.Array<any, A> | null = null,
    ) {}

    get settings() {
        return this.categoryRenderer.settings;
    }

    /*
     * The axis's own colour, or `null` for an axis that has nothing to say -
     * which is every axis in the base category, and is why the default
     * processor reproduces the plain black wire exactly.
     */
    color(): Color | null {
        return null;
    }
    stroke(): string {
        return this.color()?.hex() || 'black';
    }
    stroke_width(): string {
        return '1px';
    }
    curve_attributes(): Partial<dhd.LineAttrs> {
        return {
            'stroke': this.stroke(),
            'stroke-width': this.stroke_width(),
        };
    }
    dot_attributes(): Partial<dhd.CircleAttrs> {
        return {fill: this.stroke(), stroke: this.stroke(), radius: 2};
    }
    /*
     * The wire's label. The anchor asks the processor for it, so an axis that
     * carries more than a size - a sparse one, say - can put that in the label,
     * the same way `color()` lets it paint its own wire.
     */
    annotation_text(): string {
        return this.size_text();
    }
    protected size_text(): string {
        return axis_size_text(this.axis);
    }
    /*
     * How wide the `ComposedGap` holding this wire's label has to be, over the
     * width the gap takes anyway. Zero for an axis named by a letter and a
     * size, which fits the gap already. A concatenated axis is the one axis
     * whose label is wider than that, because it holds the label of every part.
     */
    label_width(): number {
        return 0;
    }
    annotation_color(): string | undefined {
        return this.color()?.hex();
    }
    annotation_settings(): Partial<rh.AnnotationElementSettings> {
        return {
            font_size: rhs.axis_label_font_size(
                this.categoryRenderer.renderHandler.settings),
            color: this.annotation_color(),
        };
    }
}

/*
 * The text an axis carries on its wire, for a reader outside the render.
 *
 * The legend names each of its rows with it, so a row and the wires it stands
 * for read alike. The processor is built directly rather than through an
 * `AxisAnchor`, because an anchor is a `DiagramElement` and every
 * `DiagramElement` registers itself with the render handler as it is
 * constructed, which would add elements to a figure already drawn.
 */
export function axis_annotation_text(
    categoryRenderer: cr.CategoryRenderer<any, any, any>,
    axis: cat.Axis,
): string {
    return axesRegistry.getConstructor(axis)(
        categoryRenderer, axis, null, null).annotation_text();
}

export interface AxisAnnotationFormat {
    text: (axis_text: string) => string;
    minimum_width: (text: string) => number;
}

/*
 * The highlight an axis is named by, keyed on the uid that is the axis's
 * identity. Every wire and every name of the axis registers under it, and the
 * legend row for the axis sets and answers it through the same key.
 */
export function axis_highlight_token(axis_id: number): string {
    return `axis:${axis_id}`;
}

export class AxisAnchor<A extends cat.Axis> extends cr.Anchor<A> {
    private annotation?: rh.AnnotationElement;
    private gap_annotation?: rh.AnnotationElement;
    private annotation_format?: AxisAnnotationFormat;
    private _processor!: AxisProcessor<A>;
    /* How many wires this anchor has drawn, which names the source each
     * wire's hover sets the highlight from. */
    private drawn_wires: number = 0;

    constructor(
        public categoryRenderer: cr.CategoryRenderer<A, any, A>,
        public target: A,
    ) {
        super(categoryRenderer);
        this.setBorderColor('green');
        this.assign_processor(null);
    }

    get processor(): AxisProcessor<A> {
        return this._processor;
    }

    /*
     * Build the processor for this axis and take its paint. Called once from
     * the constructor so that an axis drawn on its own still has one, and again
     * from `ArrayMeridian` once the array is known, so a processor may read the
     * datatype the axis travels with.
     */
    public assign_processor(array: cat.Array<any, A> | null): AxisProcessor<A> {
        this._processor = axesRegistry.getConstructor(this.target)(
            this.categoryRenderer,
            this.target,
            this,
            array,
        ) as AxisProcessor<A>;
        this.curve_attributes = this._processor.curve_attributes();
        // The label takes its colour from the processor, so a processor
        // arriving after the label was built must invalidate it.
        this.annotation = undefined;
        this.gap_annotation = undefined;
        return this._processor;
    }

    protected dot_attributes(): Partial<dhd.CircleAttrs> {
        return this._processor.dot_attributes();
    }

    public set_annotation_format(format: AxisAnnotationFormat): void {
        this.annotation_format = format;
        this.gap_annotation = undefined;
    }

    public label_width(): number {
        return Math.max(
            this.annotation_format?.minimum_width(this.get_gap_annotation().latex) ?? 0,
            this._processor.label_width());
    }

    public highlight_token(): string {
        return axis_highlight_token(this.target.uid._id);
    }

    /* A name of this axis, lit with the axis where halos are drawn at all, and
     * setting it under the pointer where the axes of the figure answer one. */
    private highlighted_annotation(latex: string): rh.AnnotationElement {
        const annotation = new rh.AnnotationElement(
            this.renderHandler, latex, this._processor.annotation_settings());
        if (rhs.draws_axis_halos(this.renderHandler.settings)) {
            annotation.halo_token = this.highlight_token();
        }
        if (rhs.axes_answer_the_pointer(this.renderHandler.settings)) {
            annotation.add_hover_token(this.highlight_token());
        }
        return annotation;
    }

    public get_gap_annotation(): rh.AnnotationElement {
        if (!this.annotation_format) {
            return this.getAnnotation();
        }
        if (!this.gap_annotation) {
            this.gap_annotation = this.highlighted_annotation(
                this.annotation_format.text(this._processor.annotation_text()));
        }
        return this.gap_annotation;
    }

    /*
     * The label is set in braces, so that KaTeX draws it on one line. KaTeX
     * breaks an inline formula after a binary operator when its box is
     * narrower than the formula, and a gap's box is, so the concatenated axis
     * `w+s` of an `aops.ConcatenateAxes` came out as `w +` above `s` and the
     * first of the two lines landed on the row above. A formula in braces is
     * one group and is not broken, which is what
     * `quantisationLabels.label_latex` does for a datatype's label.
     */
    public getAnnotation(): rh.AnnotationElement {
        if (!this.annotation) {
            this.annotation = this.highlighted_annotation(
                `{${this._processor.annotation_text()}}`);
        }
        return this.annotation;
    }

    public update(): void {
        if (!this.skipped() && (this.prior_terminal().length > 1 || this.next_terminal().length > 1)) {
            this.add_dot = true;
        }
        super.update();
    }

    /*
     * The wire with a halo under it, where the settings draw one. The halo is
     * lit wherever the axis is highlighted, and where the axes of the figure
     * answer the pointer it is the hit target rather than the wire, because a
     * pointer rests on a wider stroke more easily than on a one pixel one.
     */
    protected draw_wire(
        curve: Curve.Curve,
        layer: 'main' | 'broadcast',
    ): dhd.DrawElement | undefined {
        if (!rhs.draws_axis_halos(this.renderHandler.settings)) {
            return super.draw_wire(curve, layer);
        }
        const halo = cr.draw_wire_halo(
            this.draw, curve, this.curve_attributes,
            this.settings.axis_halo_extra_width, layer);
        const wire = super.draw_wire(curve, layer);
        cr.link_halo(this.renderHandler, halo, [this.highlight_token()],
                     this.settings.halo_opacity);
        if (halo !== undefined && rhs.axes_answer_the_pointer(this.renderHandler.settings)) {
            this.drawn_wires += 1;
            const source = `${this.diagram_id}:wire:${this.drawn_wires}`;
            this.events?.addHover(
                halo,
                () => this.renderHandler.set_highlight(
                    this.highlight_token(), source, true),
                () => this.renderHandler.set_highlight(
                    this.highlight_token(), source, false));
        }
        return wire;
    }
}

/*
 * The anchor in the middle of a reindexing, which every input links to and
 * which links to every output.
 *
 * It paints no wire. The links through it are the wiring of the reindexing, and
 * `next_terminal`, `prior_terminal` and the terminal walk of `wire_connections`
 * read them. Painted, they are a fan of thin wires inside the pentagon or the
 * hexagon, over the fill and under the strides and the name. The user asked on
 * 2026-09-17 for a reindexing to draw no wire inside its own box, so the anchor
 * clears `paints_wires`. A wire outside the box has an anchor of one of the two
 * columns at one end and a neighbour at the other, and is drawn as it was.
 */
export class NodeAnchor<A extends cat.Axis> extends cr.Anchor<A> {
    public paints_wires: boolean = false;
    constructor(
        public categoryRenderer: StrideRenderer<A>,
    ) {
        super(categoryRenderer);
    }
}

/*
 * `deltaPolygon` takes its first point absolutely and every later one as a step
 * from the one before. A pentagon is far easier to state - and to check - as
 * five corners, so it is stated that way and converted here.
 */
function deltas(points: pt.Point[]): pt.Point[] {
    return points.map((point, i) => i === 0 ? point : {
        x: point.x - points[i - 1].x,
        y: point.y - points[i - 1].y,
    });
}

/* The font size the strides and the shift of an affine are written at. */
export const AFFINE_LABEL_FONT_SIZE = 0.65;
/* The room kept between a stride against the flat edge and the label at the
 * point where the two share a line. */
export const AFFINE_LABEL_GAP = 6;
export const SHIFT_ONLY_REINDEXING_HEIGHT = 30;
/* The least width a reindexing with no domain is drawn at, which holds the
 * point and enough body behind it to read as one. */
export const SHIFT_ONLY_REINDEXING_MINIMUM_WIDTH = 24;

/*
 * The shift as it is written beside the output, or `undefined` when there is
 * nothing worth writing.
 *
 * Zero is the common case and prints as nothing: `0` on every reindexing that
 * merely sums its inputs is noise, and the user asked for the shift only when
 * it is there. Nothing is written in front of the numeric, so the shift
 * `2|a| - 2` reads as the number it is.
 */
function shift_string(shift: nm.Numeric | undefined): string | undefined {
    if (shift === undefined
     || (shift instanceof nm.Integer && shift._value === 0)) {
        return undefined;
    }
    return nmr.numeric_string(shift);
}

/*
 * How much width a pentagon's labels need. The strides sit against the flat
 * edge and the label at the point sits hard against the point, and with a
 * single domain axis the two share a line, so the body has to hold the widest
 * stride and the label at the point side by side with `AFFINE_LABEL_GAP`
 * between them. The texts are measured bare, so the room is the text and the
 * one gap, and a pentagon is widened past `reindexing_pentagon_width` only
 * where its labels need the room.
 *
 * An operation box that writes the same labels onto a glyph of its own sizes it
 * through this function, so the two are measured by one estimate.
 */
export function affine_label_room(
    stride_texts: string[],
    point_text: string | undefined,
    point_font_size: number,
): number {
    return te.estimate_bare_text_width(stride_texts, AFFINE_LABEL_FONT_SIZE)
        + (point_text === undefined
           ? 0
           : te.estimate_bare_text_width([point_text], point_font_size))
        + AFFINE_LABEL_GAP;
}

/*
 * One reindexing, drawn either as a hexagon or - when its codomain is a single
 * axis - as a pentagon pointing at that axis.
 *
 * The hexagon says only that the input degrees meet and the output degrees
 * leave. It is symmetric, and deliberately silent about the arithmetic. A
 * reindexing onto ONE axis has arithmetic small enough to put in the figure:
 * the whole morphism is the single row `cod = sum_j stride_j * dom_j + shift`,
 * so every incoming wire can carry its own stride and the output can carry the
 * shift. The point is what makes that readable - it names the end the row is
 * summed onto, which a symmetric hexagon cannot.
 *
 * Which end that is follows `settings.reversed` rather than a fixed side. The
 * stride renderer draws a reindexing's codomain on the LEFT, because the
 * reindexing maps output indices back to input ones and drawing it swapped
 * keeps the picture reading left to right; `swap_anchors` has already applied
 * that below, so the point reads the same flag instead of second-guessing it.
 */
export class StrideMorphismBox<A extends cat.Axis> extends cr.MorphismBox<A, cat.StrideMorphism<A>, A> {
    public central_node: NodeAnchor<A>;
    public annotation?: rh.AnnotationElement;
    /*
     * The two columns by their role in the algebra, kept beside `left_anchors`
     * / `right_anchors`, which are the same two by their role in the picture
     * and are swapped under `reversed`. The strides are indexed by the domain,
     * so labelling them needs the algebraic name for the column, not the
     * positional one.
     */
    public dom_anchors: cr.ProdObjectMeridian<A, A>;
    public cod_anchors: cr.ProdObjectMeridian<A, A>;
    // One per domain axis, in order; absent where the numeric has no rendering.
    private stride_annotations: (rh.AnnotationElement | undefined)[] = [];
    // Drawn at the point: the shift when it is not zero, the name otherwise.
    private point_annotation?: rh.AnnotationElement;
    get settings(): crs.StrideRendererSettings<A> {
        return this.categoryRenderer.settings;
    }
    /*
     * Only a single-codomain reindexing can be drawn pointed: with two output
     * axes there are two rows of strides, no one scalar per input wire, and no
     * one anchor for the point to aim at.
     */
    get pointed(): boolean {
        return this.settings.pointed_reindexing
            && this.target._cod_stride_shift.length === 1;
    }
    get shift_only(): boolean {
        return this.target._dom.length === 0
            && this.target._cod_stride_shift.length === 1;
    }
    get points_left(): boolean {
        const codomain_points_left = !!this.settings.reversed !== this.mirrored;
        return this.shift_only ? !codomain_points_left : codomain_points_left;
    }
    constructor(
        public categoryRenderer: StrideRenderer<A>,
        public target: cat.StrideMorphism<A>,
    ){
        super(categoryRenderer, target);
        this.dom_anchors = this.categoryRenderer.display_prod_object(this.target.dom());
        this.cod_anchors = this.categoryRenderer.display_prod_object(this.target.cod());
        this.left_anchors = this.dom_anchors;
        this.right_anchors = this.cod_anchors;
        this.swap_anchors();
        this.central_node = new NodeAnchor(this.categoryRenderer);
        this.left_anchors.anchors.forEach((anchor) => anchor.link(this.central_node));
        this.right_anchors.anchors.forEach((anchor) => this.central_node.link(anchor));

        if (target.name) {
            this.annotation = new rh.AnnotationElement(
                this.renderHandler,
                this.target.name?.to_latex() || '',
            );
        }
        if (this.pointed) {
            this.build_pointed_annotations();
        }
        const width = this.glyph_width();
        const height = this.settings.minimum_reindexing_height;
        this.children = [
            this.left_anchors,
            new rh.CoreElement(this.renderHandler, {x: width / 2, y: height}),
            this.central_node,
            new rh.CoreElement(this.renderHandler, {x: width / 2, y: height}),
            this.right_anchors,
        ];
        this.setBorderColor('magenta');
    }

    /*
     * How wide the glyph is drawn.
     *
     * The pentagon is wider than the hexagon because it carries text the
     * hexagon does not. `reindexing_pentagon_width` holds a stride of one
     * digit beside a short name, and `affine_label_room` widens the pentagon
     * only for the affines whose strides and label at the point run longer
     * than that. The strides start `reindexing_pentagon_pad` in from the flat
     * edge and the label at the point ends half the tip short of the point, so
     * those two insets are all that is added to the room the labels need.
     *
     * A reindexing with no domain carries no stride, so the index is its only
     * label and nothing else needs room. The user asked on 2026-09-17 for these
     * to be drawn narrower, so the width is that label with the tip and the
     * inset beside it, down to `SHIFT_ONLY_REINDEXING_MINIMUM_WIDTH`, and the
     * label is centred in the room that gives it.
     */
    private glyph_width(): number {
        if (!this.pointed) {
            return this.settings.reindexing_width;
        }
        const point_text = this.point_annotation?.latex;
        const point_font_size =
            this.point_annotation?.annotationSettings.font_size ?? 1;
        if (this.shift_only) {
            return Math.max(
                SHIFT_ONLY_REINDEXING_MINIMUM_WIDTH,
                this.settings.reindexing_pentagon_tip
                    + this.settings.reindexing_pentagon_pad
                    + (point_text === undefined ? 0 : te.estimate_bare_text_width(
                        [point_text], point_font_size)));
        }
        return Math.max(
            this.settings.reindexing_pentagon_width,
            this.settings.reindexing_pentagon_tip / 2
                + this.settings.reindexing_pentagon_pad
                + affine_label_room(
                    this.stride_annotations.flatMap(
                        (annotation) => annotation ? [annotation.latex] : []),
                    point_text,
                    point_font_size));
    }

    /*
     * The scalar beside each incoming wire, and the shift beside the outgoing
     * one.
     *
     * The shift displaces the whole row, so it belongs where the row lands -
     * at the output - rather than on any one input. What takes its place when
     * it is zero is the morphism's own name, so the point carries exactly one
     * label either way and the name is only ever dropped for something that
     * says more than it did.
     */
    private build_pointed_annotations(): void {
        const strides = this.target.strides()[0] ?? [];
        this.stride_annotations = this.target._dom.map((_axis, j) => {
            const text = strides[j] === undefined
                ? undefined
                : nmr.numeric_string(strides[j]);
            return text === undefined ? undefined : new rh.AnnotationElement(
                this.renderHandler,
                text,
                {font_size: AFFINE_LABEL_FONT_SIZE},
            );
        });
        const shift_text = shift_string(this.target.shifts()[0]);
        this.point_annotation = shift_text === undefined
            ? this.annotation
            : new rh.AnnotationElement(
                this.renderHandler,
                shift_text,
                {font_size: AFFINE_LABEL_FONT_SIZE},
            );
    }

    update(): void {
        super.update();
        const rect = this.rectangle();
        if (this.pointed) {
            this.draw_pentagon(rect);
            this.place_pointed_annotations(rect);
            return;
        }
        this.draw_hexagon(rect);
        if (this.annotation) {
            this.renderHandler.annotation_handler.addAnnotation(
                rect,
                this.annotation,
            );
        }
    }

    private draw_hexagon(rect: pt.Rectangle): void {
        const hexagon_height = this.settings.reindexing_hexagon_y;
        const hexagon_width = this.settings.reindexing_hexagon_x;
        this.renderHandler.draw_handler?.deltaPolygon(
            [
                rect.getLocation({x: 0, y: 0.5}),
                {x: hexagon_width, y: hexagon_height},
                {x: rect.width - 2 * hexagon_width, y: 0},
                {x: hexagon_width, y: -hexagon_height},
                {x: -hexagon_width, y: -hexagon_height},
                {x: 2*hexagon_width - rect.width, y: 0},
            ],
            {fill: 'red', stroke: 'black'},
            {dropShadow: true},
        );
    }

    /*
     * Home plate: a flat edge down the whole of the input column, and a point
     * on the mid-line of the output one.
     *
     * Full height, unlike the hexagon's fixed 2 * `reindexing_hexagon_y` band,
     * because the flat edge is what the input wires have to arrive at - the
     * input anchors are spread over the box's whole height, and a short band
     * centred on it would leave the outer ones ending in mid-air. The point
     * lands exactly on the output anchor, which the surrounding
     * `align-items: center` puts on the mid-line.
     */
    private draw_pentagon(rect: pt.Rectangle): void {
        const tip = this.settings.reindexing_pentagon_tip;
        const point_x = this.points_left ? rect.left : rect.right;
        const flat_x = this.points_left ? rect.right : rect.left;
        const shoulder_x = this.points_left ? rect.left + tip : rect.right - tip;
        this.renderHandler.draw_handler?.deltaPolygon(
            deltas([
                {x: point_x, y: rect.top + rect.height / 2},
                {x: shoulder_x, y: rect.top + 5},
                {x: flat_x, y: rect.top + 5},
                {x: flat_x, y: rect.bottom - 5},
                {x: shoulder_x, y: rect.bottom - 5},
            ]),
            {fill: 'white', stroke: 'none'},
            {dropShadow: true},
        );
    }

    /*
     * The labels go INSIDE the pentagon, which is the reason it is given a
     * width of its own. A stride belongs to the one wire it scales, and the
     * only place that is unambiguously beside one wire and no other is the
     * strip of the flat edge that wire arrives at. Outside the box, that strip
     * is the gap the degree wires fan through, and the label would read as
     * sitting on whichever of them happened to pass under it.
     *
     * A pentagon carrying strides writes the label of its point hard against
     * the point. A pentagon drawn for an index carries no stride and writes
     * that label in its middle.
     */
    private place_pointed_annotations(rect: pt.Rectangle): void {
        const tip = this.settings.reindexing_pentagon_tip;
        const pad = this.settings.reindexing_pentagon_pad;
        // The full-height part of the pentagon, less the inset from the flat
        // edge: everything the strides may be written in.
        const body_left = this.points_left ? rect.left + tip : rect.left + pad;
        const body_width = rect.width - tip - pad;
        const stride_align: 'left' | 'right' = this.points_left ? 'right' : 'left';
        for (const [annotation, anchor] of ut.zip(
            this.stride_annotations, this.dom_anchors.lone_elements
        )) {
            if (!annotation) {
                continue;
            }
            const anchor_rect = anchor.rectangle();
            annotation.annotationSettings.horizontal_align = stride_align;
            annotation.annotationSettings.vertical_align = 'center';
            this.renderHandler.annotation_handler.addAnnotation(
                new pt.Rectangle(
                    {x: body_left, y: anchor_rect.top},
                    {x: body_width, y: anchor_rect.height},
                ),
                annotation,
            );
        }
        if (!this.point_annotation) {
            return;
        }
        /*
         * An index is a reindexing with a shift and no strides, so its label is
         * the only one the pentagon carries and nothing stands beside it. The
         * user ruled on 2026-09-17 that such a label is written in the middle
         * of the figure rather than at one side of it.
         */
        if (this.shift_only) {
            this.point_annotation.annotationSettings.horizontal_align = 'center';
            this.point_annotation.annotationSettings.vertical_align = 'center';
            this.renderHandler.annotation_handler.addAnnotation(
                rect, this.point_annotation);
            return;
        }
        /*
         * Hard against the point, and so at the opposite end of the body from
         * the strides. The two only share a line when there is a single input,
         * and then the body's width is all that keeps them apart - which is
         * what `reindexing_pentagon_width` is for.
         */
        this.point_annotation.annotationSettings.horizontal_align =
            this.points_left ? 'left' : 'right';
        this.point_annotation.annotationSettings.vertical_align = 'center';
        this.renderHandler.annotation_handler.addAnnotation(
            new pt.Rectangle(
                {x: this.points_left ? rect.left + tip / 2 : rect.left, y: rect.top},
                {x: rect.width - tip / 2, y: rect.height},
            ),
            this.point_annotation,
        );
    }
}

export class StrideRenderer<A extends cat.Axis> extends cr.CategoryRenderer<A, cat.StrideMorphism<A>> {
    public settings: crs.StrideRendererSettings<A>;
    constructor(
        public renderHandler: rh.RenderHandler,
        _settings: Partial<crs.StrideRendererSettings<A>> = {},
    ) {
        super(renderHandler, _settings);
        this.settings = {
            ...crs.DefaultStrideRendererSettings,
            ..._settings,
        }
    }

    public display_lone(target: A): AxisAnchor<A> {
        return new AxisAnchor(this, target);
    }
    public display_prod_object(target: cat.ProdObject<A>): cr.ProdObjectMeridian<A> {
        return new cr.ProdObjectMeridian(this, target);
    }
    public display_morphism(target: cat.StrideMorphism<A>): StrideMorphismBox<A> {
        return new StrideMorphismBox(this, target);
    }
    /*
     * A block whose aesthetics say `BlockDrawing.BODY_IN_PLACE` is drawn as its
     * body alone: no title, no frame and no room of its own, so a reindexing
     * explained by a block is the figure of the reindexing.
     *
     * The body's box is registered as the block's region, which is the hook
     * `broadcasted_box` uses for an operator drawn in place, so the pointer
     * resting on the pentagon or the hexagon opens the block's inspection box.
     * The user asked for a reindexing to carry an explanation on 2026-09-17,
     * and `pyncd`'s `notebooks/display/explain_reindexings.py` is what wraps
     * one.
     */
    public display_category(
        target: cat.ProdCategory<A, cat.StrideMorphism<A>>
            | contra.Contravariant<A, cat.ProdCategory<A, cat.StrideMorphism<A>>>,
        capped: boolean = true,
    ): cr.MorphismBox<A, cat.StrideMorphism<A>, A> {
        if (target instanceof contra.Contravariant) {
            return super.display_category(target, capped);
        }
        const drawn = tu.drawn_morphism(target);
        if (drawn === target) {
            return super.display_category(target, capped);
        }
        const box = super.display_category(
            drawn as cat.ProdCategory<A, cat.StrideMorphism<A>>, capped);
        this.renderHandler.register_term_region(box, target);
        return box;
    }
}

/*
 * The stride renderer that draws a reindexing's domain on the left and its
 * codomain on the right.
 *
 * `DefaultStrideRendererSettings.reversed` is `true`, which puts the codomain
 * on the left. A `reindexings` entry of a `Broadcasted` maps output indices
 * back to input ones, so drawing it swapped keeps the picture reading left to
 * right. An operator that carries a reindexing as a field of its own reads it
 * the other way, sending each input position to the output position it writes,
 * and its figure is drawn unreversed. `StrideMorphismBox.points_left` reads the
 * same flag, so unreversing also carries the point to the right, onto the axis
 * the row is summed onto.
 *
 * `ReindexTransposeBox` in `para/ParaCategoryRenderer.ts` and `CovariantViewBox`
 * in `advanced_axis_dynamics/covariantOperatorBoxes.ts` are the two callers.
 * Each hands over the settings of the figure's own stride renderer, so that a
 * node an operator carries is sized like the nodes `BroadcastedBox` draws
 * beside it. `reversed` is the one setting the caller does not choose.
 */
export class CovariantStrideRenderer<A extends cat.Axis> extends StrideRenderer<A> {
    constructor(
        public renderHandler: rh.RenderHandler,
        _settings: Partial<crs.StrideRendererSettings<A>> = {},
    ) {
        super(renderHandler, {..._settings, reversed: false});
    }
}
