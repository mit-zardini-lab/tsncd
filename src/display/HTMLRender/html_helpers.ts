
import * as pt from '../../utilities/Point';

export function bound_to_rect(
    target:    HTMLElement,
    relative?: HTMLElement): pt.Rectangle {
    const rect = target.getBoundingClientRect();
    if (!relative) {
        return new pt.Rectangle(
            new pt.Point(rect.left, rect.top),
            new pt.Point(rect.width, rect.height)
        );
    }
    return local_rectangle(rect, relative);
}

/*
 * `rect`, measured on the screen, in the untransformed pixels of `container`,
 * with its origin at the container's top left.
 *
 * The renderer positions elements, wires and labels in the container's own
 * pixels, and the browser reports client rectangles after every transform on
 * the container and its ancestors. A page that zooms the figure with a CSS
 * transform, as the lab website's viewer does, shrinks every measurement by
 * its zoom, and a figure drawn while zoomed put its wires and labels at that
 * fraction of their places. `unscale` by `screen_scale` undoes it.
 */
export function local_rectangle(
    rect:      DOMRectReadOnly,
    container: HTMLElement): pt.Rectangle {
    const origin = container.getBoundingClientRect();
    const scale = screen_scale(container);
    return new pt.Rectangle(
        new pt.Point(unscale(rect.left - origin.left, scale.x), unscale(rect.top - origin.top, scale.y)),
        new pt.Point(unscale(rect.width, scale.x), unscale(rect.height, scale.y))
    );
}

/*
 * `length`, measured on the screen through `scale`, in the container's own
 * pixels. At scale 1 it is returned as measured.
 *
 * The browser lays out in sixty-fourths of a pixel, and a length measured
 * through a scale and divided back lands a hair off its layout value, 30 as
 * 30.000000000000004. The renderer compares measured sizes with the sizes it
 * declared, and `GlyphBox` draws its fill behind a glyph when the measured box
 * is larger, so the hair drew a green box behind the selection glyph of
 * Mixtral-8x7B redrawn at 80%. Snapping to the layout grid recovers the value
 * the unscaled page measures.
 */
export function unscale(length: number, scale: number): number {
    return scale === 1
        ? length
        : Math.round(length / scale * LAYOUT_UNITS_PER_PX) / LAYOUT_UNITS_PER_PX;
}

const LAYOUT_UNITS_PER_PX = 64;

/*
 * The scale the page applies to `element` on the screen, on each axis: the
 * product of the scales of the `transform` and `scale` of the element and of
 * every ancestor. It is exactly 1 where nothing scales the element, so an
 * unscaled page measures exactly as it did before.
 *
 * A draw measures many rectangles against one container, so each scale is kept
 * until the current task ends, after which the page may have zoomed.
 */
const SCALES = new Map<Element, pt.Point>();
let clearing_scales = false;

export function screen_scale(element: Element): pt.Point {
    const known = SCALES.get(element);
    if (known !== undefined) {
        return known;
    }
    let x = 1;
    let y = 1;
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.transform && style.transform !== 'none') {
            const matrix = new DOMMatrixReadOnly(style.transform);
            x *= Math.hypot(matrix.a, matrix.b);
            y *= Math.hypot(matrix.c, matrix.d);
        }
        if (style.scale && style.scale !== 'none') {
            const [sx, sy = sx] = style.scale.split(/\s+/).map(Number);
            x *= sx;
            y *= sy;
        }
    }
    const scale = new pt.Point(x || 1, y || 1);
    SCALES.set(element, scale);
    if (!clearing_scales) {
        clearing_scales = true;
        queueMicrotask(() => {
            SCALES.clear();
            clearing_scales = false;
        });
    }
    return scale;
}
