// Claude Opus 5 (1M context), effort high.
/*
 * The padlock shown where a reader can lock a highlight on.
 *
 * Three places show one and they share this module, so that the three read
 * alike. A legend row and an inspection box each write a note in HTML and take
 * their padlock from `LOCKED_GLYPH` and `UNLOCKED_GLYPH`. A taped array has its
 * padlock drawn into the figure instead, because a label inside a diagram is
 * typeset by KaTeX and KaTeX carries no padlock character. The drawn form keeps
 * the shape of the glyph: a rectangular body under a semicircular shackle,
 * with the shackle raised clear of the body on one side while the padlock is
 * open.
 *
 * The drawing is stroked and never filled, so `DiagramTheme` lifts its colour
 * the way it lifts a wire's and the padlock reads in both themes.
 */

import * as pt from '../../utilities/Point';
import * as Curve from '../../utilities/Curve';
import type * as dhd from './DrawHandler';

export const LOCKED_GLYPH = '🔒';
export const UNLOCKED_GLYPH = '🔓';

/* The circular-arc constant, as `ParaWrapDisplay` uses it for a tape's elbow:
 * how far along each leg a cubic's control point goes to approximate a quarter
 * turn. */
const KAPPA = 0.5523;

/*
 * The measurements of a drawn padlock.
 *
 * `body` is the rectangle at the foot of it. `shackle_radius` is the radius of
 * the semicircle above the body and `shackle_leg` the straight run at each end
 * of that semicircle. The open form carries the whole shackle `open_lift`
 * higher and `open_shift` along the body, and leaves the end that is no longer
 * attached hanging a `shackle_leg` below the semicircle.
 */
export interface PadlockShape {
    body: pt.Point;
    shackle_radius: number;
    shackle_leg: number;
    open_lift: number;
    open_shift: number;
    stroke_width: string;
}

export const DEFAULT_PADLOCK_SHAPE: PadlockShape = {
    body: {x: 7.5, y: 5.5},
    shackle_radius: 2.4,
    shackle_leg: 2.2,
    open_lift: 2.4,
    open_shift: 1.2,
    stroke_width: '1.1px',
};

/** The room a padlock takes, which is the room the open form takes, so that
 * the body stands in one place and only the shackle moves. */
export function padlock_dims(shape: PadlockShape): pt.Point {
    return {
        x: shape.body.x,
        y: shape.body.y + shape.shackle_leg + shape.shackle_radius
           + shape.open_lift,
    };
}

export function padlock_body(centre: pt.Point, shape: PadlockShape): pt.Rectangle {
    const dims = padlock_dims(shape);
    return new pt.Rectangle(
        {
            x: centre.x - shape.body.x / 2,
            y: centre.y + dims.y / 2 - shape.body.y,
        },
        {x: shape.body.x, y: shape.body.y},
    );
}

function body_top(centre: pt.Point, shape: PadlockShape): number {
    return padlock_body(centre, shape).top;
}

/*
 * The shackle as one run: up the left end, over the semicircle and down the
 * right end. `arc_line` is the height the semicircle springs from, `shift`
 * carries the whole shackle along the body, and the two bottoms are where each
 * end of the shackle stops.
 */
function shackle_curve(
    centre: pt.Point,
    shape: PadlockShape,
    arc_line: number,
    shift: number,
    left_bottom: number,
    right_bottom: number,
): Curve.Curve {
    const radius = shape.shackle_radius;
    const left = {x: centre.x - radius + shift, y: arc_line};
    const right = {x: centre.x + radius + shift, y: arc_line};
    const apex = {x: centre.x + shift, y: arc_line - radius};
    return new Curve.CurveSequence([
        new Curve.StraightLine({x: left.x, y: left_bottom}, left),
        new Curve.CubicBezierSegment(
            left,
            {x: left.x, y: arc_line - radius * KAPPA},
            {x: apex.x - radius * KAPPA, y: apex.y},
            apex),
        new Curve.CubicBezierSegment(
            apex,
            {x: apex.x + radius * KAPPA, y: apex.y},
            {x: right.x, y: arc_line - radius * KAPPA},
            right),
        new Curve.StraightLine(right, {x: right.x, y: right_bottom}),
    ]);
}

export function closed_padlock_shackle(
    centre: pt.Point, shape: PadlockShape,
): Curve.Curve {
    const top = body_top(centre, shape);
    return shackle_curve(centre, shape, top - shape.shackle_leg, 0, top, top);
}

export function open_padlock_shackle(
    centre: pt.Point, shape: PadlockShape,
): Curve.Curve {
    const top = body_top(centre, shape);
    const arc_line = top - shape.shackle_leg - shape.open_lift;
    return shackle_curve(
        centre, shape, arc_line, shape.open_shift,
        arc_line + shape.shackle_leg, top);
}

/*
 * A drawn padlock, painted only while the thing it stands for is hovered or
 * locked.
 *
 * A padlock that is not painted answers no pointer either. An SVG element is
 * tested against the pointer by its `visibility`, which an opacity of zero
 * leaves alone, so a padlock left as a target while it is invisible would
 * answer the pointer over a patch of blank page beside the plate.
 */
export class DrawnPadlock<T, R> {
    constructor(public readonly parts: readonly dhd.DrawElement<T, R>[]) {
        this.set_drawn(false);
    }
    set_drawn(drawn: boolean): void {
        this.parts.forEach((part) => part.set_attr({
            opacity: drawn ? '1' : '0',
            'pointer-events': drawn ? 'all' : 'none',
        }));
    }
}

function draw_padlock<T, R>(
    draw: dhd.DrawHandler<T, R>,
    centre: pt.Point,
    shape: PadlockShape,
    color: string,
    shackle: Curve.Curve,
): DrawnPadlock<T, R> {
    const line = {stroke: color, 'stroke-width': shape.stroke_width};
    return new DrawnPadlock([
        draw.drawRectangle(padlock_body(centre, shape), {...line, fill: 'none'}),
        draw.curve(shackle, line),
    ]);
}

export function draw_open_padlock<T, R>(
    draw: dhd.DrawHandler<T, R> | undefined,
    centre: pt.Point,
    shape: PadlockShape,
    color: string,
): DrawnPadlock<T, R> | undefined {
    return draw === undefined ? undefined
        : draw_padlock(draw, centre, shape, color,
                       open_padlock_shackle(centre, shape));
}

export function draw_closed_padlock<T, R>(
    draw: dhd.DrawHandler<T, R> | undefined,
    centre: pt.Point,
    shape: PadlockShape,
    color: string,
): DrawnPadlock<T, R> | undefined {
    return draw === undefined ? undefined
        : draw_padlock(draw, centre, shape, color,
                       closed_padlock_shackle(centre, shape));
}
