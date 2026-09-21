import * as cat from '../../data_structure/Category';
import * as dhd from '../Render/DrawHandler';
import { CategoryRenderer } from './CategoryRenderer';
import * as pt from '../../utilities/Point';

export interface SeparatorRendererSettings<A> {
    separator_curve_attributes?: Partial<dhd.LineAttrs>;
}
export interface CategoryRendererSettings<
    L, M extends cat.Morphism<L>, A=L> {
    separator_settings?: SeparatorRendererSettings<A>;
    circle_anchors?: boolean;
    anchor_height: number;
    reversed?: boolean;
    rearrangement_width: number;
    // The width of a block drawn as one box instead of its contents.
    collapsed_block_width: number;
    /*
     * How far to drop an axis annotation below the wire it names, in px.
     *
     * `ComposedGap` hangs each label upward from the curve and aligns it to the
     * bottom of its box, so at 0 the name sits exactly on the line. That leaves
     * a visible gap: what touches the wire is the box, and the glyphs stop
     * short of it by their own descender space. Dropping the box a few px puts
     * the TEXT on the line rather than the box.
     */
    annotation_drop: number;
    /*
     * Name a wire in the gap coming OUT of a rearrangement as well as the one
     * going into it?
     *
     * A rearrangement moves a wire; it does not change what the wire carries,
     * so the name on either side of it is the same name. With the gap before it
     * already labelled, the gap after repeats that label a few px away - and a
     * wire crossing a rearrangement is drawn as one line, so the repeat sits on
     * the same line as the original with nothing between them to justify it.
     * Off by default for that reason. On, every gap is labelled, which is worth
     * having when a figure is being read gap by gap rather than wire by wire.
     */
    annotate_after_rearrangement: boolean;
    composed_gap_dims: pt.Point;
    cap_products?: boolean;
    product_gap_width?: number;
    block_padding: pt.Point;
    block_label_font_size: number;
    block_title_font_size: number;
    encompassing_title_font_size: number;
    block_title_padding: pt.Point;
    product_reduction_c: number;
    product_reduction_m: number;
    loose_link: boolean;
    /*
     * Radius of the quarter-circle a wire turns through between an anchor on
     * a row and one in a column - see `wire_curve`. Every such turn in a
     * figure is this one circle, shrunk only where the anchors are closer.
     */
    turn_radius: number;
    /*
     * The halo a wire shows while its axis is highlighted: a second stroke
     * under the wire, `axis_halo_extra_width` px wider than the wire, at
     * `halo_opacity` while the highlight is active and invisible otherwise.
     * The halo is also the wire's hit target, so the extra width is the room a
     * pointer has to rest on a one pixel wire.
     */
    axis_halo_extra_width: number;
    halo_opacity: number;
    // MULTILINE SETTINGS
    offset_multiline: boolean;
    multiline_curve_width: number;
}

export interface StrideRendererSettings<
    A extends cat.Axis> extends CategoryRendererSettings<
    A,
    cat.StrideMorphism<A>,
    A> {
    reindexing_width: number;
    minimum_reindexing_height: number;
    reindexing_hexagon_x: number;
    reindexing_hexagon_y: number;
    /*
     * A reindexing onto a SINGLE axis is drawn as a pentagon pointing at that
     * axis instead of as a hexagon, with the stride each input contributes
     * written beside it and the shift written at the point. See
     * `StrideMorphismBox`.
     *
     * It needs its own width because it carries text the hexagon does not: the
     * strides sit inside it, against the flat edge, and 40px of `reindexing
     * _width` is a box wide enough for a wire and nothing else.
     */
    pointed_reindexing: boolean;
    reindexing_pentagon_width: number;
    // How far in from the point the flat part of the pentagon starts.
    reindexing_pentagon_tip: number;
    // Inset of the stride labels from the flat edge.
    reindexing_pentagon_pad: number;
}

export interface BroadcastedRendererSettings<
    B extends cat.Datatype = cat.Datatype, 
    A extends cat.Axis = cat.Axis> extends CategoryRendererSettings<
    cat.Array<B, A>,
    cat.Broadcasted<B, A>,
    A | B> {
    broadcast_offset_x: number;
    broadcast_core_gap: number;
    operation_core_dims: pt.Point;
    operation_softmax_dims: pt.Point;
    operation_multilinear_bite: number;
    linear_core_dims: pt.Point;
    linear_label_font_size: number;
    linear_label_padding: pt.Point;
    block_operator_halo_width: number;
    block_operator_halo_highlight_width: number;
    cast_color_fp32: string;
    cast_color_fp4: string;
    cast_color_exponent: number;
    /* The colour of the format label a conversion drawn as no glyph writes,
     * which is the one mark a figure makes where a value is rounded. */
    thin_cast_label_color: string;
    /*
     * Room between the glyph of a morphism with an empty domain and a row a
     * wrap has put on it, in px. Such a box has no degree wires routing around
     * its glyph to make it tall, and without this the row sits on the glyph's
     * border, so a dropped result's tape and its slot label start on the
     * glyph. A row's tape then still runs `tape_escape` past the box.
     */
    empty_domain_row_padding: number;
}
    

export enum AnchorAnnotationStyle {
    Default = 0,
    AfterOp = 1,
}

export const DefaultCategoryRendererSettings: CategoryRendererSettings<any, any, any> = {
    anchor_height: 20,
    circle_anchors: false,
    reversed: false,
    separator_settings: undefined,
    rearrangement_width: 30,
    collapsed_block_width: 60,
    annotation_drop: 3,
    annotate_after_rearrangement: false,
    composed_gap_dims: {x: 30, y: 20},
    cap_products: false,
    product_gap_width: 20,
    product_reduction_c: 30,
    product_reduction_m: 0.8,
    block_padding: {x: 10, y: 20},
    block_label_font_size: 0.9,
    block_title_font_size: 0.8,
    encompassing_title_font_size: 1.65,
    block_title_padding: {x: 6, y: 3},
    loose_link: true,
    turn_radius: 10,
    axis_halo_extra_width: 5,
    halo_opacity: 0.45,
    offset_multiline: true,
    multiline_curve_width: 20,
}

export const DefaultStrideRendererSettings: StrideRendererSettings<cat.Axis> = {
    ...DefaultCategoryRendererSettings,
    reversed: true,
    rearrangement_width: 30,
    reindexing_width: 40,
    minimum_reindexing_height: 30,
    reindexing_hexagon_x: 10,
    reindexing_hexagon_y: 10,
    pointed_reindexing: true,
    reindexing_pentagon_width: 50,
    reindexing_pentagon_tip: 12,
    reindexing_pentagon_pad: 4,
    composed_gap_dims: {x: 10, y: 10},
}

export const DefaultBroadcastedRendererSettings: BroadcastedRendererSettings = {
    ...DefaultCategoryRendererSettings,
    separator_settings: {
        separator_curve_attributes: {
            'stroke-dasharray': '5,5',
            'stroke-width': '2px',
        }
    },
    broadcast_offset_x: 8,
    broadcast_core_gap: 30,
    operation_core_dims: {x: 30, y: 30},
    operation_softmax_dims: {x: 20, y: 20},
    operation_multilinear_bite: 10,
    linear_core_dims: {x: 30, y: 30},
    linear_label_font_size: 1.2,
    linear_label_padding: {x: 0, y: 0},
    block_operator_halo_width: 1,
    block_operator_halo_highlight_width: 1.5,
    cast_color_fp32: '#465561',
    cast_color_fp4: '#0088FF',
    cast_color_exponent: 0.5,
    thin_cast_label_color: '#0088FF',
    empty_domain_row_padding: 15,
}
/*
 * A grab and a drop are drawn as a *tape*: a wire leaving the object's anchor
 * sideways, turning through an elbow, and running out through the top or the
 * bottom of the box to an arrowhead. These are the numbers that shape it. They
 * are category-agnostic, as the boxes are - nothing here knows what the object
 * on the anchor is.
 */
export interface ParaRendererSettings<
    L, M extends cat.Morphism<L>, A=L> extends CategoryRendererSettings<L, M, A> {
    // Least horizontal room a grab or a drop reserves. An object drawn with
    // enough anchors to need more than this gets more.
    tape_width: number;
    tape_arrows_outside_separators: boolean;
    tape_escape: number;
    // How far the innermost tape sits from the column of anchors it feeds.
    tape_inset: number;
    // Spacing between tapes, where an object is drawn with several anchors.
    tape_spacing: number;
    tape_elbow_radius: number;
    // Half-width (x) and length (y) of the arrowhead on the free end.
    tape_arrow: pt.Point;
    /*
     * The names written at the free ends of the tapes, on two lines. Drawn
     * only when the `tapeLabels` render setting is on. That flag rides the
     * wire and so is settable per figure, while the numbers below are the
     * glyph's own shape and belong here with the rest of the tape.
     *
     * The first line carries the slot name, one per taped array rather than
     * one per tape, since every tape a grab or a drop draws carries the one
     * array onto the one slot. It sits to the left of that array's tapes and
     * is right-aligned, so it ends against the first of them.
     *
     * The second line carries the axis names, one per tape, each to the right
     * of its own tape and left-aligned so that it begins against it. A grab
     * writes it below the slot name and a drop above, so that both rows read
     * from the arrowheads inwards. A grabbed array then reads `s0` over `q d`,
     * in the order it would be written, and no name is over a wire.
     *
     * An axis name whose text is wider than the room between its tape and the
     * next is turned a quarter turn clockwise and runs down its tape, reading
     * in the direction the tape flows. One name of an array that turns turns
     * the rest of that array's names with it.
     * `ParaWrapDisplay.axis_label_rooms` measures the room,
     * `rotated_axis_labels` decides which names turn, and
     * `place_rotated_axis_label` turns them.
     *
     * `tape_label_dims` is the least box a name is aligned in, and the renderer
     * grows that box to the pre-render estimate. It sets no tape's height.
     * `tape_label_gap` is the clearance between an unrotated name's box and the
     * tape it rests against, and a turned name stands on its tape's own x with
     * no clearance, because it runs down beside the tape rather than out from
     * it. `tape_label_drop` is how far below the top of a grab's vertical run
     * the slot name is centred, and a drop's slot name ends at its own
     * arrowheads. `tape_label_clearance` separates the slot name's line from
     * the axis names' line.
     *
     * A tape is as tall as its own names need, measured bare: from the
     * arrowhead's tip past the slot name, a `tape_label_clearance`, and the
     * deepest axis name on the line beside it, to the row anchor the tape
     * reaches. `tape_base_height` is the least a tape may be, which is about an
     * arrowhead and one line of text, so a row of one-letter axis names gets a
     * short tape and a row of turned names gets the length its names need.
     */
    tape_label_dims: pt.Point;
    tape_label_gap: number;
    tape_label_drop: number;
    tape_label_clearance: number;
    tape_base_height: number;
    tape_label_font_size: number;
    /*
     * The plate painted behind the label, or `undefined` for none. Wanted
     * because the label is set outside the layout, as the tape is, and so over
     * whatever the neighbouring row holds - which in a dense figure is a wire
     * straight through the text. Set it to `undefined` where the labels are in
     * clear space and the plates would punch holes in the drawing instead.
     */
    tape_label_background?: string;
    /*
     * Saturation and value applied to the slot's hue, which is taken from
     * its UID. Text is a thin mark like a hairline, and a pure hue at full
     * value does not read against white.
     */
    tape_label_saturation_value: [number, number];
    /*
     * The plate painted behind a taped array while its slot is highlighted.
     * The plate covers the array's tapes, arrowheads and names, padded by
     * `tape_plate_padding` px, and is filled with the slot's colour blended
     * into the surface at `tape_plate_tint`. The plate is also the hit target
     * the pointer sets the highlight from, so the whole of the array answers.
     */
    tape_plate_padding: number;
    tape_plate_tint: number;
    /*
     * The clearance between the plate and the padlock drawn beside it. The
     * padlock stands outside the edge of the plate the arrowheads are on, at
     * the end of that edge nearest the slot name. It is open while the slot is
     * lit and closed while a click holds the slot locked, and
     * `Render/padlock.ts` holds the shape it is drawn in.
     */
    tape_padlock_gap: number;
}

export const DefaultParaRendererSettings: ParaRendererSettings<any, any, any> = {
    ...DefaultCategoryRendererSettings,
    tape_width: 30,
    tape_arrows_outside_separators: false,
    tape_escape: 24,
    tape_inset: 12,
    tape_spacing: 10,
    tape_elbow_radius: 8,
    tape_arrow: {x: 3.5, y: 8},
    tape_label_dims: {x: 30, y: 16},
    tape_label_gap: 5,
    tape_label_drop: 9,
    tape_label_clearance: 3,
    tape_base_height: 26,
    tape_label_font_size: 0.75,
    tape_label_background: 'transparent',
    tape_label_saturation_value: [0.85, 0.7],
    tape_plate_padding: 3,
    tape_plate_tint: 0.28,
    tape_padlock_gap: 3,
}
