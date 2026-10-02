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
    /*
     * A wire that continues on the next row turns down the page through a
     * quarter circle of `multiline_arc_radius` px at the end of its row, and
     * turns out of the same circle at the start of the next row. Each circle
     * stands in a cap `multiline_curve_width` px wide, and the rest of the cap
     * is the level run that carries the wire's arrow.
     */
    multiline_curve_width: number;
    multiline_arc_radius: number;
    /*
     * The plate under the arcs of one array, which lights while the pointer
     * rests on either of the array's two plates and is the hit target a click
     * locks the pair from. It is padded `multiline_plate_padding` px past the
     * arcs, their runs and their arrows, and filled with the highlight colour blended into the surface at
     * `multiline_plate_tint`. Its padlock stands `multiline_padlock_gap` px
     * outside the row, as a taped array's padlock stands `tape_padlock_gap` px
     * outside its plate.
     */
    multiline_plate_padding: number;
    multiline_plate_tint: number;
    multiline_padlock_gap: number;
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
    multiline_arc_radius: 10,
    multiline_plate_padding: 3,
    multiline_plate_tint: 0.28,
    multiline_padlock_gap: 3,
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
 * The settings of the arrow form of the broadcasted category, which
 * `display/Framework/arrows/` draws. The form draws with the anchor heights
 * and the gap widths of `BroadcastedRendererSettings`, so the two forms of one
 * figure stand alike, and it adds the numbers below.
 */
export interface ArrowRendererSettings<
    B extends cat.Datatype = cat.Datatype,
    A extends cat.Axis = cat.Axis> extends BroadcastedRendererSettings<B, A> {
    /*
     * The width of the room beside an operator's box in which an operand's
     * arrow opens into the wires of its array's axes, and in which the axes of
     * a result close into the result's arrow, in px.
     */
    arrow_fan_width: number;
    /*
     * The room kept between the end of an arrow's label and the stretch of
     * the arrow's wire that carries the direction triangle, in px.
     */
    arrow_label_clearance: number;
    /*
     * How much further below an arrow's wire its datatype stands than the
     * `annotation_drop` puts it, in px, so that the line of text below the
     * heavy wire stands as clear of it as the shape above it does.
     */
    arrow_datatype_clearance: number;
    /*
     * How far an arrow's wire may climb or fall under the end of the line of
     * its label on the side it turns towards, in px, before the wire runs
     * level under that line and bends beyond it.
     */
    arrow_label_wire_tolerance: number;
    /*
     * The width an arrow's wire is stroked at, in px. It is heavier than an
     * axis wire, so the one wire of an array reads apart from the wires of its
     * axes that a fan opens it into.
     */
    arrow_stroke_width: number;
    /*
     * How many times larger than the triangle of a datatype wire the
     * direction triangle of an arrow is drawn, so that it reads as a head on
     * the heavier line.
     */
    arrow_head_scale: number;
    /* The radius of the dot where an arrow forks into several arrows, in px,
     * which is larger than the dot on an axis wire so that it reads on the
     * heavier line. */
    arrow_dot_radius: number;
    /*
     * The plate an operator's box stands on: how far it reaches past the
     * box, in px, and the radius of its corners, in px. The plate is filled
     * with `arrow_plate_color` blended into the theme's surface at
     * `arrow_plate_tint`, so the theme gives its colour in each mode.
     */
    arrow_plate_padding: number;
    arrow_plate_radius: number;
    arrow_plate_color: string;
    arrow_plate_tint: number;
    /*
     * The room between the name of an axis written in a fan and the plate at
     * one end, and between the name and the fan's arrow at the other, in px.
     */
    arrow_axis_name_clearance: number;
    /* The size the name of an elementwise map is written at over its arrow,
     * which is the size `ElementwiseBox` writes it at in the axis form. */
    arrow_map_name_font_size: number;
    /* The room between each head of an elementwise map and the end of the
     * map's box, in px, which keeps the head clear of the label of the arrow
     * the map writes. */
    arrow_map_margin: number;
}

export const DefaultArrowRendererSettings: ArrowRendererSettings = {
    ...DefaultBroadcastedRendererSettings,
    /* No separator stands between two arrows, because one arrow is already
     * one array. */
    separator_settings: undefined,
    /*
     * An arrow's label stands a little above its wire. A wire from the middle
     * of one operator's wires to the middle of the next operator's climbs
     * wherever the second middle is the higher, and a label resting on the
     * wire at the gap's left edge meets the climbing wire at its right end.
     */
    annotation_drop: -2,
    arrow_fan_width: 24,
    arrow_label_clearance: 4,
    arrow_datatype_clearance: 3,
    arrow_label_wire_tolerance: 5,
    arrow_stroke_width: 2.5,
    arrow_head_scale: 1.35,
    arrow_dot_radius: 3,
    arrow_plate_padding: 5,
    arrow_plate_radius: 6,
    arrow_plate_color: '#7d8ba1',
    arrow_plate_tint: 0.12,
    arrow_axis_name_clearance: 3,
    arrow_map_name_font_size: 1,
    arrow_map_margin: 8,
}

/*
 * The settings of the box form, which `display/Framework/arrows/BoxRenderer.ts`
 * draws. The arrows are the arrow form's, and an operator's box is drawn in
 * the fill, the shadow and the radius of the arrow form's plate. The numbers
 * below size the face inside the box.
 */
export interface BoxRendererSettings<
    B extends cat.Datatype = cat.Datatype,
    A extends cat.Axis = cat.Axis> extends ArrowRendererSettings<B, A> {
    /* The room between a face and the edge of its box, in px. */
    box_face_padding: pt.Point;
    /* The room left above and below a box inside the room its arrows take, in
     * px, so that two boxes of a product stand apart. */
    box_margin: number;
    /* The room between the right edge of a box and the label of the arrow of
     * each result, which the gap after the box writes, in px. */
    box_result_label_inset: number;
    /* The narrowest an operator's box is drawn, in px. */
    box_minimum_width: number;
    /* The size a name written in the middle of a box is set at. */
    box_face_font_size: number;
    /* The side of the square a glyph is drawn in under the name of its box,
     * and the room between the name and the glyph, in px. */
    box_glyph_side: number;
    box_glyph_label_gap: number;
    /* The fill of the named rectangle a `Linear` is drawn as, which is the
     * fill `LinearBox` draws it in. */
    box_linear_fill: string;
}

export const DefaultBoxRendererSettings: BoxRendererSettings = {
    ...DefaultArrowRendererSettings,
    box_face_padding: {x: 10, y: 6},
    box_margin: 4,
    box_result_label_inset: 5,
    box_minimum_width: 30,
    box_face_font_size: 1,
    box_glyph_side: 20,
    box_glyph_label_gap: 6,
    box_linear_fill: '#E8EEEB',
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
    /*
     * Whether the tape of a grab off a wrap over a rearrangement, which a bare
     * `Grab` is drawn as, writes the name of each wire it turns into. The
     * all-broadcasted form writes each axis name on its tape. The arrow forms
     * leave the label of the array to the composed gap after the wrap, so that
     * the label stands on a level wire as the label of every other arrow does.
     */
    grab_tape_names_its_wire: boolean;
}

export const DefaultParaRendererSettings: ParaRendererSettings<any, any, any> = {
    ...DefaultCategoryRendererSettings,
    tape_width: 30,
    tape_arrows_outside_separators: false,
    tape_escape: 24,
    tape_inset: 12,
    tape_spacing: 10,
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
    grab_tape_names_its_wire: true,
}
