// Claude Fable 5.1, effort medium.
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
 */

/** The visible part of the page, in page coordinates. */
export interface Viewport {
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

/** The tallest a box may be and still fit on the screen with its margin. */
export function room_height(viewport: Viewport): number {
    return Math.max(0, viewport.height - 2 * VIEWPORT_MARGIN_PX);
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
