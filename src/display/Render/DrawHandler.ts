import { Point, Rectangle } from "../../utilities/Point";
import { Color } from "../../utilities/Color";
import { Curve } from "../../utilities/Curve";
export interface LineAttrs {
    'stroke': string,
    'stroke-width': string,
    'stroke-dasharray'?: string,
}

export const defaultLineAttrs: LineAttrs = {
    'stroke': 'black',
    'stroke-width': '1px',
}

export interface PolygonAttrs extends LineAttrs {
    fill: string,
}

const defaultPolygonAttrs: PolygonAttrs = {
    ...defaultLineAttrs,
    fill: 'none',
}

export interface AuxAttrs {
    dropShadow: boolean,
}

const defaultAuxAttrs: AuxAttrs = {
    dropShadow: false,
}

export interface CircleAttrs extends PolygonAttrs {
    radius: number,
}

const defaultCircleAttrs: CircleAttrs = {
    ...defaultPolygonAttrs,
    radius: 5,
}

export class DrawLayer<T, R = any> {
    constructor(
        public name: string,
        public zIndex: number = 0,
    ) {}
}

export enum PointsDrawMode {
    'DELTA',
    'ABSOLUTE',
    'RELATIVE'
}

export class DrawElement<T=any, R=any, Aux=any> {
    constructor(
        public drawHandler: DrawHandler<T, R>,
        public element: R,
    ) {}
    set_attr(aux: Partial<Aux>) {
        this.drawHandler.set_attr(this.element, aux);
    }
    set_aux(aux: Partial<AuxAttrs>) {
        this.drawHandler.set_aux(this.element, aux);
    }
}

export abstract class DrawHandler<T, R = any> {
    public drawLayers: Record<string, DrawLayer<T, R>> = {
        'main': new DrawLayer<T, R>('main')
    }
    constructor(
    ) {}
    abstract update(): void;
    abstract removeElement(target: R): void;

    get_drawLayer(draw_layer: string | DrawLayer<T, R>): DrawLayer<T, R> {
        if (typeof draw_layer === 'string') {
            if (!(draw_layer in this.drawLayers)) {
                this.drawLayers[draw_layer] = new DrawLayer<T, R>(draw_layer);
            }
            return this.drawLayers[draw_layer];
        }
        if (!(draw_layer.name in this.drawLayers)) {
            this.drawLayers[draw_layer.name] = draw_layer;
        }
        else if (this.drawLayers[draw_layer.name] !== draw_layer) {
            throw new Error(`Draw layer name conflict for layer ${draw_layer.name}`);
        }
        return draw_layer;
    }
    abstract set_attr(target: R, aux: Partial<AuxAttrs>): void;
    abstract set_aux(target: R, aux: Partial<AuxAttrs>): void;
    deltaPolygon(
        points: Point[], 
        main_attr?: Partial<PolygonAttrs>, 
        aux_attr?:  Partial<AuxAttrs>,
        draw_layer: string | DrawLayer<T, R> = 'main'
    ): DrawElement<T, R> {
        const attr = {...defaultPolygonAttrs, ...main_attr};
        const aux  = {...defaultAuxAttrs, ...aux_attr};
        const output = this._deltaPolygon(points, attr, aux, draw_layer);
        this._appendDraw([output], draw_layer);
        return new DrawElement(this, output);
    }
    protected abstract _deltaPolygon(
        points: Point[],
        main_attr: PolygonAttrs, 
        aux_attr: AuxAttrs,
        draw_layer: string | DrawLayer<T, R>
    ): R;
    drawRectangle(
        rect: Rectangle, 
        attrs?: Partial<PolygonAttrs>, 
        aux_attr?: Partial<AuxAttrs>,
        draw_layer: string | DrawLayer<T, R> = 'main'
    ): DrawElement<T, R> {
        return this.deltaPolygon(
            [rect.top_left, 
                {x: rect.dims.x, y: 0}, 
                {x:0, y: rect.dims.y},
                {x: -rect.dims.x, y: 0},],
            attrs, aux_attr, draw_layer
        )
    }
    flatCurve<Attr>(
        points: Point[], 
        main_attr?: Partial<LineAttrs>, 
        aux_attr?:  Partial<AuxAttrs>,
        draw_layer: string | DrawLayer<T, R> = 'main'
    ): DrawElement<T, R> {
        const attr = {...defaultLineAttrs, ...main_attr};
        const aux  = {...defaultAuxAttrs, ...aux_attr};
        const output = this._flatCurve(points, attr, aux, draw_layer);
        this._appendDraw([output], draw_layer);
        return new DrawElement(this, output);
    }
    protected abstract _flatCurve(
        points: Point[], 
        attrs: LineAttrs, 
        aux_attr: AuxAttrs, 
        draw_layer: string | DrawLayer<T, R>): R;

    curve(
        curve: Curve,
        main_attr?: Partial<LineAttrs>,
        aux_attr?: Partial<AuxAttrs>,
        draw_layer: string | DrawLayer<T, R> = 'main'
    ): DrawElement<T, R> {
        const attr = {...defaultLineAttrs, ...main_attr};
        const aux  = {...defaultAuxAttrs, ...aux_attr};
        const output = this._curve(curve, attr, aux, draw_layer);
        this._appendDraw([output], draw_layer);
        return new DrawElement(this, output);
    }

    protected abstract _curve(
        curve: Curve,
        main_attr: LineAttrs,
        aux_attr: AuxAttrs,
        draw_layer: string | DrawLayer<T, R>
    ): R;

    circle(
        point: Point,
        main_attr?: Partial<CircleAttrs>,
        aux_attr?:  Partial<AuxAttrs>,
        draw_layer: string | DrawLayer<T, R> = 'main'
    ): DrawElement<T, R> {
        const attr = {...defaultCircleAttrs, ...main_attr};
        const aux  = {...defaultAuxAttrs, ...aux_attr};
        const output = this._circle(point, attr, aux, draw_layer);
        this._appendDraw([output], draw_layer);
        return new DrawElement(this, output);
    }
    protected abstract _circle(
        point: Point, 
        main_attr: PolygonAttrs, 
        aux_attr: AuxAttrs,
        draw_layer: string | DrawLayer<T, R>
    ): R;
    // public abstract latex(): void;

    arcCurve(
        p0: Point,
        p1: Point,
        radius: number,
        largeArcFlag: boolean,
        main_attr?: Partial<PolygonAttrs>,
        aux_attr?:  Partial<AuxAttrs>,
        draw_layer: string | DrawLayer<T, R> = 'main'
    ): DrawElement<T, R> {
        const attr = {...defaultPolygonAttrs, ...main_attr};
        const aux  = {...defaultAuxAttrs, ...aux_attr};
        const output = this._arcCurve(p0, p1, radius, largeArcFlag, attr, aux, draw_layer);
        this._appendDraw([output], draw_layer);
        return new DrawElement(this, output);
    }
    protected abstract _arcCurve(
        p0: Point, 
        p1: Point, 
        radius: number, 
        largeArcFlag: boolean,
        main_attr: PolygonAttrs, 
        aux_attr: AuxAttrs,
        draw_layer: string | DrawLayer<T, R>
    ): R;

    // How to convert *instructions* into drawn things
    protected abstract _appendDraw(target: R[], draw_layer: string | DrawLayer<T, R>): void;
    // public highlight(target: DiagramElement<T>): R {
    //     const rect = target.renderHandler.getRect(target);
    //     return this.drawRectangle(
    //         rect.top_left, rect.dims,
    //         {fill: 'none', stroke: 'red', 'stroke-width': '2px'}
    //     )
    // }
    polyline(
        points: Point[],
        main_attr?: Partial<LineAttrs>,
        draw_layer: string | DrawLayer<T, R> = 'main',
        mode: PointsDrawMode = PointsDrawMode.ABSOLUTE,
    ): DrawElement<T, R> {
        const attr = {...defaultLineAttrs, ...main_attr};
        const aux = {...defaultAuxAttrs};
        const output = this._polyline(points, attr, draw_layer, mode);
        this._appendDraw([output], draw_layer);
        return new DrawElement(this, output);
    }

    protected abstract _polyline(
        points: Point[],
        main_attr: LineAttrs,
        draw_layer: string | DrawLayer<T, R>,
        mode: PointsDrawMode
    ): R
}