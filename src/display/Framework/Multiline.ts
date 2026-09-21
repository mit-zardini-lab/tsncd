import * as highlightTokens from '../Render/highlightTokens';
import * as rh from '../Render/RenderHandler';
import * as cat from '../../data_structure/Category';
import * as ut from '../../utilities/utilities';
import * as dhd from '../Render/DrawHandler';
import * as crs from './CategoryRendererSettings';
import * as pt from '../../utilities/Point';
import * as nm from '../../data_structure/Numeric'
import * as mc from '../../para/data_structure/MultiCategory';
import * as contra from '../../para/data_structure/Contravariant';
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
    let accumulated_width = 0;

    for (const morphism of target.content) {
        const previous_box = boxes[boxes.length - 1];
        const remaining_width = max_width - accumulated_width;
        let body_width = remaining_width;
        let morphism_split: SplitResult<L, M, A> | undefined;
        let gap_width = 0;
        while (true) {
            morphism_split = split_category(
                categoryRenderer, morphism, body_width,
                gaurentee_single && boxes.length === 0);
            if (!morphism_split || !previous_box) {
                break;
            }
            gap_width = categoryRenderer.settings.reversed
                ? cr.ComposedGap.required_width(categoryRenderer,
                    morphism_split.box.right_anchors, previous_box.left_anchors)
                : cr.ComposedGap.required_width(categoryRenderer,
                    previous_box.right_anchors, morphism_split.box.left_anchors);
            if (morphism_split.box.dims.x + gap_width <= remaining_width) {
                break;
            }
            const next_body_width = remaining_width - gap_width;
            if (next_body_width >= body_width) {
                morphism_split = undefined;
                break;
            }
            body_width = next_body_width;
        }
        if (morphism_split === undefined) {
            break;
        }
        boxes.push(morphism_split.box);
        target0_content.push(morphism_split.target0);
        target1_content.shift();
        accumulated_width += gap_width + morphism_split.box.dims.x;
        if (morphism_split.target1 !== undefined) {
            target1_content.unshift(morphism_split.target1);
            break;
        }
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
            segment_splits.map((split, i) => split === undefined
                ? target.content[i]
                : split.target1 ?? target.content[i].cod().identity())
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
    const processor = cr.blocksRegistry.getConstructor(target.block_tag.aesthetics)(
        categoryRenderer, target.block_tag.aesthetics, null);
    if (processor.body_display() !== cr.BlockBody.FULL) {
        return split_morphism<L, M, A>(
            categoryRenderer,
            target,
            max_width,
            gaurentee_single,
        );
    }
    const body_split = split_category(
        categoryRenderer,
        target.body,
        max_width - processor.placement_padding().x,
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
    }
}

function split_morphism<L, M extends cat.Morphism<L>, A=L>(
    categoryRenderer: cr.CategoryRenderer<L, M, A>,
    target: cat.ProdCategory<L, M>,
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

function split_row<L, M extends cat.Morphism<L>, A=L>(
    categoryRenderer: cr.CategoryRenderer<L, M, A>,
    target: cat.ProdCategory<L, M>,
    max_width: number,
): SplitResult<L, M, A> {
    const target_width = max_width + 2 * categoryRenderer.settings.composed_gap_dims.x;
    const dom = categoryRenderer.display_prod_object(target.dom());
    let body_width = max_width;
    while (true) {
        const split = split_category(categoryRenderer, target, body_width, true)!;
        const cod = categoryRenderer.display_prod_object(split.target0.cod());
        const [left_anchors, right_anchors] = categoryRenderer.settings.reversed
            ? [cod, dom] : [dom, cod];
        const cap_width = cr.ComposedGap.required_width(categoryRenderer,
            left_anchors, split.box.left_anchors, 0)
            + cr.ComposedGap.required_width(categoryRenderer,
                split.box.right_anchors, right_anchors, 0);
        if (split.box.dims.x + cap_width <= target_width
            || split.box.dims.x > body_width) {
            return split;
        }
        body_width = target_width - cap_width;
    }
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
        
        this.offset_caps();

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

    public fit_width(target_width: number): void {
        super.fit_width(target_width);
        this.offset_caps();
    }

    protected caps_spread_the_wires(): boolean {
        return true;
    }

    private offset_caps(): void {
        if (!this.settings.offset_multiline) {
            return;
        }
        const total_width = this.left_cap.dims.x + this.right_cap.dims.x;
        if (this.is_last === PartialBlockPosition.LAST) {
            this.set_cap_widths(total_width, this.settings.composed_gap_dims.x);
        } else if (this.first_pass) {
            this.set_cap_widths(total_width,
                total_width - this.settings.composed_gap_dims.x);
        }
    }
}

export class MultilineComposedBox<L, M extends cat.Morphism<L>, A=L> 
    extends cr.MorphismBox<L, M, A> {
    private rows: MultilineSpreadBox<L, M, A>[];
    constructor(
        public categoryRenderer: cr.CategoryRenderer<L, M, A>,
        public target: cat.ProdCategory<L, M>,
        public max_width: number,
    ) {
        super(categoryRenderer, target);

        this.rows = [];
        let current_target = this.target;
        let first_pass = true;
        while (true) {
            const split_info = split_row(
                this.categoryRenderer,
                current_target,
                this.max_width,
            );
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
        const row_width = Math.max(0, ...this.rows.map((row) => row.dims.x));
        this.rows.forEach((row) => row.fit_width(row_width));
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
        if (this.order === 0) {
            this.draw_label();
        }
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
    private title_dims: pt.Point | null = null;
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

        this.processor = cr.blocksRegistry.getConstructor(this.block_tag.aesthetics)(
            categoryRenderer, block_tag.aesthetics, this
        );

        const padding = this.processor.placement_padding();
        this.title_dims = this.processor.title_dims(
            this.settings.encompassing_title_font_size);
        const label_dims = this.processor.label_dims();
        const title_padding = this.settings.block_title_padding;
        this.inner_box = display_function(
            categoryRenderer, target, max_width - 2 * padding.x
        );
        const outer_width = Math.max(
            this.inner_box.dims.x + padding.x,
            (this.title_dims?.x ?? 0) + 2 * title_padding.x,
            (label_dims?.x ?? 0) + 2 * title_padding.x);
        const top_padding = this.title_dims
            ? Math.max(padding.y / 2, this.title_dims.y + title_padding.y)
            : padding.y / 2;
        this.outer_box = new rh.CoreElement(
            this.renderHandler,
            {
                x: outer_width,
                y: this.inner_box.dims.y + top_padding + padding.y / 2,
             },
            [this.inner_box]
        );
        this.inner_box.transform.offset = {
            x: (outer_width - this.inner_box.dims.x) / 2,
            y: top_padding};
        this.children = [this.outer_box];
        this.setBorderColor('red');
    }

    private core_rectangle: dhd.DrawElement | undefined = undefined;

    protected draw_core(): void {
        if (!this.aesthetics) {
            return;
        }
        if (this.aesthetics.title) {
            this.renderHandler.annotation_handler.addAnnotation(
                this.rectangle(),
                new rh.AnnotationElement(
                    this.renderHandler,
                    // Latex as given; see CategoryRenderer's BlockBox.
                    this.aesthetics.title || '',
                    {font_size: this.settings.encompassing_title_font_size,
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
        if (this.core_rectangle) {
            const token = highlightTokens.block_highlight_token(this.block_tag);
            this.renderHandler.register_highlight(token, (active) =>
                active ? this.highlight() : this.dehighlight());
            this.events?.addHover(
                this.core_rectangle,
                () => this.renderHandler.set_highlight(token, this.diagram_id, true),
                () => this.renderHandler.set_highlight(token, this.diagram_id, false),
            );
        }
    }
    highlight(): void {
        this.core_rectangle?.set_attr(this.processor.highlight_attributes());
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
        this.processor.draw_label(this.rectangle());
    }
}

export function multiline_render<L, M extends cat.Morphism<L>, A=L>(
    categoryRenderer: cr.CategoryRenderer<L, M, A>,
    target: mc.MultiCategoryElement<L, M>,
    max_width: number
): cr.MorphismBox<L, M, A> {
    if (target instanceof contra.Contravariant) {
        return new cr.ContravariantBox<L, M, A>(
            categoryRenderer,
            target,
            CAPPED,
            multiline_render(categoryRenderer, target.body, max_width),
        );
    }
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

/*
 * The boundary between two rows of a `MultiCategoryBox`: two dashed lines
 * across the whole stack. The height is the room the rows' tapes need - a
 * forward row's drops run down past its box and a backward row's grabs run up
 * past its own, and both land in this band, which is the picture of a value
 * crossing from one pass to the other.
 */
export class DoubleDashedSeparator extends rh.DiagramElement {
    constructor(
        public renderHandler: rh.RenderHandler,
        height: number,
    ) {
        super(renderHandler);
        this.children = [new rh.CoreElement(
            this.renderHandler, {x: 0, y: height})];
    }
    set width(value: number | undefined) {
        this._width = value;
        this.children[0].width = value;
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        const middle = rect.top + rect.height / 2;
        const attributes: Partial<dhd.LineAttrs> = {
            stroke: 'black',
            'stroke-width': '1px',
            'stroke-dasharray': '9 6',
        };
        for (const y of [middle - 3, middle + 3]) {
            this.draw?.polyline(
                [{x: rect.left, y}, {x: rect.right, y}], attributes, 'main');
        }
    }
}

/*
 * A `MultiCategory` drawn as its rows stacked, a double dashed line between
 * one row and the next. Each row is rendered by `multiline_render`, so a
 * covariant row reads left to right and a `Contravariant` row is its body
 * mirrored, per `ContravariantBox`. No wire crosses a row boundary - the rows
 * of a `Taped` share their tape slots and nothing else - so the rows need no
 * anchors between them.
 */
export class MultiCategoryBox extends rh.DiagramElement {
    constructor(
        public renderHandler: rh.RenderHandler,
        rows: rh.DiagramElement[],
        separator_height: number = 80,
    ) {
        super(renderHandler);
        const width = Math.max(0, ...rows.map((row) => row.dims.x));
        const separated = ut.join<rh.DiagramElement>(
            () => {
                const separator = new DoubleDashedSeparator(
                    this.renderHandler, separator_height);
                separator.width = width;
                return separator;
            },
            rows);
        this.children = [new rh.Vertical(this.renderHandler, separated)];
    }
}

/*
 * The entry point a whole figure goes through, where `multiline_render` is
 * the entry for one expression. A `MultiCategory` is not a morphism - it has
 * no one domain - so it is dispatched here rather than given a `MorphismBox`.
 */
export function render_root<L, M extends cat.Morphism<L>, A=L>(
    categoryRenderer: cr.CategoryRenderer<L, M, A>,
    target: cat.ProdCategory<L, M> | mc.MultiCategory<L, M>,
    max_width: number,
): rh.DiagramElement {
    if (target instanceof mc.MultiCategory) {
        return new MultiCategoryBox(
            categoryRenderer.renderHandler,
            target.content.map(
                (row) => multiline_render(categoryRenderer, row, max_width)));
    }
    return multiline_render(categoryRenderer, target, max_width);
}
