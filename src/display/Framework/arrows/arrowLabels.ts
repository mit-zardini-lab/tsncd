// Claude Opus 5.5 (1M context), effort max. The label split into a shape above the
// wire and a datatype below it, and the function that places it, by Claude Opus 5.5
// (1M context), effort 40, on 2026-09-26.
/*
 * The label an arrow carries in the two arrow forms, and the function that
 * rests it on a stretch of the arrow's wire.
 *
 * The label is two lines. The shape of the arrow's array stands above the
 * wire, its axes in square brackets separated by commas, and the array's
 * datatype stands below the wire. The user asked for the datatype below the
 * arrow on 2026-09-26, so that the quantisation of an array is read on every
 * arrow, apart from its axes.
 *
 * Each axis is labelled by the processor `scr.axesRegistry` holds for its
 * class, through `scr.axis_annotation_text`, which is the function the legend
 * names its rows with. A sized axis therefore prints its integer, and a
 * concatenated or a guarded axis prints the label it carries on a wire of its
 * own in the axis form.
 */
import * as rh from '../../Render/RenderHandler';
import * as rhs from '../../Render/RenderHandlerSettings';
import * as cat from '../../../data_structure/Category';
import * as cr from '../CategoryRenderer';
import * as scr from '../StrideCategoryRenderer';
import * as pt from '../../../utilities/Point';

/* What stands between the labels of two neighbouring axes of a shape: a comma
 * and the control space, because KaTeX drops a plain space in mathematics. The
 * user asked for the comma on 2026-09-26. */
export const AXIS_SEPARATOR = ',\\ ';

/* The datatype written for the reals, and for any datatype whose `to_latex`
 * writes nothing. The user ruled on 2026-09-17 that a drawn reals wire is
 * named, and `bb.RealsDatatypeAnchor` names it the same. */
export const REALS = '\\mathbb{R}';

/**
 * The shape of `array` as an arrow writes it above its wire, which is the
 * labels of its axes in the order of the array's shape, separated by commas
 * and set in square brackets. A real matrix over `q` and `d` reads `[q,\ d]`.
 * An array with no axes has no shape to write, and the text is empty.
 */
export function array_shape_label<B extends cat.Datatype, A extends cat.Axis>(
    categoryRenderer: cr.CategoryRenderer<
        cat.Array<B, A>, cat.Broadcasted<B, A>, cat.Array<B, A>>,
    array: cat.Array<B, A>,
): string {
    if (array._shape.length === 0) {
        return '';
    }
    const axes = array._shape
        .map((axis) => scr.axis_annotation_text(categoryRenderer, axis))
        .join(AXIS_SEPARATOR);
    return `[${axes}]`;
}

/**
 * The datatype of `array` as an arrow writes it below its wire. A quantised
 * array writes its quantisation, as `\mathtt{FP32}`, and an array of naturals
 * bounded by `\bar{v}` writes `\bar{v}`. A datatype whose `to_latex` writes
 * nothing, which the reals are, is written `\mathbb{R}`.
 */
export function array_datatype_label<B extends cat.Datatype, A extends cat.Axis>(
    array: cat.Array<B, A>,
): string {
    return array.datatype.to_latex() || REALS;
}

/* One line of an arrow's label, at the size an axis label is drawn at and set
 * in braces, so that KaTeX draws it on one line, as
 * `scr.AxisAnchor.getAnnotation` sets the name of an axis. */
export function arrow_label_line(
    renderHandler: rh.RenderHandler,
    latex: string,
): rh.AnnotationElement {
    return new rh.AnnotationElement(
        renderHandler, `{${latex}}`,
        {font_size: rhs.axis_label_font_size(renderHandler.settings)});
}

/**
 * Rest the label of `anchor` on a level stretch of its wire at height
 * `wire_y`, from `span.left` to `span.right`, and return the rectangle the
 * label takes, or nothing where the anchor writes none.
 *
 * The label is what `anchor.gap_annotations` gives, which for an
 * `ArrayArrowAnchor` is the shape above the wire and the datatype below it, so
 * a composed gap and any other stretch of an arrow's wire write one label
 * alike. `cr.rest_annotations_on_wire` places the lines with the anchor's own
 * `annotation_drop` and `anchor_height`.
 */
export function rest_arrow_label_on_wire(
    anchor: cr.Anchor<unknown>,
    span: {left: number; right: number},
    wire_y: number,
    horizontal_align: 'left' | 'right' = 'left',
): pt.Rectangle | undefined {
    return cr.rest_annotations_on_wire(
        anchor.renderHandler, anchor.gap_annotations(),
        {left: span.left, width: span.right - span.left}, wire_y, horizontal_align,
        {drop: anchor.settings.annotation_drop, height: anchor.settings.anchor_height});
}

/* The room the label of an anchor takes about its wire: the width of its
 * widest line, measured bare and counting the inset it starts at, and the
 * heights it reaches above and below the wire, in px. */
export interface ArrowLabelExtent {
    width: number;
    above: number;
    below: number;
}

/**
 * The room `rest_arrow_label_on_wire` gives the label of `anchor`, read before
 * the label is placed. A caller sizing a stretch of wire for the label reads
 * the width, and the two heights say how far the label reaches from the wire
 * on either side.
 */
export function arrow_label_extent(anchor: cr.Anchor<unknown>): ArrowLabelExtent {
    const {annotation_drop, anchor_height} = anchor.settings;
    const annotations = anchor.gap_annotations();
    const reach = (placement: 'above' | 'below'): number => annotations
        .filter((label) => (label.placement ?? 'above') === placement)
        .reduce((total, label) =>
            total + label.rows * anchor_height + (label.wire_clearance ?? 0), 0);
    const above = reach('above');
    const below = reach('below');
    return {
        width: Math.max(0, ...annotations.map((label) =>
            (label.left_inset ?? 0) + label.annotation.estimated_bare_text_width())),
        above: above === 0 ? 0 : above - annotation_drop,
        below: below === 0 ? 0 : below + annotation_drop,
    };
}
