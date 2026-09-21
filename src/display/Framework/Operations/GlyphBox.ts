/*
 * An operation drawn as a fixed shape rather than as a rectangle.
 *
 * `OperationBox` grows with the wires it carries, so its rectangle is as tall
 * as its columns and as wide as its rows. A circle and a diamond have one
 * dimension, so a box with more than a few wires is larger than the shape that
 * names it and the rest of the box is empty. Two things then go wrong. A wire
 * arrives at nothing, and a tape drawn onto the operation - `LinearBox` and
 * `NormalizeBox` set `raise_rows` false so that it does - ends in mid-air
 * beside the shape.
 *
 * A `GlyphBox` draws the shape at the size the box declared as its core, and
 * fills the rest of the rectangle behind it wherever the box is larger than
 * that. The shape is the same size in every figure and in every box, so two
 * of them read as the same operation whatever each is carrying. The filled
 * rectangle has one corner bitten off, which is the mark this package puts on
 * a box carrying more than its glyph states: `LinearBox` bites the
 * bottom-left corner of a plain rectangle and `TransposeBox` the top-right.
 *
 * A subclass gives the fill, the corner and the shape. `NormalizeBox` is a
 * circle, `TopKBox` and `InjectBox` are the two halves of `drawSelectionGlyph`.
 */
import * as pt from '../../../utilities/Point';
import * as cat from '../../../data_structure/Category';
import * as bb from '../BroadcastedCategoryRenderer';

/*
 * Which corner of a rectangle is bitten off. The bite is a mark rather than a
 * position, so a box picks the corner that reads against its neighbours:
 * `TransposeBox` bites the corner opposite `LinearBox`'s, and `InjectBox` the
 * corner `TopKBox`'s is a reflection of.
 */
export enum Corner {
    TOP_LEFT = 'top left',
    TOP_RIGHT = 'top right',
    BOTTOM_RIGHT = 'bottom right',
    BOTTOM_LEFT = 'bottom left',
}

/* The square of side `side` with the same centre as `rect`. */
export function centred_square(rect: pt.Rectangle, side: number): pt.Rectangle {
    const middle = rect.midpoint();
    return new pt.Rectangle(
        {x: middle.x - side / 2, y: middle.y - side / 2},
        {x: side, y: side});
}

/* The rectangle of size `dims` with the same centre as `rect`. */
export function centred_rectangle(rect: pt.Rectangle, dims: pt.Point): pt.Rectangle {
    const middle = rect.midpoint();
    return new pt.Rectangle(
        {x: middle.x - dims.x / 2, y: middle.y - dims.y / 2}, dims);
}

/*
 * `rect` with `corner` cut off `bite` along each of the two edges that meet
 * there, in the form `DrawHandler.deltaPolygon` reads: the first point
 * absolute and the rest offsets from the one before.
 *
 * The walk is clockwise from the top-left, and the bitten corner contributes
 * the two points where the cut meets its edges in place of the corner itself.
 */
export function bitten_rectangle(
    rect: pt.Rectangle,
    bite: number,
    corner: Corner,
): pt.Point[] {
    const {left, right, top, bottom} = rect;
    const clockwise = [
        {corner: Corner.TOP_LEFT, point: {x: left, y: top},
         entering: {x: left, y: top + bite}, leaving: {x: left + bite, y: top}},
        {corner: Corner.TOP_RIGHT, point: {x: right, y: top},
         entering: {x: right - bite, y: top}, leaving: {x: right, y: top + bite}},
        {corner: Corner.BOTTOM_RIGHT, point: {x: right, y: bottom},
         entering: {x: right, y: bottom - bite}, leaving: {x: right - bite, y: bottom}},
        {corner: Corner.BOTTOM_LEFT, point: {x: left, y: bottom},
         entering: {x: left + bite, y: bottom}, leaving: {x: left, y: bottom - bite}},
    ];
    const absolute = clockwise.flatMap((c) => c.corner === corner
        ? [c.entering, c.leaving]
        : [c.point]);
    return absolute.map((point, i) => i === 0 ? point : {
        x: point.x - absolute[i - 1].x,
        y: point.y - absolute[i - 1].y,
    });
}

export abstract class GlyphBox<
    B extends cat.Datatype,
    A extends cat.Axis,
    Op extends cat.Operator,
> extends bb.OperationBox<B, A, Op> {
    /* The colour the rectangle behind the glyph is filled with. */
    protected abstract get glyph_fill(): string;
    /* The corner that rectangle is bitten at. */
    protected abstract get bitten_corner(): Corner;
    /* The glyph, drawn in the square `glyph_square` gives it. */
    protected abstract draw_glyph(glyph: pt.Rectangle): void;

    /*
     * The square the glyph is drawn in: the core the box was constructed
     * with, centred in the box. The core is what the operator asked for and
     * the box grows past it with the wires it carries, so measuring the glyph
     * against the box would draw the same operation at a different size in
     * every figure.
     */
    protected glyph_square(): pt.Rectangle {
        return centred_square(
            this.rectangle(), Math.min(this.core_dims.x, this.core_dims.y));
    }

    /*
     * The part of the box the glyph and whatever is written with it occupy,
     * which is the glyph alone for a box that draws nothing else. A box that
     * writes a name under its glyph returns the two together, so that the
     * fill is drawn where the wires have made the box larger than the pair
     * and not where the name is.
     */
    protected glyph_room(): pt.Rectangle {
        return this.glyph_square();
    }

    update(): void {
        super.update();
        const rect = this.rectangle();
        const room = this.glyph_room();
        const glyph = this.glyph_square();
        if (room.width < rect.width || room.height < rect.height) {
            this.draw?.deltaPolygon(
                bitten_rectangle(
                    rect, this.settings.operation_multilinear_bite,
                    this.bitten_corner),
                {fill: this.glyph_fill, stroke: 'none'},
                {dropShadow: true},
            );
        }
        this.draw_glyph(glyph);
    }
}
