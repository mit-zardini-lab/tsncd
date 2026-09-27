/*
 * Written by Claude Opus 5.5 (1M context), effort 40.
 *
 * The box for `caching/data_structure/Caching.py`, which saves the array of this
 * pass into a cache and loads the whole cache.
 *
 * The box sits here so that no module of `display/Framework` outside this
 * folder imports `caching/data_structure/`.
 */

import * as rh from '../../Render/RenderHandler';
import * as cat from '../../../data_structure/Category';
import * as pt from '../../../utilities/Point';
import * as bb from '../BroadcastedCategoryRenderer';
import * as plate_names from '../arrows/plateNames';
import * as caching from '../../../caching/data_structure/Caching';

export function establish(): void {
    console.log("Loaded the caching boxes.");
}

const CACHE_NAME_FONT_SIZE = 1;
const CACHE_NAME_HORIZONTAL_PADDING = 8;
const CACHE_MINIMUM_WIDTH = 40;
const CACHE_LID_HALF_HEIGHT = 5;
const CACHE_BROADCAST_WIRE_CLEARANCE = 4;
const CACHE_FILL = '#EEF2F7';
const CACHE_OUTLINE_WIDTH = '1px';
const CACHE_ELLIPSE_SEGMENTS = 16;
const CACHE_DEFAULT_NAME = '\\mathrm{cache}';
const CACHE_PLATE_NAME = '\\mathrm{Cache}';

/* Both arrow forms write `Cache` above a cache, because the cylinder of
 * `arrows-and-broadcasted` and the box of `arrows-and-boxes` write the name of
 * the cache. */
plate_names.plateNamesRegistry.registerFunction(caching.Caching)(
    () => CACHE_PLATE_NAME);

/* The points of the half of the ellipse centred at `centre` with semi-axes
 * `radii` from the angle `start` to the angle `end`, measured clockwise on the
 * page from the positive x direction. */
function half_ellipse_points(
    centre: pt.Point, radii: pt.Point, start: number, end: number,
): pt.Point[] {
    return Array.from({length: CACHE_ELLIPSE_SEGMENTS + 1}, (_, i) => {
        const angle = start + (end - start) * i / CACHE_ELLIPSE_SEGMENTS;
        return {x: centre.x + radii.x * Math.cos(angle),
                y: centre.y + radii.y * Math.sin(angle)};
    });
}

/* The absolute points of `points` in the form `DrawHandler.deltaPolygon`
 * reads: the first point absolute and the rest offsets from the one before. */
function as_deltas(points: pt.Point[]): pt.Point[] {
    return points.map((point, i) => i === 0 ? point : {
        x: point.x - points[i - 1].x,
        y: point.y - points[i - 1].y,
    });
}

/*
 * The outline of a cylinder standing upright in `rect`, which is the usual
 * symbol for stored data: the left side, the front half of the base, the right
 * side, and the back half of the lid.
 */
function cylinder_outline(rect: pt.Rectangle, lid_half_height: number): pt.Point[] {
    const radii = {x: rect.width / 2, y: lid_half_height};
    const middle_x = rect.left + rect.width / 2;
    const lid_centre = {x: middle_x, y: rect.top + lid_half_height};
    const base_centre = {x: middle_x, y: rect.bottom - lid_half_height};
    return [
        ...half_ellipse_points(base_centre, radii, Math.PI, 0),
        ...half_ellipse_points(lid_centre, radii, 0, -Math.PI),
    ];
}

/* The front half of the lid of the cylinder `cylinder_outline` draws, which is
 * the rim that makes the top read as an opening. */
function cylinder_lid_rim(rect: pt.Rectangle, lid_half_height: number): pt.Point[] {
    return half_ellipse_points(
        {x: rect.left + rect.width / 2, y: rect.top + lid_half_height},
        {x: rect.width / 2, y: lid_half_height},
        Math.PI, 0);
}

/*
 * A cache is drawn as a cylinder, the symbol for stored data, with the name of
 * the cache written on its side. The token axis `x` of this pass runs in on the
 * left and the axis `P + x` of every cached token runs out on the right, and
 * every other axis is broadcast past the cylinder as it is past any operator.
 *
 * The cylinder fills the core of this box, and `BroadcastedBox` centres the
 * box on the wire of the token axis. The nearest broadcast wires run one anchor
 * height above and below that wire, so the core is as tall as the room between
 * them less `CACHE_BROADCAST_WIRE_CLEARANCE` on each side. A name wider than
 * the cylinder makes the core wider and leaves its height unchanged.
 */
@bb.opsRegistry.registerClass(caching.Caching)
export class CachingBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, caching.Caching> {
    private annotation: rh.AnnotationElement;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, caching.Caching>,
    ) {
        const latex = target.operator.name?.to_latex() ?? CACHE_DEFAULT_NAME;
        const text_width = rh.estimated_label_width([latex], CACHE_NAME_FONT_SIZE);
        super(categoryRenderer, target, {
            x: Math.max(
                CACHE_MINIMUM_WIDTH, text_width + 2 * CACHE_NAME_HORIZONTAL_PADDING),
            y: 2 * (categoryRenderer.settings.anchor_height
                    - CACHE_BROADCAST_WIRE_CLEARANCE),
        });
        this.annotation = new rh.AnnotationElement(
            this.renderHandler, latex, {font_size: CACHE_NAME_FONT_SIZE});
        this.names_itself = true;
    }
    update(): void {
        super.update();
        const cylinder = this.core.rectangle();
        this.draw?.deltaPolygon(
            as_deltas(cylinder_outline(cylinder, CACHE_LID_HALF_HEIGHT)),
            {fill: CACHE_FILL, stroke: 'black', 'stroke-width': CACHE_OUTLINE_WIDTH},
            {dropShadow: true},
        );
        this.draw?.polyline(
            cylinder_lid_rim(cylinder, CACHE_LID_HALF_HEIGHT),
            {stroke: 'black', 'stroke-width': CACHE_OUTLINE_WIDTH},
        );
        this.annotation.place(new pt.Rectangle(
            {x: cylinder.left, y: cylinder.top + 2 * CACHE_LID_HALF_HEIGHT},
            {x: cylinder.width, y: cylinder.height - 3 * CACHE_LID_HALF_HEIGHT}));
    }
}
