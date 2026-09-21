/**
 * Written by Claude Opus 5 (1M context), effort high.
 *
 * The quantisation of a datatype, drawn as a label below the array's axes in
 * every gap that labels the axes, in place of the wire and direction triangle
 * `DatatypeAnchor` draws for a datatype carrying no quantisation. A
 * quantisation is the number format a value is held in together with the size
 * of that format in bits, and
 * `src/quantization/data_structure/Quantization.ts` holds it.
 *
 * A conversion between two quantisations is drawn as a chevron whose two
 * halves are as tall as the quantisations it reads and writes, and a
 * conversion carrying no name is drawn as no glyph at all, on a core of no
 * size, so that the labels on the two wires state the rounding on their own.
 */
import * as rh from '../../Render/RenderHandler';
import * as cr from '../CategoryRenderer';
import * as crs from '../CategoryRendererSettings';
import * as cat from '../../../data_structure/Category';
import * as bb from '../BroadcastedCategoryRenderer';
import * as pt from '../../../utilities/Point';
import * as nm from '../../../data_structure/Numeric';
import * as ut from '../../../utilities/utilities';
import * as Color from '../../../utilities/Color';
import { GenericOperatorBox } from '../Operations/additionalOperationBoxes';
import * as Quantization from '../../../quantization/data_structure/Quantization';

export function establish(): void {
    console.log("Loaded the quantisation labels.");
}

/*
 * The lines of a quantised datatype's label. A quantisation writes itself on
 * one line, and a datatype whose latex is empty writes no line at all.
 */
export function quantisation_label_lines(datatype: cat.Datatype): string[] {
    const latex = datatype.to_latex();
    return latex ? [latex] : [];
}

/*
 * KaTeX breaks an inline formula after a relation when its box is narrower
 * than the formula, and a gap's box is. A formula in braces is one group and
 * is not broken, and an `array` is not broken either.
 */
export function label_latex(lines: string[]): string {
    return lines.length > 1
        ? `\\begin{array}{l}${lines.join(' \\\\ ')}\\end{array}`
        : `{${lines[0] ?? ''}}`;
}

/**
 * The `Quantified` held by `datatype`, and nothing for a datatype carrying no
 * quantisation. A quantisation wrapping a second one is read down to the
 * innermost. Mirrors `quantisation_of` in
 * `pyncd/quantization/data_structure/Quantization.py`.
 */
function quantisation_of(
    datatype: cat.Datatype,
): Quantization.Quantified<cat.Datatype> | undefined {
    if (datatype instanceof Quantization.Quantified) {
        return quantisation_of(datatype.wraps) ?? datatype;
    }
    return undefined;
}

export class QuantisationAnchor<B extends cat.Datatype> extends bb.DatatypeAnchor<B> {
    public rows_above_axes(): number {
        return Math.max(1, quantisation_label_lines(this.target).length);
    }

    public label_width(): number {
        return rh.estimated_label_width(quantisation_label_lines(this.target));
    }

    update(): void {
        if (this.skipped()) {
            return;
        }
        for (const next of this.next_terminal()) {
            this.draw?.curve(
                cr.wire_curve(this.location()!, next.location()!,
                              this.horizontal, next.horizontal,
                              this.settings.turn_radius),
                {...this.curve_attributes},
            );
        }
    }

    public getAnnotation(): rh.AnnotationElement {
        if (!this.annotation) {
            this.annotation = new rh.AnnotationElement(
                this.renderHandler,
                label_latex(quantisation_label_lines(this.target)),
                {font_size: 0.65, color: this.color},
            );
        }
        return this.annotation;
    }
}

/*
 * The quantisation `target` imposes on an index, and nothing for a
 * quantisation of any other value. A `cat.Natural` is the number kind of an
 * index, and its latex is the bound of the positions it counts.
 */
function quantised_index(
    target: cat.Datatype,
): Quantization.Quantified<cat.Natural> | undefined {
    return target instanceof Quantization.Quantified
        && target.wraps instanceof cat.Natural
        ? target as Quantization.Quantified<cat.Natural>
        : undefined;
}

/*
 * A quantised index, drawn with the wire of an index and the label of a
 * quantisation. The anchor is built on the `cat.Natural` the quantisation
 * wraps, so the wire, its direction triangle and the bound it is annotated
 * with are the ones an index carrying no quantisation is drawn with, and the
 * label below the wires states the format alone, as `2 \times \mathtt{BF16}`
 * states it for an array of real numbers. The user ruled on 2026-09-20 that an
 * index keeps its arrow and its size once it carries a quantisation.
 *
 * The format hangs off the index's own anchor rather than off the last axis,
 * which is where `ArrayMeridian` hangs the label of a `DatatypeDisplay`. An
 * anchor stacks the annotations placed below it under its wire and its own
 * name above it, so the bound is read above the index wire and the format
 * below it. The label of a real array is hung off the last axis because such
 * an array draws no wire of its own, and a gap holding both labels on one axis
 * would draw them on top of each other. An array of no axes has no axis to
 * hang a label off at all, and the index wire is the one thing drawn there.
 */
function quantisedIndexDisplay<A extends cat.Axis>(
    categoryRenderer: bb.BroadcastedRenderer<cat.Datatype, A>,
    target: Quantization.Quantified<cat.Natural>,
): bb.DatatypeDisplay<cat.Datatype> {
    const anchor = new bb.DatatypeAnchor<cat.Datatype>(
        categoryRenderer, target.wraps);
    const format = make_quantisation_annotation(
        categoryRenderer.renderHandler, [target.width_latex()]);
    if (format) {
        anchor.auxiliary_annotations.push(format);
    }
    return new bb.DatatypeDisplay<cat.Datatype>(anchor);
}

function quantisedDatatypeDisplay<B extends cat.Datatype, A extends cat.Axis>(
    categoryRenderer: bb.BroadcastedRenderer<B, A>,
    target: B,
    array: cat.Array<B, A>,
    weave?: cat.Weave<B, A>,
): bb.DatatypeDisplay<B> {
    const index = quantised_index(target);
    if (index !== undefined) {
        return quantisedIndexDisplay(
            categoryRenderer as bb.BroadcastedRenderer<cat.Datatype, A>,
            index) as bb.DatatypeDisplay<B>;
    }
    if (bb.is_true_scalar(array, weave)) {
        return new bb.DatatypeDisplay(new QuantisationAnchor(categoryRenderer, target));
    }
    return new bb.DatatypeDisplay<B>(undefined, make_quantisation_annotation(
        categoryRenderer.renderHandler, quantisation_label_lines(target)));
}

bb.datatypesRegistry.registerFunction(Quantization.Quantified)(quantisedDatatypeDisplay);

function make_quantisation_annotation(
    renderHandler: rh.RenderHandler,
    label_parts: string[],
): cr.AnchorAnnotation | undefined {
    const label_text = label_parts.join('\\quad ');
    return label_text ? {
        annotation: new rh.AnnotationElement(
            renderHandler, label_latex([label_text]), {font_size: 0.65}),
        minimum_gap_width: rh.estimated_label_width([label_text]),
        rows: 1,
        placement: 'below',
    } : undefined;
}

class TypeConvertBox<B extends cat.Datatype, A extends cat.Axis>
    extends GenericOperatorBox<B, A> {
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, Quantization.TypeConvert>,
    ) {
        super(categoryRenderer, target);
        this.glyph_positioning = {x: -0.5, y: -1};
        this.annotation = new rh.AnnotationElement(
            this.renderHandler,
            `\\mathrm{${target.operator.name?.body ?? 'convert'}}`,
            {font_size: 1},
        );
    }
}

const CHEVRON_WIDTH = 44;
const CHEVRON_HEIGHT = 20;
const CHEVRON_POINT_RATIO = 0.25;
const CAST_HEIGHT_FRACTIONS: ReadonlyMap<number, number> = new Map([
    [4, 1 / 4],
    [8, 2 / 4],
    [16, 3 / 4],
    [32, 1],
]);

interface TransferChevron {
    color: string;
    height_fraction: number;
}

class TypeConvertChevronBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, Quantization.TypeConvert> {
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, Quantization.TypeConvert>,
        readonly source_chevron: TransferChevron,
        readonly target_chevron: TransferChevron,
    ) {
        super(categoryRenderer, target, {
            x: CHEVRON_WIDTH,
            y: CHEVRON_HEIGHT,
        });
        this.glyph_positioning = {x: -0.5, y: -1};
    }

    update(): void {
        super.update();
        const rect = this.core.rectangle();
        const point = rect.height * CHEVRON_POINT_RATIO;
        const tail_x = rect.left;
        const head_x = rect.right - point;
        const split_x = (tail_x + head_x) / 2;
        this.draw_chevron(rect, tail_x, split_x, point, this.source_chevron);
        this.draw_chevron(rect, split_x, head_x, point, this.target_chevron);
    }

    private draw_chevron(
        rect: pt.Rectangle, tail_x: number, head_x: number, point: number,
        chevron: TransferChevron,
    ): void {
        const middle = rect.top + rect.height / 2;
        const half_height = rect.height * chevron.height_fraction / 2;
        const top = middle - half_height;
        const bottom = middle + half_height;
        const corners: pt.Point[] = [
            {x: tail_x, y: top}, {x: head_x, y: top}, {x: head_x + point, y: middle},
            {x: head_x, y: bottom}, {x: tail_x, y: bottom}, {x: tail_x + point, y: middle},
        ];
        const positioned_corners = corners.map((corner): pt.Point => ({
            x: this.mirrored ? rect.left + rect.right - corner.x : corner.x,
            y: corner.y,
        }));
        const deltas = positioned_corners.slice(1).map((corner, k): pt.Point => ({
            x: corner.x - positioned_corners[k].x,
            y: corner.y - positioned_corners[k].y,
        }));
        this.draw?.deltaPolygon(
            [positioned_corners[0], ...deltas],
            {fill: chevron.color, stroke: 'none'}, {dropShadow: true});
    }
}

function cast_height_fraction(
    quantified: Quantization.Quantified<cat.Datatype> | undefined,
): number | undefined {
    return quantified?.size instanceof nm.Integer
        ? CAST_HEIGHT_FRACTIONS.get(quantified.size._value) : undefined;
}

function make_cast_chevron(
    height_fraction: number,
    settings: crs.BroadcastedRendererSettings,
): TransferChevron {
    const full_precision = Color.Color.from_hex(settings.cast_color_fp32).rgb;
    const low_precision = Color.Color.from_hex(settings.cast_color_fp4).rgb;
    const blue_fraction = Math.pow(
        (1 - height_fraction) / (1 - Math.min(...CAST_HEIGHT_FRACTIONS.values())),
        settings.cast_color_exponent);
    const [red, green, blue] = full_precision.map((component, index): number =>
        component + (low_precision[index] - component) * blue_fraction);
    return {
        color: new Color.RGBColor(red, green, blue).hex(),
        height_fraction,
    };
}

/*
 * A conversion carrying no name, drawn as no glyph on a core of no size. The
 * wire crosses the figure where the conversion stands, and the label on each
 * side of it states the format that side is held in, so the rounding is read
 * from the two arrays rather than from an operation.
 *
 * `notebooks/display/cast_presentation.py` in `pyncd` takes the name off every
 * conversion that changes a quantisation under `CastPresentation.THIN`, which
 * is how a figure asks for this box. The quantisations stay in the operator's
 * `source` and `target`, so the inspection box over the conversion still reads
 * them.
 *
 * The gap the conversion writes into carries the format it wrote and nothing
 * else. The format is drawn in `thin_cast_label_color`, so the one place a
 * figure marks a rounding is the colour of the new format, and the names of the
 * axes are left out, because the gap the operand came from names them and the
 * conversion changes none of them.
 *
 * That coloured format is also what the pointer rests on to open the
 * conversion's inspection box. A box of no size has a rectangle two pixels
 * across, which `advanced_display/inspectionBoxes.ts` keeps as a region and no
 * reader can hit, so `region_element` names the label instead and the box opens
 * over the format the conversion wrote. The user asked for that on 2026-09-20.
 */
class ThinTypeConvertBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, Quantization.TypeConvert> {
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, Quantization.TypeConvert>,
    ) {
        super(categoryRenderer, target, {x: 0, y: 0});
        const read = this.input_meridians[0]?.datatype_anchor;
        const written = this.output_meridians[0]?.datatype_anchor;
        if (read && written) {
            this.pass_anchor_through(read, written);
        }
    }

    /* The label stating the format this conversion wrote, drawn in the gap on
     * its right. It is the region the pointer opens this conversion's
     * inspection box from, and it is read after `link_holder_anchors` has run,
     * which the holder does before it registers the region. */
    private written_format?: rh.AnnotationElement;

    /*
     * The holder's own columns are what the figure draws, so the result this
     * box writes is coloured and unnamed there rather than on this box's
     * meridians. The wiring is left to the holder, which is why this answers
     * false.
     */
    public link_holder_anchors(holder: bb.BroadcastedBox<B, A>): boolean {
        for (const result of holder.output_meridians) {
            this.mark_written_format(result);
        }
        return false;
    }

    private mark_written_format(result: bb.ArrayMeridian<B, A>): void {
        const color = this.settings.thin_cast_label_color;
        result.datatype_anchor?.recolor(color);
        /* Where the conversion writes an index, the format hangs off the
         * index's own anchor and the rows of the axes have nothing left to say
         * in this gap. An anchor that reports no annotation of its own lets the
         * gap take the names from the anchor facing it across the gap, which
         * puts the axis back, so each axis is silenced by the flag that
         * silences the pair rather than by the one that drops its name. */
        const format_on_the_index =
            (result.datatype_anchor?.auxiliary_annotations.length ?? 0) > 0;
        for (const anchor of result.axes_anchors.anchors) {
            anchor.names_itself_in_gap = false;
            if (format_on_the_index) {
                anchor.annotate_in_gap = false;
            }
            this.mark_auxiliary_annotations(anchor, color);
        }
        /* The bound an index anchor is named with is a fact about the array
         * and not about the conversion, so it is read on both sides of a thin
         * cast where the names of the axes are not. */
        if (result.datatype_anchor) {
            this.mark_auxiliary_annotations(result.datatype_anchor, color);
        }
        this.written_format ??= result.datatype_anchor?.getAnnotation();
    }

    private mark_auxiliary_annotations(
        anchor: cr.Anchor<A | B>, color: string,
    ): void {
        for (const annotation of anchor.auxiliary_annotations) {
            annotation.annotation.annotationSettings.color = color;
            this.written_format ??= annotation.annotation;
        }
    }

    public region_element(holder: bb.BroadcastedBox<B, A>): rh.DiagramElement {
        return this.written_format ?? holder;
    }
}

function typeConvertDisplay<B extends cat.Datatype, A extends cat.Axis>(
    categoryRenderer: bb.BroadcastedRenderer<B, A>,
    target: cat.Broadcasted<B, A, Quantization.TypeConvert>,
): bb.OperationBox<B, A, Quantization.TypeConvert> {
    if (!target.operator.name) {
        return new ThinTypeConvertBox(categoryRenderer, target);
    }
    const source_quantisation = quantisation_of(target.operator.source);
    const target_quantisation = quantisation_of(target.operator.target);
    const source_height = cast_height_fraction(source_quantisation);
    const target_height = cast_height_fraction(target_quantisation);
    if (target.operator.name?.body === 'cast'
        || !ut.deep_equals(source_quantisation, target_quantisation)) {
        if (source_height !== undefined && target_height !== undefined) {
            return new TypeConvertChevronBox(categoryRenderer, target,
                make_cast_chevron(source_height, categoryRenderer.settings),
                make_cast_chevron(target_height, categoryRenderer.settings));
        }
    }
    return new TypeConvertBox(categoryRenderer, target);
}

bb.opsRegistry.registerFunction(Quantization.TypeConvert)(typeConvertDisplay);
