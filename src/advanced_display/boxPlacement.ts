// Claude Fable 5.1, effort medium.
// Revised by Claude Opus 5.5 (1M context), effort 40: the place of a tooltip
// under the text it explains.
/*
 * Where an inspection box stands on the page, so that the whole box is on the
 * screen.
 *
 * A box opens at the pointer and is placed again each time its content
 * arrives, because a box that runs off the bottom of the screen has to be
 * scrolled to, and scrolling moves the page under the pointer, which closes the
 * box and opens another. The box hangs below and to the right of the pointer
 * where it fits. A box too tall for the room below the pointer stands above it
 * where it fits there, so the region under the pointer stays visible, and is
 * otherwise held against the bottom edge of the screen. A box too wide for the
 * room to the right is held against the right edge. A box is never taller or
 * wider than the screen less its margin, so every placement fits.
 *
 * A tooltip stands centred under the text it explains, and above the text
 * where the room below is too short, and is moved along the line of the text
 * as far as the screen needs.
 */

/** The visible part of the page, in page coordinates. */
export interface Viewport {
    left: number;
    top: number;
    width: number;
    height: number;
}

/** A rectangle of the page, in page coordinates. */
export interface PageRectangle {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface Extent {
    width: number;
    height: number;
}

export interface PagePoint {
    x: number;
    y: number;
}

export const VIEWPORT_MARGIN_PX = 8;
export const POINTER_GAP_PX = 2;
export const TOOLTIP_GAP_PX = 6;
const MAX_HEIGHT_VIEWPORT_FRACTION = 0.8;

/** The visible part of the page. The visual viewport is read because panning
 * on a phone can leave the window's scroll position unchanged, and the root's
 * client size, which leaves out the scrollbars, where a browser has none. */
export function page_viewport(): Viewport {
    const visible = window.visualViewport;
    if (visible !== null) {
        return {
            left: visible.pageLeft,
            top: visible.pageTop,
            width: visible.width,
            height: visible.height,
        };
    }
    return {
        left: window.scrollX,
        top: window.scrollY,
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
    };
}

/** The rectangle `element` occupies, in page coordinates. */
export function page_rectangle(element: Element): PageRectangle {
    const bounds = element.getBoundingClientRect();
    return {
        left: bounds.left + window.scrollX,
        top: bounds.top + window.scrollY,
        width: bounds.width,
        height: bounds.height,
    };
}

/**
 * Where a tooltip of `extent` stands for the text occupying `target`: centred
 * under the text where it fits below it, above the text where it fits there,
 * and otherwise against the bottom edge of the screen. Along the line of the
 * text it is moved inside the screen's margin.
 */
export function place_under_target(
    target: PageRectangle, extent: Extent, viewport: Viewport,
): PagePoint {
    const first_x = viewport.left + VIEWPORT_MARGIN_PX;
    const last_x = viewport.left + viewport.width - VIEWPORT_MARGIN_PX;
    const centred = target.left + (target.width - extent.width) / 2;
    const x = Math.max(first_x, Math.min(centred, last_x - extent.width));
    const first_y = viewport.top + VIEWPORT_MARGIN_PX;
    const last_y = viewport.top + viewport.height - VIEWPORT_MARGIN_PX;
    const below = target.top + target.height + TOOLTIP_GAP_PX;
    if (below + extent.height <= last_y) {
        return {x, y: below};
    }
    const above = target.top - TOOLTIP_GAP_PX - extent.height;
    return {x, y: above >= first_y ? above : Math.max(first_y, last_y - extent.height)};
}

/** Cap the box at 80% of the viewport while preserving the screen margin. */
export function room_height(viewport: Viewport): number {
    return Math.max(0, Math.min(
        viewport.height * MAX_HEIGHT_VIEWPORT_FRACTION,
        viewport.height - 2 * VIEWPORT_MARGIN_PX));
}

/** The widest a box may be and still fit on the screen with its margin. */
export function room_width(viewport: Viewport): number {
    return Math.max(0, viewport.width - 2 * VIEWPORT_MARGIN_PX);
}

export function place_beside_pointer(
    pointer: PagePoint, box: Extent, viewport: Viewport,
): PagePoint {
    return {
        x: place_along(
            pointer.x, box.width, viewport.left, viewport.width, false),
        y: place_along(
            pointer.y, box.height, viewport.top, viewport.height, true),
    };
}

/**
 * The position of the box along one axis: after the pointer where the box
 * fits there, before the pointer where it fits there and flipping is allowed,
 * and otherwise as far along as the screen allows, at least the margin.
 */
function place_along(
    pointer: number,
    extent: number,
    viewport_start: number,
    viewport_extent: number,
    may_flip: boolean,
): number {
    const first = viewport_start + VIEWPORT_MARGIN_PX;
    const last = viewport_start + viewport_extent - VIEWPORT_MARGIN_PX;
    const after = pointer + POINTER_GAP_PX;
    if (after + extent <= last) {
        return after;
    }
    const before = pointer - POINTER_GAP_PX - extent;
    if (may_flip && before >= first) {
        return before;
    }
    return Math.max(first, last - extent);
}
