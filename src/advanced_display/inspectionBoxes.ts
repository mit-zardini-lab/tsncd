// Claude Opus 5, effort high. Revised by Claude Fable 5.1, effort 80.
// Revised by Claude Fable 5.1, effort medium: the box is placed on the screen whole.
// Revised by Claude Opus 5 (1M context), effort high.
// Revised by Claude Fable 5.1, effort 80: the box is padded to the overhang of its drawing.
// Revised by Claude Opus 5 (1M context), effort high: a core width and a padding.
/*
 * The inspection boxes a figure opens under the pointer.
 *
 * A block box shows the block's title, the formula the sender holds for it
 * where there is one, its description, the places in a codebase it stands for,
 * and the block's body drawn beside them. An operator box shows the operator's
 * name, its formula, its description, its own code references where the sender
 * attaches any, and the expansion drawn as a diagram. A reference is preceded
 * by the icon it names, which `referenceIcons.ts` draws. Everything either box
 * shows arrives in the `auxiliary` field of the message, because `tsncd` does
 * no algebra.
 *
 * One box draws no diagram: a block whose aesthetics say
 * `BlockDrawing.BODY_IN_PLACE` has its body drawn where the block stands, so
 * the figure already shows what a body diagram would show. Such a box holds its
 * text alone and is never queued for prerendering.
 *
 * A region is the operation box of an operator, its glyph without the node
 * box stacked above it where the operator has one, which
 * `display/Framework/BroadcastedCategoryRenderer.ts` registers on the render
 * handler as it builds it. The pointer is tested against the rectangles rather
 * than against elements of the page, so nothing is added over the drawing for
 * the test and the wire highlights underneath keep their own hover.
 *
 * Resting on a region opens a box that closes when the pointer leaves both the
 * region and the box. While the box is open, a block's own highlight is held
 * on through the render handler's highlight registry, on the figure and on
 * the body drawn inside the box, so it outlives the pointer. Clicking locks
 * the box open. A note at the top of every box says
 * whether it is locked, and clicking the note locks or unlocks it. The note
 * and the title under it form the head of the box, which stays at the top
 * edge while the rest of a box taller than its room is scrolled.
 *
 * A box is a core width with a padding either side of it, and `boxWidths.ts`
 * holds both, together with the room taken by the scrollbar a box shows when it
 * is taller than the window. The text of a box occupies the core width, and the
 * scrollbar stands beside the core rather than over it. The diagram
 * inside a
 * box is wrapped so that the drawing and the ink that overhangs it together
 * occupy the core width, so a body is read as a multiline figure of a few rows
 * and no scrollbar is drawn for the width of a box. The wires and the labels of
 * a drawing reach past the container that holds it, and the room they take is
 * measured once the drawing stands in the holder, so the container is given the
 * overhang as its margin. The first drawing of a term is wrapped to leave the
 * overhang the draw layers take, and a drawing that comes out wider than the
 * core width is drawn again wrapped narrower, as `draw_within_core_width`
 * states. A box taller than the window scrolls, and a window with no room for
 * the core width and its padding holds a box of the room the window has.
 *
 * A container holds one unlocked box at a time, the one under the pointer,
 * and as many locked boxes as regions it has, one per region, so several
 * blocks are inspected at once. Every box, locked or not, draws boxes of its
 * own from the diagram inside it, so a reader opens one operator inside
 * another as far down as the expansions go. An unlocked box stays open while
 * the pointer is in a box opened inside it, and closing a box closes the
 * boxes opened from the diagram inside it. The block a box was opened from is
 * highlighted in its figure while the box is open.
 *
 * The body or the expansion a box draws is drawn once per figure and kept in a
 * pool between openings. Once the pointer enters a figure, the content of every
 * region it can open is drawn ahead of the pointer, one region per idle period,
 * inside a holder parked outside the viewport, and a box takes its content from
 * the pool rather than drawing it while the pointer waits.
 */

import katex from 'katex';
import * as cat from '../data_structure/Category';
import * as ops from '../data_structure/Operators';
import * as fd from '../data_structure/Term';
import * as pt from '../utilities/Point';
import * as html_helpers from '../display/HTMLRender/html_helpers';
import * as HTMLDrawHandler from '../display/HTMLRender/HTMLDrawHandler';
import * as DiagramTheme from '../display/Render/DiagramTheme';
import * as highlightTokens from '../display/Render/highlightTokens';
import * as dt_json from '../data_transfer/json';
import * as capture from '../data_transfer/capture';
import * as locked_highlights from '../display/Render/locked_highlights';
import * as padlock from '../display/Render/padlock';
import * as referenceIcons from './referenceIcons';
import * as boxPlacement from './boxPlacement';
import * as boxWidths from './boxWidths';
import {KATEX_OPTIONS} from '../display/HTMLRender/katex_options';
import * as rh from '../display/Render/RenderHandler';
import type * as rhs from '../display/Render/RenderHandlerSettings';
import type * as drt from '../display/diagramRenderTarget';
import type * as aux from './AuxiliaryInformation';

export type RegionKind = 'block' | 'expansion' | 'none';

/*
 * The term a region stands for: the `Broadcasted` of an operator, or a block
 * standing in the figure as a morphism of its own, which is how a reindexing
 * explained by a block arrives from
 * `display/Framework/StrideCategoryRenderer.ts`.
 */
type RegionTerm = cat.Broadcasted<any, any> | cat.Block<any, any>;

/** A rectangle of a drawn diagram, in the coordinates of its container. */
interface DiagramRegion {
    rect: pt.Rectangle;
    kind: RegionKind;
    key: string;
    target: RegionTerm;
}

/*
 * The block a region stands for, and nothing for a region that stands for an
 * operator's expansion. A block reaches a region two ways: as the block of a
 * `BlockOperator`, and as a block drawn in place of a morphism.
 */
function region_block(target: RegionTerm): cat.Block<any, any> | undefined {
    if (target instanceof cat.Block) {
        return target;
    }
    const operator = target.operator;
    return operator instanceof ops.BlockOperator ? operator.block : undefined;
}

/** A region as `window.tsncd.regions()` reports it, in page coordinates. */
export interface PageRegion {
    left: number;
    top: number;
    width: number;
    height: number;
    kind: RegionKind;
    key: string;
}

/** The content drawn for one figure, shared by every container the figure
 * holds, whether the root or a diagram inside one of its boxes. */
interface FigureContent {
    holder: HTMLElement;
    pool: Map<string, HTMLElement[]>;
    pending: Map<string, Promise<HTMLElement>>;
    drawn: Set<string>;
    queue: {state: ContainerRegions; region: DiagramRegion}[];
    prerendering: boolean;
    abandoned: boolean;
}

/** What one drawn container offers the pointer, replaced on every render. */
interface ContainerRegions {
    container: HTMLElement;
    regions: DiagramRegion[];
    renderHandler: rh.RenderHandler;
    settings: rhs.RenderHandlerSettings;
    auxiliary?: aux.DiagramAuxiliary;
    makeSubTarget: (container: HTMLElement) => drt.RenderTarget;
    figure: FigureContent;
    depth: number;
}

interface OpenBox {
    /* Distinct for every box opened, which names the source the box holds a
     * block's highlight under. */
    number: number;
    node: HTMLDivElement;
    /* The lock note and the title, held at the top edge of the box while the
     * rest of it scrolls. */
    head: HTMLDivElement;
    lock_note: HTMLDivElement;
    /* The point the box opened at, in page coordinates, which the box is placed
     * beside each time its content arrives. */
    pointer: boxPlacement.PagePoint;
    container: HTMLElement;
    region: DiagramRegion;
    state: ContainerRegions;
    depth: number;
    key: string;
    locked: boolean;
    close_timer: number | null;
    content: HTMLElement | null;
}

const BOX_CLOSE_DELAY_MS = 250;
const SUB_DIAGRAM_MARGIN_TOP_PX = 8;
/* The overhang the first drawing of a term is wrapped to leave room for, which
 * is the room `HTMLDrawHandler` gives its layers either side of the container it
 * draws in. A drawing whose ink stays inside that room, and whose rows break at
 * the width they were wrapped at, occupies the core width and is not drawn a
 * second time. */
const RESERVED_OVERHANG_PX = 2 * HTMLDrawHandler.BUFFER;
/* The number of times one term is drawn to fit the core width. The rows of a
 * narrower drawing end on other axes and carry an overhang of their own, so a
 * drawing that still exceeds the core width is drawn again a bounded number of
 * times rather than until it fits. */
const DRAWING_PASSES = 3;
/* The parts of a box written from the auxiliary information. A refill removes
 * them and writes them again, and leaves the lock note, the diagram and the
 * note that stands in for a diagram still being drawn. */
const REWRITTEN_CLASSES = [
    'inspection-box-header',
    'inspection-box-formula',
    'inspection-box-description',
    'inspection-box-references',
];
const LOCKED_NOTE = `${padlock.LOCKED_GLYPH} click to unlock`;
const UNLOCKED_NOTE = `${padlock.UNLOCKED_GLYPH} click to lock`;
const DRAWING_NOTE = 'drawing…';
const DRAWING_NOTE_CLASS = 'inspection-box-drawing';

const CONTAINER_REGIONS = new WeakMap<HTMLElement, ContainerRegions>();
const LISTENING_CONTAINERS = new WeakSet<HTMLElement>();
const PRERENDER_QUEUED = new WeakSet<HTMLElement>();
/* The figure a diagram drawn for a box belongs to, set before it is drawn. A
 * container with no entry is the root of a figure of its own. */
const CONTAINER_FIGURE = new WeakMap<HTMLElement, FigureContent>();
/* The depth a container inside a box draws at, so a box it opens in turn
 * stands one deeper than the box holding it. Set when the box takes it. */
const CONTAINER_DEPTH = new WeakMap<HTMLElement, number>();
const CONTAINER_BOX = new WeakMap<HTMLElement, OpenBox>();
const ROOT_FIGURES = new WeakMap<HTMLElement, FigureContent>();
const DRAWN_CONTAINERS: HTMLElement[] = [];
const OPEN_BOXES: OpenBox[] = [];

/* The click a container has already answered, so the document listener does not
 * read the same click as a click on the page outside every box. */
let answered_click: MouseEvent | null = null;
let listening_to_document = false;
let boxes_opened = 0;

export function attach_inspection_boxes(context: drt.RenderedDiagram): void {
    const container = context.container;
    const inherited = CONTAINER_FIGURE.get(container);
    if (inherited === undefined) {
        close_every_box();
        /* The figure this container held has been drawn again, and the render
         * wiped the highlights of its handler, so every lock a reader had set
         * on it is already off the screen. */
        locked_highlights.release_every_lock();
    }
    remember_container(container);
    if (context.settings.inspectionBoxes !== true) {
        CONTAINER_REGIONS.delete(container);
        container.style.cursor = '';
        return;
    }
    CONTAINER_REGIONS.set(container, {
        container,
        regions: measure_regions(context),
        renderHandler: context.renderHandler,
        settings: context.settings,
        auxiliary: context.auxiliary,
        makeSubTarget: context.makeSubTarget,
        figure: inherited ?? replace_root_figure(container),
        depth: CONTAINER_DEPTH.get(container) ?? 0,
    });
    if (inherited === undefined) {
        /* The figure's own diagram is one of the diagrams a lock lights. A
         * reader who locks a tape slot inside an inspection box is naming the
         * slot rather than the box, so every grab and drop of that slot in the
         * figure outside the box lights with it. The box diagrams are told
         * about a lock by `adopt_content`, and without this the figure was the
         * one diagram a lock set inside a box never reached. The reviewer
         * found the difference on the slot `mod` of Engram, on 2026-09-17. */
        locked_highlights.register_every_lock(context.renderHandler);
    }
    PRERENDER_QUEUED.delete(container);
    listen_to_container(container);
    listen_to_document();
}

function remember_container(container: HTMLElement): void {
    if (!DRAWN_CONTAINERS.includes(container)) {
        DRAWN_CONTAINERS.push(container);
    }
}

function replace_root_figure(container: HTMLElement): FigureContent {
    const previous = ROOT_FIGURES.get(container);
    if (previous !== undefined) {
        previous.abandoned = true;
        previous.holder.remove();
    }
    const figure: FigureContent = {
        holder: parked_holder(),
        pool: new Map(),
        pending: new Map(),
        drawn: new Set(),
        queue: [],
        prerendering: false,
        abandoned: false,
    };
    ROOT_FIGURES.set(container, figure);
    return figure;
}

/**
 * A container the renderer can measure in, parked outside the viewport.
 *
 * Parked with a transform rather than hidden, for the reason `src/index.ts`
 * gives for its off-screen twin: the renderer measures itself with
 * `getBoundingClientRect`, and a hidden subtree measures zero.
 */
function parked_holder(): HTMLElement {
    const holder = document.createElement('div');
    holder.className = 'inspection-box-holder';
    holder.style.position = 'absolute';
    holder.style.top = '0px';
    holder.style.left = '0px';
    holder.style.transform = 'translateX(-100000px)';
    document.body.appendChild(holder);
    return holder;
}

function measure_regions(context: drt.RenderedDiagram): DiagramRegion[] {
    const handler = context.renderHandler;
    const regions: DiagramRegion[] = [];
    handler.term_regions.forEach((term: fd.Term, id: string) => {
        const element = handler.diagram_elements[id];
        if (element === undefined || !(id in handler.diagram_rendered)) {
            return;
        }
        if (!(term instanceof cat.Broadcasted) && !(term instanceof cat.Block)) {
            return;
        }
        const rect = region_rectangle(handler, element, context.container);
        if (rect.width <= 0 || rect.height <= 0) {
            return;
        }
        const named = name_region(term, context.auxiliary);
        regions.push({rect, kind: named.kind, key: named.key, target: term});
    });
    return regions;
}

/*
 * The rectangle of a region, in the coordinates of `container`.
 *
 * `HTMLAnnotationHandler` places a label in a box as wide as the gap that holds
 * it, and a reader rests on the text, so the region of a label is the text
 * drawn inside that box. The format written by a thin conversion is the label
 * this matters for: the last gap of the FP4 round trip is 1148 pixels wide and
 * the format drawn in it is 38.
 */
function region_rectangle(
    handler: rh.RenderHandler,
    element: rh.DiagramElement,
    container: HTMLElement,
): pt.Rectangle {
    const rendered = handler.get_rendered(element);
    const text = element instanceof rh.AnnotationElement
        ? rendered.children[0] as HTMLElement | undefined : undefined;
    return html_helpers.bound_to_rect(text ?? rendered, container);
}

function name_region(
    target: RegionTerm,
    auxiliary?: aux.DiagramAuxiliary,
): {kind: RegionKind; key: string} {
    const block = region_block(target);
    if (block !== undefined) {
        const key = String(block.block_tag.uid._id);
        return auxiliary?.blocks?.[key] === undefined
            ? {kind: 'none', key: ''} : {kind: 'block', key};
    }
    if (!(target instanceof cat.Broadcasted)) {
        return {kind: 'none', key: ''};
    }
    const occurrence = dt_json.broadcast_occurrence(target);
    if (occurrence === undefined) {
        return {kind: 'none', key: ''};
    }
    const key = String(occurrence);
    return auxiliary?.expansions?.[key] === undefined
        ? {kind: 'none', key: ''} : {kind: 'expansion', key};
}

function region_at(
    state: ContainerRegions, container: HTMLElement, event: MouseEvent,
): DiagramRegion | null {
    const bounds = container.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const holding = state.regions.filter((region) =>
        region.kind !== 'none'
        && x >= region.rect.top_left.x
        && x <= region.rect.top_left.x + region.rect.width
        && y >= region.rect.top_left.y
        && y <= region.rect.top_left.y + region.rect.height);
    if (!holding.length) {
        return null;
    }
    return holding.reduce((smallest, region) =>
        region.rect.width * region.rect.height
            < smallest.rect.width * smallest.rect.height ? region : smallest);
}

function listen_to_container(container: HTMLElement): void {
    if (LISTENING_CONTAINERS.has(container)) {
        return;
    }
    LISTENING_CONTAINERS.add(container);
    container.addEventListener('mouseenter', () => {
        const state = CONTAINER_REGIONS.get(container);
        if (state !== undefined) {
            queue_prerender(state);
        }
    });
    container.addEventListener('mousemove', (event: MouseEvent) => {
        const state = CONTAINER_REGIONS.get(container);
        if (state === undefined) {
            return;
        }
        queue_prerender(state);
        const region = region_at(state, container, event);
        if (region === null) {
            container.style.cursor = '';
            schedule_close_from(container);
            return;
        }
        const open = box_from(container, region.key);
        if (open !== null) {
            container.style.cursor = 'pointer';
            hold_open(open);
            return;
        }
        container.style.cursor = 'pointer';
        open_box(state, region, event);
    });
    container.addEventListener('mouseleave', () => {
        container.style.cursor = '';
        schedule_close_from(container);
    });
    container.addEventListener('click', (event: MouseEvent) => {
        const state = CONTAINER_REGIONS.get(container);
        if (state === undefined) {
            return;
        }
        const region = region_at(state, container, event);
        if (region === null) {
            return;
        }
        const open = box_from(container, region.key);
        answered_click = event;
        lock_box(open ?? open_box(state, region, event));
    });
}

function listen_to_document(): void {
    if (listening_to_document) {
        return;
    }
    listening_to_document = true;
    document.addEventListener('click', (event: MouseEvent) => {
        if (event === answered_click) {
            return;
        }
        const node = event.target as Node | null;
        const holding = node === null ? []
            : OPEN_BOXES.filter((box) => box.node.contains(node));
        if (holding.length) {
            holding.forEach((box) => lock_box(box));
            return;
        }
        close_every_box();
    });
    document.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            close_every_box();
        }
    });
}

/** The box open for the region `key` of `container`, if one is. */
function box_from(container: HTMLElement, key: string): OpenBox | null {
    return OPEN_BOXES.find(
        (box) => box.container === container && box.key === key) ?? null;
}

/** The boxes opened from the diagram inside `box`, at every depth below it. */
function boxes_inside(box: OpenBox): OpenBox[] {
    return OPEN_BOXES.filter(
        (open) => open !== box && box.node.contains(open.container));
}

/** The boxes `box` was opened inside, at every depth above it. */
function boxes_around(box: OpenBox): OpenBox[] {
    return OPEN_BOXES.filter(
        (open) => open !== box && open.node.contains(box.container));
}

/** Lock `box` and every box around it, because a box stays open only while
 * the box it was opened from does. */
function lock_box(box: OpenBox): void {
    [box, ...boxes_around(box)].forEach((open) => {
        open.locked = true;
        cancel_close(open);
    });
    refresh_lock_notes();
}

/** Unlock `box` and the boxes opened inside it, because a box stays open only
 * while the box it was opened from does. Each then closes when the pointer
 * leaves it, and the ones the pointer is not in are scheduled to close now. */
function unlock_box(box: OpenBox): void {
    [box, ...boxes_inside(box)].forEach((open) => {
        open.locked = false;
    });
    boxes_inside(box).forEach((open) => schedule_close(open));
    refresh_lock_notes();
}

function refresh_lock_notes(): void {
    OPEN_BOXES.forEach((box) => {
        box.lock_note.textContent = box.locked ? LOCKED_NOTE : UNLOCKED_NOTE;
    });
}

function cancel_close(box: OpenBox): void {
    if (box.close_timer !== null) {
        window.clearTimeout(box.close_timer);
        box.close_timer = null;
    }
}

/** Keep `box` and the boxes around it open while the pointer is in `box`,
 * because an unlocked box closes when the pointer leaves it and a box opened
 * inside it is outside its element. */
function hold_open(box: OpenBox): void {
    [box, ...boxes_around(box)].forEach((open) => cancel_close(open));
}

/** Let `box` and the boxes around it close after the delay, once the pointer
 * has left `box`. A box the pointer moves back into cancels its own timer. */
function release_hold(box: OpenBox): void {
    [box, ...boxes_around(box)].forEach((open) => schedule_close(open));
}

function schedule_close(box: OpenBox): void {
    if (box.locked || box.close_timer !== null) {
        return;
    }
    box.close_timer = window.setTimeout(
        () => close_box(box), BOX_CLOSE_DELAY_MS);
}

/**
 * Close, after the delay, every unlocked box opened from `container`.
 *
 * A box is a child of the document body rather than of the container it was
 * opened from, so moving the pointer into one leaves the container. The box
 * cancels its own timer when the pointer enters it, which is what tells the two
 * cases apart.
 */
function schedule_close_from(container: HTMLElement): void {
    OPEN_BOXES.filter((box) => box.container === container)
        .forEach((box) => schedule_close(box));
}

function close_box(box: OpenBox): void {
    boxes_inside(box).forEach((open) => close_box(open));
    const index = OPEN_BOXES.indexOf(box);
    if (index < 0) {
        return;
    }
    cancel_close(box);
    OPEN_BOXES.splice(index, 1);
    hold_block_highlight(box, false);
    release_content(box);
    box.node.remove();
}

export function close_every_box(): void {
    [...OPEN_BOXES].forEach((box) => close_box(box));
}

export function open_boxes(): number {
    return OPEN_BOXES.length;
}

export function locked_boxes(): number {
    return OPEN_BOXES.filter((box) => box.locked).length;
}

/** How many drawn bodies and expansions wait in the pools of every figure
 * drawn at a root that is still on the page. */
export function pooled_content(): number {
    return DRAWN_CONTAINERS
        .filter((container) => container.isConnected)
        .flatMap((container) => {
            const figure = ROOT_FIGURES.get(container);
            return figure === undefined ? [] : [...figure.pool.values()];
        })
        .reduce((count, nodes) => count + nodes.length, 0);
}

export function page_regions(): PageRegion[] {
    return DRAWN_CONTAINERS.flatMap((container) => {
        const state = CONTAINER_REGIONS.get(container);
        if (state === undefined || !container.isConnected
            || state.figure.holder.contains(container)) {
            return [];
        }
        const bounds = container.getBoundingClientRect();
        return state.regions.map((region) => ({
            left: bounds.left + region.rect.top_left.x,
            top: bounds.top + region.rect.top_left.y,
            width: region.rect.width,
            height: region.rect.height,
            kind: region.kind,
            key: region.key,
        }));
    });
}

function open_box(
    state: ContainerRegions,
    region: DiagramRegion,
    event: MouseEvent,
): OpenBox {
    const depth = state.depth + 1;
    close_unlocked_boxes_from(state.container);
    const node = box_node(state.settings);
    boxes_opened += 1;
    const box: OpenBox = {
        number: boxes_opened,
        node,
        head: head_node(state.settings),
        lock_note: lock_note_node(),
        pointer: {x: event.pageX, y: event.pageY},
        container: state.container,
        region,
        state,
        depth,
        key: region.key,
        locked: false,
        close_timer: null,
        content: null,
    };
    box.lock_note.addEventListener('click', (click: MouseEvent) => {
        click.stopPropagation();
        if (box.locked) {
            unlock_box(box);
        } else {
            lock_box(box);
        }
    });
    box.head.appendChild(box.lock_note);
    node.appendChild(box.head);
    node.addEventListener('mouseenter', () => hold_open(box));
    node.addEventListener('mouseleave', () => release_hold(box));
    node.addEventListener('click', () => lock_box(box));
    document.body.appendChild(node);
    OPEN_BOXES.push(box);
    hold_block_highlight(box, true);
    refresh_lock_notes();
    fill_box(box);
    place_box(box);
    return box;
}

/**
 * Stand the box on the screen whole, beside the point it opened at.
 *
 * The box is laid out at the width `boxWidths.ts` states whatever it holds, so
 * the diagram that arrives does not widen it. Its height is what its content
 * needs, so the box is placed after its text is in it and again after its
 * diagram is, and a box that grew off the screen when the diagram arrived is
 * moved back on. Where the screen is shorter than the box, the box is capped at
 * the room the screen has and scrolls inside.
 */
function place_box(box: OpenBox): void {
    const viewport = page_viewport();
    box.node.style.maxHeight = `${boxPlacement.room_height(viewport)}px`;
    give_box_its_core_width(box.node, viewport);
    const placed = boxPlacement.place_beside_pointer(
        box.pointer,
        {width: box.node.offsetWidth, height: box.node.offsetHeight},
        viewport);
    box.node.style.left = `${placed.x}px`;
    box.node.style.top = `${placed.y}px`;
}

/**
 * Lay `node` out so that its content is the core width, within the room the
 * window gives.
 *
 * A browser draws the scrollbar of a box that scrolls inside the padding box,
 * where it takes room from the content, so the box is laid out that much wider
 * again and the content of the box is the core width either way. The room is
 * measured rather than assumed, because a browser drawing its scrollbars over
 * the content takes none, and the box is given the core width and its padding
 * first so that the measurement reads the scrollbar of a box that scrolls at
 * that width. A box with no scrollbar is laid out at the core width and its
 * padding, so the padding either side of its text is the same.
 */
function give_box_its_core_width(
    node: HTMLDivElement, viewport: boxPlacement.Viewport,
): void {
    const room = boxPlacement.room_width(viewport);
    node.style.width =
        `${Math.min(room, boxWidths.padded_width(boxWidths.CORE_WIDTH_PX, 0))}px`;
    const scrollbar = drawn_scrollbar_width(node);
    node.style.width = `${boxWidths.padded_width(
        boxWidths.core_width(room, scrollbar), scrollbar)}px`;
}

/** The room the scrollbar of `node` takes from the content of `node`, which is
 * nothing where no scrollbar is drawn and nothing in a browser that draws a
 * scrollbar over the content. */
function drawn_scrollbar_width(node: HTMLElement): number {
    return Math.max(
        0, node.offsetWidth - 2 * boxWidths.BORDER_PX - node.clientWidth);
}

/** The visible part of the page in page coordinates. The client size of the
 * root element leaves out the scrollbars, where `innerWidth` counts them. */
function page_viewport(): boxPlacement.Viewport {
    return {
        left: window.scrollX,
        top: window.scrollY,
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
    };
}

/** Close every unlocked box opened from `container`, so the pointer opens
 * one box at a time there while the locked ones stand. */
function close_unlocked_boxes_from(container: HTMLElement): void {
    OPEN_BOXES.filter((box) => box.container === container && !box.locked)
        .forEach((box) => close_box(box));
}

/** Hold or release the block's own highlight, which every box drawn for the
 * block shares through the render handler's registry, under a source of this
 * box's own so the pointer's hover can come and go beneath it. A block drawn as
 * `BlockDrawing.BODY_IN_PLACE` has no enclosure in the figure, so there is
 * nothing registered under its token to light. */
function hold_block_highlight(box: OpenBox, active: boolean): void {
    const block = region_block(box.region.target);
    if (block === undefined || cat.draws_body_in_place(block.aesthetics)) {
        return;
    }
    box.state.renderHandler.set_highlight(
        highlightTokens.block_highlight_token(block.block_tag),
        `inspection-box:${box.number}`,
        active);
}

/** Hold or release the highlight of the block drawn inside the box, which its
 * own render handler registered under the block's token when it drew the body,
 * so the body reads as the block under inspection while the box holds it. */
function hold_content_highlight(
    box: OpenBox, content: HTMLElement, active: boolean,
): void {
    const block = region_block(box.region.target);
    const state = CONTAINER_REGIONS.get(content);
    if (block === undefined || state === undefined) {
        return;
    }
    state.renderHandler.set_highlight(
        highlightTokens.block_highlight_token(block.block_tag),
        `inspection-box:${box.depth}:${box.key}`,
        active);
}

interface BoxColors {
    background: string;
    text: string;
    border: string;
    shadow: string;
}

function box_colors(settings: rhs.RenderHandlerSettings): BoxColors {
    if (DiagramTheme.usesDarkDiagramTheme(settings)) {
        return {
            background: DiagramTheme.darkDiagramTheme.canvasColor,
            text: DiagramTheme.darkDiagramTheme.foregroundColor,
            border: '#5a5a5a',
            shadow: '0 6px 18px rgba(0, 0, 0, 0.6)',
        };
    }
    return {
        background: '#ffffff',
        text: '#202020',
        border: '#303030',
        shadow: '0 6px 18px rgba(0, 0, 0, 0.25)',
    };
}

function box_node(settings: rhs.RenderHandlerSettings): HTMLDivElement {
    const node = document.createElement('div');
    const colors = box_colors(settings);
    node.className = 'inspection-box';
    node.style.position = 'absolute';
    node.style.zIndex = '2147483000';
    node.style.boxSizing = 'border-box';
    node.style.overflow = 'auto';
    node.style.padding =
        `${boxWidths.PADDING_TOP_PX}px ${boxWidths.PADDING_SIDE_PX}px`;
    node.style.backgroundColor = colors.background;
    node.style.color = colors.text;
    node.style.border = `${boxWidths.BORDER_PX}px solid ${colors.border}`;
    node.style.borderRadius = '6px';
    node.style.boxShadow = colors.shadow;
    node.style.font = '13px/1.45 sans-serif';
    return node;
}

/*
 * The head of a box: the lock note and, once the box is filled, the title.
 *
 * The box scrolls where its content is taller than its room, and the head is
 * held at the top edge of the scrolled box, so the note that unlocks the box is
 * in reach wherever the reader has scrolled to. The box itself stands on the
 * screen whole, placed as `boxPlacement.ts` states, so the page is never
 * scrolled to reach it. The head covers the padding of
 * the box above it and beside it and paints the background of the box, so what
 * scrolls beneath it is hidden rather than shown through the title. A browser
 * measures the inset of a sticky element from the content edge of the scrolled
 * box, so the inset is the padding taken back, which holds the head against the
 * top edge of the box itself.
 */
function head_node(settings: rhs.RenderHandlerSettings): HTMLDivElement {
    const head = document.createElement('div');
    head.className = 'inspection-box-head';
    head.style.position = 'sticky';
    head.style.top = `-${boxWidths.PADDING_TOP_PX}px`;
    head.style.zIndex = '1';
    head.style.margin = `-${boxWidths.PADDING_TOP_PX}px `
        + `-${boxWidths.PADDING_SIDE_PX}px 0px`;
    head.style.padding = `${boxWidths.PADDING_TOP_PX}px `
        + `${boxWidths.PADDING_SIDE_PX}px 2px`;
    head.style.backgroundColor = box_colors(settings).background;
    return head;
}

function lock_note_node(): HTMLDivElement {
    const note = document.createElement('div');
    note.className = 'inspection-box-lock';
    note.style.fontSize = '0.85em';
    note.style.opacity = '0.8';
    note.style.marginBottom = '6px';
    note.style.cursor = 'pointer';
    note.style.userSelect = 'none';
    note.textContent = UNLOCKED_NOTE;
    return note;
}

function fill_box(box: OpenBox): void {
    fill_box_text(box);
    if (draws_content(box.region)) {
        void attach_content(box);
    }
}

function fill_box_text(box: OpenBox): void {
    if (box.region.kind === 'block') {
        fill_block_box(box);
    } else {
        fill_expansion_box(box);
    }
}

/* The text of a box stands above the diagram drawn under it, so a node written
 * once the diagram has arrived is put before the diagram rather than appended.
 * A box waiting for its diagram holds the note that says so in the diagram's
 * place, and the text goes above that note too. `insertBefore` appends where
 * the box holds neither. */
function add_text_node(box: OpenBox, node: HTMLElement): void {
    box.node.insertBefore(node, box.content ?? drawing_note_of(box));
}

function drawing_note_of(box: OpenBox): Element | null {
    return [...box.node.children].find(
        (child: Element) => child.className === DRAWING_NOTE_CLASS) ?? null;
}

/*
 * Whether the box for `region` draws a diagram under its text.
 *
 * Every region does but one: a block drawn as `BlockDrawing.BODY_IN_PLACE` has
 * its body in the figure already, where the block itself would otherwise have
 * been drawn, so the box would draw the reader a second copy of what the
 * pointer is resting on. Such a region is not prerendered either.
 */
function draws_content(region: DiagramRegion): boolean {
    const block = region_block(region.target);
    return !(block !== undefined && cat.draws_body_in_place(block.aesthetics));
}

function fill_block_box(box: OpenBox): void {
    const information = box.state.auxiliary?.blocks?.[box.key];
    if (information === undefined) {
        return;
    }
    if (information.title !== null) {
        box.head.appendChild(header_node(information.title));
    }
    if (information.formula != null) {
        add_text_node(box, formula_node(information.formula));
    }
    if (information.description !== null) {
        add_text_node(box, description_node(information.description));
    }
    add_text_node(box, references_node(information.references));
}

function fill_expansion_box(box: OpenBox): void {
    const expansion = box.state.auxiliary?.expansions?.[box.key];
    if (expansion === undefined) {
        return;
    }
    box.head.appendChild(header_node(expansion.latex ?? expansion.operator));
    add_text_node(box, formula_node(expansion.formula));
    add_text_node(box, description_node(expansion.description));
    add_text_node(box, references_node(expansion.references ?? []));
}

/**
 * Write the text of every open box of `container` again, from the auxiliary
 * information as it stands now.
 *
 * A box opened from a diagram inside another box is written again too, because
 * the wording of the page reaches every open box at every depth. The diagram
 * inside a box, the place the box stands at and its lock are all left as they
 * are, so a reader who has locked a box open keeps it.
 */
export function refill_open_boxes(container: HTMLElement): void {
    OPEN_BOXES.filter((box) => opened_from(container, box))
        .forEach((box) => refill_box(box));
}

/** Whether `box` was opened from `container`, from a diagram inside it, or
 * from a diagram inside a box that `container` holds in the same way. */
function opened_from(container: HTMLElement, box: OpenBox): boolean {
    if (box.container === container || container.contains(box.container)) {
        return true;
    }
    const holding = OPEN_BOXES.find(
        (open) => open !== box && open.node.contains(box.container));
    return holding !== undefined && opened_from(container, holding);
}

function refill_box(box: OpenBox): void {
    [...box.head.children, ...box.node.children]
        .filter((child) => REWRITTEN_CLASSES.includes(child.className))
        .forEach((child) => child.remove());
    fill_box_text(box);
}

/**
 * Put the drawn body or expansion into the box, from the pool when it holds
 * one, and otherwise drawn after the box has painted with its text. A box
 * closed before its content arrives returns the content to the pool.
 */
async function attach_content(box: OpenBox): Promise<void> {
    const key = content_key(box.region);
    const figure = box.state.figure;
    const placeholder = pooled(figure, key) ? null : drawing_note();
    if (placeholder !== null) {
        box.node.appendChild(placeholder);
    }
    const content = await obtain_content(box.state, box.region);
    placeholder?.remove();
    if (content === null) {
        return;
    }
    if (!OPEN_BOXES.includes(box)) {
        pool_content(figure, key, content);
        return;
    }
    adopt_content(box, content);
}

function adopt_content(box: OpenBox, content: HTMLElement): void {
    CONTAINER_DEPTH.set(content, box.depth);
    CONTAINER_BOX.set(content, box);
    const state = CONTAINER_REGIONS.get(content);
    if (state !== undefined) {
        state.depth = box.depth;
        /* The diagram inside the box has a render handler of its own, so a
         * legend row or a tape slot the reader locked lights there only once
         * that handler is told about the lock. */
        locked_highlights.register_every_lock(state.renderHandler);
    }
    box.content = content;
    box.node.appendChild(content);
    hold_content_highlight(box, content, true);
    place_box(box);
}

function release_content(box: OpenBox): void {
    if (box.content === null) {
        return;
    }
    const state = CONTAINER_REGIONS.get(box.content);
    if (state !== undefined) {
        locked_highlights.forget_every_lock(state.renderHandler);
    }
    hold_content_highlight(box, box.content, false);
    box.content.remove();
    CONTAINER_BOX.delete(box.content);
    pool_content(box.state.figure, content_key(box.region), box.content);
    box.content = null;
}

function content_key(region: DiagramRegion): string {
    return `${region.kind}:${region.key}`;
}

function pooled(figure: FigureContent, key: string): boolean {
    return (figure.pool.get(key)?.length ?? 0) > 0;
}

function pool_content(
    figure: FigureContent, key: string, content: HTMLElement,
): void {
    if (figure.abandoned) {
        content.remove();
        return;
    }
    const free = figure.pool.get(key) ?? [];
    free.push(content);
    figure.pool.set(key, free);
}

/**
 * The drawn content for a region: one from the pool, the one being drawn if a
 * drawing is under way, and otherwise drawn now.
 *
 * A second box opened for the same key while the first holds its content
 * finds the pool empty after the wait and draws its own.
 */
async function obtain_content(
    state: ContainerRegions, region: DiagramRegion,
): Promise<HTMLElement | null> {
    const figure = state.figure;
    const key = content_key(region);
    const free = figure.pool.get(key)?.pop();
    if (free !== undefined) {
        return free;
    }
    const pending = figure.pending.get(key);
    if (pending !== undefined) {
        await pending.catch(() => undefined);
        const drawn = figure.pool.get(key)?.pop();
        if (drawn !== undefined) {
            return drawn;
        }
    }
    try {
        return await draw_content(state, region);
    } catch (error: unknown) {
        console.error('Inspection box content failed:', error);
        return null;
    }
}

function draw_content(
    state: ContainerRegions, region: DiagramRegion,
): Promise<HTMLElement> {
    const figure = state.figure;
    const key = content_key(region);
    const drawing = draw_content_in_holder(state, region);
    figure.pending.set(key, drawing);
    figure.drawn.add(key);
    return drawing.finally(() => {
        if (figure.pending.get(key) === drawing) {
            figure.pending.delete(key);
        }
    });
}

async function draw_content_in_holder(
    state: ContainerRegions, region: DiagramRegion,
): Promise<HTMLElement> {
    const drawn = await content_term(state, region);
    await next_task();
    return draw_within_core_width(state, drawn);
}

/**
 * Draw `drawn` so that the drawing and the margin its overhang is given
 * together occupy the core width of a box.
 *
 * The first drawing is wrapped at the core width less the room the draw layers
 * take, which is the overhang of almost every drawing. A drawing whose labels
 * reach further than the layers, and a drawing holding an operation too wide to
 * be wrapped at all, both come out wider than the core width, and such a term
 * is drawn again at the width `boxWidths.narrowed_wrap_width` gives for what
 * was measured. `DRAWING_PASSES` bounds the drawings, and the last of them is
 * returned at whatever width it came out, because an operation drawn wider than
 * the core width is as narrow as it is drawn.
 */
async function draw_within_core_width(
    state: ContainerRegions, drawn: DrawnTerm,
): Promise<HTMLElement> {
    let wrap = boxWidths.wrap_width(RESERVED_OVERHANG_PX);
    let diagram = draw_term_in_holder(state, drawn, wrap);
    for (let pass = 1; pass < DRAWING_PASSES; pass += 1) {
        if (diagram.width <= boxWidths.CORE_WIDTH_PX) {
            break;
        }
        const narrower = boxWidths.narrowed_wrap_width(
            wrap, diagram.width, diagram.overhang);
        if (narrower >= wrap) {
            break;
        }
        wrap = narrower;
        await next_task();
        diagram = draw_term_in_holder(state, drawn, wrap);
    }
    return diagram.node;
}

/* A drawn diagram detached from the holder, with what it measured while it
 * stood there: `width` is the room the drawing occupies, its container and the
 * margin of its overhang together, and `overhang` is that margin. */
interface DrawnDiagram {
    node: HTMLElement;
    width: number;
    overhang: number;
}

/**
 * Draw `drawn` in the figure's holder, wrapped at `wrap_width`, and detach it.
 *
 * The container is in the document while the render runs, because every phase
 * after the build measures the page with `getBoundingClientRect` and a subtree
 * outside the document measures zero. The widths are read there too, for the
 * same reason.
 */
function draw_term_in_holder(
    state: ContainerRegions, drawn: DrawnTerm, wrap_width: number,
): DrawnDiagram {
    const sub_container = document.createElement('div');
    sub_container.className = 'stack_main inspection-box-diagram';
    CONTAINER_FIGURE.set(sub_container, state.figure);
    state.figure.holder.appendChild(sub_container);
    try {
        state.makeSubTarget(sub_container).termPass(
            drawn.term, sub_diagram_settings(state.settings, wrap_width),
            drawn.auxiliary);
        const overhang = drawing_overhang(sub_container);
        give_overhang_as_margin(sub_container, overhang);
        return {
            node: sub_container,
            width: sub_container.offsetWidth + overhang.left + overhang.right,
            overhang: overhang.left + overhang.right,
        };
    } finally {
        sub_container.remove();
    }
}

/** The room the ink of a drawing takes outside the container that holds it, on
 * each side of the container. */
interface Overhang {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

/**
 * The overhang of the drawing in `container`, measured while the container
 * stands in the document.
 *
 * `HTMLDrawHandler` places its layers past the edges of the container, and a
 * label may stand outside them, so the ink of a drawing reaches beyond the
 * container's own box.
 */
function drawing_overhang(container: HTMLElement): Overhang {
    const own = container.getBoundingClientRect();
    const drawn = capture.contentBox(container);
    return {
        top: Math.max(0, own.top - drawn.top),
        right: Math.max(0, drawn.right - own.right),
        bottom: Math.max(0, drawn.bottom - own.bottom),
        left: Math.max(0, own.left - drawn.left),
    };
}

/**
 * Give `container` its overhang as its margin, so the ink of the drawing stands
 * inside the box that holds the container and a box with `overflow: auto` draws
 * no scrollbar for it. The margin stays with the container through the pool.
 */
function give_overhang_as_margin(
    container: HTMLElement, overhang: Overhang,
): void {
    container.style.margin =
        `${SUB_DIAGRAM_MARGIN_TOP_PX + overhang.top}px ${overhang.right}px `
        + `${overhang.bottom}px ${overhang.left}px`;
}

interface DrawnTerm {
    term: cat.BroadcastedCategory<any, any>;
    auxiliary?: aux.DiagramAuxiliary;
}

async function content_term(
    state: ContainerRegions, region: DiagramRegion,
): Promise<DrawnTerm> {
    const target = region.target;
    const operator = target instanceof cat.Broadcasted ? target.operator : null;
    if (region.kind === 'block' && operator instanceof ops.BlockOperator) {
        return {term: operator.block, auxiliary: state.auxiliary};
    }
    const expansion = state.auxiliary?.expansions?.[region.key];
    if (expansion === undefined) {
        throw new Error(`No expansion is held for region ${region.key}.`);
    }
    const term = await dt_json.TermJSONConverter.import(
        JSON.parse(expansion.expansion));
    return {
        term: term as cat.BroadcastedCategory<any, any>,
        auxiliary: expansion.auxiliary,
    };
}

function next_task(): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, 0));
}

/**
 * Queue the content of every region of `state`'s container that the pointer
 * can open, once per render of the container, and start drawing it.
 */
function queue_prerender(state: ContainerRegions): void {
    if (PRERENDER_QUEUED.has(state.container)) {
        return;
    }
    PRERENDER_QUEUED.add(state.container);
    const queued = new Set<string>();
    state.regions
        .filter((region) => region.kind !== 'none' && draws_content(region))
        .forEach((region) => {
            const key = content_key(region);
            if (queued.has(key) || state.figure.drawn.has(key)) {
                return;
            }
            queued.add(key);
            state.figure.queue.push({state, region});
        });
    run_prerender(state.figure);
}

function run_prerender(figure: FigureContent): void {
    if (figure.prerendering) {
        return;
    }
    figure.prerendering = true;
    const step = async (): Promise<void> => {
        const next = figure.queue.shift();
        if (next === undefined || figure.abandoned) {
            figure.prerendering = false;
            return;
        }
        const key = content_key(next.region);
        if (!figure.drawn.has(key)) {
            try {
                const content = await draw_content(next.state, next.region);
                pool_content(figure, key, content);
            } catch (error: unknown) {
                console.error('Prerendering an inspection box failed:', error);
            }
        }
        when_idle(step);
    };
    when_idle(step);
}

function when_idle(run: () => Promise<void>): void {
    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => void run(), {timeout: 500});
    } else {
        window.setTimeout(() => void run(), 16);
    }
}

/** Lay `node` out at the core width of the box that holds it, which is the
 * content width of the box, so every line of text of a box is set at one
 * measure. */
function give_core_width(node: HTMLElement): void {
    node.style.width = '100%';
}

function header_node(latex: string): HTMLDivElement {
    const node = document.createElement('div');
    node.className = 'inspection-box-header';
    node.style.fontSize = '1.1em';
    node.style.marginBottom = '6px';
    give_core_width(node);
    katex.render(latex, node, KATEX_OPTIONS);
    return node;
}

function formula_node(formula: string): HTMLDivElement {
    const node = document.createElement('div');
    node.className = 'inspection-box-formula';
    node.style.margin = '6px 0px';
    give_core_width(node);
    katex.render(formula, node, {...KATEX_OPTIONS, displayMode: true});
    return node;
}

function description_node(description: string): HTMLParagraphElement {
    const node = document.createElement('p');
    node.className = 'inspection-box-description';
    node.style.margin = '6px 0px';
    give_core_width(node);
    node.textContent = description;
    return node;
}

function drawing_note(): HTMLParagraphElement {
    const node = document.createElement('p');
    node.className = DRAWING_NOTE_CLASS;
    node.style.margin = '6px 0px';
    node.style.opacity = '0.6';
    node.textContent = DRAWING_NOTE;
    return node;
}

/* The label, with the path and the line beside it where the label does not
 * already name the path. `pyncd`'s `pinned_link` labels a reference
 * `inference/model.py L822`, and writing the path after that label repeats it. */
function reference_text(reference: aux.CodeReferenceRecord): string {
    if (reference.path === null || reference.label.includes(reference.path)) {
        return reference.label;
    }
    if (reference.line === null) {
        return `${reference.label} (${reference.path})`;
    }
    return `${reference.label} (${reference.path}:${reference.line})`;
}

/* One reference, preceded by the icon it names where `referenceIcons.ts` holds
 * a drawing for that name. A reference with no url is written as plain text. */
function reference_line(reference: aux.CodeReferenceRecord): HTMLDivElement {
    const line = document.createElement('div');
    const icon = referenceIcons.reference_icon_node(reference.icon);
    if (icon !== null) {
        line.appendChild(icon);
    }
    if (reference.url === null) {
        line.appendChild(document.createTextNode(reference_text(reference)));
        return line;
    }
    const link = document.createElement('a');
    link.href = reference.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = reference_text(reference);
    line.appendChild(link);
    return line;
}

function references_node(
    references: aux.CodeReferenceRecord[],
): HTMLDivElement {
    const node = document.createElement('div');
    node.className = 'inspection-box-references';
    node.style.margin = '6px 0px';
    give_core_width(node);
    references.forEach(
        (reference) => node.appendChild(reference_line(reference)));
    return node;
}

function sub_diagram_settings(
    settings: rhs.RenderHandlerSettings, wrap_width: number,
): rhs.RenderHandlerSettings {
    return {
        ...settings,
        width: wrap_width,
        subBlocks: false,
        drawnBlockTags: [],
        legend: false,
        inspectionBoxes: true,
    };
}
