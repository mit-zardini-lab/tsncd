import * as rh from '../Render/RenderHandler';
import * as cat from '../../data_structure/Category';
import {Separated} from '../../utilities/Separated';
import * as cr from './CategoryRenderer';
import * as crs from './CategoryRendererSettings';
import * as ut from '../../utilities/utilities';
import * as pt from '../../utilities/Point';
import * as nm from '../../data_structure/Numeric';
import * as dhd from '../Render/DrawHandler';
import * as utcr from '../../utilities/ConstructorRegistry';
import { Color } from '../../utilities/Color';

/*
 * How an axis is drawn, split out of `AxisAnchor` the way `BlockProcessor` is
 * split out of `BlockBox`: the anchor owns the geometry and the links, the
 * processor owns the paint. An extension that adds an `Axis` subclass carrying
 * something worth showing - a kernel, say - registers a processor for it here
 * instead of subclassing the anchor, which the renderer builds unconditionally
 * and so cannot be swapped out per axis.
 */
export const axesRegistry = new utcr.ConstructorRegistry<
    cat.Axis,
    AxisProcessor<any>,
    [cr.CategoryRenderer<any, any, any>,
     cat.Axis,
     AxisAnchor<any>,
     cat.Array<any, any> | null]
>();

@axesRegistry.registerDefaultClass
export class AxisProcessor<A extends cat.Axis> {
    constructor(
        public categoryRenderer: cr.CategoryRenderer<A, any, A>,
        public axis: A,
        public axisAnchor: AxisAnchor<A>,
        // The array this axis was drawn as part of, when there is one. A lone
        // axis - the ones inside a reindexing node - has none.
        public array: cat.Array<any, A> | null = null,
    ) {}

    get settings() {
        return this.categoryRenderer.settings;
    }

    /*
     * The axis's own colour, or `null` for an axis that has nothing to say -
     * which is every axis in the base category, and is why the default
     * processor reproduces the plain black wire exactly.
     */
    color(): Color | null {
        return null;
    }
    stroke(): string {
        return this.color()?.hex() || 'black';
    }
    stroke_width(): string {
        return '1px';
    }
    curve_attributes(): Partial<dhd.LineAttrs> {
        return {
            'stroke': this.stroke(),
            'stroke-width': this.stroke_width(),
        };
    }
    dot_attributes(): Partial<dhd.CircleAttrs> {
        return {fill: this.stroke(), stroke: this.stroke(), radius: 2};
    }
    annotation_color(): string | undefined {
        return this.color()?.hex();
    }
    annotation_settings(): Partial<rh.AnnotationElementSettings> {
        return {font_size: 0.65, color: this.annotation_color()};
    }
}

export class AxisAnchor<A extends cat.Axis> extends cr.Anchor<A> {
    private annotation?: rh.AnnotationElement;
    private _processor!: AxisProcessor<A>;

    constructor(
        public categoryRenderer: cr.CategoryRenderer<A, any, A>,
        public target: A,
    ) {
        super(categoryRenderer);
        this.setBorderColor('green');
        this.assign_processor(null);
    }

    get processor(): AxisProcessor<A> {
        return this._processor;
    }

    /*
     * Build the processor for this axis and take its paint. Called once from
     * the constructor so that an axis drawn on its own still has one, and again
     * from `ArrayMeridian` once the array is known, so a processor may read the
     * datatype the axis travels with.
     */
    public assign_processor(array: cat.Array<any, A> | null): AxisProcessor<A> {
        this._processor = axesRegistry.getConstructor(this.target)(
            this.categoryRenderer,
            this.target,
            this,
            array,
        ) as AxisProcessor<A>;
        this.curve_attributes = this._processor.curve_attributes();
        // The label takes its colour from the processor, so a processor
        // arriving after the label was built must invalidate it.
        this.annotation = undefined;
        return this._processor;
    }

    protected dot_attributes(): Partial<dhd.CircleAttrs> {
        return this._processor.dot_attributes();
    }

    public getAnnotation(): rh.AnnotationElement {
        if (!this.annotation) {
            const name = this.target._size instanceof nm.Integer ?
                this.target._size._value.toString() :
                this.target.uid._name?.to_latex() || '';
            this.annotation = new rh.AnnotationElement(
                this.renderHandler,
                name,
                this._processor.annotation_settings(),
            )
        }
        return this.annotation;
    }

    public update(): void {
        if (!this.skipped() && (this.prior_terminal().length > 1 || this.next_terminal().length > 1)) {
            this.add_dot = true;
        }
        super.update();
    }
}

export class NodeAnchor<A extends cat.Axis> extends cr.Anchor<A> {
    constructor(
        public categoryRenderer: StrideRenderer<A>,
    ) {
        super(categoryRenderer);
    }
}

class StrideMorphismBox<A extends cat.Axis> extends cr.MorphismBox<A, cat.StrideMorphism<A>, A> {
    public central_node: NodeAnchor<A>;
    public annotation?: rh.AnnotationElement;
    get settings(): crs.StrideRendererSettings<A> {
        return this.categoryRenderer.settings;
    }
    constructor(
        public categoryRenderer: StrideRenderer<A>,
        public target: cat.StrideMorphism<A>,
    ){
        super(categoryRenderer, target);
        this.left_anchors = this.categoryRenderer.display_prod_object(this.target.dom());
        this.right_anchors = this.categoryRenderer.display_prod_object(this.target.cod());
        this.swap_anchors();
        this.central_node = new NodeAnchor(this.categoryRenderer);
        this.left_anchors.anchors.forEach((anchor) => anchor.link(this.central_node));
        this.right_anchors.anchors.forEach((anchor) => this.central_node.link(anchor));
        
        if (target.name) {
            this.annotation = new rh.AnnotationElement(
                this.renderHandler,
                this.target.name?.to_latex() || '',
            );
        }
        this.children = [
            this.left_anchors,
            new rh.CoreElement(this.renderHandler, {x:this.settings.reindexing_width / 2,y:0}),
            this.central_node,
            new rh.CoreElement(this.renderHandler, {x:this.settings.reindexing_width / 2,y:0}),
            this.right_anchors,
        ];
        this.setBorderColor('magenta');
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        const hexagon_height = this.settings.reindexing_hexagon_y;
        const hexagon_width = this.settings.reindexing_hexagon_x;
        this.renderHandler.draw_handler?.deltaPolygon(
            [
                rect.getLocation({x: 0, y: 0.5}),
                {x: hexagon_width, y: hexagon_height},
                {x: rect.width - 2 * hexagon_width, y: 0},
                {x: hexagon_width, y: -hexagon_height},
                {x: -hexagon_width, y: -hexagon_height},
                {x: 2*hexagon_width - rect.width, y: 0},
            ],
            {fill: 'red', stroke: 'black'},
            {dropShadow: true},
        );

        if (this.annotation) {
            this.renderHandler.annotation_handler.addAnnotation(
                rect,
                this.annotation,
            );
        }
    }
}

export class StrideRenderer<A extends cat.Axis> extends cr.CategoryRenderer<A, cat.StrideMorphism<A>> {
    public settings: crs.StrideRendererSettings<A>;
    constructor(
        public renderHandler: rh.RenderHandler,
        _settings: Partial<crs.StrideRendererSettings<A>> = {},
    ) {
        super(renderHandler, _settings);
        this.settings = {
            ...crs.DefaultStrideRendererSettings,
            // @ts-ignore: ts(2855)
            ...super.settings,
        }
    }

    public display_lone(target: A): AxisAnchor<A> {
        return new AxisAnchor(this, target);
    }
    public display_prod_object(target: cat.ProdObject<A>): cr.ProdObjectMeridian<A> {
        return new cr.ProdObjectMeridian(this, target);
    }
    public display_morphism(target: cat.StrideMorphism<A>): StrideMorphismBox<A> {
        return new StrideMorphismBox(this, target);
    }
}