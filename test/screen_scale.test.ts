import * as assert from 'node:assert/strict';
import {test} from 'node:test';
import * as html_helpers from '../src/display/HTMLRender/html_helpers';

/*
 * An element as `screen_scale` and `local_rectangle` read it: its client
 * rectangle, its parent, and the `transform` and `scale` of its computed style.
 */
interface FakeElement {
    parentElement: FakeElement | null;
    transform: string;
    scale: string;
    rect: {left: number; top: number; width: number; height: number};
    getBoundingClientRect(): FakeElement['rect'];
}

function element(
    rect: FakeElement['rect'],
    parentElement: FakeElement | null = null,
    transform = 'none',
    scale = 'none',
): FakeElement {
    return {parentElement, transform, scale, rect, getBoundingClientRect() { return this.rect; }};
}

/* The browser's two globals the helpers use, for `matrix(a, b, c, d, e, f)` alone. */
globalThis.getComputedStyle = ((node: FakeElement) =>
    ({transform: node.transform, scale: node.scale})) as unknown as typeof getComputedStyle;
globalThis.DOMMatrixReadOnly = class {
    a: number; b: number; c: number; d: number;
    constructor(source: string) {
        [this.a, this.b, this.c, this.d] = source.slice('matrix('.length, -1).split(',').map(Number);
    }
} as unknown as typeof DOMMatrixReadOnly;

const local = (rect: FakeElement['rect'], container: FakeElement) =>
    html_helpers.local_rectangle(rect as DOMRectReadOnly, container as unknown as HTMLElement);

test('an unscaled container measures its children exactly as before', (): void => {
    const container = element({left: 40.5, top: 12.25, width: 800, height: 600});
    const rect = local({left: 140.5, top: 62.25, width: 30.125, height: 20}, container);
    assert.deepEqual([rect.top_left.x, rect.top_left.y, rect.width, rect.height], [100, 50, 30.125, 20]);
});

test('a container zoomed by an ancestor measures in its own pixels', (): void => {
    // The lab website's viewer zooms the figure to 60% with a transform on a wrapper.
    const camera = element({left: 0, top: 0, width: 600, height: 360}, null, 'matrix(0.6, 0, 0, 0.6, 20, 10)');
    const container = element({left: 32, top: 16, width: 480, height: 300}, camera);
    const rect = local({left: 92, top: 46, width: 120, height: 12}, container);
    assert.deepEqual([rect.top_left.x, rect.top_left.y, rect.width, rect.height], [100, 50, 200, 20]);
});

test('transforms and scale properties along the ancestry multiply', (): void => {
    const outer = element({left: 0, top: 0, width: 0, height: 0}, null, 'none', '0.5');
    const inner = element({left: 0, top: 0, width: 0, height: 0}, outer, 'matrix(2, 0, 0, 4, 0, 0)');
    const container = element({left: 0, top: 0, width: 0, height: 0}, inner, 'matrix(1, 0, 0, 1, 7, 9)');
    const scale = html_helpers.screen_scale(container as unknown as Element);
    assert.deepEqual([scale.x, scale.y], [1, 2]);
});

test('a length measured through a scale lands back on the layout grid', (): void => {
    // Divided back without snapping, 21 at 70% is 30.000000000000004, which is
    // larger than the 30 px a `GlyphBox` declared, and drew the fill behind it.
    assert.equal(html_helpers.unscale(21, 0.7), 30);
    // The browser reports a transformed rectangle in single precision.
    assert.equal(html_helpers.unscale(Math.fround(75.890625 * 0.6), 0.6), 75.890625);
    // Unscaled, a measurement is returned exactly, on the grid or off it.
    assert.equal(html_helpers.unscale(12.9956, 1), 12.9956);
});
