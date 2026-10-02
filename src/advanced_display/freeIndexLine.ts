// Claude Opus 5.5 (1M context), effort 40.
/*
 * The line under the formula of an inspection box that names the indices the
 * formula holds for every position of their axes, and the tooltip each of
 * those indices opens.
 *
 * `pyncd` letters the indices of a formula and sends, beside the formula, each
 * index it holds for every position of the index's axis, in the order the
 * formula first names them. The line reads `\forall i_{x} \in x,\; j_{d} \in d`,
 * centred under the formula and set at the size the formula is set at. The
 * user asked for the line on 2026-09-27. A guarded index whose record carries a
 * `range` is written over that range, `j_{w|x} \in [0, i_{x}]`, and the tooltip
 * of a guarded index adds the condition its record carries, as the user asked
 * on 2026-09-28.
 *
 * Each clause `i_{x} \in x` is typeset by KaTeX as a span of its own, and the
 * pointer is tested against that span, so KaTeX needs no `trust` to mark the
 * clause. The spans stand side by side with nothing between them, and the
 * separator carries the thin space TeX puts after a comma in a formula, so the
 * line is spaced as one formula would be. Resting the pointer on a clause shows
 * a tooltip stating the set of indexes the axis carries, and a tap or a click
 * on the clause shows or hides it, which is how a phone reaches it. The click
 * ends at the clause, because the box locks on a click inside it and every box
 * closes on a click the page outside them answers.
 *
 * The tooltip is appended to the document body and placed over the page, so it
 * changes nothing of the layout of the box, and a box that scrolls does not
 * clip it. One tooltip is shown at a time, and it is hidden when the page or
 * the box scrolls, and when the box holding its clause closes or is written
 * again.
 */

import katex from 'katex';
import * as boxPlacement from './boxPlacement';
import {KATEX_OPTIONS} from '../display/HTMLRender/katex_options';
import type * as aux from './AuxiliaryInformation';

export const FREE_INDEX_LINE_CLASS = 'inspection-box-indices';
const FORALL_LATEX = '\\forall';
const CLAUSE_SEPARATOR_LATEX = ',\\,\\;';
/* Above every inspection box, which stands at 2147483000. */
const TOOLTIP_Z_INDEX = '2147483100';
const TOOLTIP_MAX_WIDTH_PX = 360;

/** The colours of the box the line is drawn in, which the tooltip takes so it
 * reads in the theme of the box. */
export interface TooltipColors {
    background: string;
    text: string;
    border: string;
    shadow: string;
}

interface ShownTooltip {
    clause: HTMLElement;
    node: HTMLDivElement;
}

let shown_tooltip: ShownTooltip | null = null;

export function clause_latex(record: aux.FormulaIndexRecord): string {
    return `${record.index} \\in ${record.range ?? record.axis}`;
}

export function tooltip_interval_latex(record: aux.FormulaIndexRecord): string {
    return `[0, \\lvert ${record.axis} \\rvert)`;
}

function typeset_span(latex: string): HTMLSpanElement {
    const span = document.createElement('span');
    katex.render(latex, span, KATEX_OPTIONS);
    return span;
}

export function free_index_line_node(
    records: readonly aux.FormulaIndexRecord[],
    colors: TooltipColors,
): HTMLDivElement {
    const node = document.createElement('div');
    node.className = FREE_INDEX_LINE_CLASS;
    node.style.width = '100%';
    node.style.margin = '0px 0px 6px';
    node.style.textAlign = 'center';
    node.style.whiteSpace = 'nowrap';
    node.style.overflowX = 'auto';
    node.style.overflowY = 'hidden';
    node.appendChild(typeset_span(FORALL_LATEX));
    records.forEach((record, index) => {
        if (index > 0) {
            node.appendChild(typeset_span(CLAUSE_SEPARATOR_LATEX));
        }
        node.appendChild(clause_node(record, colors));
    });
    return node;
}

function clause_node(
    record: aux.FormulaIndexRecord, colors: TooltipColors,
): HTMLSpanElement {
    const clause = typeset_span(clause_latex(record));
    clause.className = 'inspection-box-index-clause';
    clause.style.cursor = 'help';
    clause.addEventListener('pointerenter', (event: PointerEvent) => {
        if (event.pointerType === 'mouse') {
            show_tooltip(clause, record, colors);
        }
    });
    clause.addEventListener('pointerleave', (event: PointerEvent) => {
        if (event.pointerType === 'mouse' && shown_tooltip?.clause === clause) {
            hide_index_tooltip();
        }
    });
    clause.addEventListener('click', (event: MouseEvent) => {
        event.stopPropagation();
        if (shown_tooltip?.clause === clause) {
            hide_index_tooltip();
        } else {
            show_tooltip(clause, record, colors);
        }
    });
    return clause;
}

function tooltip_node(
    record: aux.FormulaIndexRecord, colors: TooltipColors,
): HTMLDivElement {
    const node = document.createElement('div');
    node.className = 'inspection-box-index-tooltip';
    node.setAttribute('role', 'tooltip');
    node.style.position = 'absolute';
    node.style.left = '0px';
    node.style.top = '0px';
    node.style.zIndex = TOOLTIP_Z_INDEX;
    node.style.boxSizing = 'border-box';
    node.style.maxWidth = `${TOOLTIP_MAX_WIDTH_PX}px`;
    node.style.padding = '5px 9px';
    node.style.font = '12px/1.45 sans-serif';
    node.style.backgroundColor = colors.background;
    node.style.color = colors.text;
    node.style.border = `1px solid ${colors.border}`;
    node.style.borderRadius = '4px';
    node.style.boxShadow = colors.shadow;
    node.append(
        'The axis ', typeset_span(record.axis),
        ' carries a set of indexes, in ',
        typeset_span(tooltip_interval_latex(record)), '.');
    if (record.condition !== undefined) {
        node.append(
            ' The position ', typeset_span(record.index), ' holds a value where ',
            typeset_span(record.condition),
            ', and the universal unit elsewhere.');
    }
    node.addEventListener('click', (event: MouseEvent) => {
        event.stopPropagation();
        hide_index_tooltip();
    });
    return node;
}

function show_tooltip(
    clause: HTMLElement,
    record: aux.FormulaIndexRecord,
    colors: TooltipColors,
): void {
    hide_index_tooltip();
    const node = tooltip_node(record, colors);
    node.style.visibility = 'hidden';
    document.body.appendChild(node);
    const placed = boxPlacement.place_under_target(
        boxPlacement.page_rectangle(clause),
        {width: node.offsetWidth, height: node.offsetHeight},
        boxPlacement.page_viewport());
    node.style.left = `${placed.x}px`;
    node.style.top = `${placed.y}px`;
    node.style.visibility = '';
    shown_tooltip = {clause, node};
    document.addEventListener(
        'scroll', hide_index_tooltip, {capture: true, once: true});
}

export function hide_index_tooltip(): void {
    shown_tooltip?.node.remove();
    shown_tooltip = null;
}

/** Hide the tooltip where its clause stands inside `container`, which a box
 * calls as it closes or writes its text again. */
export function hide_index_tooltip_within(container: Element): void {
    if (shown_tooltip !== null && container.contains(shown_tooltip.clause)) {
        hide_index_tooltip();
    }
}
