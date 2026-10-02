// Claude Opus 5.5, effort 40.
/*
 * The rows of a wrapped figure chosen so that whole blocks stand on one row,
 * which `RenderHandlerSettings.dynamicMultilineSizing` turns on.
 *
 * Without the setting, `Multiline.ts` fills each row until the width runs out
 * and cuts whichever block is open at that point, at any depth. A block of two
 * layers can then end one row with its first layer and start the next with its
 * second, and a block can leave its last member alone at the start of a row.
 *
 * With the setting, the figure is read as a tree of layout nodes. A leaf is a
 * box the layout does not divide. A sequence is a `Composed`, with the width of
 * the gap between each pair of its members. A group is a `Block` whose body is
 * drawn, with its padding and the width of its title. A parallel node is a
 * product whose widest factor the rows may divide, with the other factors on
 * the first of its rows. A row holds a run of
 * consecutive leaves, and a break between two leaves cuts every group holding
 * both of them. `plan_rows` chooses the breaks by dynamic programming over the
 * leaves, as Knuth and Plass break a paragraph into lines, and minimises the
 * sum of these costs:
 *
 * - each row costs the square of its shortfall from the target width, or twice
 *   the square of its overrun, as a fraction of the target, so that the rows
 *   come out of similar width and the last row is not a short remainder;
 * - a row may run over the target by `overrun` and no further, unless it holds
 *   one leaf, which is the case of a box wider than the target;
 * - each group a break cuts costs `cut_group`, and a group that repeats, whose
 *   brackets the cut divides, costs `cut_loop` more, so a break between two
 *   whole blocks is preferred to a break inside one, and a break inside a
 *   shallow block to a break inside a deep one. A group no wider than the
 *   widest row costs `cut_fitting_group` more, because it could stand whole on
 *   a row of its own. Without that cost a layer of two sublayers of Kimi K3 was
 *   cut into its two halves to fill two rows;
 * - a piece of a cut group narrower than `short_piece_fraction` of the group's
 *   width, or of the target where the group is wider than the target, costs
 *   `short_piece`. That cost removes the head of a block left at the end of a
 *   row and the tail left at the start of the next.
 *
 * The widths are estimates. A row's width is taken as the sum of the widths of
 * its leaves, the gaps between them, the padding of every group it holds and
 * the caps at its two ends, and `Multiline.ts` then builds the rows and fits
 * them to the widest. The user asked for the setting on 2026-09-29.
 */

export interface LeafNode<S> {
    kind: 'leaf';
    source: S;
    width: number;
    first: number;
    last: number;
}

export interface SequenceNode<S> {
    kind: 'sequence';
    source: S;
    children: LayoutNode<S>[];
    /* `gaps[i]` stands between `children[i]` and `children[i + 1]`. */
    gaps: number[];
    /* `offsets[i]` is the width of every child before child `i` and of the
     * gap after each of them. */
    offsets: number[];
    width: number;
    first: number;
    last: number;
}

export interface GroupNode<S> {
    kind: 'group';
    source: S;
    body: LayoutNode<S>;
    padding: number;
    minimum_width: number;
    is_loop: boolean;
    width: number;
    first: number;
    last: number;
}

/*
 * A product whose rows divide one factor, `main`, as `split_product` divides a
 * product holding an identity beside a block. The other factors stand whole
 * on the row holding the product's first leaf, and an identity carries their
 * wires across every later row, so that row is at least `side_width` wide.
 */
export interface ParallelNode<S> {
    kind: 'parallel';
    source: S;
    main: LayoutNode<S>;
    main_index: number;
    side_width: number;
    width: number;
    first: number;
    last: number;
}

export type LayoutNode<S> = LeafNode<S> | SequenceNode<S> | GroupNode<S> | ParallelNode<S>;

export function layout_leaf<S>(source: S, width: number, index: number): LeafNode<S> {
    return {kind: 'leaf', source, width, first: index, last: index};
}

export function layout_sequence<S>(
    source: S,
    children: LayoutNode<S>[],
    gaps: number[],
): SequenceNode<S> {
    if (children.length === 0 || gaps.length !== children.length - 1) {
        throw new Error(
            `A sequence of ${children.length} children was given ${gaps.length} gaps.`);
    }
    const offsets = [0];
    children.forEach((child, i) =>
        offsets.push(offsets[i] + child.width + (gaps[i] ?? 0)));
    return {
        kind: 'sequence', source, children, gaps, offsets,
        width: offsets[children.length],
        first: children[0].first,
        last: children[children.length - 1].last,
    };
}

export function layout_group<S>(
    source: S,
    body: LayoutNode<S>,
    padding: number,
    minimum_width: number,
    is_loop: boolean,
): GroupNode<S> {
    return {
        kind: 'group', source, body, padding, minimum_width, is_loop,
        width: Math.max(body.width + padding, minimum_width),
        first: body.first,
        last: body.last,
    };
}

export function layout_parallel<S>(
    source: S,
    main: LayoutNode<S>,
    main_index: number,
    side_width: number,
): ParallelNode<S> {
    return {
        kind: 'parallel', source, main, main_index, side_width,
        width: Math.max(main.width, side_width),
        first: main.first,
        last: main.last,
    };
}

/* A figure's layout tree, with the width of the cap that stands before a row
 * starting at each leaf and after a row ending at each leaf. */
export interface RowLayout<S> {
    root: LayoutNode<S>;
    start_caps: number[];
    end_caps: number[];
}

/* The leaves a row holds, from `first` to `last` inclusive. */
export interface RowSpan {
    first: number;
    last: number;
}

export interface DynamicSizingCosts {
    overrun: number;
    shortfall_weight: number;
    overrun_weight: number;
    cut_group: number;
    cut_loop: number;
    cut_fitting_group: number;
    short_piece: number;
    short_piece_fraction: number;
    row: number;
}

export const DYNAMIC_SIZING_COSTS: DynamicSizingCosts = {
    overrun: 0.15,
    shortfall_weight: 1,
    overrun_weight: 2,
    cut_group: 0.4,
    cut_loop: 0.4,
    cut_fitting_group: 4,
    short_piece: 2,
    short_piece_fraction: 1 / 3,
    row: 0.02,
};

export function leaf_count<S>(layout: RowLayout<S>): number {
    return layout.root.last + 1;
}

/* The index of the child of `node` holding the leaf `leaf`. */
function child_holding<S>(node: SequenceNode<S>, leaf: number): number {
    let low = 0;
    let high = node.children.length - 1;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (node.children[middle].first <= leaf) {
            low = middle;
        } else {
            high = middle - 1;
        }
    }
    return low;
}

/* The width of the part of `node` holding the leaves from `first` to `last`,
 * which overlap it. */
export function restricted_width<S>(
    node: LayoutNode<S>,
    first: number,
    last: number,
): number {
    if (first <= node.first && node.last <= last) {
        return node.width;
    }
    switch (node.kind) {
        case 'leaf':
            return node.width;
        case 'group':
            return Math.max(
                restricted_width(node.body, first, last) + node.padding,
                node.minimum_width);
        case 'parallel': {
            const main = restricted_width(node.main, first, last);
            return first <= node.first ? Math.max(main, node.side_width) : main;
        }
        case 'sequence': {
            const first_child = child_holding(node, Math.max(first, node.first));
            const last_child = child_holding(node, Math.min(last, node.last));
            if (first_child === last_child) {
                return restricted_width(node.children[first_child], first, last);
            }
            return restricted_width(node.children[first_child], first, last)
                + restricted_width(node.children[last_child], first, last)
                + node.offsets[last_child] - node.offsets[first_child + 1]
                + node.gaps[first_child];
        }
    }
}

/* The groups a break between leaf `leaf` and the leaf after it cuts, from the
 * outermost inwards. */
export function groups_cut_after<S>(root: LayoutNode<S>, leaf: number): GroupNode<S>[] {
    const cut: GroupNode<S>[] = [];
    let node: LayoutNode<S> = root;
    while (node.first <= leaf && leaf + 1 <= node.last) {
        if (node.kind === 'group') {
            cut.push(node);
            node = node.body;
        } else if (node.kind === 'sequence') {
            node = node.children[child_holding(node, leaf)];
        } else if (node.kind === 'parallel') {
            node = node.main;
        } else {
            break;
        }
    }
    return cut;
}

function break_cost<S>(
    cut: GroupNode<S>[],
    widest_row: number,
    costs: DynamicSizingCosts,
): number {
    return cut.reduce((total, group) =>
        total + costs.cut_group
        + (group.is_loop ? costs.cut_loop : 0)
        + (group.width <= widest_row ? costs.cut_fitting_group : 0), 0);
}

/* How many pieces of groups cut at either end of the row from `first` to
 * `last` are short. */
function short_pieces<S>(
    first: number,
    last: number,
    cut_before: GroupNode<S>[],
    cut_after: GroupNode<S>[],
    target_width: number,
    costs: DynamicSizingCosts,
): number {
    const pieces = new Set([...cut_before, ...cut_after]);
    return [...pieces].filter((group) => {
        const piece = restricted_width(
            group.body, Math.max(first, group.first), Math.min(last, group.last));
        return piece < costs.short_piece_fraction
            * Math.min(group.body.width, target_width);
    }).length;
}

/* The width of the row from `first` to `last`, with its caps. */
export function row_width<S>(layout: RowLayout<S>, first: number, last: number): number {
    return restricted_width(layout.root, first, last)
        + layout.start_caps[first] + layout.end_caps[last];
}

function fit_cost(width: number, target_width: number, costs: DynamicSizingCosts): number {
    return width <= target_width
        ? costs.shortfall_weight * ((target_width - width) / target_width) ** 2
        : costs.overrun_weight * ((width - target_width) / target_width) ** 2;
}

/**
 * The rows of `layout` at `target_width`, in order, chosen to minimise the costs
 * the module comment states. Every leaf stands in exactly one row.
 */
export function plan_rows<S>(
    layout: RowLayout<S>,
    target_width: number,
    costs: DynamicSizingCosts = DYNAMIC_SIZING_COSTS,
): RowSpan[] {
    const count = leaf_count(layout);
    const cuts = Array.from({length: count}, (_, leaf) =>
        leaf + 1 < count ? groups_cut_after(layout.root, leaf) : []);
    const widest_row = target_width * (1 + costs.overrun);
    const best = new Array<number>(count + 1).fill(Infinity);
    const start_of_last_row = new Array<number>(count + 1).fill(0);
    best[0] = 0;
    for (let last = 0; last < count; last++) {
        const cost_of_break = break_cost(cuts[last], widest_row, costs);
        for (let first = last; first >= 0; first--) {
            const content = restricted_width(layout.root, first, last);
            if (first < last && content > widest_row) {
                break;
            }
            const width = content + layout.start_caps[first] + layout.end_caps[last];
            if (first < last && width > widest_row) {
                continue;
            }
            const cost = best[first]
                + fit_cost(width, target_width, costs)
                + costs.row
                + costs.short_piece * short_pieces(
                    first, last, first > 0 ? cuts[first - 1] : [], cuts[last],
                    target_width, costs)
                + cost_of_break;
            if (cost < best[last + 1]) {
                best[last + 1] = cost;
                start_of_last_row[last + 1] = first;
            }
        }
    }
    const rows: RowSpan[] = [];
    for (let end = count; end > 0; end = start_of_last_row[end]) {
        rows.unshift({first: start_of_last_row[end], last: end - 1});
    }
    return rows;
}
