import * as dhd from '../Render/DrawHandler';
import * as rhs from '../Render/RenderHandlerSettings';
import * as DiagramTheme from '../Render/DiagramTheme';
import * as dh from '../draw_helper/draw_helpers';
import * as pt from '../../utilities/Point';
import * as Curve from "../../utilities/Curve";

export function new_svg(parent: HTMLElement): SVGSVGElement {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.position = 'absolute';
    svg.style.zIndex = '5';
    svg.style.left = `0px`;
    svg.style.top = '0px';
    svg.style.pointerEvents = 'none';
    /*
     * An outermost `<svg>` clips to its viewport by default, and this one is
     * sized to the container it overlays plus `BUFFER`. Anything drawn further
     * out than that would be cut off at the edge rather than drawn - which is
     * what a `TapeBox` does deliberately, running its tape past the top or the
     * bottom of a box that reserved no room for it. The layer is transparent
     * and has no background of its own, so not clipping it costs nothing.
     */
    svg.style.overflow = 'visible';
	parent.appendChild(svg);
	return svg;
}

const BUFFER: number = 10;
const OFFSET: pt.Point = {x: -BUFFER, y: -BUFFER};

export class HTMLDrawHandler extends dhd.DrawHandler<HTMLDivElement, SVGElement> {
    private drawLayer_svgs: Record<string, SVGSVGElement> = {};
    private elementLayers: WeakMap<SVGElement, string> = new WeakMap();
    constructor(
        private parent: HTMLDivElement,
        private settings: () => rhs.RenderHandlerSettings =
            () => rhs.defaultRenderHandlerSettings,
    ) {
        super();
        this.drawLayers = {
            'background': new dhd.DrawLayer<HTMLDivElement, SVGElement>('background', -1),
            'main': new dhd.DrawLayer<HTMLDivElement, SVGElement>('main', 0),
            'broadcast': new dhd.DrawLayer<HTMLDivElement, SVGElement>('broadcast', 1),
        }
    }
    set_attr<A extends object>(target: SVGElement, attributes: Partial<A>): void {
        const layerName = this.elementLayers.get(target) ?? 'main';
        const paintRole: DiagramTheme.DiagramPaintRole = layerName === 'background'
            ? 'enclosure'
            : 'mark';
        const adapted = DiagramTheme.adaptChangedDrawAttributes(
            attributes, this.settings(), paintRole);
        for (const [key, value] of Object.entries(adapted)) {
            target.style.setProperty(key, value as string);
        }
    }
    set_aux(
        target: SVGElement, 
        aux_attr: Partial<dhd.AuxAttrs>,
        draw_layer: string | dhd.DrawLayer<HTMLDivElement, SVGElement> = 'main',
    ): void {
        const adapted = DiagramTheme.adaptAuxAttributes(aux_attr, this.settings());
        if (adapted.dropShadow) {
            dh.addDropShadow(
                this.getSVGLayer(draw_layer), 
                target);
        } else if (DiagramTheme.usesDarkDiagramTheme(this.settings())) {
            target.style.removeProperty('filter');
        }
    }
    removeElement(target: SVGElement): void {
        // if (this.svg && target) {
        //     target.remove();
        // } else {
        throw new Error('Not Implemented');
        // }
    }
    getSVGLayer(layer: string | dhd.DrawLayer<HTMLDivElement, SVGElement>): SVGSVGElement {
        const layer_name = typeof layer === 'string' ? layer : layer.name;
        const layer_obj = this.get_drawLayer(layer);
        if (!(layer_name in this.drawLayer_svgs)) {
            this.generateSVG(layer_obj);
        }
        return this.drawLayer_svgs[layer_name];
    }
    generateSVG(layer: dhd.DrawLayer<HTMLDivElement, SVGElement>): void {
        const _svg = new_svg(this.parent);
        // TODO: Create a proper buffer
        _svg.style.left = `${OFFSET.x}px`;
        _svg.style.top = `${OFFSET.y}px`;
        _svg.style.width = `${this.parent.getBoundingClientRect().width + 2 * -OFFSET.x}px`;
        _svg.style.height = `${this.parent.getBoundingClientRect().height + 2 * -OFFSET.y}px`;
        _svg.style.zIndex = layer.zIndex.toString();
        this.drawLayer_svgs[layer.name] = _svg;
    }
    update(): void {
        console.log('updating svg');
        Object.entries(this.drawLayer_svgs).forEach(([name, svg]) => {
            svg.remove();
        });
        this.drawLayer_svgs = {};
        this.elementLayers = new WeakMap();
    }
    protected _deltaPolygon(
        points: pt.Point[],
        main_attr: dhd.PolygonAttrs,
        aux_attr: dhd.AuxAttrs,
        draw_layer: string | dhd.DrawLayer<HTMLDivElement, SVGElement> = 'main'
    ): SVGElement {
        points[0] = pt.Point.relative(OFFSET, points[0])[0];
        const layerName = typeof draw_layer === 'string' ? draw_layer : draw_layer.name;
        const paintRole: DiagramTheme.DiagramPaintRole = layerName === 'background'
            ? 'enclosure'
            : 'mark';
        const attributes = DiagramTheme.adaptPolygonAttributes(
            main_attr, this.settings(), paintRole);
        const polygon = dh.deltaPolygon(
            this.getSVGLayer(draw_layer), 
            points, attributes);
        return this.appliedAux(polygon, aux_attr, draw_layer);
    }
    private appliedAux(
        target: SVGElement, 
        aux_attr: Partial<dhd.AuxAttrs>,
        draw_layer: string | dhd.DrawLayer<HTMLDivElement, SVGElement> = 'main',
    ): SVGElement {
        const layerName = typeof draw_layer === 'string' ? draw_layer : draw_layer.name;
        this.elementLayers.set(target, layerName);
        this.set_aux(target, aux_attr, draw_layer);
        return target;
    }
    protected _flatCurve(
        points: pt.Point[],
        main_attr: dhd.LineAttrs,
        aux_attr: dhd.AuxAttrs,
        draw_layer: string | dhd.DrawLayer<HTMLDivElement, SVGElement> = 'main'
    ): SVGElement {
        const [p0, p1] = points;
        return this._curve(Curve.flatCurve(p0, p1), main_attr, aux_attr, draw_layer);
    }

    protected _curve(
        curve: Curve.Curve,
        main_attr: dhd.LineAttrs,
        aux_attr: dhd.AuxAttrs,
        draw_layer: string | dhd.DrawLayer<HTMLDivElement, SVGElement> = 'main'
    ): SVGElement {
        const relativeCurve = curve.relative(OFFSET);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', relativeCurve.pathData());
        dh.setAttributes(path, {
            ...DiagramTheme.adaptLineAttributes(main_attr, this.settings()),
            fill: 'none',
        });
        return this.appliedAux(path, aux_attr, draw_layer);
    }

    protected _circle(
        point: pt.Point,
        main_attr: dhd.CircleAttrs,
        aux_attr: dhd.AuxAttrs,
        draw_layer: string | dhd.DrawLayer<HTMLDivElement, SVGElement> = 'main'
    ): SVGElement {
        const relativePoint = pt.Point.relative(OFFSET, point)[0];
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', relativePoint.x.toString());
        circle.setAttribute('cy', relativePoint.y.toString());
        circle.setAttribute('r', main_attr.radius.toString());
        dh.setAttributes(circle, DiagramTheme.adaptCircleAttributes(
            main_attr, this.settings()));
        return this.appliedAux(circle, aux_attr, draw_layer);
    }

    protected _arcCurve(
        p0: pt.Point, p1: pt.Point,
        radius: number, largeArcFlag: boolean, 
        main_attr: dhd.PolygonAttrs, aux_attr: dhd.AuxAttrs,
        draw_layer: string | dhd.DrawLayer<HTMLDivElement, SVGElement> = 'main'
    ): SVGElement {
        const [relativeP0, relativeP1] = pt.Point.relative(OFFSET, p0, p1);
        const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M ${relativeP0.x} ${relativeP0.y} A ${radius} ${radius} 0 `
            + `${largeArcFlag ? 1:0} 1 ${relativeP1.x} ${relativeP1.y}`;
        arc.setAttribute('d', d);
        dh.setAttributes(arc, DiagramTheme.adaptPolygonAttributes(
            main_attr, this.settings(), 'mark'));
        return arc;
    }

    protected _polyline(
        points: pt.Point[],
        main_attr: dhd.LineAttrs,
        draw_layer: string | dhd.DrawLayer<HTMLDivElement, SVGElement> = 'main',
        mode: dhd.PointsDrawMode = dhd.PointsDrawMode.ABSOLUTE
    ): SVGElement {
        const relativePoints = pt.Point.relative(OFFSET, ...points);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        const points_str = relativePoints.map((point) => `${point.x},${point.y}`).join(' ');
        line.setAttribute('points', points_str);
        dh.setAttributes(line, {
            ...DiagramTheme.adaptLineAttributes(main_attr, this.settings()),
            fill: 'none',
        });
        this.elementLayers.set(line,
            typeof draw_layer === 'string' ? draw_layer : draw_layer.name);
        return line;
    }

    protected _appendDraw(
        target: SVGElement[], 
        draw_layer: string | dhd.DrawLayer<HTMLDivElement, SVGElement> = 'main'): void {
        const svg = this.getSVGLayer(draw_layer);
        if (svg) {
            svg.append(...target);
        } else {
            throw new Error('SVG element not initialized');
        }
    }

}
