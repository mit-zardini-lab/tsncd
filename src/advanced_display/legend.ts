// Claude Opus 5, effort high. Revised by Claude Opus 5 (1M context), effort high.
// Revised by Claude Opus 5.5 (1M context), effort 40: the second table, of the
// naturals the arrays of the term carry.
/*
 * The tables of axes and of naturals drawn beside a figure.
 *
 * The first table holds one row per axis, with the axis on the left, the
 * integer its size comes to in the middle and the code name on the right. The
 * rows arrive in the `legend` field of the message's auxiliary information,
 * already sorted by the sender, and `settings.legend` is what asks for them to
 * be drawn.
 *
 * The axis column is written here rather than taken from the sender. A row
 * carries the uid of every axis of the term it stands for, and each of those
 * axes is labelled by the processor `StrideCategoryRenderer.axesRegistry` holds
 * for its class, which is the processor that labels the axis's wire, so the
 * column and the figure read alike. A row whose axes come out under two
 * different labels is drawn as one line per label, each linked to its own axes.
 * The sender's own `latex` is the fallback, for a row whose uids name no axis of
 * the term.
 *
 * The second table, under the first, holds one row per `cat.Natural` that is
 * the datatype of an array of the term, and arrives in the `naturals` field. A
 * natural has no uid, so a row carries the key of the natural's bound, which
 * `find_naturals_by_key.natural_key` writes. The natural column is written with
 * the label `bb.datatype_wire_latex` gives the wire of a natural of the term
 * with that key, and with the sender's `latex` where the term holds none. The
 * user asked for the second table on 2026-09-27.
 *
 * Resting the pointer on a line halos its wires. Clicking the line locks the
 * halo on, under a source of its own so that the pointer's hover comes and goes
 * beneath it, and clicking it again releases it. Several lines of either table
 * may be locked at once. A locked line keeps its shading and shows a closed
 * padlock. The locks are held in a `locked_highlights.LockedHighlights`, which
 * is also what carries them into the diagram drawn inside an open inspection
 * box.
 *
 * The tables are appended inside the diagram container, so an image cut from
 * that container holds them: `capture.contentBox` measures the union over every
 * descendant.
 */

import katex from 'katex';
import * as DiagramTheme from '../display/Render/DiagramTheme';
import * as Color from '../utilities/Color';
import * as rhs from '../display/Render/RenderHandlerSettings';
import * as scr from '../display/Framework/StrideCategoryRenderer';
import * as bb from '../display/Framework/BroadcastedCategoryRenderer';
import * as find_axes_by_uid from '../data_structure_processing/find_axes_by_uid';
import * as find_naturals_by_key from '../data_structure_processing/find_naturals_by_key';
import * as locked_highlights from '../display/Render/locked_highlights';
import * as padlock from '../display/Render/padlock';
import {KATEX_OPTIONS} from '../display/HTMLRender/katex_options';
import type * as cat from '../data_structure/Category';
import type * as drt from '../display/diagramRenderTarget';
import type * as aux from './AuxiliaryInformation';

const AXIS_COLUMN_HEADINGS = ['axis', 'size', 'code name'];
const NATURAL_COLUMN_HEADINGS = ['natural', 'size', 'code name'];

const LIGHT_BORDER = '#c8c8c8';
const DARK_BORDER = '#4a4a4a';
/* How much of the theme's `highlightHaloColor` a lit line is shaded with,
 * blended into the canvas, so the line and the halos of its wires are lit in
 * one colour. */
const LIGHT_HIGHLIGHT_WEIGHT = 0.16;
const DARK_HIGHLIGHT_WEIGHT = 0.22;
const TABLE_SPACING_PX = 10;

const LOCK_NOTE = `${padlock.UNLOCKED_GLYPH} click a row to lock its wires`;

/* The wires the locked lines hold, under a source of their own so that a line
 * stays lit once the pointer has left it. `locked_highlights.ts` states how
 * the lock reaches the diagram inside an open inspection box. */
const LEGEND_LOCKS = new locked_highlights.LockedHighlights('legend-lock');

interface LegendColors {
    text: string;
    border: string;
    highlight: string;
}

/** One line of a table: a label and the highlight tokens of the wires it
 * stands for. */
interface LegendLine {
    latex: string;
    tokens: string[];
}

/** Whether a line is locked, and whether the pointer is resting on it, which
 * are the two facts the padlock reads. */
interface LockState {
    locked: boolean;
    hovered: boolean;
}

function legend_colors(settings: drt.RenderedDiagram['settings']): LegendColors {
    const halo = Color.Color.from_hex(DiagramTheme.highlightHaloColor(settings));
    if (DiagramTheme.usesDarkDiagramTheme(settings)) {
        return {
            text: DiagramTheme.darkDiagramTheme.foregroundColor,
            border: DARK_BORDER,
            highlight: Color.Color.from_hex(DiagramTheme.darkDiagramTheme.canvasColor)
                .blend(halo, DARK_HIGHLIGHT_WEIGHT).hex(),
        };
    }
    return {
        text: '#202020',
        border: LIGHT_BORDER,
        highlight: Color.Color.from_hex(DiagramTheme.lightSurfaceColors.canvasColor)
            .blend(halo, LIGHT_HIGHLIGHT_WEIGHT).hex(),
    };
}

/**
 * The lines of one row of axes: the label the figure writes on each of the
 * row's axes, with the axes that share a label gathered onto one line.
 *
 * The axes are found by uid in the term the figure was drawn from. A row none
 * of whose uids names an axis of the term falls back to the sender's own latex,
 * which is what a row from a sender that sends no uids takes.
 */
function axis_legend_lines(
    context: drt.RenderedDiagram,
    row: aux.AxisLegendRow,
    axes: Map<number, cat.Axis>,
): LegendLine[] {
    const labelled = new Map<string, number[]>();
    (row.uids ?? []).forEach((uid: number) => {
        const axis = axes.get(uid);
        const latex = axis === undefined
            ? '' : scr.axis_annotation_text(context.renderer, axis);
        if (latex === '') {
            return;
        }
        labelled.set(latex, [...(labelled.get(latex) ?? []), uid]);
    });
    if (labelled.size === 0) {
        return [{
            latex: row.latex,
            tokens: (row.uids ?? []).map(scr.axis_highlight_token),
        }];
    }
    return [...labelled].map(([latex, uids]) => ({
        latex, tokens: uids.map(scr.axis_highlight_token),
    }));
}

/* The line of one row of naturals, labelled as the wire of a natural of the
 * term with the row's key is labelled. */
function natural_legend_line(
    row: aux.NaturalLegendRow,
    naturals: Map<string, cat.Natural>,
): LegendLine {
    const natural = naturals.get(row.key);
    const latex = natural === undefined ? '' : bb.datatype_wire_latex(natural);
    return {
        latex: latex === '' ? row.latex : latex,
        tokens: [scr.natural_highlight_token(row.key)],
    };
}

function heading_row(headings: string[], border: string): HTMLTableRowElement {
    const row = document.createElement('tr');
    [...headings, ''].forEach((heading) => {
        const cell = document.createElement('th');
        cell.textContent = heading;
        cell.style.textAlign = 'left';
        cell.style.fontWeight = '600';
        cell.style.padding = '2px 10px 4px 0px';
        cell.style.borderBottom = `1px solid ${border}`;
        row.appendChild(cell);
    });
    return row;
}

function label_cell(line: LegendLine): HTMLTableCellElement {
    const cell = document.createElement('td');
    cell.style.padding = '2px 10px 2px 0px';
    try {
        katex.render(line.latex, cell, KATEX_OPTIONS);
    } catch {
        cell.textContent = line.latex;
    }
    return cell;
}

/* The size and the code name belong to the row, so where a row is drawn as
 * several lines the two cells stand beside the whole run of them. */
function size_cell(size: string, lines: number): HTMLTableCellElement {
    const cell = document.createElement('td');
    cell.style.padding = '2px 10px 2px 0px';
    cell.rowSpan = lines;
    cell.textContent = size;
    return cell;
}

function code_name_cell(code_name: string, lines: number): HTMLTableCellElement {
    const cell = document.createElement('td');
    cell.style.padding = '2px 10px 2px 0px';
    cell.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
    cell.rowSpan = lines;
    cell.textContent = code_name;
    return cell;
}

function lock_cell_node(): HTMLTableCellElement {
    const cell = document.createElement('td');
    cell.className = 'axis-legend-lock';
    cell.style.padding = '2px 0px 2px 0px';
    cell.style.userSelect = 'none';
    return cell;
}

function draw_lock_glyph(cell: HTMLTableCellElement, lock: LockState): void {
    if (lock.locked) {
        cell.textContent = padlock.LOCKED_GLYPH;
        cell.style.opacity = '1';
        return;
    }
    cell.textContent = lock.hovered ? padlock.UNLOCKED_GLYPH : '';
    cell.style.opacity = '0.55';
}

/*
 * Link a line to its wires, unless `axisHover` is off. The line is shaded
 * while any of its tokens is highlighted, a pointer resting on the line
 * highlights every one of them, and a click locks that highlight on until the
 * next click.
 */
function link_line_highlights(
    element: HTMLTableRowElement,
    lock_cell: HTMLTableCellElement,
    line: LegendLine,
    key: string,
    context: drt.RenderedDiagram,
    colors: LegendColors,
): void {
    const tokens = line.tokens;
    if (!tokens.length || !rhs.draws_axis_halos(context.settings)) {
        return;
    }
    const handler = context.renderHandler;
    const active = new Set<string>();
    tokens.forEach((token) => handler.register_highlight(token, (lit: boolean) => {
        if (lit) { active.add(token); } else { active.delete(token); }
        element.style.backgroundColor = active.size > 0 ? colors.highlight : '';
    }));
    const source = `legend:${key}`;
    const lock: LockState = {locked: false, hovered: false};
    element.style.cursor = 'pointer';
    element.addEventListener('mouseenter', () => {
        lock.hovered = true;
        draw_lock_glyph(lock_cell, lock);
        tokens.forEach((token) => handler.set_highlight(token, source, true));
    });
    element.addEventListener('mouseleave', () => {
        lock.hovered = false;
        draw_lock_glyph(lock_cell, lock);
        tokens.forEach((token) => handler.set_highlight(token, source, false));
    });
    element.addEventListener('click', (event: MouseEvent) => {
        /* The inspection boxes close on a click the page outside them answers,
         * and this table is inside the diagram container, so the click ends
         * here rather than reaching the document. */
        event.stopPropagation();
        lock.locked = LEGEND_LOCKS.toggle(tokens, handler);
        draw_lock_glyph(lock_cell, lock);
    });
}

function empty_table(headings: string[], colors: LegendColors): {
    table: HTMLTableElement; body: HTMLTableSectionElement;
} {
    const table = document.createElement('table');
    table.className = 'axis-legend';
    table.style.borderCollapse = 'collapse';
    table.style.color = colors.text;
    const body = document.createElement('tbody');
    body.appendChild(heading_row(headings, colors.border));
    table.appendChild(body);
    return {table, body};
}

/* One line of a table, with the size and the code name of its row beside the
 * first line of the row, linked to its wires under `key`. */
function line_row(
    context: drt.RenderedDiagram,
    colors: LegendColors,
    line: LegendLine,
    row_cells: HTMLTableCellElement[],
    key: string,
): HTMLTableRowElement {
    const element = document.createElement('tr');
    element.appendChild(label_cell(line));
    row_cells.forEach((cell) => element.appendChild(cell));
    const lock_cell = lock_cell_node();
    element.appendChild(lock_cell);
    link_line_highlights(element, lock_cell, line, key, context, colors);
    return element;
}

function axis_table(
    context: drt.RenderedDiagram,
    rows: aux.AxisLegendRow[],
    colors: LegendColors,
): HTMLTableElement {
    const axes = find_axes_by_uid.find_axes_by_uid(context.term);
    const {table, body} = empty_table(AXIS_COLUMN_HEADINGS, colors);
    rows.forEach((row, index) => {
        const lines = axis_legend_lines(context, row, axes);
        lines.forEach((line, line_index) => {
            const row_cells = line_index === 0 ? [
                size_cell(row.size === null ? '' : String(row.size), lines.length),
                code_name_cell(row.codeName ?? '', lines.length),
            ] : [];
            body.appendChild(line_row(
                context, colors, line, row_cells, `${index}:${line_index}`));
        });
    });
    return table;
}

function natural_table(
    context: drt.RenderedDiagram,
    rows: aux.NaturalLegendRow[],
    colors: LegendColors,
): HTMLTableElement {
    const naturals = find_naturals_by_key.find_naturals_by_key(context.term);
    const {table, body} = empty_table(NATURAL_COLUMN_HEADINGS, colors);
    table.classList.add('natural-legend');
    rows.forEach((row, index) => {
        body.appendChild(line_row(
            context, colors, natural_legend_line(row, naturals),
            [size_cell(row.size ?? '', 1), code_name_cell(row.codeName ?? '', 1)],
            `natural:${index}`));
    });
    return table;
}

function lock_note_node(colors: LegendColors): HTMLDivElement {
    const note = document.createElement('div');
    note.className = 'axis-legend-note';
    note.style.marginTop = '6px';
    note.style.fontSize = '0.9em';
    note.style.opacity = '0.7';
    note.style.color = colors.text;
    note.textContent = LOCK_NOTE;
    return note;
}

export function attach_legend(context: drt.RenderedDiagram): void {
    const rows = context.auxiliary?.legend ?? [];
    const naturals = context.auxiliary?.naturals ?? [];
    if (context.settings.legend !== true || !(rows.length || naturals.length)) {
        return;
    }
    LEGEND_LOCKS.release_every();
    const colors = legend_colors(context.settings);
    const column = document.createElement('div');
    column.className = 'axis-legend-column';
    column.style.marginLeft = '24px';
    column.style.marginRight = '8px';
    column.style.alignSelf = 'flex-start';
    column.style.flex = '0 0 auto';
    column.style.minWidth = 'max-content';
    column.style.fontSize = '0.85em';
    column.style.color = colors.text;
    if (rows.length) {
        column.appendChild(axis_table(context, rows, colors));
    }
    if (naturals.length) {
        const table = natural_table(context, naturals, colors);
        table.style.marginTop = rows.length ? `${TABLE_SPACING_PX}px` : '';
        column.appendChild(table);
    }
    /* The note is written where the sender asked for the inspection boxes,
     * which is the setting a figure meant for the pointer carries. A figure
     * with the legend alone is usually cut into an image, where a note about
     * clicking would describe something the image cannot do. Its rows lock
     * all the same when it is drawn on a page. */
    if (rhs.draws_axis_halos(context.settings)
        && context.settings.inspectionBoxes === true) {
        column.appendChild(lock_note_node(colors));
    }
    context.container.appendChild(column);
}
