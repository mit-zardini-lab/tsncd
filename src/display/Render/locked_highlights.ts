// Claude Opus 5 (1M context), effort high.
/*
 * The highlights a reader has locked on with a click.
 *
 * A highlight is normally set by the pointer and cleared when the pointer
 * leaves. A lock is a second source for the same token, so the pointer's own
 * source comes and goes beneath the lock and the highlight stays on until the
 * reader clicks again. `RenderHandler.set_highlight` is where the sources are
 * counted.
 *
 * A figure's diagram and the diagram inside each of its inspection boxes have
 * render handlers of their own. An instance therefore keeps the handlers of
 * those diagrams beside the figure's, and `register` lights the tokens already
 * locked on a handler whose diagram has just been drawn.
 *
 * The legend's rows and the tape slots hold one instance each.
 * `register_every_lock` and `forget_every_lock` reach both, and
 * `inspectionBoxes.ts` calls them as a box takes or returns a drawn diagram.
 */

import type * as rh from './RenderHandler';

const INSTANCES = new Set<LockedHighlights>();

export class LockedHighlights {
    private tokens = new Set<string>();
    private handlers = new Set<rh.RenderHandler>();

    constructor(public readonly source: string) {
        INSTANCES.add(this);
    }

    holds(token: string): boolean {
        return this.tokens.has(token);
    }

    get size(): number {
        return this.tokens.size;
    }

    set(
        tokens: readonly string[],
        locked: boolean,
        figure: rh.RenderHandler,
    ): void {
        tokens.forEach((token) => {
            if (locked) {
                this.tokens.add(token);
            } else {
                this.tokens.delete(token);
            }
            figure.set_highlight(token, this.source, locked);
            this.handlers.forEach(
                (handler) => handler.set_highlight(token, this.source, locked));
        });
    }

    /** Lock `tokens` where the first of them is unlocked and release them
     * otherwise, and report the state they end in. */
    toggle(tokens: readonly string[], figure: rh.RenderHandler): boolean {
        const locked = tokens.length > 0 && !this.holds(tokens[0]);
        this.set(tokens, locked, figure);
        return locked;
    }

    register(handler: rh.RenderHandler): void {
        this.handlers.add(handler);
        this.tokens.forEach(
            (token) => handler.set_highlight(token, this.source, true));
    }

    forget(handler: rh.RenderHandler): void {
        this.handlers.delete(handler);
        this.tokens.forEach(
            (token) => handler.set_highlight(token, this.source, false));
    }

    /* A figure drawn again wipes the highlights of its own handler and closes
     * every inspection box it had open, so both sets start empty again. */
    release_every(): void {
        this.tokens.clear();
        this.handlers.clear();
    }
}

export function register_every_lock(handler: rh.RenderHandler): void {
    INSTANCES.forEach((locks) => locks.register(handler));
}

export function forget_every_lock(handler: rh.RenderHandler): void {
    INSTANCES.forEach((locks) => locks.forget(handler));
}

export function release_every_lock(): void {
    INSTANCES.forEach((locks) => locks.release_every());
}

/** How many tokens are locked across every instance, which a driving browser
 * reads through `window.tsncd.lockedHighlights`. */
export function locked_highlight_count(): number {
    return [...INSTANCES].reduce((count, locks) => count + locks.size, 0);
}
