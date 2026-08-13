import * as rh from '../Render/RenderHandler';
import * as cat from '../../data_structure/Category';
import * as ut from '../../utilities/utilities';
import * as dhd from '../Render/DrawHandler';
import * as crs from './CategoryRendererSettings';
import * as pt from '../../utilities/Point';
import * as nm from '../../data_structure/Numeric'
import { Separated } from '../../utilities/Separated';
import * as cr from './CategoryRenderer';

const CAPPED = false;

/*
A split returns:
    IF width <= max_width:
        - {box, target, <undefined>}
    IF width > max_width AND is splittable:
        - {box, target0, target1}
        - so that:
             box.dims.x <= max_width
             target == target0 @ target1
    IF width > max_width AND is NOT splittable AND gaurentee_single == false:
        - undefined
        (this indicates a new line should begin)
    IF width > max_width AND is NOT splittable AND gaurentee_single == true:
        - {box, target0, target1}
        - so that:
             target0 is as thin as possible
             target == target0 @ target1
*/

interface SplitResult<L, M extends cat.Morphism<L>, A=L> { // If undefined, nothing fits.
    box: cr.MorphismBox<L, M, A>;
    target0: cat.ProdCategory<L, M>;
    target1?: cat.ProdCategory<L, M>; // If undefined, everything fits.
    block_order?: number;
    block_position?: PartialBlockPosition;
}

function split_composed<L, M extends cat.Morphism<L>, A=L>(
    categoryRenderer: cr.CategoryRenderer<L, M, A>,
    target: cat.Composed<L, cat.ProdCategory<L, M>>,
    max_width: number,
    gaurentee_single: boolean,
): SplitResult<L, M, A> | undefined {
    const boxes: cr.MorphismBox<L, M, A>[] = [];
    const target0_content: cat.ProdCategory<L, M>[] = [];
    const target1_content = target.content.slice();
    let accumulated_width = -categoryRenderer.settings.composed_gap_dims.x;

    for (const m of target.content) {
        const m_split = split_category(
            categoryRenderer,
            m, 
            max_width 
            - accumulated_width
            - categoryRenderer.settings.composed_gap_dims.x,
            gaurentee_single && boxes.length === 0
        )
        // Nothing fits.
        if (m_split === undefined) {
            break;
        }
        // Else, add the first section.
        boxes.push(m_split.box);
        target0_content.push(m_split.target0);
        target1_content.shift();
        // There is a remainder.
        if (m_split.target1 !== undefined) {
            target1_content.unshift(m_split.target1);
            break;
        }
        accumulated_width += 
            categoryRenderer.settings.composed_gap_dims.x 
            + m_split.box.dims.x;
    }

    if (boxes.length === 0) {
        return undefined;
    }

    const target0: cat.Composed<L, cat.ProdCategory<L, M>> 
        = new cat.Composed(target0_content);
    const target1 = target1_content.length > 0
        ? new cat.Composed<L, cat.ProdCategory<L, M>>(target1_content)
        : undefined;
    const box = new cr.ComposedBox<L, M, A>(
        categoryRenderer,
        target0,
        CAPPED,
        boxes,
    )
    return {
        box: box,
        target0: target0,
        target1: target1,
    }
}

function split_product<L, M extends cat.Morphism<L>, A=L>(
    categoryRenderer: cr.CategoryRenderer<L, M, A>,
    target: cat.ProductOfMorphisms<L, cat.ProdCategory<L, M>>,
    max_width: number,
    gaurentee_single: boolean,
): SplitResult<L, M, A> | undefined {
    const segment_splits = target.content.map((m) =>
        split_category(
            categoryRenderer,
            m, max_width,
            gaurentee_single
        )
    );
    // Nothing fits
    if (segment_splits.every((s) => s === undefined)) {
        return undefined;
    }
    // Something fits
    const target0 = new cat.ProductOfMorphisms<L, cat.ProdCategory<L, M>>(
        segment_splits.map((s, i) =>
            s ? s.target0 : target.content[i].dom().identity()
        )
    );
    const boxes = segment_splits.map((s, i) =>
        s ? s.box : categoryRenderer.display_category(
            target.content[i].dom().identity(),
            false,
        ));

    // Everything fits
    const everything_fits = segment_splits.every((s) => 
        s !== undefined && s.target1 === undefined)
    const target1 = everything_fits
        ? undefined
        : new cat.ProductOfMorphisms
            <L, cat.ProdCategory<L, M>>(
            segment_splits.map((s, i) =>
                s?.target1 ?? target.content[i].cod().identity()
            )
        );

    return {
        box: new cr.ProductBox(
            categoryRenderer,
            target0,
            CAPPED,
            boxes,
        ),
        target0: target0,
        target1: target1,
    }
}

function split_block<L, M extends cat.Morphism<L>, A=L>(
    categoryRenderer: cr.CategoryRenderer<L, M, A>,
    target: cat.Block<L, cat.ProdCategory<L, M>>,
    max_width: number,
    gaurentee_single: boolean,
): SplitResult<L, M, A> | undefined {
    const body_split = split_category(
        categoryRenderer,
        target.body,
        max_width - categoryRenderer.settings.block_padding.x,
        gaurentee_single
    );
    // Nothing fits
    if (body_split === undefined) {
        return undefined;
    }
    // Something fits
    const block_order = target._display_order ?? 0;
    const target0 = new cat.Block
        <L, cat.ProdCategory<L, M>>(
        body_split.target0,
        target.block_tag,
        block_order,
    )
    const target1 = body_split.target1 ?
        new cat.Block
            <L, cat.ProdCategory<L, M>>(
            body_split.target1,
            target.block_tag,
            block_order + 1,
        ) : undefined;
    const block_position = (target1 === undefined)
        ? PartialBlockPosition.LAST
        : PartialBlockPosition.MIDDLE;
    const box = new PartialBlock(
        categoryRenderer,
        target0,
        CAPPED,
        body_split.box,
        block_order,
        block_position 
    );
    return {
        box: box,
        target0: target0,
        target1: target1,
        // block_order: block_order,
        // block_position: block_position
    }
}

function split_morphism<L, M extends cat.Morphism<L>, A=L>(
    categoryRenderer: cr.CategoryRenderer<L, M, A>,
    target: M | cat.Rearrangement<L>,
    max_width: number,
    gaurentee_single: boolean,
): SplitResult<L, M, A> | undefined {
    const box = categoryRenderer.display_category(
        target,
        false
    );
    if (box.dims.x <= max_width || gaurentee_single) {
        return {
            box: box,
            target0: target,
            target1: undefined,
        }
    }
    else {
        return undefined;
    }
}

function split_category<L, M extends cat.Morphism<L>, A=L>(
    categoryRenderer: cr.CategoryRenderer<L, M, A>,
    target: cat.ProdCategory<L, M>,
    max_width: number,
    gaurentee_single: boolean,
    block_order?: number,
): SplitResult<L, M, A> | undefined {
    if (target instanceof cat.ProductOfMorphisms) {
        return split_product(
            categoryRenderer,
            target,
            max_width,
            gaurentee_single
        );
    }
    if (target instanceof cat.Composed) {
        return split_composed(
            categoryRenderer,
            target,
            max_width,
            gaurentee_single
        );
    }
    if (target instanceof cat.Block) {
        return split_block(
            categoryRenderer,
            target,
            max_width,
            gaurentee_single,
        );
    }
    return split_morphism<L, M, A>(
        categoryRenderer,
        target,
        max_width,
        gaurentee_single
    );
}

enum MultilineCurveDirection {
    LEFT,
    RIGHT,
}

export class MultilineCurve<L, A=L> extends cr.ComposedGap<L, A> {
    constructor(
        public categoryRenderer: cr.CategoryRenderer<L, any, A>,
        public dom: cr.Meridian<A>,
        public cod: cr.Meridian<A>,
        target_width?: number,
        public annotated: boolean = true,
        public first_pass: boolean = false,
        public is_last: PartialBlockPosition = PartialBlockPosition.MIDDLE,
        public direction: MultilineCurveDirection = MultilineCurveDirection.LEFT,
    ) {
        super(categoryRenderer, dom, cod, target_width, annotated);
    }
    post_placement(): void {
        if (!this.first_pass && this.direction === MultilineCurveDirection.LEFT) {
            this.left_anchors.transform.offset = {x: 0, y: -10};
        }
        if (this.is_last != PartialBlockPosition.LAST && this.direction === MultilineCurveDirection.RIGHT) {
            this.right_anchors.transform.offset = {x: 0, y: 10};
        }
    }
    // update(): void {

    // }
}


export class MultilineSpreadBox<L, M extends cat.Morphism<L>, A=L> extends cr.SpreadBox<L, M, A> {
    // public left_cap: cr.ComposedGap<L, A>;
    // public right_cap: cr.ComposedGap<L, A>;
    constructor(
        public categoryRenderer: cr.CategoryRenderer<L, M, A>,
        public target: cat.ProdCategory<L, M>,
        public body: cr.MorphismBox<L, M, A>,
        public target_width: number | undefined,
        public annotated: boolean = false,
        public first_pass: boolean = false,
        public is_last: PartialBlockPosition = PartialBlockPosition.MIDDLE,
    ) {
        super(
            categoryRenderer, 
            target, body, target_width, 
            annotated);
        
        if (this.settings.offset_multiline) {
            let left_delta: number | undefined = undefined;
            if (this.first_pass) {
                left_delta = this.right_cap.dims.x - this.settings.composed_gap_dims.x;
            }
            if (this.is_last === PartialBlockPosition.LAST) {
                left_delta = this.settings.composed_gap_dims.x - this.left_cap.dims.x;
            }

            if (left_delta !== undefined) {
                this.left_cap.width = this.left_cap.dims.x + left_delta;
                this.right_cap.width = this.right_cap.dims.x - left_delta;
            }
        }

        const left_curve_cap = new MultilineCurve<L,A>(
            categoryRenderer,
            categoryRenderer.display_prod_object(this.target.dom()),
            this.left_cap.left_anchors,
            this.settings.multiline_curve_width,
            false,
            first_pass,
            is_last,
            MultilineCurveDirection.LEFT,
        );
        const right_curve_cap = new MultilineCurve<L,A>(
            categoryRenderer,
            this.right_cap.right_anchors,
            categoryRenderer.display_prod_object(this.target.cod()),
            this.settings.multiline_curve_width,
            false,
            first_pass,
            is_last,
            MultilineCurveDirection.RIGHT,
        )
        this.children = [
            left_curve_cap.left_anchors,
            left_curve_cap,
            ...this.children,
            right_curve_cap,
            right_curve_cap.right_anchors,
        ];
    }
}

export class MultilineComposedBox<L, M extends cat.Morphism<L>, A=L> 
    extends cr.MorphismBox<L, M, A> {
    private rows: cr.MorphismBox<L, M, A>[];
    constructor(
        public categoryRenderer: cr.CategoryRenderer<L, M, A>,
        public target: cat.ProdCategory<L, M>,
        public max_width: number,
    ) {
        super(categoryRenderer, target);

        this.rows = [];
        let current_target = this.target;
        let first_pass = true;
        let block_order = 0;
        while (true) {
            const split_info = split_category(
                this.categoryRenderer,
                current_target,
                this.max_width,
                true,
                block_order,
            )!;
            block_order = (split_info.block_order === undefined)
                ? 0
                : split_info.block_order;
            const thin_display = first_pass && split_info.target1 === undefined;
            const position = (
                split_info.target1 === undefined ? PartialBlockPosition.LAST
                : PartialBlockPosition.MIDDLE
            );
            const row = new MultilineSpreadBox<L, M, A>(
                this.categoryRenderer,
                split_info.target0,
                split_info.box,
                thin_display ?
                    undefined 
                    : this.max_width + 2 * this.settings.composed_gap_dims.x,
                true,
                first_pass,
                position
            );
            this.rows.push(
                row
            );
            if (split_info.target1 === undefined) {
                break;
            }
            current_target = split_info.target1;
            first_pass = false;
        }
        this.children = [
            new rh.Vertical(
                this.renderHandler,
                this.rows,
            )
        ]
    }
}

enum PartialBlockPosition {
    MIDDLE,
    LAST,
}

export class PartialBlock<L, M extends cat.Morphism<L>, A=L>
    extends cr.BlockBox<L, M, A> {
    constructor(
        public categoryRenderer: cr.CategoryRenderer<L, M, A>,
        public target: cat.Block<L, cat.ProdCategory<L, M>>,
        public capped: boolean = true,
        _inner_box?: cr.MorphismBox<L, cat.ProdCategory<L, M>, A>,
        public order: number = 0,
        public position: PartialBlockPosition = PartialBlockPosition.LAST,
    ) {
        super(
            categoryRenderer, 
            target, 
            capped,
        _inner_box);
    }
    update(): void {
        if (!this.target.aesthetics) {
            super.super_update();
            return;
        }
        this.draw_core();
        super.super_update();
        if ((this.target.repetition instanceof nm.Integer)
            && (this.target.repetition._value === 1)) {
            return;
        }
        if (this.order === 0) {
            this.draw_left_bracket();
        }
        if (this.position === PartialBlockPosition.LAST) {
            this.draw_right_bracket();
        }
    }
}

export class MultilineGap extends rh.DiagramElement {
    constructor(
        public renderHandler: rh.RenderHandler,
        public _width: number = 20,
        public _height: number = 20,
    ) {
        super(renderHandler);
        this.children = [
            new rh.CoreElement(this.renderHandler, { x: this._width, y: this._height })
        ]
    }
}

export class EncompassingBox<L, M extends cat.Morphism<L>, A=L> extends cr.MorphismBox<L, M, A> {
    private outer_box: rh.DiagramElement;
    private inner_box: cr.MorphismBox<L, M, A>;
    private iteration_annotation?: rh.AnnotationElement;
    private processor: cr.BlockProcessor<any>;

    private aesthetics = this.block_tag.aesthetics;
    private target_title_height = 30;
    constructor(
        public categoryRenderer: cr.CategoryRenderer<L, M, A>,
        public target: cat.ProdCategory<L, M>,
        public block_tag: cat.BlockTag,
        public max_width: number,
        public display_function: (
            categoryRenderer: cr.CategoryRenderer<L, M, A>,
            target: cat.ProdCategory<L, M>,
            max_width: number
        ) => cr.MorphismBox<L, M, A> = multiline_render,
    ) {
        super(categoryRenderer, target);
        
        this.categoryRenderer.referencesHandler.add_to_collection(this.block_tag, this);

        this.processor = cr.blocksRegistry.getConstructor(this.block_tag.aesthetics)(
            categoryRenderer, block_tag.aesthetics, this
        );

        const padding = this.processor.placement_padding();
        this.inner_box = display_function(
            categoryRenderer, target, max_width - 2 * padding.x
        );
        this.outer_box = new rh.CoreElement(
            this.renderHandler,
            {
                x: this.inner_box.dims.x + padding.x,
                y: this.inner_box.dims.y 
                + padding.y 
                + (this.aesthetics?.title ? this.target_title_height : 0),
             },
            [this.inner_box]
        );
        this.inner_box.transform.offset = {
            x: padding.x / 2, 
            y: padding.y / 2 + (this.aesthetics?.title ? this.target_title_height : 0)};
        this.children = [this.outer_box];
        this.setBorderColor('red');
    }

    private core_rectangle: dhd.DrawElement | undefined = undefined;

    protected draw_core(): void {
        if (!this.aesthetics) {
            return;
        }
        const TEXTHEIGHT = 20;
        if (this.aesthetics.title) {
            this.renderHandler.annotation_handler.addAnnotation(
                this.rectangle(),
                new rh.AnnotationElement(
                    this.renderHandler,
                    `\\text{${this.aesthetics.title || ''}}`,
                    {font_size: this.target_title_height / TEXTHEIGHT,
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

    update(): void {
        if (!this.aesthetics) {
            super.update();
            return;
        }
        this.draw_core();
        super.update();
    }
}

export function multiline_render<L, M extends cat.Morphism<L>, A=L>(
    categoryRenderer: cr.CategoryRenderer<L, M, A>,
    target: cat.ProdCategory<L, M>,
    max_width: number
): cr.MorphismBox<L, M, A> {
    if (target instanceof cat.Block) {
        const body = target.body;
        const tag = target.block_tag;
        return new EncompassingBox<L, M, A>(
            categoryRenderer,
            body,
            tag,
            max_width,
            multiline_render,
        );
    }
    return new MultilineComposedBox(categoryRenderer, target, max_width);
}