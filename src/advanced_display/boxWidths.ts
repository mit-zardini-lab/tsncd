// Claude Opus 5 (1M context), effort high.
/*
 * How wide an inspection box is.
 *
 * A box is a core width with a padding either side of it. Every box of a window
 * with room for one has the same core width, and the text of a box occupies it,
 * so the text of one box is set at the measure of the text of the next. The
 * diagram inside a box is wrapped so that the drawing and the ink that overhangs
 * it together occupy no more than the core width. A window with no room for the
 * core width and its padding holds a box of the room the window has.
 *
 * A box taller than the window scrolls, and a browser draws the scrollbar of a
 * box inside the box, which takes room from the content. A drawing occupying the
 * whole core width would then reach past the content and the box would hold a
 * horizontal scrollbar as well, which the user ruled out on 2026-09-21. The room
 * the scrollbar takes is therefore held outside the core width, as the
 * `scrollbar` argument below, and a box showing no scrollbar is laid out at the
 * core width and its padding alone, so the padding either side of its text is
 * the same. `inspectionBoxes.ts` measures the room from the box.
 *
 * The functions here are arithmetic on widths. `inspectionBoxes.ts` writes them
 * onto the page and measures the overhang a drawing takes.
 */

/* The width of the text of a box, and of the drawing under the text, with the
 * padding of the box excluded. */
export const CORE_WIDTH_PX = 1000;
export const PADDING_TOP_PX = 12;
export const PADDING_SIDE_PX = 14;
export const BORDER_PX = 1;
/* The narrowest a drawing is wrapped at, for a drawing whose ink overhangs it
 * by a large part of the core width. */
export const MINIMUM_WRAP_WIDTH_PX = 320;

/** The width a box holding a core of `core` is laid out at, its padding, its
 * border and the room `scrollbar` taken by a scrollbar it shows included. */
export function padded_width(core: number, scrollbar: number): number {
    return core + scrollbar + 2 * (PADDING_SIDE_PX + BORDER_PX);
}

/** The core width of a box laid out in `room` whose scrollbar takes
 * `scrollbar`: the core width where the room holds it, and what the room leaves
 * beside the padding and the scrollbar where it does not. */
export function core_width(room: number, scrollbar: number): number {
    return Math.max(
        0,
        Math.min(CORE_WIDTH_PX,
                 room - scrollbar - 2 * (PADDING_SIDE_PX + BORDER_PX)));
}

/** The width a drawing whose ink overhangs it by `overhang` is wrapped at, so
 * that the drawing and the overhang together occupy the core width. */
export function wrap_width(overhang: number): number {
    return Math.max(MINIMUM_WRAP_WIDTH_PX, CORE_WIDTH_PX - overhang);
}

/**
 * The width to wrap a drawing at, after a drawing wrapped at `wrap` came out
 * `occupied` wide with an overhang of `overhang`.
 *
 * The width leaves room for the overhang that was measured, and it is narrower
 * than `wrap` by what the drawing exceeded the core width by, because a row is
 * broken between two operations and a row of one wide operation comes out wider
 * than the width it was wrapped at. A result no narrower than `wrap` says that
 * no narrower wrapping is left to try.
 */
export function narrowed_wrap_width(
    wrap: number, occupied: number, overhang: number,
): number {
    return Math.max(
        MINIMUM_WRAP_WIDTH_PX,
        Math.min(CORE_WIDTH_PX - overhang, wrap - (occupied - CORE_WIDTH_PX)));
}
