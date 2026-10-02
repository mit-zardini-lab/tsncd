// Claude Opus 5.5 (1M context), effort 40.
/*
 * A plate a reader lights by resting the pointer on it and locks lit with a
 * click, and the padlock beside it that says which of the two holds.
 *
 * A taped array is drawn with one plate per slot it reaches, in
 * `para/ParaWrapDisplay.ts`, and a wire that continues on the next row of a
 * wrapped figure is drawn with one plate at the end of its row and one at the
 * start of the next, in `Multiline.ts`. Both call `draw_lockable_plate`, so the
 * two answer the pointer alike.
 */

import * as pt from '../../utilities/Point';
import * as padlock from './padlock';
import type * as dhd from './DrawHandler';
import type * as locked_highlights from './locked_highlights';
import type * as rh from './RenderHandler';

/*
 * The plate covers `region` and is filled with `color` blended into the
 * surface at `tint` while `highlight_token` is lit. `lock_token` is the second
 * highlight a lock holds, which closes the padlock, and `locks` holds the two
 * tokens a click toggles. The padlock stands at `padlock_centre`. `source`
 * names the pointer's hold on the highlight, and is distinct for every plate.
 */
export interface LockablePlate {
    region: pt.Rectangle;
    color: string;
    tint: number;
    highlight_token: string;
    lock_token: string;
    locks: locked_highlights.LockedHighlights;
    padlock_centre: pt.Point;
    source: string;
}

/*
 * The plate on the background layer under the wires, invisible until its
 * highlight is lit, and the two padlocks beside it, painted one at a time.
 *
 * The plate is the hit target the pointer sets the highlight from. A click on
 * the plate or on a padlock locks the highlight lit, and a second click
 * releases it. The open padlock is drawn while the highlight is lit and
 * unlocked, which says that a click would lock it. The closed one is drawn
 * while the lock holds. Both read the highlight registry rather than this
 * plate's own pointer, so every plate of one highlight shows the padlock of the
 * plate the pointer rests on. A padlock stands outside its plate and answers
 * the pointer as the plate does, so the highlight stays lit while the reader
 * moves from the plate onto the padlock.
 */
export function draw_lockable_plate(
    renderHandler: rh.RenderHandler,
    plate: LockablePlate,
): void {
    const draw = renderHandler.draw_handler;
    const filled_plate = draw?.drawRectangle(plate.region, {
        fill: plate.color,
        fillRole: 'tint',
        surfaceTint: plate.tint,
        stroke: 'none',
        'stroke-width': '0',
    }, undefined, 'background');
    if (draw === undefined || filled_plate === undefined) {
        return;
    }
    const lock_tokens = [plate.highlight_token, plate.lock_token];
    const answer_the_pointer = (target: dhd.DrawElement, source: string): void => {
        renderHandler.event_handler?.addHover(
            target,
            () => renderHandler.set_highlight(plate.highlight_token, source, true),
            () => renderHandler.set_highlight(plate.highlight_token, source, false));
        renderHandler.event_handler?.addClick(
            target, () => plate.locks.toggle(lock_tokens, renderHandler));
    };

    filled_plate.set_attr({'fill-opacity': '0'});
    renderHandler.register_highlight(plate.highlight_token, (lit) =>
        filled_plate.set_attr({'fill-opacity': lit ? '1' : '0'}));
    answer_the_pointer(filled_plate, `${plate.source}:plate`);

    const shape = padlock.DEFAULT_PADLOCK_SHAPE;
    const open = padlock.draw_open_padlock(draw, plate.padlock_centre, shape, plate.color);
    const closed = padlock.draw_closed_padlock(
        draw, plate.padlock_centre, shape, plate.color);
    for (const part of [...open?.parts ?? [], ...closed?.parts ?? []]) {
        answer_the_pointer(part, `${plate.source}:padlock`);
    }
    const state = {lit: false, locked: false};
    const paint_padlocks = (): void => {
        open?.set_drawn(state.lit && !state.locked);
        closed?.set_drawn(state.locked);
    };
    renderHandler.register_highlight(
        plate.highlight_token, (lit) => { state.lit = lit; paint_padlocks(); });
    renderHandler.register_highlight(
        plate.lock_token, (locked) => { state.locked = locked; paint_padlocks(); });
}
