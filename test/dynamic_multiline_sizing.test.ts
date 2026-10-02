// Claude Opus 5.5, effort 40.
/*
 * The rows `src/display/Framework/dynamicMultilineSizing.ts` plans for a wrapped
 * figure, on layout trees written here with round widths. The tests cover the
 * width of a row, the groups a break cuts, and the four properties the plan is
 * for: a block that fits on a row is not cut, a cut block leaves no short piece
 * on either row, the rows come out of similar width, and a box wider than the
 * target stands on a row of its own.
 */
import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as dms from '../src/display/Framework/dynamicMultilineSizing.ts';

type Node = dms.LayoutNode<string>;
const GAP = 20;
const PADDING = 20;

/* Builds layout trees whose leaves are numbered in the order they are
 * written, as `Multiline.ts` numbers the leaves of a figure. */
class TreeWriter {
    private next_leaf = 0;

    leaf(width: number, name: string = `leaf ${this.next_leaf}`): Node {
        return dms.layout_leaf(name, width, this.next_leaf++);
    }

    sequence(children: Node[]): Node {
        return dms.layout_sequence(
            'sequence', children, children.slice(1).map(() => GAP));
    }

    group(name: string, children: Node[], is_loop: boolean = false): Node {
        return dms.layout_group(
            name, children.length === 1 ? children[0] : this.sequence(children),
            PADDING, 0, is_loop);
    }
}

function layout_of(root: Node): dms.RowLayout<string> {
    const count = root.last + 1;
    return {root, start_caps: new Array(count).fill(0), end_caps: new Array(count).fill(0)};
}

function spans(rows: dms.RowSpan[]): [number, number][] {
    return rows.map(({first, last}) => [first, last]);
}

/*
 * The top level of MiMo-V2.6-Pro, with each pre-norm residual 330 wide: the
 * embedding, layer 0 of two residuals, a group of layers holding a sliding
 * window layer of two residuals and then a full attention residual and a
 * mixture of experts, and the output logits.
 */
function layers_of_a_model(): Node {
    const writer = new TreeWriter();
    return writer.sequence([
        writer.leaf(100, 'embedding'),
        writer.group('layer 0', [writer.leaf(330), writer.leaf(330)]),
        writer.group('layers 1 to 7', [
            writer.group('sliding window layers', [writer.leaf(330), writer.leaf(330)], true),
            writer.leaf(330),
            writer.leaf(330),
        ], true),
        writer.leaf(180, 'output logits'),
    ]);
}

test('the width of a row adds its leaves, the gaps between them and the padding of its groups',
     (): void => {
    const root = layers_of_a_model();

    assert.equal(dms.restricted_width(root, 0, 0), 100);
    assert.equal(dms.restricted_width(root, 1, 2), 330 + GAP + 330 + PADDING);
    assert.equal(dms.restricted_width(root, 0, 2), 100 + GAP + 700);
    assert.equal(
        dms.restricted_width(root, 2, 3),
        (330 + PADDING) + GAP + (330 + PADDING + PADDING));
    assert.equal(root.width, dms.restricted_width(root, 0, root.last));
});

test('a break cuts every group holding the leaves on both sides of it, outermost first',
     (): void => {
    const root = layers_of_a_model();

    assert.deepEqual(dms.groups_cut_after(root, 0).map((group) => group.source), []);
    assert.deepEqual(dms.groups_cut_after(root, 1).map((group) => group.source), ['layer 0']);
    assert.deepEqual(dms.groups_cut_after(root, 3).map((group) => group.source),
        ['layers 1 to 7', 'sliding window layers']);
    assert.deepEqual(dms.groups_cut_after(root, 4).map((group) => group.source),
        ['layers 1 to 7']);
});

test('a group of layers too wide for a row is cut between its members and not inside them',
     (): void => {
    const rows = dms.plan_rows(layout_of(layers_of_a_model()), 900);

    assert.deepEqual(spans(rows), [[0, 2], [3, 4], [5, 7]]);
});

test('a group that fits on a row of its own is not cut', (): void => {
    const writer = new TreeWriter();
    const root = writer.sequence([
        writer.group('first', [writer.leaf(300), writer.leaf(300)]),
        writer.group('second', [writer.leaf(300), writer.leaf(300)]),
    ]);

    assert.deepEqual(spans(dms.plan_rows(layout_of(root), 700)), [[0, 1], [2, 3]]);
});

test('a group that fits on a row is not cut in halves to fill the rows beside it', (): void => {
    const writer = new TreeWriter();
    const root = writer.sequence(['first', 'second', 'third'].map((name) =>
        writer.group(name, [writer.leaf(440), writer.leaf(440)])));

    assert.deepEqual(
        spans(dms.plan_rows(layout_of(root), 1500)), [[0, 1], [2, 3], [4, 5]]);
    assert.deepEqual(
        spans(dms.plan_rows(layout_of(root), 1500,
            {...dms.DYNAMIC_SIZING_COSTS, cut_fitting_group: 0})),
        [[0, 2], [3, 5]]);
});

test('a cut group leaves no short piece at the end of a row or the start of the next',
     (): void => {
    const writer = new TreeWriter();
    const root = writer.sequence([
        writer.group('block', [writer.leaf(600), writer.leaf(300), writer.leaf(320)]),
    ]);
    const rows = dms.plan_rows(layout_of(root), 1000);

    assert.deepEqual(spans(rows), [[0, 0], [1, 2]]);
});

test('the rows come out of similar width, so the last is not a short remainder', (): void => {
    const writer = new TreeWriter();
    const root = writer.sequence([300, 300, 300, 300].map((width) => writer.leaf(width)));

    assert.deepEqual(spans(dms.plan_rows(layout_of(root), 1000)), [[0, 1], [2, 3]]);
});

test('a row may run over the target to keep a group whole, and no further than the overrun',
     (): void => {
    const writer = new TreeWriter();
    const root = writer.sequence([
        writer.group('first', [writer.leaf(520), writer.leaf(520)]),
        writer.group('second', [writer.leaf(520), writer.leaf(520)]),
    ]);

    assert.deepEqual(spans(dms.plan_rows(layout_of(root), 1000)), [[0, 1], [2, 3]]);
    assert.deepEqual(spans(dms.plan_rows(layout_of(root), 800)), [[0, 0], [1, 1], [2, 2], [3, 3]]);
});

test('a product beside an identity is divided in its block, and the identity stands on its first row',
     (): void => {
    const writer = new TreeWriter();
    const copy = writer.leaf(40, 'copy');
    const attention = writer.group('attention', [writer.leaf(500), writer.leaf(500)]);
    const residual = writer.group('residual', [
        copy,
        dms.layout_parallel('product', attention, 1, 60),
        writer.leaf(40, 'add'),
    ]);
    const root = writer.sequence([residual]);

    assert.equal(dms.restricted_width(root, 0, 1), 40 + GAP + 500 + PADDING + PADDING);
    assert.equal(
        dms.groups_cut_after(root, 1).map((group) => group.source).join(', '),
        'residual, attention');
    assert.deepEqual(spans(dms.plan_rows(layout_of(root), 700)), [[0, 1], [2, 3]]);
});

test('a box wider than the target stands on a row of its own', (): void => {
    const writer = new TreeWriter();
    const root = writer.sequence([writer.leaf(200), writer.leaf(1500), writer.leaf(200)]);

    const rows = dms.plan_rows(layout_of(root), 1000);

    assert.ok(spans(rows).some(([first, last]) => first === 1 && last === 1));
    assert.deepEqual(rows.flatMap(({first, last}) =>
        Array.from({length: last - first + 1}, (_, i) => first + i)), [0, 1, 2]);
});
