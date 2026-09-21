import * as assert from 'node:assert/strict';
import {test} from 'node:test';

import * as DiagramTheme from '../src/display/Render/DiagramTheme.ts';
import * as rhs from '../src/display/Render/RenderHandlerSettings.ts';
import * as Color from '../src/utilities/Color.ts';

const DARK_SETTINGS = {darkMode: true};
const LIGHT_SETTINGS = {darkMode: false};

test('block background levels increase the tint and reset after hover', (): void => {
    const attributes = {fill: '#c4b0ee', stroke: 'none', 'stroke-width': '1px'};
    const levels: rhs.BlockBackground[] = ['none', 'subtle', 'medium', 'strong'];
    const fills = levels.map((blockBackground) => {
        const settings = {...DARK_SETTINGS, blockBackground};
        const drawn = DiagramTheme.adaptPolygonAttributes(attributes, settings, 'enclosure');
        const restored = DiagramTheme.adaptChangedDrawAttributes(attributes, settings, 'enclosure');
        assert.equal(restored.fill, drawn.fill);
        assert.equal(drawn['stroke-dasharray'], DiagramTheme.darkDiagramTheme.enclosureStrokeDasharray);
        return drawn.fill;
    });
    assert.equal(fills[0], 'none');
    for (let i = 2; i < fills.length; i++) {
        assert.ok(Color.Color.from_css(fills[i])!.luminance
            > Color.Color.from_css(fills[i - 1])!.luminance);
    }
    assert.equal(DiagramTheme.adaptPolygonAttributes(
        attributes, LIGHT_SETTINGS, 'enclosure').fill, attributes.fill);
});

test('associated blocks and operators use identical hover fill at each intensity', (): void => {
    const attributes = {fill: '#b092ec', stroke: '#b092ec', 'stroke-width': '1px',
        fillRole: 'tint' as const};
    for (const darkMode of [true, false]) {
        for (const blockHoverIntensity of [0.06, 0.12, 0.2]) {
            const settings = {darkMode, blockHoverIntensity};
            const operator = DiagramTheme.adaptPolygonAttributes(attributes, settings, 'mark');
            const block = DiagramTheme.adaptPolygonAttributes(attributes, settings, 'enclosure');
            const hovered = DiagramTheme.adaptChangedDrawAttributes(attributes, settings, 'enclosure');
            assert.equal(block.fill, operator.fill);
            assert.equal(hovered.fill, operator.fill);
        }
    }
});

test('hover tints blend through Color in both themes without leaking semantic attributes', (): void => {
    const source = Object.freeze({fill: '#ff0000', stroke: '#ff0000',
        'stroke-width': '1px', fillRole: 'tint' as const, surfaceTint: 0.06});
    for (const settings of [DARK_SETTINGS, LIGHT_SETTINGS]) {
        const drawn = DiagramTheme.adaptPolygonAttributes(source, settings, 'mark');
        const changed = DiagramTheme.adaptChangedDrawAttributes(source, settings, 'mark');
        assert.equal(drawn.fill, settings.darkMode ? '#3c2d2d' : '#fff0f0');
        assert.equal(changed.fill, drawn.fill);
        assert.equal('surfaceTint' in drawn, false);
        assert.equal('surfaceTint' in changed, false);
        assert.equal('fillRole' in drawn, false);
        assert.equal('fillRole' in changed, false);
    }
    assert.equal(source.fill, '#ff0000');
});

test('an explicit colored outline keeps its color independently of the surface fill', (): void => {
    const attributes = {fill: '#e0ffe0', stroke: '#c090ff', 'stroke-width': '1px'};
    const outlined = DiagramTheme.adaptPolygonAttributes(attributes, DARK_SETTINGS, 'mark');
    const line = DiagramTheme.adaptLineAttributes(attributes, DARK_SETTINGS);
    assert.equal(outlined.stroke, line.stroke);
});

test('dark marks turn an undefined SVG fill into visible foreground', (): void => {
    const attributes = Object.freeze({
        fill: undefined,
        stroke: 'none',
        'stroke-width': '1px',
    });

    const adapted = DiagramTheme.adaptPolygonAttributes(
        attributes, DARK_SETTINGS, 'mark');

    assert.equal(adapted.fill, DiagramTheme.darkDiagramTheme.foregroundColor);
    assert.equal(adapted.stroke, 'none');
    assert.deepEqual(attributes, {
        fill: undefined,
        stroke: 'none',
        'stroke-width': '1px',
    });
});

test('paint roles are consumed and produce contrasting dark mask fills', (): void => {
    const surface = Object.freeze({
        fill: '#808080',
        stroke: 'none',
        'stroke-width': '1px',
        fillRole: 'surface' as const,
    });
    const contrast = Object.freeze({
        fill: '#F9CBDF',
        stroke: 'none',
        'stroke-width': '1px',
        fillRole: 'contrast' as const,
    });

    const adaptedSurface = DiagramTheme.adaptPolygonAttributes(
        surface, DARK_SETTINGS, 'mark');
    const adaptedContrast = DiagramTheme.adaptPolygonAttributes(
        contrast, DARK_SETTINGS, 'mark');

    assert.equal(adaptedSurface.fill, DiagramTheme.darkDiagramTheme.surfaceColor);
    assert.equal(adaptedSurface.stroke, DiagramTheme.darkDiagramTheme.foregroundColor);
    assert.equal(adaptedContrast.fill, DiagramTheme.darkDiagramTheme.foregroundColor);
    assert.equal(adaptedContrast.stroke, 'none');
    assert.equal('fillRole' in adaptedSurface, false);
    assert.equal('fillRole' in adaptedContrast, false);
    assert.equal(surface.fillRole, 'surface');
    assert.equal(contrast.fillRole, 'contrast');
});

test('set_attr adaptation consumes paint roles without mutating changes', (): void => {
    const changes = Object.freeze({fill: '#808080', fillRole: 'surface' as const});

    const adapted = DiagramTheme.adaptChangedDrawAttributes(
        changes, DARK_SETTINGS, 'mark');

    assert.deepEqual(adapted, {
        fill: DiagramTheme.darkDiagramTheme.surfaceColor,
        stroke: DiagramTheme.darkDiagramTheme.foregroundColor,
    });
    assert.deepEqual(changes, {fill: '#808080', fillRole: 'surface'});
});

test('light mode preserves SVG attributes and source objects', (): void => {
    const attributes = Object.freeze({
        fill: '#F9CBDF',
        stroke: 'black',
        'stroke-width': '2px',
        'stroke-dasharray': '3 2',
    });

    const adapted = DiagramTheme.adaptPolygonAttributes(
        attributes, LIGHT_SETTINGS, 'mark');

    assert.deepEqual(adapted, attributes);
    assert.notEqual(adapted, attributes);
});

test('light mode strips paint roles without changing SVG attributes', (): void => {
    const attributes = Object.freeze({
        fill: '#F9CBDF',
        stroke: 'none',
        'stroke-width': '1px',
        fillRole: 'contrast' as const,
    });

    const adapted = DiagramTheme.adaptPolygonAttributes(
        attributes, LIGHT_SETTINGS, 'mark');

    assert.deepEqual(adapted, {
        fill: '#F9CBDF',
        stroke: 'none',
        'stroke-width': '1px',
    });
    assert.equal(attributes.fillRole, 'contrast');
});
