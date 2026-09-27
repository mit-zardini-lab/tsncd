// Claude Opus 5.5 (1M context), effort 40.
/*
 * The direction in which data travels across the page, and the marks that
 * follow it.
 *
 * A covariant morphism is drawn from its domain on the left to its codomain on
 * the right, and its data travels left to right. `ContravariantBox` draws its
 * body mirrored, so the backward pass of a training step travels from its input
 * on the right to its outputs on the left. `DiagramElement.mirrored` records
 * that an element was mirrored an odd number of times, and a contravariant
 * inside a mirrored region is drawn forwards again.
 *
 * A mirror reverses the children of every horizontal element before the page
 * lays them out, which moves every anchor to its mirrored place. A mark drawn
 * inside one rectangle is still drawn the ordinary way round, and so is a
 * shape a box places on a side its code names. The code that draws an
 * arrowhead, the heads beside an elementwise map, the head a dangling natural
 * wire ends in and the corner of a tape reads its direction here, so each
 * points or turns left in a mirrored region. The user asked for arrows
 * pointing right to left in a reversed category on 2026-09-27.
 *
 * `settings.reversed` is a different thing. The stride renderer reads it to put
 * the codomain of a reindexing on the left, and it holds in every region.
 */
import * as pt from '../../utilities/Point';
import type * as rh from './RenderHandler';

/* The way data travels through a drawn element, as the sign of its travel
 * along the x axis of the page. */
export enum TravelDirection {
    LEFT_TO_RIGHT = 1,
    RIGHT_TO_LEFT = -1,
}

/* The way data travels through `element`, which is right to left where the
 * element is drawn mirrored. */
export function travel_direction(element: rh.DiagramElement): TravelDirection {
    return element.mirrored
        ? TravelDirection.RIGHT_TO_LEFT : TravelDirection.LEFT_TO_RIGHT;
}

/*
 * The way data travels along the wire from `start` to `end`, which is right to
 * left where both ends are drawn mirrored. A wire with one end in a mirrored
 * region and the other outside it joins a `ContravariantBox` to the covariant
 * composition that holds it, and is read left to right as that composition is.
 */
export function wire_travel_direction(
    start: rh.DiagramElement,
    end: rh.DiagramElement,
): TravelDirection {
    return start.mirrored && end.mirrored
        ? TravelDirection.RIGHT_TO_LEFT : TravelDirection.LEFT_TO_RIGHT;
}

/* The angle a mark points at for data travelling in `direction`, given the
 * angle `angle_left_to_right` it points at for data travelling left to right. */
export function angle_of_travel(
    angle_left_to_right: number,
    direction: TravelDirection,
): number {
    return direction === TravelDirection.RIGHT_TO_LEFT
        ? angle_left_to_right + Math.PI : angle_left_to_right;
}

/* `point`, given for data travelling left to right, reflected across the
 * vertical line at `mirror_x` for data travelling right to left. */
export function reflect_point_for_travel(
    point: pt.Point,
    mirror_x: number,
    direction: TravelDirection,
): pt.Point {
    return direction === TravelDirection.RIGHT_TO_LEFT
        ? {x: 2 * mirror_x - point.x, y: point.y} : point;
}

/*
 * `polygon`, in the form `DrawHandler.deltaPolygon` reads and given for data
 * travelling left to right, reflected across the vertical line at `mirror_x`
 * for data travelling right to left. The first point is absolute and is
 * reflected across the line, and every later point is a step from the one
 * before, whose x is negated.
 */
export function reflect_polygon_for_travel(
    polygon: readonly pt.Point[],
    mirror_x: number,
    direction: TravelDirection,
): pt.Point[] {
    if (direction === TravelDirection.LEFT_TO_RIGHT) {
        return [...polygon];
    }
    return polygon.map((point, i) => i === 0
        ? reflect_point_for_travel(point, mirror_x, direction)
        : {x: -point.x, y: point.y});
}
