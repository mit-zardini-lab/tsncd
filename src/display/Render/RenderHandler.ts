import * as pt from '../../utilities/Point';
import type * as fd from '../../data_structure/Term';
import {DrawElement, DrawHandler} from "../Render/DrawHandler";
import { TransformHandler } from './TransformHandler';
import * as rhs from './RenderHandlerSettings';
import * as ah from './AnnotationHandler';
import * as te from './TextEstimator';

export type DiagramID = string;
export function fresh_uid(): DiagramID {
    return 'uid_' + Math.random().toString(36);
}

export abstract class DiagramElement {
    public diagram_id: DiagramID = fresh_uid();
    public transform: TransformHandler = new TransformHandler(this);

    public _width: number | undefined;
    public _height: number | undefined;
    get width(): number | undefined {
        return this._width;
    }
    set width(value: number | undefined) {
        this._width = value;
    }
    get height(): number | undefined {
        return this._height;
    }
    set height(value: number | undefined) {
        this._height = value;
    }

    public children: DiagramElement[] = [];
    constructor(
        public renderHandler: RenderHandler,
    ) {
        this.renderHandler.diagram_elements[this.diagram_id] = this;
    }
    /*
     * Whether this element has been mirrored an odd number of times. Draw code
     * whose geometry is stated in terms of a side of the box - the pointed
     * reindexing, an einops cup's sweep - reads it to pick the other side;
     * everything that draws from an anchor's measured location needs nothing,
     * because the layout has already moved the anchor.
     */
    public mirrored: boolean = false;
    /*
     * Reflect the subtree left to right, before it reaches the DOM.
     *
     * Layout is flex, so reversing the children of every horizontally laid-out
     * element mirrors the whole figure while each leaf - a glyph, a label, an
     * anchor - is still drawn the ordinary way round inside its own rectangle.
     * `ContravariantBox` is the caller: a contravariant morphism is its body
     * read from the right, and mirroring twice is the identity, so a
     * contravariant inside a mirrored region comes out drawn forwards.
     *
     * Subclasses with a left-and-right of their own extend this: `AnchoredBox`
     * re-swaps its two anchor references so `left_anchors` keeps naming the
     * column drawn on the left, and `Anchor` swaps `prior` and `further` so
     * links keep running in drawing order.
     */
    public mirror(): void {
        this.mirrored = !this.mirrored;
        if (this.mirror_reverses_children()) {
            this.children = [...this.children].reverse();
        }
        this.children.forEach((child) => child.mirror());
    }
    /*
     * `Vertical` stacks its children top to bottom and `CoreElement` places
     * them by transform, so for both of them the order carries no left-to-right
     * meaning and reversing it would be wrong or a no-op.
     */
    protected mirror_reverses_children(): boolean {
        return true;
    }
    post_placement(): void {
        this.children.forEach((child) => child.post_placement());
    }
    update(): void {
        this.children.forEach((child) => child.update());
    }
    rectangle(): pt.Rectangle {
        return this.renderHandler.rectangle(this);
    }
    location(): pt.Point | undefined {
        return this.renderHandler.location(this);
    }
    set_transform(): void {
        return this.renderHandler.set_transform(this);
    }
    remove_reference(): void {
        if (this.diagram_id in this.renderHandler.diagram_rendered) {
            throw new Error("Cannot remove reference to diagram element that is still rendered.");
        }
        this.children.forEach((child) => child.remove_reference());
        delete this.renderHandler.diagram_elements[this.diagram_id];
    }
    get dims(): pt.Point {
        const child_points = this.children.map((child) => child.dims);
        return {
            x: this.width ?? child_points.reduce((acc, chp) => acc + chp.x, 0),
            y: this.height ?? Math.max(0, ...child_points.map((chp) => chp.y))
        }
    }
    public aux: {
        borderColor?: string,
        core?: boolean,
    } = {};
    get draw(): DrawHandler<any> | undefined {
        return this.renderHandler.draw_handler;
    }
    get events(): EventHandler<any, any> | undefined {
        return this.renderHandler.event_handler;
    }
    public setBorderColor(color: string, core: boolean = false): void {
        this.aux.borderColor = color;
        this.aux.core = core;
    }
}

export class Vertical extends DiagramElement {
    constructor(
        public renderHandler: RenderHandler,
        public children: DiagramElement[],
    ) {
        super(renderHandler);
        this.children = children;
    }
    protected mirror_reverses_children(): boolean {
        return false;
    }
    get dims(): pt.Point {
        const child_points = this.children.map((child) => child.dims);
        return {
            x: this.width ?? Math.max(0, ...child_points.map((chp) => chp.x)),
            y: this.height ?? child_points.reduce((acc, chp) => acc + chp.y, 0),
        }
    }
}

export class Horizontal extends DiagramElement {
    constructor(
        public renderHandler: RenderHandler,
        public children: DiagramElement[],
    ) {
        super(renderHandler);
        this.children = children;
    }
}

export class CoreElement extends DiagramElement {
    constructor(
        public renderHandler: RenderHandler,
        public _dims: Partial<pt.Point>,
        public children: DiagramElement[] = [],
    ) {
        super(renderHandler);
        this.width = _dims.x;
        this.height = _dims.y;
        this.children = children;
    }
    protected mirror_reverses_children(): boolean {
        return false;
    }
}

// TODO:
// AnnotationElement renders in a unique way.
// It is not rendered as a Child.
// Rather, it is instructions for an update.
// Therefore, EventHandlers etc need to treat it in
// a unique manner.
// Nonetheless, as it is a rendered element,
// the DiagramElement class makes sense.
export interface AnnotationElementSettings {
    font_size: number;
    vertical_align: 'start' | 'center' | 'end';
    horizontal_align: 'left' | 'center' | 'right';
    color?: string;
    /*
     * A plate painted behind the text, as a CSS colour. Off by default, and
     * worth asking for only where the annotation is placed over the drawing
     * rather than in room reserved for it - `TapeBox`'s slot label is set
     * outside the layout entirely and otherwise lands on whatever wire the
     * neighbouring row happens to have there. The annotation layer is above
     * every draw layer (z-index 10 against 0), so the plate covers the ink
     * beneath it whatever order the two were drawn in.
     */
    background?: string;
    rotation?: number; // degrees
}

const defaultAnnotationSettings: AnnotationElementSettings = {
    font_size: 1,
    vertical_align: 'center',
    horizontal_align: 'center',
};

export function estimated_label_width(
    lines: string[],
    font_size: number = 0.65,
): number {
    return estimated_label_dims(lines, font_size).x;
}

export function estimated_label_dims(
    lines: readonly string[],
    font_size: number = 0.65,
): pt.Point {
    return te.estimate_text_dims(lines, font_size);
}

export class AnnotationElement extends DiagramElement {
    public annotationSettings: AnnotationElementSettings;
    private _placedRect?: pt.Rectangle;
    /*
     * The highlight this label shows a halo for, and the highlights a pointer
     * resting on the label sets. The annotation handler links both to the
     * element it makes on every placement, so a label a composed gap places
     * and one a wrap places answer the pointer the same way. An axis name
     * carries its axis as both, and a name on a tape sets the tape's slot as
     * well.
     */
    public halo_token?: string;
    public hover_tokens: string[] = [];
    public add_hover_token(token: string): void {
        if (!this.hover_tokens.includes(token)) {
            this.hover_tokens = [...this.hover_tokens, token];
        }
    }
    get rotation(): number | undefined { return this.annotationSettings.rotation; }
    set rotation(degrees: number | undefined) {
        this.annotationSettings.rotation = degrees;
        if (this._placedRect) this.place(this._placedRect);
    }
    constructor(
        public renderHandler: RenderHandler,
        public latex: string,
        _annotationSettings: Partial<AnnotationElementSettings>
            = {},
    ) {
        super(renderHandler);
        this.annotationSettings = {
            ...defaultAnnotationSettings,
            ..._annotationSettings,
        }
    }
    text_rectangle(): pt.Rectangle {
        return this.renderHandler.text_rectangle(this);
    }
    estimated_text_dims(): pt.Point {
        return estimated_label_dims([this.latex], this.annotationSettings.font_size);
    }
    /* The width KaTeX sets the text in, with none of the padding
     * `estimated_text_dims` adds around it. */
    estimated_bare_text_width(): number {
        return te.estimate_bare_text_width(
            [this.latex], this.annotationSettings.font_size);
    }
    place(rect: pt.Rectangle): void {
        this._placedRect = rect;
        this.renderHandler.remove_element(this);
        this.renderHandler.annotation_handler.addAnnotation(
            rect,
            this
        );
    }
}

export abstract class RenderHandler<T=any, R=any> {
    public diagram_elements: Record<DiagramID, DiagramElement> = {};
    /**
     * The term each registered element stands for, so that a pass outside the
     * render pipeline can say which term the pointer is over. Filled during the
     * build phase and emptied by `wipe`, and the element it keys may have been
     * built and then dropped by the multiline splitter, so a reader checks
     * `diagram_rendered` before measuring one.
     */
    public term_regions: Map<DiagramID, fd.Term> = new Map();
    public diagram_rendered: Record<DiagramID, T> = {};
    public primary_children: DiagramElement[] = [];
    public draw_handler?: DrawHandler<T, R>;
    public event_handler?: EventHandler<T, R>;
    private highlight_handlers = new Map<string, Set<(active: boolean) => void>>();
    private highlight_sources = new Map<string, Set<string>>();
    private pending_highlight_sources = new Map<string, Set<string>>();
    public abstract annotation_handler: ah.AnnotationHandler;
    public settings: rhs.RenderHandlerSettings = rhs.defaultRenderHandlerSettings;

    public element_to_rendered(target: DiagramElement): T {
        if (target.diagram_id in this.diagram_rendered) {
            return this.diagram_rendered[target.diagram_id];
        }
        return this._element_to_rendered(target);
    }

    protected abstract _element_to_rendered(target: DiagramElement): T;

    public abstract remove_element(target: DiagramElement): void;

    public get_rendered(target: DiagramElement): T {
        if (!(target.diagram_id in this.diagram_rendered)) {
            throw new Error("Target diagram element has not been rendered yet.");
        }
        return this.diagram_rendered[target.diagram_id];
    }

    public abstract location(target: DiagramElement): pt.Point | undefined;

    public abstract text_rectangle(target: AnnotationElement, relative?: boolean): pt.Rectangle;

    public abstract rectangle(target: DiagramElement, relative?: boolean): pt.Rectangle;

    public abstract set_transform(target: DiagramElement): void;

    public post_placement(): void {
        this.primary_children.forEach((child) => child.post_placement());
    }

    public update(): void {
        this.clear_highlights();
        this.annotation_handler.update();
        this.draw_handler?.update();
        this.primary_children.forEach((child) => child.update());
    }

    public register_highlight(
        token: string,
        handler: (active: boolean) => void,
    ): () => void {
        const handlers = this.highlight_handlers.get(token) ?? new Set();
        handlers.add(handler);
        this.highlight_handlers.set(token, handlers);
        handler((this.highlight_sources.get(token)?.size ?? 0) > 0);
        return () => {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.highlight_handlers.delete(token);
            }
        };
    }

    public set_highlight(token: string, source: string, active: boolean): void {
        const sources = this.highlight_sources.get(token) ?? new Set<string>();
        if (active) {
            this.pending_highlight_sources.get(token)?.delete(source);
            sources.add(source);
            this.highlight_sources.set(token, sources);
        } else {
            const pending = this.pending_highlight_sources.get(token) ?? new Set<string>();
            pending.add(source);
            this.pending_highlight_sources.set(token, pending);
            queueMicrotask(() => this.remove_highlight_source(token, source));
            return;
        }
        this.highlight_handlers.get(token)?.forEach((handler) =>
            handler(sources.size > 0));
    }

    private remove_highlight_source(token: string, source: string): void {
        const pending = this.pending_highlight_sources.get(token);
        if (!pending?.delete(source)) { return; }
        if (pending.size === 0) {
            this.pending_highlight_sources.delete(token);
        }
        const sources = this.highlight_sources.get(token);
        sources?.delete(source);
        if (sources?.size === 0) {
            this.highlight_sources.delete(token);
        }
        this.highlight_handlers.get(token)?.forEach((handler) =>
            handler((sources?.size ?? 0) > 0));
    }

    public clear_highlights(): void {
        this.highlight_handlers.forEach((handlers) =>
            handlers.forEach((handler) => handler(false)));
        this.highlight_handlers.clear();
        this.highlight_sources.clear();
        this.pending_highlight_sources.clear();
    }

    public register_term_region(element: DiagramElement, term: fd.Term): void {
        this.term_regions.set(element.diagram_id, term);
    }

    public add_child(target: DiagramElement): void {
        this.primary_children.push(target);
        this._add_child(target);
    }
    protected abstract _add_child(target: DiagramElement): void;

    protected abstract applyAux(target: DiagramElement): void;

    public abstract wipe(): void

    public abstract getMain(target: DiagramElement | AnnotationElement | DrawElement<T, R>): T | R;
}

export abstract class EventHandler<T, R> {
    constructor(
        public renderHandler: RenderHandler<T, R>,
    ) {
        renderHandler.event_handler = this;
    }
    addHover(
        target: DrawElement<T, R> | AnnotationElement,
        funcIn: (arg: T | R) => void = () => {},
        funcOut: (arg: T | R) => void = () => {},
    ): void {
        throw new Error('Not Implemented');
    }
    /*
     * Answer a click on `target`, and show a pointer cursor over it.
     *
     * The click stops where the target is, because the advanced display closes
     * its inspection boxes on a click the page outside them answers and opens
     * one on a click the diagram container answers.
     */
    addClick(
        target: DrawElement<T, R> | AnnotationElement,
        func: (arg: T | R) => void = () => {},
    ): void {
        throw new Error('Not Implemented');
    }
}
