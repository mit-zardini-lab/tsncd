import * as rh from '../Render/RenderHandler';
import * as cat from '../../data_structure/Category';
import * as ut from '../../utilities/utilities';
import * as dhd from '../Render/DrawHandler';
import * as crs from './CategoryRendererSettings';
import * as pt from '../../utilities/Point';
import * as nm from '../../data_structure/Numeric'
import * as nmr from './NumericRenderer';
import * as utcr from '../../utilities/ConstructorRegistry';

import { Separated } from '../../utilities/Separated';
import { Color } from '../../utilities/Color';

// The settings are:
// - L (the long objects of the category)
// - M (the base morphism of the category)
// - A (the anchor type of the category, defaults to L)

// OBJECTS
export abstract class Meridian<A> extends rh.DiagramElement {
    public anchors: Anchor<A>[] = [];
    constructor(
        public categoryRenderer: CategoryRenderer<any, any, A>,
    ) {
        super(categoryRenderer.renderHandler);
    }
    get settings() {
        return this.categoryRenderer.settings;
    }
    public link(next: Meridian<A>, reversed: boolean = false): void {
        if (reversed) {
            return next.link(this, false);
        }
        ut.zip(
            this.anchors, next.anchors).map(
            ([a1, a2]) => a1.anchor_link(a2)
        );
    }
    static generic_link<A>(left: Meridian<A> | Anchor<A>[], right: Meridian<A> | Anchor<A>[]): void {
        const left_anchors = left instanceof Meridian ? left.anchors : left;
        const right_anchors = right instanceof Meridian ? right.anchors : right;
        ut.zip(
            left_anchors, right_anchors).map(
            ([a1, a2]) => a1.anchor_link(a2)
        );
    }
    public enableAnnotation(): void {}
}
export abstract class Anchor<A> extends Meridian<A> {
    public further: Anchor<A>[] = [];
    protected prior: Anchor<A>[] = [];

    protected curve_attributes: Partial<dhd.LineAttrs> = {}; 
    constructor(
        public categoryRenderer: CategoryRenderer<any, any, A>,
    ){
        super(categoryRenderer);
        this.children = [new rh.CoreElement(
            this.renderHandler, 
            {x: 0, y: this.settings.anchor_height})];
        this.anchors = [this];
    }
    public anchor_link(target: Anchor<A>): void {
        this.further.push(target);
        target.prior.push(this);
    }

    // SKIP MANAGEMENT
    private _allow_skip: boolean = true;
    private _loose: boolean = false;
    get loose(): boolean {
        return this._loose;
    }
    set loose(value: boolean) {
        this._loose = value;
    }
    get allow_skip(): boolean {
        return this._allow_skip;
    }
    set allow_skip(value: boolean) {
        this._allow_skip = value;
    }
    public skipped(): boolean {
        return this.loose && this.allow_skip && this.prior.length > 0;
    }

    private _add_dot: boolean = false;
    set add_dot(value: boolean) {
        this._add_dot = value;
    }

    /*
     * The deletion dot belongs to the wire it sits on, so a subclass that
     * colours its wire can colour the dot to match rather than leaving a black
     * mark on a coloured line. Stroke is given explicitly alongside fill:
     * `defaultCircleAttrs` would otherwise put a black 1px outline on a dot of
     * radius 2, which is most of the dot.
     */
    protected dot_attributes(): Partial<dhd.CircleAttrs> {
        return {fill: 'black', stroke: 'black', radius: 2};
    }

    update(): void {
        if (this.skipped()) {
            return;
        }
        if (this._add_dot) {
            this.draw?.circle(
                this.rectangle().midpoint(),
                this.dot_attributes()
            )
        }
        for (const next of this.next_terminal()) {
            this.renderHandler.draw_handler!.flatCurve(
                [this.location()!, next.location()!],
                {...this.curve_attributes}
            )
        }
    }


    private next_terminal_poll(): Anchor<A>[] {
        if (this.skipped() && this.further.length > 0) {
            return this.further.flatMap((a) => a.next_terminal_poll());
        }
        return [this];
    }
    public next_terminal(): Anchor<A>[] {
        return this.further.flatMap(
            (a) => a.next_terminal_poll()
        );
    }

    private prior_terminal_poll(): Anchor<A>[] {
        if (this.skipped() && this.prior.length > 0) {
            return this.prior.flatMap((a) => a.prior_terminal_poll());
        }
        return [this];
    }
    public prior_terminal(): Anchor<A>[] {
        return this.prior.flatMap(
            (a) => a.prior_terminal_poll()
        );
    }

    public getAnnotation(): rh.AnnotationElement | undefined {
        return undefined;
    }
}
export class SeparatorAnchor<A> extends Anchor<A> {
    constructor(
        public categoryRenderer: CategoryRenderer<any, any, A>,
    ) {
        super(categoryRenderer);
        this.curve_attributes = this.settings.separator_settings?.separator_curve_attributes || {};
        this.setBorderColor('red');
    }
}

export class ConcatMeridian<A> extends Meridian<A> {
    constructor(
        public categoryRenderer: CategoryRenderer<any, any, A>,
        public content: Meridian<A>[],
    ) {
        super(categoryRenderer);
        this.anchors = this.content.flatMap((x) => x.anchors);
    }
}

export class ProdObjectMeridian<L, A=L> extends Meridian<A> {
    public lone_elements: Meridian<A>[];
    public separated?: Separated<Meridian<A>, SeparatorAnchor<A>>;
    constructor(
        public categoryRenderer: CategoryRenderer<L, any, A>,
        public target: cat.ProdObject<L> | Meridian<A>[],
        public no_separator: boolean = false,
    ) {
        super(categoryRenderer);
        if (target instanceof cat.ProdObject) {
            this.lone_elements = target.map(
                (l) => this.categoryRenderer.display_lone(l)
            );
        } else {
            this.lone_elements = target;
        }
        let content: Meridian<A>[];
        if (!this.no_separator && this.settings.separator_settings) {
            this.separated = new Separated(
                this.lone_elements,
                () => new SeparatorAnchor<A>(this.categoryRenderer),
            );
            content = this.separated.content;
        } else {
            content = this.lone_elements;
        }
        this.children = [new rh.Vertical(this.renderHandler, content)];
        this.anchors = content.flatMap((x) => x.anchors);
    }
    public enableAnnotation(): void {
        this.lone_elements.forEach((el) => el.enableAnnotation());
    }
}

/*
    MORPHISMS
*/
export abstract class AnchoredBox<A> extends rh.DiagramElement {
    public left_anchors!: Meridian<A>;
    public right_anchors!: Meridian<A>;
    constructor(
        public categoryRenderer: CategoryRenderer<any, any, A>,
    ) {
        super(categoryRenderer.renderHandler);
    }
    get settings() {
        return this.categoryRenderer.settings;
    }
    public swap_anchors(): void {
        if (this.settings.reversed) {
            [this.left_anchors, this.right_anchors] = [this.right_anchors, this.left_anchors];
        }
    }
}
export abstract class MorphismBox<L, M extends cat.Morphism<L>, A=L> extends AnchoredBox<A> {
    public left_anchors!: ProdObjectMeridian<L, A>;
    public right_anchors!: ProdObjectMeridian<L, A>;
    constructor(
        public categoryRenderer: CategoryRenderer<L, M, A>,
        public target: cat.ProdCategory<L, M>,
        public build: boolean = true,
    ) {
        super(categoryRenderer);
    }
    get settings() {
        return this.categoryRenderer.settings;
    }
    highlight(): void {}
    dehighlight(): void {}
}

// Placeholder for Morphisms
class DefaultMorphismBox<L, M extends cat.Morphism<L>, A=L> extends MorphismBox<L, M, A> {
    constructor(
        public categoryRenderer: CategoryRenderer<L, M, A>,
        public target: cat.ProdCategory<L, M>,
        public build: boolean = true,
    ) {
        super(categoryRenderer, target, build);
        this.left_anchors = this.categoryRenderer.display_prod_object(this.target.dom());
        this.right_anchors = this.categoryRenderer.display_prod_object(this.target.cod());
        if (this.settings.reversed) {
            console.log('reverse!');
            const placeholder = this.left_anchors;
            this.left_anchors = this.right_anchors;
            this.right_anchors = placeholder;
        }
        this.children = [
            this.left_anchors,
            new rh.CoreElement(this.renderHandler, {x:50,y:50}),
            this.right_anchors,
        ];
        this.setBorderColor('black');
    }
}

export const blocksRegistry = new utcr.ConstructorRegistry<
    cat.BlockAesthetics | null,
    BlockProcessor,
    [CategoryRenderer<any, any, any>, cat.BlockAesthetics | null, MorphismBox<any, any, any>]
>();

@blocksRegistry.registerDefaultClass
export class BlockProcessor<T extends cat.BlockAesthetics | null=cat.BlockAesthetics> {
    constructor(
        public categoryRenderer: CategoryRenderer<any, any, any>,
        public aesthetics: T,
        public morphismBox: MorphismBox<any, any, any>
    ) {}

    get settings() {
        return this.categoryRenderer.settings;
    }

    placement_padding(): pt.Point {
        return this.settings.block_padding;
    }
    rectangle_padding(): pt.Point {
        return {x: 0, y: 0};
    }
    fill_color(): string {
        return this.aesthetics?.fill_color || 'none';
    }
    fill_color_dark(): string {
        return Color.from_h360sv(Color.from_hex(this.fill_color()).hue360, 1, 0.5).hex();
    }
    fill_color_highlight(): string {
        const color = Color.from_hex(this.fill_color());
        const highlight_color = Color.from_h360sv(
            color.hue360, 0.5, 1
        );
        return highlight_color.hex();
    }
    stroke(): string {
        return 'none'
    }
    polygon_aux_attrs(): [Partial<dhd.PolygonAttrs>, Partial<dhd.AuxAttrs>] {
        return [
            { 
                fill: this.fill_color(), 
                stroke: this.stroke(),
            },
            {dropShadow: true}
        ]
    }
}

// export class CollapsedBlockBox<L, M extends cat.Morphism<L>, A=L>
//     extends MorphismBox<L, M, A> {
//     constructor(
//         public categoryRenderer: CategoryRenderer<L, M, A>,
//         public target: cat.Block<L, cat.ProdCategory<L, M>>,
//     ) {
//         super(categoryRenderer, target);
//     }
// }

export class BlockBox<L, M extends cat.Morphism<L>, A=L> extends MorphismBox<L, M, A> {
    private outer_box: rh.DiagramElement;
    private inner_box: MorphismBox<L, cat.ProdCategory<L, M>, A>;
    private iteration_annotation?: rh.AnnotationElement;
    private processor: BlockProcessor;
    constructor(
        public categoryRenderer: CategoryRenderer<L, M, A>,
        public target: cat.Block<L, cat.ProdCategory<L, M>>,
        public capped: boolean = true,
        _inner_box?: MorphismBox<L, cat.ProdCategory<L, M>, A>,
    ) {
        super(categoryRenderer, target);
        this.inner_box = _inner_box ?? this.categoryRenderer.display_category(
            target.body, capped);
        this.left_anchors = this.inner_box.left_anchors;
        this.right_anchors = this.inner_box.right_anchors;

        this.categoryRenderer.referencesHandler.add_to_collection(this.target.block_tag, this);

        this.processor = blocksRegistry.getConstructor(target.block_tag.aesthetics)(
            categoryRenderer, target.block_tag.aesthetics, this
        );
        const padding = this.processor.placement_padding();
        this.outer_box = new rh.CoreElement(
            this.renderHandler,
            {
                x: this.inner_box.dims.x + padding.x,
                y: this.inner_box.dims.y + padding.y,
            },
            [this.inner_box]
        );
        this.inner_box.transform.offset = {
            x: padding.x / 2, 
            y: padding.y / 2};
        this.children = [this.outer_box];
        this.setBorderColor('red');
        this.right_anchors.anchors.forEach((a) => a.allow_skip = false);
    }

    private core_rectangle: dhd.DrawElement<any> | undefined;

    protected draw_core(): void {
        if (!this.target.aesthetics) {
            return;
        }
        if (this.target.aesthetics.title) {
            this.renderHandler.annotation_handler.addAnnotation(
                this.rectangle(),
                new rh.AnnotationElement(
                    this.renderHandler,
                    `\\text{${this.target.aesthetics.title || ''}}`,
                    {font_size: 0.5,
                    vertical_align: 'start',
                    horizontal_align: 'center'
                    }
                )
            );
        }
        this.core_rectangle = this.draw?.drawRectangle(
            this.rectangle().pad(this.processor.rectangle_padding()),
            ...this.processor.polygon_aux_attrs(),
            'background'
        );
    }
    highlight(): void {
        this.core_rectangle?.set_attr({fill: this.processor.fill_color_highlight()});
    }
    dehighlight(): void {
        this.core_rectangle?.set_attr({fill: this.processor.fill_color()});
    }

    protected draw_left_bracket(): void {
        const rect = this.rectangle();
        const bracket_depth: number = 5;
        this.iteration_annotation = this.iteration_annotation ??
            new rh.AnnotationElement(
                this.renderHandler,
                nmr.numeric_string(this.target.repetition) || '',
                {font_size: 1, vertical_align: 'center', horizontal_align: 'center'}
            );
        this.iteration_annotation?.place(
            new pt.Rectangle(
                {x: rect.left - 20, y: rect.top},
                {x: 20, y: 20}
            )
        );
        this.draw?.polyline(
            [
                {x: rect.left + bracket_depth, y: rect.top},
                {x: rect.left, y: rect.top + bracket_depth},
                {x: rect.left, y: rect.bottom - bracket_depth},
                {x: rect.left + bracket_depth, y: rect.bottom},
            ],
            {stroke: 'black', 'stroke-width': '3px'},
            'main'
        )
    }
    protected draw_right_bracket(): void {
        const rect = this.rectangle();
        const bracket_depth: number = 5;
        this.draw?.polyline(
            [
                {x: rect.right - bracket_depth, y: rect.top},
                {x: rect.right, y: rect.top + bracket_depth},
                {x: rect.right, y: rect.bottom - bracket_depth},
                {x: rect.right - bracket_depth, y: rect.bottom}
            ],
            {stroke: 'black', 'stroke-width': '3px'},
            'main'
        )
    }
    super_update(): void {
        super.update();
    }
    update(): void {
        if (!this.target.aesthetics) {
            super.update();
            return;
        }
        this.draw_core();
        super.update();
        if ((this.target.repetition instanceof nm.Integer)
            && (this.target.repetition._value === 1)) {
            return;
        }
        this.draw_left_bracket();
        this.draw_right_bracket();
    }
}

/*
    COMPOSED RENDERING
*/
export class ComposedGap<L, A=L> extends AnchoredBox<A> {
    constructor(
        public categoryRenderer: CategoryRenderer<L, any, A>,
        public dom: Meridian<A>,
        public cod: Meridian<A>,
        target_width?: number,
        public annotated: boolean = true,
    ) {
        super(categoryRenderer);
        this.left_anchors = dom;
        this.right_anchors = cod;
        for (const [left, right] of this.aligned_anchors()) {
            left.link(right);
        }
        const dims = {
            x: target_width ?? this.settings.composed_gap_dims.x,
            y: this.settings.composed_gap_dims.y,
        }
        this.children = [new rh.CoreElement(
            this.renderHandler, 
            dims
        )];
        this.height = Math.max(
            this.settings.anchor_height * this.left_anchors.anchors.length,
            this.settings.anchor_height * this.right_anchors.anchors.length);
        
        this.setBorderColor('blue');
    }
    set width(value: number) {
        this._width = value;
        this.children[0].width = value;
    }

    aligned_anchors(): [Anchor<A>, Anchor<A>][] {
        const left_anchors = this.left_anchors.anchors;
        const right_anchors = this.right_anchors.anchors;
        let i = 0, j = 0;
        const aligned_anchors: [Anchor<A>, Anchor<A>][] = [];
        while (i < left_anchors.length && j < right_anchors.length) {
            let left_anchor = left_anchors[i];
            let right_anchor = right_anchors[j];
            if (left_anchor instanceof SeparatorAnchor && !(right_anchor instanceof SeparatorAnchor)) {
                i++;
                continue;
            }
            if (!(left_anchor instanceof SeparatorAnchor) && (right_anchor instanceof SeparatorAnchor)) {
                j++;
                continue;
            }
            i++; j++;
            aligned_anchors.push([left_anchor, right_anchor]);
        }
        return aligned_anchors;
    }
    
    update(): void {
        super.update();
        if (this.annotated) {
            this.update_anchor_annotations();
        }
    }

    protected update_anchor_annotations(): void {
        const this_rect = this.rectangle();
        for (const [left_anchor, right_anchor] of this.aligned_anchors()) {
            const left_align = !left_anchor.skipped();
            const top_left = 
                left_align
                ? left_anchor.rectangle().top_left
                : pt.Point.mulsum(
                    right_anchor.rectangle().top_left,
                    [-1, {x: this_rect.width, y: 0}]
                )
            const dims = {
                x: this_rect.width,
                y: this.settings.anchor_height,
            }
            const annotation_rect = new pt.Rectangle(
                {x: top_left.x + 3*(left_align ? 0 : -1), 
                 y: top_left.y-7},
                dims
            )
            const annotation = 
                   left_anchor.getAnnotation() 
                ?? right_anchor.getAnnotation();
            if (annotation?.annotationSettings) {
                annotation.annotationSettings.horizontal_align = 
                    left_align ? 'left' : 'right';
            }
            if (annotation) {
                this.renderHandler.annotation_handler.addAnnotation(
                    annotation_rect,
                    annotation,
                )
            }
        }
    }

    static make_composed_gap<L, A=L>(
        categoryRenderer: CategoryRenderer<L, any, A>,
        left: AnchoredBox<A>,
        right: AnchoredBox<A>,
    ): ComposedGap<L, A> {
        const dom = left.right_anchors;
        const cod = right.left_anchors;
        const left_height = left.dims.y ?? 0;
        const right_height = right.dims.y ?? 0;
        //if (categoryRenderer.settings.loose_link) {
        if (left_height < right_height) {
            dom.anchors.forEach(
                (a) => {
                    a.loose = true;
                    a.aux.borderColor = 'pink';
                }

            );
        } else if (right_height < left_height) {
            cod.anchors.forEach(
                (a) => {
                    a.loose = true;
                    a.aux.borderColor = 'pink';
                }
            );
        }
        //}
        return new ComposedGap(
            categoryRenderer,
            dom,
            cod,
        )
    }
}
export class ComposedBox<L, M extends cat.Morphism<L>, A=L> extends MorphismBox<L, M, A> {
    private content: MorphismBox<L, M, A>[];
    private separated_content: Separated<MorphismBox<L, M, A>, ComposedGap<L, A>>;
    constructor(
        public categoryRenderer: CategoryRenderer<L, M, A>,
        public target: cat.Composed<L, cat.ProdCategory<L, M>>,
        public capped: boolean = true,
        _content?: MorphismBox<L, M, A>[],
    ) {
        super(categoryRenderer, target);

        this.content = _content ?? target.content.map(
            (item) => categoryRenderer.display_category(
                item, false)
        );
        if (this.settings.reversed) {
            this.content.reverse();
        }
        let caps: undefined | [ComposedGap<L, A>, ComposedGap<L, A>] = undefined;
        if (this.capped) {
            this.left_anchors = categoryRenderer.display_prod_object(
                target.dom()
            );
            this.right_anchors = categoryRenderer.display_prod_object(
                target.cod()
            );
            this.swap_anchors();
            caps = [
                new ComposedGap(
                    categoryRenderer, 
                    this.left_anchors, 
                    this.content[0].left_anchors),
                new ComposedGap(
                    categoryRenderer, 
                    this.content[this.content.length - 1].right_anchors, 
                    this.right_anchors)
                ];
        }
        else {
            this.left_anchors = this.content[0].left_anchors;
            this.right_anchors = this.content[this.content.length - 1].right_anchors;
        }

        this.separated_content = new Separated(
            this.content,
            (i?: number) => ComposedGap.make_composed_gap(
                this.categoryRenderer,
                this.content[i!],
                this.content[i!+1]
            ),
            caps,
        );
        this.children = [
            ...(this.capped ? [this.left_anchors] : []),
            ...this.separated_content.content,
            ...(this.capped ? [this.right_anchors] : []),
        ];
        this.setBorderColor('orange', true);

        // this.children.forEach((c) => {
        //     if (c instanceof ProductBox) {
        //         c.height = this.dims.y;
        //     }
        // });
    }
}

/*
 PRODUCT RENDERING
*/
class ProductGap<L, A=L> extends AnchoredBox<A> {
    constructor(
        public categoryRenderer: CategoryRenderer<L, any, A>,
        public target_width: number = categoryRenderer.settings.product_gap_width ?? 20,
    ) {
        super(categoryRenderer);
        this.left_anchors =  new SeparatorAnchor<A>(categoryRenderer);
        this.right_anchors = new SeparatorAnchor<A>(categoryRenderer);
        (this.left_anchors as SeparatorAnchor<A>).allow_skip = false;
        (this.right_anchors as SeparatorAnchor<A>).allow_skip = false;
        this.left_anchors.link(this.right_anchors);
        this.children = [
            this.left_anchors,
            new rh.CoreElement(this.renderHandler, 
                {x:target_width,
                y:undefined}),
            this.right_anchors,
        ];
        this.setBorderColor('green');
    }
}

export class SpreadBox<L, M extends cat.Morphism<L>, A=L> extends MorphismBox<L, M, A> {
    public left_cap: ComposedGap<L, A>;
    public right_cap: ComposedGap<L, A>;
    constructor(
        public categoryRenderer: CategoryRenderer<L, M, A>,
        public target: cat.ProdCategory<L, M>,
        public body: MorphismBox<L, M, A>,
        public target_width: number | undefined,
        public annotated: boolean = false,
    ) {
        super(categoryRenderer, target);
        const cap_width = 
            this.target_width 
            ? (this.target_width - this.body.dims.x!) / 2
            : this.settings.composed_gap_dims.x;
        this.left_anchors = categoryRenderer.display_prod_object(
            this.target.dom()
        );
        this.right_anchors = categoryRenderer.display_prod_object(
            this.target.cod()
        );
        this.swap_anchors();
        this.left_cap = new ComposedGap(
            categoryRenderer,
            this.left_anchors,
            this.body.left_anchors,
            cap_width,
            annotated,
        );
        this.right_cap = new ComposedGap(
            categoryRenderer,
            this.body.right_anchors,
            this.right_anchors,
            cap_width,
            annotated,
        )
        this.children = [
            this.left_anchors,
            this.left_cap,
            this.body,
            this.right_cap,
            this.right_anchors,
        ]
        this.left_anchors.anchors.forEach((a) => a.allow_skip = false);
        this.right_anchors.anchors.forEach((a) => a.allow_skip = false);
    }
}

export class ProductBox<L, M extends cat.Morphism<L>, A=L> extends MorphismBox<L, M, A> {
    constructor(
        public categoryRenderer: CategoryRenderer<L, M, A>,
        public target: cat.ProductOfMorphisms<L, cat.ProdCategory<L,M>>,
        capped: boolean = true,
        _morphisms?: MorphismBox<L, M, A>[],
    ) {
        super(categoryRenderer, target);
        let morphisms = _morphisms ?? this.target.content.map(
            (item) => categoryRenderer.display_category(
                item, 
                capped && this.settings.cap_products)
        );
        const max_component_width = Math.max(
            ...morphisms.map((m) => m.dims.x ?? 0)
        );
        const target_width = Math.max(
            0,
            max_component_width * this.settings.product_reduction_m,
            max_component_width - this.settings.product_reduction_c
        );
        morphisms = morphisms.map(
            (m) => (m.dims.x >= target_width) ?
                m :
                new SpreadBox(
                    this.categoryRenderer,
                    m.target,
                    m,
                    target_width
                )
        )
        let content: AnchoredBox<A>[];
        if (this.categoryRenderer.settings.separator_settings !== undefined) {
            content = new Separated(
                morphisms, 
                () => new ProductGap<L, A>(
                    this.categoryRenderer, 
                    target_width)
            ).content;
        }
        else {
            content = morphisms;
        }
        this.left_anchors = new ProdObjectMeridian(
            this.categoryRenderer, content.map((x) => x.left_anchors), true);
        this.right_anchors = new ProdObjectMeridian(
            this.categoryRenderer, content.map((x) => x.right_anchors), true);
        this.children = [new rh.Vertical(
            this.renderHandler, content
        )];
        this.setBorderColor('#50E3C2', true);
    }
    set height(value: number | undefined) {
        this._height = value;
        this.children.forEach((c) => {
            c.height = value;
        })
    }
}

/*
    REARRANGEMENT RENDERING
*/

class RearrangementBox<L, A=L> extends MorphismBox<L, any, A> {
    public core: rh.CoreElement;
    constructor(
        public categoryRenderer: CategoryRenderer<L, any, A>,
        public target: cat.Rearrangement<L>,
    ) {
        super(categoryRenderer, target);
        this.left_anchors =  categoryRenderer.display_prod_object(target.dom());
        this.right_anchors = categoryRenderer.display_prod_object(target.cod());
        this.setup_links();
        this.swap_anchors();
        this.core = new rh.CoreElement(
            this.renderHandler, {x:this.settings.rearrangement_width}
        );
        this.children = [this.left_anchors, this.core, this.right_anchors];
        this.setBorderColor('yellow');
    }
    setup_links(): void {
        // Setup lone element links
        const doms = this.left_anchors.lone_elements;
        const cods = this.right_anchors.lone_elements;
        const mapping = this.target.mapping;
        const dom_cod_pairs = cods.map(
            (cod, i) => 
                [doms[mapping[i]],
                 cod]
        );
        dom_cod_pairs.forEach(
            ([dom, cod]) => dom.link(cod, this.settings.reversed)
        );
        // Add dots to skipped doms. Above the separator guard below, not after
        // it: a deletion is a deletion whether or not the renderer draws
        // separators, and the StrideRenderer - which is what reindexings are
        // drawn with - sets none, so anything past that return never runs here.
        doms.forEach((dom, i) => {
            if (mapping.filter((j) => (i == j)).length == 0) {
                dom.anchors.forEach((anchor) => {anchor.add_dot = true});
            }
        });
        // Setup separator links
        if (!this.settings.separator_settings) {
            return;
        }
        /*
         * A separator may only cross the box where it still separates the same
         * cells on both sides. `deconcatenate` finds exactly those places: each
         * pair is a cut the rearrangement splits along, `L` counted in the
         * codomain (it indexes `mapping`) and `R` in the domain. A cut at
         * position N sits after cell N-1, hence the offsets.
         *
         * The two are only interchangeable when the rearrangement is a
         * permutation, where every cut lands at the same index on both sides.
         * A mapping that copies or drops a cell - `[0,1,0,2,3]`, say - shifts
         * them apart, and swapping the two draws a separator diagonally across
         * the box between cells it does not divide.
         */
        const bigI = doms.length;
        const dom_seps = this.left_anchors.separated?.separators ?? [];
        const cod_seps = this.right_anchors.separated?.separators ?? [];
        const crossed: Set<Anchor<A>> = new Set();
        ut.deconcatenate(mapping, bigI).forEach(([L, R]) => {
            const [dom_sep, cod_sep] = [dom_seps[R-1], cod_seps[L-1]];
            if (!dom_sep || !cod_sep) {
                return;
            }
            dom_sep.link(cod_sep, this.settings.reversed);
            crossed.add(dom_sep);
            crossed.add(cod_sep);
        });
        /*
         * Everything else divides cells the rearrangement mixes together, so it
         * has nowhere to go. Marked loose rather than linked somewhere
         * approximate: a separator that cannot cross should read as absent, not
         * as a line to the wrong place.
         */
        [...dom_seps, ...cod_seps].forEach((sep) => {
            if (!crossed.has(sep)) {
                sep.loose = true;
            }
        });
    }
}

export type CatBox<L, M extends cat.Morphism<L>, A=L> = MorphismBox<L, cat.ProdCategory<L, M>, A>;

class ReferencesHandler<L, M extends cat.Morphism<L>, A=L> {
    private _pending_render: cat.ProdCategory<L, M>[] = [];
    add_pending(target: cat.ProdCategory<L, M>): void {
        this._pending_render.push(target);
    }
    pop_pending(): cat.ProdCategory<L, M>[] {
        const temp = this._pending_render.splice(0, this._pending_render.length);
        this._pending_render = [];
        return temp;
    }

    private _collections: Map<number, MorphismBox<L, cat.ProdCategory<L, M>, A>[]> = new Map();
    create_collection(tag: cat.BlockTag, pending: cat.ProdCategory<L, M> | undefined = undefined): void {
        if (this._collections.has(tag.uid._id)) {
            return;
        }
        this._collections.set(tag.uid._id, []);
        if (pending) {
            this.add_pending(pending);
        }
    }
    add_to_collection(tag: cat.BlockTag, target: MorphismBox<L, cat.ProdCategory<L, M>, A>): void {
        const collection = this._collections.get(tag.uid._id);
        if (collection) {
            collection.push(target);
        }
    }
    highlight_collection(tag: cat.BlockTag): void {
        this._collections.get(tag.uid._id)?.forEach((box) => box.highlight());
    }
    dehighlight_collection(tag: cat.BlockTag): void {
        this._collections.get(tag.uid._id)?.forEach((box) => box.dehighlight());
    }

    // private _references: cat.Block<L, cat.ProdCategory<L, M>>[] = [];
    // private _references_map: Map<
    //     cat.BlockTag, 
    //     MorphismBox<L, cat.ProdCategory<L, M>, A>[]
    // > = new Map();
    // get references(): cat.Block<L, cat.ProdCategory<L, M>>[] {
    //     return this._references;
    // }
    // add_reference(ref: cat.Block<L, cat.ProdCategory<L, M>>): void {
    //     // No duplicates
    //     if (this._references.some((r) => r.block_tag.uid._id === ref.block_tag.uid._id)) {
    //         return;
    //     }
    //     this._references.push(ref);
    // }
    // add_rendered(tag: cat.BlockTag, target: MorphismBox<L, cat.ProdCategory<L, M>, A>): void {
    //     const collection = this._references_map.get(tag) ?? [];
    //     collection.push(target);
    //     this._references_map.set(tag, collection);
    // }
    // pop_references(): cat.Block<L, cat.ProdCategory<L, M>>[] {
    //     const temp = this._references.splice(0, this._references.length);
    //     this._references = [];
    //     return temp;
    // }
    // highlight_collection(tag: cat.BlockTag) {
    //     this._references_map.get(tag)?.forEach((box) => box.highlight());
    // }
    // dehighlight_collection(tag: cat.BlockTag) {
    //     this._references_map.get(tag)?.forEach((box) => box.dehighlight());
    // }
    // create_collection(tag: cat.BlockTag): void {
    //     if (!this._references_map.has(tag)) {
    //         this._references_map.set(tag, []);
    //     }
    // }
    // add_to_collection(tag: cat.BlockTag, target: MorphismBox<L, cat.ProdCategory<L, M>, A>): void {
    //     const collection = this._references_map.get(tag);
    //     if (collection) {
    //         collection.push(target);
    //     }
    // }
}

export abstract class CategoryRenderer<
    L, 
    M extends cat.Morphism<L>,
    A = L> {

    public settings: crs.CategoryRendererSettings<L, M, A>;
    public referencesHandler: ReferencesHandler<L, M> = new ReferencesHandler<L, M>();
    constructor(
        public renderHandler: rh.RenderHandler,
        _settings: Partial<crs.CategoryRendererSettings<L, M, A>> = {},
    ) {
        this.settings = {
            ...crs.DefaultCategoryRendererSettings,
            ..._settings,
        };
        console.log("CategoryRenderer settings:", this.settings);
    }

    public abstract display_lone(target: L): Meridian<A>;
    public display_morphism(target: M): MorphismBox<L, M, A> {
        return new DefaultMorphismBox(this, target);
    }
    public abstract display_prod_object(target: cat.ProdObject<L>): ProdObjectMeridian<L, A>;
    public display_category(
        target: cat.ProdCategory<L, M>, 
        capped: boolean = true): MorphismBox<L, M, A> {
        if (target instanceof cat.Composed) {
            return new ComposedBox(this, target, capped);
        }
        if (target instanceof cat.ProductOfMorphisms) {
            return new ProductBox(this, target, capped);
        }
        if (target instanceof cat.Block) {
            return new BlockBox(this, target, capped);
        }
        if (capped) {
            return new ComposedBox(
                this, 
                new cat.Composed([target]),
            );
        }
        if (target instanceof cat.Rearrangement) {
            return new RearrangementBox(this, target);
        }
        //return new DefaultMorphismBox(this, target);
        return this.display_morphism(target);
    }
    // add_reference(ref: cat.Block<L, cat.ProdCategory<L, M>>): void {
    //     this.referencesHandler.add_reference(ref);
    // }
    // pop_references(): cat.Block<L, cat.ProdCategory<L, M>>[] {
    //     return this.referencesHandler.pop_references();
    // }
    // highlight_collection(tag: cat.BlockTag): void {
    //     this.referencesHandler.highlight_collection(tag);
    // }
    // dehighlight_collection(tag: cat.BlockTag): void {
    //     this.referencesHandler.dehighlight_collection(tag);
    // }
    // add_to_collection(tag: cat.BlockTag, target: MorphismBox<L, cat.ProdCategory<L, M>, A>): void {
    //     this.referencesHandler.add_to_collection(tag, target);
    // }
}