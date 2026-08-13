import { 
    DrawHandler,
    PolygonAttrs,
    LineAttrs,
    AuxAttrs,
    CircleAttrs,
    DrawLayer,
    PointsDrawMode
 } from "../Render/DrawHandler";
// import { SVGHTMLRenderHandler, HTMLSVGDrawHandler } from "./svgRenderHandler";
import * as dh from '../draw_helper/draw_helpers';
import { Point } from "../../utilities/Point";
import * as Curve from "../../utilities/Curve";
// import { morphismRegistry } from "./elements/diagram_boxes";

export function new_svg(parent: HTMLElement): SVGSVGElement {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.position = 'absolute';
    svg.style.zIndex = '5';
    svg.style.left = `0px`;
    svg.style.top = '0px';
	parent.appendChild(svg);
	return svg;
}

const BUFFER: number = 10;
const OFFSET: Point = {x: -BUFFER, y: -BUFFER};
export class HTMLDrawHandler extends DrawHandler<HTMLDivElement, SVGElement> {
    private drawLayer_svgs: Record<string, SVGSVGElement> = {};
    constructor(
        private parent: HTMLDivElement,
    ) {
        super();
        this.drawLayers = {
            'background': new DrawLayer<HTMLDivElement, SVGElement>('background', -1),
            'main': new DrawLayer<HTMLDivElement, SVGElement>('main', 0),
        }
    }
    set_attr<A>(target: SVGElement, aux: Partial<A>): void {
        for (const [key, value] of Object.entries(aux)) {
            target.style.setProperty(key, value as string);
        }
    }
    set_aux(
        target: SVGElement, 
        aux_attr: Partial<AuxAttrs>,
        draw_layer: string | DrawLayer<HTMLDivElement, SVGElement> = 'main') {
        if (aux_attr.dropShadow) {
            dh.addDropShadow(
                this.getSVGLayer(draw_layer), 
                target);
        }
    }
    removeElement(target: SVGElement): void {
        // if (this.svg && target) {
        //     target.remove();
        // } else {
        throw new Error('Not Implemented');
        // }
    }
    getSVGLayer(layer: string | DrawLayer<HTMLDivElement, SVGElement>): SVGSVGElement {
        const layer_name = typeof layer === 'string' ? layer : layer.name;
        const layer_obj = this.get_drawLayer(layer);
        if (!(layer_name in this.drawLayer_svgs)) {
            this.generateSVG(layer_obj);
        }
        return this.drawLayer_svgs[layer_name];
    }
    generateSVG(layer: DrawLayer<HTMLDivElement, SVGElement>): void {
        const _svg = new_svg(this.parent);
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
    }
    protected _deltaPolygon(
        points: Point[],
        main_attr: PolygonAttrs,
        aux_attr:  AuxAttrs,
        draw_layer: string | DrawLayer<HTMLDivElement, SVGElement> = 'main'
    ) {
        points[0] = Point.relative(OFFSET, points[0])[0];
        const polygon = dh.deltaPolygon(
            this.getSVGLayer(draw_layer), 
            points, main_attr);
        return this.appliedAux(polygon, aux_attr, draw_layer);
    }
    private appliedAux(
        target: SVGElement, 
        aux_attr: Partial<AuxAttrs>,
        draw_layer: string | DrawLayer<HTMLDivElement, SVGElement> = 'main') {
        if (aux_attr.dropShadow) {
            dh.addDropShadow(
                this.getSVGLayer(draw_layer), 
                target);
        }
        return target;
    }
    // @ts-ignore
    protected _flatCurve(
        points: Point[], 
        main_attr: LineAttrs,
        aux_attr : AuxAttrs,
        draw_layer: string | DrawLayer<HTMLDivElement, SVGElement> = 'main'
    ) {
        const [p0, p1] = points; //Point.relative(OFFSET, ...points);
        return this._curve(Curve.flatCurve(p0, p1), main_attr, aux_attr, draw_layer);
    }

    protected _curve(
        curve: Curve.Curve,
        main_attr: LineAttrs,
        aux_attr: AuxAttrs,
        draw_layer: string | DrawLayer<HTMLDivElement, SVGElement> = 'main'
    ): SVGElement {
        const relativeCurve = curve.relative(OFFSET);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', relativeCurve.pathData());
        dh.setAttributes(path, {...main_attr, fill: 'none'});
        return this.appliedAux(path, aux_attr, draw_layer);
    }

    protected _circle(
        point: Point, 
        main_attr: CircleAttrs, 
        aux_attr: AuxAttrs,
        draw_layer: string | DrawLayer<HTMLDivElement, SVGElement> = 'main'
    ): SVGElement {
        //const circle = dh.drawCircle(this.svg, point, main_attr);
        point = Point.relative(OFFSET, point)[0];
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', point.x.toString());
        circle.setAttribute('cy', point.y.toString());
        circle.setAttribute('r', main_attr.radius.toString());
        dh.setAttributes(circle, main_attr);
        return this.appliedAux(circle, aux_attr, draw_layer);
    }

    protected _arcCurve(
        p0: Point, p1: Point, 
        radius: number, largeArcFlag: boolean, 
        main_attr: PolygonAttrs, aux_attr: AuxAttrs,
        draw_layer: string | DrawLayer<HTMLDivElement, SVGElement> = 'main'
    ): SVGElement {
        [p0, p1] = Point.relative(OFFSET, p0, p1);
        const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M ${p0.x} ${p0.y} A ${radius} ${radius} 0 ${largeArcFlag ? 1:0} 1 ${p1.x} ${p1.y}`;
        arc.setAttribute('d', d);
        dh.setAttributes(arc, main_attr);
        return arc;
    }

    protected _polyline(
        points: Point[],
        main_attr: LineAttrs,
        draw_layer: string | DrawLayer<HTMLDivElement, SVGElement> = 'main',
        mode: PointsDrawMode = PointsDrawMode.ABSOLUTE
    ): SVGElement {
        points = Point.relative(OFFSET, ...points);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        const points_str = points.map((p) => `${p.x},${p.y}`).join(' ');
        line.setAttribute('points', points_str);
        dh.setAttributes(line, {...main_attr, fill: 'none'});
        return line;
    }

    protected _appendDraw(
        target: SVGElement[], 
        draw_layer: string | DrawLayer<HTMLDivElement, SVGElement> = 'main'): void {
        const svg = this.getSVGLayer(draw_layer);
        if (svg) {
            svg.append(...target);
        } else {
            throw new Error('SVG element not initialized');
        }
    }

}