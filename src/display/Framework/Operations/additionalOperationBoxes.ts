import * as rh from '../../Render/RenderHandler';
import * as cr from '../CategoryRenderer';
//import * as bm from '../BroadcastedMeridian';
import * as ut from '../../../utilities/utilities';
import * as cat from '../../../data_structure/Category';
import * as ops from '../../../data_structure/Operators';
import { Separated } from '../../../utilities/Separated';
//import * as cr from '../StandardCategoryRenderer';
import * as crs from '../CategoryRendererSettings';
import * as pt from '../../../utilities/Point';
import * as utcr from '../../../utilities/ConstructorRegistry';
import * as bb from '../BroadcastedCategoryRenderer';
import * as nmr from '../NumericRenderer';
import * as tu from '../../../data_structure_processing/term_utilities';
import * as dhd from '../../Render/DrawHandler';

import { Color } from '../../../utilities/Color';

@bb.opsRegistry.registerClass(ops.GenericOperator)
export class GenericOperatorBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.GenericOperator> {
    public annotation: rh.AnnotationElement;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.GenericOperator>,
    ) {
        super(categoryRenderer, target);
        this.annotation = new rh.AnnotationElement(
            this.renderHandler,
            target.operator.name?.to_latex() ?? 'F',
            {font_size: 1},
        );
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        this.draw?.drawRectangle(
            rect,
            {fill: '#FFFFFF', 'stroke-width': '1px'},
            {dropShadow: true}
        );
        this.annotation.place(rect);
    }
}

@bb.opsRegistry.registerClass(ops.Einops)
export class EinopsBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.Einops> {
    private cups: cr.Anchor<A>[][];
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.Einops>,
    ) {
        super(categoryRenderer, target, {x: categoryRenderer.settings.operation_core_dims.x, y: 0});
        this.cups = this.setup_cups();
        this.setup_datatype();
    }
    private setup_datatype(): void {
        const left_datatypes = this.left_anchors.lone_elements.flatMap(
            (segment) => (segment as bb.ArrayMeridian<B, A>)?.datatype_anchor ?? []);
        const right_datatypes = this.right_anchors.lone_elements.flatMap(
            (segment) => (segment as bb.ArrayMeridian<B, A>)?.datatype_anchor ?? []);
        for (const left_dt of left_datatypes) {
            left_dt.loose = true;
            left_dt.allow_skip = true;
            //left_dt.skip = true;
            for (const right_dt of right_datatypes) {
                //right_dt.skip = true;
                right_dt.loose = true;
                right_dt.allow_skip = true;
                left_dt.link(right_dt);
            }
        }
    }
    private setup_cups(): cr.Anchor<A>[][] {
        const operator = this.target.operator as ops.Einops;
        const cups = [
            ...new Set(operator.signature.flatMap((x)=>x))
        ].map((x) => [] as cr.Anchor<A>[]);
        ut.zip(
            this.left_anchors.lone_elements,
            operator.signature,
        ).forEach(
            ([segment_anchors, segment_signature]) =>
                ut.zip(
                    segment_anchors.anchors,
                    segment_signature,
                ).forEach(
                    ([anchor, sig]) => cups[sig].push(anchor)
                )
        );
        return cups;
    }
    update(): void {
        for (const cup of this.cups) {
            if (cup.length == 1) {
                const anchor = cup[0];
                anchor.add_dot = true;
            }
            if (cup.length == 2) {
                const start = cup[0].location()!;
                const end = cup[cup.length - 1].location()!;
                this.renderHandler.draw_handler?.arcCurve(
                    start,
                    end,
                    (start.y-end.y)/2,
                    false,
                    {fill: 'none'}
                );
            }
        }
        super.update();
    }
}
@bb.opsRegistry.registerClass(ops.SoftMax)
class SoftMaxBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.SoftMax> {
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.SoftMax>,
    ) {
        super(
            categoryRenderer, 
            target, 
            categoryRenderer.settings.operation_softmax_dims);
    }
    update(): void {
        super.update();
        const rectangle: pt.Rectangle = this.rectangle();
        const polygon = this.draw?.deltaPolygon(
            [this.rectangle().getLocation({x:0,y:0.5}),
                {x:rectangle.width, y:rectangle.height*2/3},
                {x:0, y: -rectangle.height*4/3}
            ],
            {fill: 'white'},
            {dropShadow: true}
        );
        this.events?.addHover(
            polygon!, (e) => {console.log('Hello');}, (e) => {}
        );
    }
}
@bb.opsRegistry.registerClass(ops.Linear)
class LinearBox<B extends cat.Datatype, A extends cat.Axis>    
    extends bb.OperationBox<B, A, ops.Linear> {
    private annotation: rh.AnnotationElement;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.Linear>,
    ) {
        const width = 40;// + target.operator.name.length * 5;
        super(categoryRenderer, target, {x: width, y: 30});
        this.annotation = new rh.AnnotationElement(
            this.renderHandler,
            target.operator.name?.to_latex() ?? 'L',
            {font_size: 1.2},
        );
        this.override_display_type = bb.BroadcastDisplayType.NODE;
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        const biteSize = this.settings.operation_multilinear_bite;
        this.renderHandler.draw_handler?.deltaPolygon(
            [rect.top_left,
            {x:rect.dims.x, y: 0},
            {x:0, y:rect.dims.y},
            {x:-rect.dims.x+biteSize, y:0},
            {x:-biteSize, y:-biteSize}],
            {fill: '#E8EEEB', stroke: 'none'},
            {dropShadow: true}
        );
        this.renderHandler.annotation_handler.addAnnotation(
            rect,
            this.annotation,
        )
    }
}

@bb.opsRegistry.registerClass(ops.Identity)
class IdentityBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.Identity> {
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.Identity>,
    ) {
        super(categoryRenderer, target, {x: 0, y: 0});
    }
}

@bb.opsRegistry.registerClass(ops.AdditionOp)
class AdditionOpBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.AdditionOp> {
    public annotation: rh.AnnotationElement;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.AdditionOp>,
    ) {
        super(categoryRenderer, target, {
            x: 30, y: 30
        });
        this.annotation = new rh.AnnotationElement(
            this.renderHandler,
            `\\pmb{${target.operator.name?.to_latex() ?? '+'}}`,
            {
                font_size: 1.2,
                horizontal_align: 'left',
            },
        );
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        this.renderHandler.annotation_handler.addAnnotation(
            rect,
            this.annotation,
        )
    }
}

/*
 * `max` is a fold, and it is the same kind of thing as `+`: an accumulator and
 * the value being folded into it go in, one accumulator comes out. So it is
 * drawn in the same idiom - a glyph where the wires meet rather than a box -
 * which makes the two accumulators of an online softmax read alike, and both
 * read differently from the pointwise operations between them.
 *
 * `\max` rather than `max`, because KaTeX sets a bare name in maths italic, as
 * a product of three variables. The operator's own name is used when it has
 * one, so a `Maximum` renamed to `\vee` or `\sqcup` still typesets.
 */
@bb.opsRegistry.registerClass(ops.Maximum)
class MaximumBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.Maximum> {
    public annotation: rh.AnnotationElement;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.Maximum>,
    ) {
        super(categoryRenderer, target, {
            x: 40, y: 30
        });
        this.annotation = new rh.AnnotationElement(
            this.renderHandler,
            `\\pmb{${target.operator.name?.to_latex() ?? '\\max'}}`,
            {
                font_size: 1.2,
                horizontal_align: 'left',
            },
        );
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        this.renderHandler.annotation_handler.addAnnotation(
            rect,
            this.annotation,
        )
    }
}

@bb.opsRegistry.registerClass(ops.Elementwise)
class ElementwiseBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.Elementwise> {
    public annotation: rh.AnnotationElement;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.Elementwise>,
    ) {
        super(categoryRenderer, target, {
            x: 30, y: 10
        });
        this.parent_gap = 0;
        this.setBorderColor('#E8EEEB');
        this.annotation = new rh.AnnotationElement(
            this.renderHandler,
            `${target.operator.name?.to_latex()}`
        );
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        this.annotation.place(rect);
        const top_left = {
            x: this.annotation.text_rectangle().left - 10,
            y: this.rectangle().top_left.y,
        }
        const top_right = {
            x: this.annotation.text_rectangle().right,
            y: this.rectangle().top_left.y,
        }
        const triangle = [
            {x: 10, y: 5},
            {x: -10, y: 5},
            {x: 3, y: -5}
        ]
        this.draw?.deltaPolygon(
            [top_left, ...triangle],
            {fill: 'black', stroke: 'none'}
        );
        this.draw?.deltaPolygon(
            [top_right, ...triangle],
            {fill: 'black', stroke: 'none'}
        );
    }
}

@bb.opsRegistry.registerClass(ops.Constant)
class ConstantBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.Constant> {
    private annotation: rh.AnnotationElement;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.Constant>,
    ) {
        super(categoryRenderer, target, {x: 40, y: 30});
        const value = target.operator.value;
        this.annotation = new rh.AnnotationElement(
            this.renderHandler,
            nmr.numeric_string(value) ?? value.to_latex(),
            {font_size: 1},
        );
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        const point_depth = 10;
        // A pentagon whose left edge collapses to a point, marking a nullary
        // source feeding rightwards.
        this.draw?.deltaPolygon(
            [rect.getLocation({x: 0, y: 0.5}),
            {x: point_depth, y: -rect.height/2},
            {x: rect.width - point_depth, y: 0},
            {x: 0, y: rect.height},
            {x: -rect.width + point_depth, y: 0}],
            {fill: '#E8EEEB', stroke: 'none'},
            {dropShadow: true}
        );
        // Centred on the body rather than the full rectangle, so the point does
        // not drag the value off-centre.
        this.annotation.place(new pt.Rectangle(
            {x: rect.left + point_depth, y: rect.top},
            {x: rect.width - point_depth, y: rect.height}
        ));
    }
}

@bb.opsRegistry.registerClass(ops.Normalize)
class NormalizeBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.Normalize> {
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.Normalize>,
    ) {
        super(categoryRenderer, target);
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        this.draw?.circle(
            rect.midpoint(),
            {radius: rect.height/2, 'stroke-width': '2', fill: '#F1FCFC'},
            {dropShadow: true}
        );
        this.draw?.polyline(
            rect.getLocations(
                [
                    {x: 0.1, y: 0.2},
                    {x: 0.5, y: 1},
                    {x: 0.9, y: 0.2}
                ]
            ),
            {stroke: 'black', 'stroke-width': '1'},
            'main',
        );
    }
}

@bb.opsRegistry.registerClass(ops.WeightedTriangularLower)
class WeightedTriangularLowerBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.WeightedTriangularLower> {
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.WeightedTriangularLower>,
    ) {
        super(categoryRenderer, target);
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        const gap = rect.height - rect.width;
        const core_rect = new pt.Rectangle(
            {x: rect.left, y: rect.top + gap * 0.5},
            {x: rect.width, y: rect.width}
        );
        this.draw?.drawRectangle(
            core_rect,
            {fill: '#F9CBDF', stroke: 'none'},
            {dropShadow: true}
        );
        this.draw?.deltaPolygon(
            [core_rect.top_left,
            {x: core_rect.width, y: 0},
            {x: 0, y: core_rect.height}],
            {fill: '#808080', stroke: 'none'},
        );
        this.draw?.drawRectangle(
            core_rect,
            {fill: 'none', stroke: 'black', 'stroke-width': '1'},
        );

    }
}

@bb.opsRegistry.registerClass(ops.Embedding)
class EmbeddingBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.Embedding> {
    private annotation: rh.AnnotationElement;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.Embedding>,
    ) {
        super(categoryRenderer, target, {x: 30, y: 30});
        this.annotation = new rh.AnnotationElement(
            this.renderHandler,
            target.operator.name?.to_latex() ?? 'L',
            {font_size: 1.2},
        );
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        const biteSize = this.settings.operation_multilinear_bite;
        this.renderHandler.draw_handler?.deltaPolygon(
            [rect.top_left,
            {x:rect.dims.x, y: 0},
            {x:0, y:rect.dims.y},
            {x:-rect.dims.x+biteSize, y:0},
            {x:-biteSize, y:-biteSize}],
            {fill: '#E8EEEB', stroke: 'none'},
            {dropShadow: true}
        );
        this.renderHandler.annotation_handler.addAnnotation(
            rect,
            this.annotation,
        )
    }
}

@bb.opsRegistry.registerClass(ops.BlockOperator)
class BlockOperatorBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ops.BlockOperator<B, A>> {
        private annotation: rh.AnnotationElement;
        private processor: cr.BlockProcessor;
        private block: cat.Block<cat.Array<B, A>,cat.Broadcasted<B, A>> = this.target.operator.block;
        private block_tag = this.block.block_tag;
        private block_aesthetics = this.block_tag.aesthetics;

    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ops.BlockOperator<B, A>>,
    ) {
        super(categoryRenderer, target, {x: 60, y: 35});
        this.block = this.target.operator.block;
        this.annotation = new rh.AnnotationElement(
            this.renderHandler,
            target.operator.name?.to_latex() ?? 'BOp',
            {font_size: 1.2},
        );
        //this.width = 40;
        this.categoryRenderer.referencesHandler.create_collection(this.block_tag, this.block);
        this.categoryRenderer.referencesHandler.add_to_collection(this.block_tag, this);
        this.processor = cr.blocksRegistry.getConstructor(this.block_aesthetics)(
            categoryRenderer, this.block_aesthetics, this
        );
        if (this.right_anchors.lone_elements.length > 1) {
        this.override_display_type = bb.BroadcastDisplayType.NODE;
        }

    }
    private core_rectangle: dhd.DrawElement<any> | undefined;
    protected draw_core(): void {
        if (!this.block_aesthetics) { return; }

        const rect = this.rectangle();
        const bite_size = this.settings.anchor_height / 2;
        // this.core_rectangle = this.draw?.drawRectangle(
        //     this.rectangle(),
        //     ...this.processor.polygon_aux_attrs(),
        //     // 'background'
        // );
        this.core_rectangle = this.draw?.deltaPolygon(
            [rect.top_left, 
                {x: rect.width - bite_size, y: 0}, 
                {x: bite_size, y: bite_size},
                {x: 0, y: rect.height - bite_size},
                {x: -rect.width + bite_size, y: 0},
                {x: -bite_size, y: -bite_size}],
            ...this.processor.polygon_aux_attrs(),
        )

        // this.core_rectangle?.set_attr({fill: this.processor.fill_color_dark()});
    }
    highlight(): void {
        this.core_rectangle?.set_attr({fill: this.processor.fill_color_highlight()});
    }
    dehighlight(): void {
        this.core_rectangle?.set_attr({fill: this.processor.fill_color()});
    }
    update(): void {
        super.update();
        this.draw_core();
        this.annotation.place(this.rectangle());
        const text_rect = this.annotation.text_rectangle();
        if (text_rect.width > this.rectangle().width) {
            console.log('Rotating block operator annotation for better fit');
            this.annotation.rotation = -90;
        }
        this.events?.addHover(
            this.core_rectangle!,
            (e) => {
                this.highlight();
                this.categoryRenderer.referencesHandler.highlight_collection(this.block_tag);
            },
            (e) => {
                this.dehighlight();
                this.categoryRenderer.referencesHandler.dehighlight_collection(this.block_tag);
            },
        );
        // const color = this.target.operator.block.block_tag.aesthetics?.fill_color ?? '#D3D3D3';
        // const rect = this.rectangle();
        // const drawn_rect = this.draw?.drawRectangle(
        //     rect, 
        //     {fill: color, stroke: 'none'},
        //     {dropShadow: true}
        // );
        // this.annotation.place(rect);
        // const text_rect = this.annotation.text_rectangle();
        // if (text_rect.width > text_rect.height) {
        //     console.log('Rotating block operator annotation for better fit');
        //     this.annotation.rotation = -90;
        // }
        // const dark_color = Color.from_hex(color);
        // const dark_color_hsv = dark_color.hsv;
        // dark_color_hsv[1] = 1;
        // dark_color_hsv[2] = 0.8;
        // const hover_color = Color.from_h360sv(...dark_color_hsv).hex(); 
        // this.events?.addHover(
        //     drawn_rect!,
        //     (e) => {
        //         drawn_rect!.set_attr({fill: hover_color});
        //     },
        //     (e) => {
        //         drawn_rect!.set_attr({fill: dark_color.hex()});
        //     }
        // )
    }

}