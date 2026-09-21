import type * as rh from './RenderHandler';
import type * as rhs from './RenderHandlerSettings';
import type * as dhd from './DrawHandler';
import * as Color from '../../utilities/Color';

export interface DiagramTheme {
    canvasColor: string;
    foregroundColor: string;
    surfaceColor: string;
    enclosureFill: string;
    enclosureStrokeDasharray: string;
}

export type DiagramPaintRole = 'mark' | 'enclosure';

export const darkDiagramTheme: DiagramTheme = {
    canvasColor: Color.Color.from_hex('#1e1e1e').hex(),
    foregroundColor: Color.Color.from_hex('#dedede').hex(),
    surfaceColor: Color.Color.from_hex('#303030').hex(),
    enclosureFill: 'none',
    enclosureStrokeDasharray: '2 3',
};

export function usesDarkDiagramTheme(settings: rhs.RenderHandlerSettings): boolean {
    return settings.darkMode !== false;
}

export function adaptLineAttributes(
    attributes: dhd.LineAttrs,
    settings: rhs.RenderHandlerSettings,
): dhd.LineAttrs {
    if (!usesDarkDiagramTheme(settings)) {
        return {...attributes};
    }
    return {
        ...attributes,
        stroke: adaptForegroundColor(attributes.stroke),
    };
}

export function adaptPolygonAttributes(
    attributes: dhd.PolygonAttrs,
    settings: rhs.RenderHandlerSettings,
    paintRole: DiagramPaintRole,
): dhd.PolygonAttrs {
    const {fillRole, surfaceTint, ...svgAttributes} = attributes;
    if (fillRole === 'tint') {
        return {
            ...svgAttributes,
            fill: tintedSurfaceColor(svgAttributes.fill, surfaceTint, settings),
            stroke: usesDarkDiagramTheme(settings)
                ? filledShapeStrokeColor(svgAttributes.fill, svgAttributes.stroke)
                : svgAttributes.stroke,
        };
    }
    if (!usesDarkDiagramTheme(settings)) {
        return svgAttributes;
    }
    if (paintRole === 'enclosure') {
        return {
            ...svgAttributes,
            fill: enclosureFillColor(svgAttributes.fill, settings),
            stroke: enclosureStrokeColor(svgAttributes),
            'stroke-dasharray': darkDiagramTheme.enclosureStrokeDasharray,
        };
    }
    if (fillRole === 'surface') {
        return {
            ...svgAttributes,
            fill: darkDiagramTheme.surfaceColor,
            stroke: fillAccentColor(svgAttributes.fill)
                ?? darkDiagramTheme.foregroundColor,
        };
    }
    if (fillRole === 'contrast') {
        return {
            ...svgAttributes,
            fill: contrastFillColor(),
            stroke: adaptForegroundColor(svgAttributes.stroke),
        };
    }
    return {
        ...svgAttributes,
        fill: adaptFillColor(svgAttributes.fill),
        stroke: filledShapeStrokeColor(svgAttributes.fill, svgAttributes.stroke),
    };
}

export function adaptCircleAttributes(
    attributes: dhd.CircleAttrs,
    settings: rhs.RenderHandlerSettings,
): dhd.CircleAttrs {
    return {
        ...adaptPolygonAttributes(attributes, settings, 'mark'),
        radius: attributes.radius,
    };
}

export function adaptChangedDrawAttributes<A extends object>(
    attributes: Partial<A>,
    settings: rhs.RenderHandlerSettings,
    paintRole: DiagramPaintRole,
): Partial<A> {
    const source = attributes as Record<string, unknown>;
    const adapted: Record<string, unknown> = {...source};
    const fillRole = source['fillRole'];
    const surfaceTint = typeof source['surfaceTint'] === 'number'
        ? source['surfaceTint'] : undefined;
    delete adapted['fillRole'];
    delete adapted['surfaceTint'];
    if (fillRole === 'tint') {
        const fill = typeof source['fill'] === 'string' ? source['fill'] : undefined;
        const stroke = typeof source['stroke'] === 'string' ? source['stroke'] : undefined;
        adapted['fill'] = tintedSurfaceColor(fill, surfaceTint, settings);
        if (usesDarkDiagramTheme(settings)) {
            const accent = filledShapeStrokeColor(fill, stroke);
            if (accent !== undefined) { adapted['stroke'] = accent; }
        }
        return adapted as Partial<A>;
    }
    if (!usesDarkDiagramTheme(settings)) {
        return adapted as Partial<A>;
    }
    if (typeof adapted['stroke'] === 'string') {
        adapted['stroke'] = paintRole === 'enclosure'
            ? darkDiagramTheme.foregroundColor
            : adaptForegroundColor(adapted['stroke']);
    }
    if ('fill' in adapted) {
        const originalFill = typeof adapted['fill'] === 'string'
            ? adapted['fill']
            : undefined;
        adapted['fill'] = paintRole === 'enclosure'
            ? enclosureFillColor(originalFill, settings)
            : fillRole === 'surface'
                ? darkDiagramTheme.surfaceColor
                : fillRole === 'contrast'
                    ? contrastFillColor()
                    : adaptFillColor(originalFill);
        const stroke = fillRole === 'surface'
            ? fillAccentColor(originalFill) ?? darkDiagramTheme.foregroundColor
            : fillRole === 'contrast'
                ? adaptForegroundColor(
                    typeof source['stroke'] === 'string' ? source['stroke'] : undefined)
                : filledShapeStrokeColor(
                    originalFill,
                    typeof source['stroke'] === 'string' ? source['stroke'] : undefined);
        if (stroke !== undefined) {
            adapted['stroke'] = stroke;
        }
    }
    if (paintRole === 'enclosure' && ('fill' in adapted || 'stroke' in adapted)) {
        const strokeSource = typeof source['fill'] === 'string'
            ? source['fill']
            : typeof source['stroke'] === 'string'
                ? source['stroke']
                : 'black';
        adapted['stroke'] = adaptForegroundColor(strokeSource);
        adapted['stroke-dasharray'] = darkDiagramTheme.enclosureStrokeDasharray;
    }
    return adapted as Partial<A>;
}

export function adaptAuxAttributes(
    attributes: Partial<dhd.AuxAttrs>,
    settings: rhs.RenderHandlerSettings,
): Partial<dhd.AuxAttrs> {
    return usesDarkDiagramTheme(settings)
        ? {...attributes, dropShadow: false}
        : {...attributes};
}

export function adaptAnnotationSettings(
    annotationSettings: rh.AnnotationElementSettings,
    settings: rhs.RenderHandlerSettings,
): rh.AnnotationElementSettings {
    if (!usesDarkDiagramTheme(settings)) {
        return {...annotationSettings};
    }
    return {
        ...annotationSettings,
        color: annotationSettings.color === undefined
            ? darkDiagramTheme.foregroundColor
            : adaptForegroundColor(annotationSettings.color),
        background: annotationSettings.background === undefined
            ? undefined
            : adaptFillColor(annotationSettings.background),
    };
}

function adaptForegroundColor(color: string): string;
function adaptForegroundColor(color: undefined): undefined;
function adaptForegroundColor(color: string | undefined): string | undefined;
function adaptForegroundColor(color: string | undefined): string | undefined {
    if (color === undefined) {
        return undefined;
    }
    if (isTransparentColor(color)) {
        return color;
    }
    const rgb = Color.Color.from_css(color);
    if (rgb === undefined) {
        return color;
    }
    if (isNeutralColor(rgb)) {
        return darkDiagramTheme.foregroundColor;
    }
    return liftColor(rgb);
}

function adaptFillColor(color: string | undefined): string {
    if (color === undefined) {
        return darkDiagramTheme.foregroundColor;
    }
    if (isTransparentColor(color)) {
        return color;
    }
    const rgb = Color.Color.from_css(color);
    if (rgb === undefined) {
        return color;
    }
    if (!isNeutralColor(rgb)) {
        return darkDiagramTheme.surfaceColor;
    }
    const brightness = rgb.v01 * 255;
    return brightness <= 224
        ? darkDiagramTheme.foregroundColor
        : darkDiagramTheme.surfaceColor;
}

function contrastFillColor(): string {
    return darkDiagramTheme.foregroundColor;
}

function tintedSurfaceColor(
    color: string | undefined,
    weight: number | undefined,
    settings: rhs.RenderHandlerSettings,
): string {
    const surface = Color.Color.from_hex(usesDarkDiagramTheme(settings)
        ? darkDiagramTheme.surfaceColor : '#ffffff');
    const tint = color === undefined ? undefined : Color.Color.from_css(color);
    return tint === undefined ? surface.hex()
        : surface.blend(tint, weight ?? settings.blockHoverIntensity ?? 0.12).hex();
}

const blockBackgroundWeights: Record<rhs.BlockBackground, number> = {
    none: 0,
    subtle: 0.045,
    medium: 0.08,
    strong: 0.14,
};

function enclosureFillColor(
    color: string | undefined,
    settings: rhs.RenderHandlerSettings,
): string {
    const weight = blockBackgroundWeights[settings.blockBackground ?? 'subtle'];
    if (!weight || color === undefined || isTransparentColor(color)) {
        return darkDiagramTheme.enclosureFill;
    }
    const tint = Color.Color.from_css(color);
    return tint === undefined ? darkDiagramTheme.enclosureFill
        : Color.Color.from_hex(darkDiagramTheme.canvasColor).blend(tint, weight).hex();
}

function isTransparentColor(color: string): boolean {
    const normalized = color.trim().toLowerCase();
    return normalized === 'none'
        || normalized === 'transparent'
        || /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(normalized);
}

function isNeutralColor(color: Color.Color): boolean {
    return color.chroma <= 24 / 255;
}

function fillAccentColor(fill: string | undefined): string | undefined {
    if (fill === undefined) {
        return undefined;
    }
    const rgb = Color.Color.from_css(fill);
    return rgb !== undefined && !isNeutralColor(rgb) ? liftColor(rgb) : undefined;
}

function filledShapeStrokeColor(fill: string, stroke: string): string;
function filledShapeStrokeColor(
    fill: string | undefined,
    stroke: string | undefined,
): string | undefined;
function filledShapeStrokeColor(
    fill: string | undefined,
    stroke: string | undefined,
): string | undefined {
    const strokeColor = stroke === undefined ? undefined : Color.Color.from_css(stroke);
    if (strokeColor !== undefined && !isNeutralColor(strokeColor)) {
        return liftColor(strokeColor);
    }
    const accent = fillAccentColor(fill);
    if (accent !== undefined) {
        return accent;
    }
    if (usesDarkSurfaceFill(fill)) {
        return darkDiagramTheme.foregroundColor;
    }
    return adaptForegroundColor(stroke);
}

function usesDarkSurfaceFill(fill: string | undefined): boolean {
    if (fill === undefined || isTransparentColor(fill)) {
        return false;
    }
    const rgb = Color.Color.from_css(fill);
    return rgb !== undefined && isNeutralColor(rgb) && rgb.v01 * 255 > 224;
}

function enclosureStrokeColor(attributes: dhd.PolygonAttrs): string {
    return fillAccentColor(attributes.fill)
        ?? adaptForegroundColor(
            attributes.stroke === undefined || attributes.stroke === 'none'
                ? 'black'
                : attributes.stroke);
}

function liftColor(color: Color.Color): string {
    return color.with_minimum_luminance(0.62).hex();
}
