import * as rh from '../Render/RenderHandler';
import * as cr from './CategoryRenderer';
//import * as bm from './BroadcastedMeridian';
import * as ut from '../../utilities/utilities';
import * as cat from '../../data_structure/Category';
import * as ops from '../../data_structure/Operators';
import { Separated } from '../../utilities/Separated';
import * as crs from './CategoryRendererSettings';
import * as pt from '../../utilities/Point';
import * as utcr from '../../utilities/ConstructorRegistry';
import * as tu from '../../data_structure_processing/term_utilities';
import * as tu_rc from '../../data_structure_processing/ReversedCategory';
import * as scr from './StrideCategoryRenderer';
import * as dhd from '../Render/DrawHandler';
import * as Curve from '../../utilities/Curve';
// There are three main modes of displaying Broadcasted morphisms:
// 1. WEAVE: One output, and all reindexings are remappings.
// 2. NODE: All the reindexings are the same.
// 3. JOIN: General case. The degrees join. Reindexings on the left.

//import * as addops from './Operations/additionalOperationBoxes'
//console.log(addops);

export const opsRegistry = new utcr.ConstructorRegistry<
    cat.Operator,
    OperationBox<any, any, any>,
    [BroadcastedRenderer<any, any>,
    cat.Broadcasted<any, any, any>
]>(); 

export const datatypesRegistry = new utcr.ConstructorRegistry<
    cat.Datatype,
    DatatypeAnchor<any> | undefined,
    [BroadcastedRenderer<any, any>,
    cat.Datatype,
    cat.Array<any, any>,
    // The weave the array is the target of, where there is one - see
    // `ArrayMeridian`. `undefined` for an array drawn in its own right.
    cat.Weave<any, any> | undefined]
>();

const DATATYPE_ANCHOR_TRIANGLE_X = 7;
const DATATYPE_ANCHOR_TRIANGLE_Y = 4;
export class DatatypeAnchor<B extends cat.Datatype> extends cr.Anchor<B> {
    private annotation?: rh.AnnotationElement;
    private color?: string;
    constructor(
        public categoryRenderer: BroadcastedRenderer<B, any>,
        public target: B,
    ) {
        super(categoryRenderer);
        this.setBorderColor('lime', false);
        this.curve_attributes = {
            ...this.curve_attributes,
            'stroke-width': '2px',
        }
    }

    /*
     * Repaint the wire, its direction triangle and its label. The registry
     * hands back a fully built anchor, so a datatype that wraps another -
     * `KernelizedDatatype`, which takes its shape from the form inside it - has
     * no other way to add what it alone knows on top of the form's drawing.
     */
    public recolor(color: string): void {
        this.color = color;
        this.curve_attributes = {...this.curve_attributes, 'stroke': color};
        if (this.annotation) {
            this.annotation.annotationSettings.color = color;
        }
    }

    protected dot_attributes(): Partial<dhd.CircleAttrs> {
        const color = this.color || 'black';
        return {fill: color, stroke: color, radius: 2};
    }
    update(): void {
        if (this.skipped()) {
            return;
        }
        const triangle_delta_coords = [
            {x: -DATATYPE_ANCHOR_TRIANGLE_X,    y:-DATATYPE_ANCHOR_TRIANGLE_Y},
            {x:  DATATYPE_ANCHOR_TRIANGLE_X / 3,y: DATATYPE_ANCHOR_TRIANGLE_Y},
            {x: -DATATYPE_ANCHOR_TRIANGLE_X / 3,y: DATATYPE_ANCHOR_TRIANGLE_Y},
        ]
        for (const next of this.next_terminal()) {
            const [p0, p1] = [this.location()!, next.location()!];
            this.draw?.flatCurve(
                [p0, p1],
                {...this.curve_attributes}
            );
            /*
             * A curve is parameterised by x, so one spanning no x at all has no
             * midpoint to ask for - `y(x)` divides by the span and comes back
             * NaN, which reaches the SVG as a non-finite coordinate and throws.
             * The wire itself is drawn from its endpoints and is fine; only the
             * direction triangle needs a direction, and a gap of zero width has
             * none to show. Happens where two anchors meet with no gap between
             * them, which a scalar array can do.
             */
            if (p0.x === p1.x) {
                continue;
            }
            const curve = Curve.flatCurve(p0, p1);
            const midpoint_x = p0.x / 2 + p1.x / 2;
            const midpoint = curve.y(midpoint_x);
            const angle = curve.angle(midpoint_x);
            this.draw?.deltaPolygon(
                [midpoint, ...pt.Point.rotate(triangle_delta_coords, angle)],
                {stroke: 'none', fill: this.curve_attributes.stroke}
            );
        }
    }
    public getAnnotation(): rh.AnnotationElement {
        const target_latex = this.target.to_latex();
        if (!this.annotation) {
            this.annotation = new rh.AnnotationElement(
                this.renderHandler,
                target_latex || '',
                {font_size: 0.7, color: this.color}
            )
        }
        return this.annotation!;
    }
    
}

/*
 * `Reals` is the default datatype and normally not worth a wire of its own -
 * the array's axes already draw a line each, and an anchor beside them saying
 * "real" adds nothing.
 *
 * An array with no axes has no lines at all, though. A scalar would be drawn as
 * nothing whatever, and the operator it feeds would sit with an empty side. So
 * there, and only there, the datatype anchor is the one thing left to carry the
 * array - drawn unlabelled, `Reals` having no latex of its own, which is the
 * right amount to say about it.
 *
 * Inside an `OperationBox` the arrays are weave *targets*, with the `TILED`
 * slots taken out, so an array broadcast over its every axis reaches here
 * looking exactly like a true scalar. It is not one: its degree wires are drawn
 * around the operator and already carry it, and giving it an anchor as well
 * would put a second wire beside them. Hence the weave - when it has `TILED`
 * slots, the axes are only missing from this view, not missing.
 */
function realsDatatypeAnchor(
    categoryRenderer: BroadcastedRenderer<any, any>,
    target: cat.Datatype,
    array: cat.Array<any, any>,
    weave?: cat.Weave<any, any>
): DatatypeAnchor<any> | undefined {
    const tiled = weave?._shape.some((s) => !(s instanceof cat.Axis)) ?? false;
    if (array._shape.length > 0 || tiled) {
        return undefined;
    }
    return new DatatypeAnchor(categoryRenderer, target);
}

function defaultDatatypeAnchor(
    categoryRenderer: BroadcastedRenderer<any, any>,
    target: cat.Datatype,
    array: cat.Array<any, any>,
    weave?: cat.Weave<any, any>
): DatatypeAnchor<any> | undefined {
    return new DatatypeAnchor(categoryRenderer, target);
}

datatypesRegistry.registerFunction(cat.Reals)(realsDatatypeAnchor);
datatypesRegistry.registerDefaultFunc(defaultDatatypeAnchor);

export class ArrayMeridian<B extends cat.Datatype, A extends cat.Axis> extends cr.Meridian<A | B> {
    public axes_anchors: cr.ProdObjectMeridian<A>;
    public datatype_anchor?: DatatypeAnchor<B>;
    constructor(
        public categoryRenderer: BroadcastedRenderer<B, A>,
        public target: cat.Array<B, A>,
        /*
         * The weave `target` is the target of, when this meridian is drawing a
         * weave's view of an array rather than the array itself - which is what
         * an `OperationBox` does, since an operator sees only the slots that are
         * not broadcast over. Whoever builds the meridian is the only one who
         * still knows, so they pass it on.
         */
        public weave?: cat.Weave<B, A>,
    ) {
        super(categoryRenderer);
        this.axes_anchors = categoryRenderer.strideRenderer.display_prod_object(
            this.target.shape()
        );
        // The array is the only place an axis and the datatype it travels with
        // are both in hand, so it is where each axis is handed the processor
        // that decides how it is drawn. Separators are not axes and keep
        // whatever the settings gave them.
        this.axes_anchors.anchors.forEach((anchor) => {
            if (anchor instanceof scr.AxisAnchor) {
                anchor.assign_processor(this.target);
            }
        });
        this.datatype_anchor = datatypesRegistry.getConstructor(this.target.datatype)(
            categoryRenderer,
            this.target.datatype,
            this.target,
            this.weave
        ) as DatatypeAnchor<B> | undefined;
        this.children = 
            this.datatype_anchor
            ? [new rh.Vertical(
                this.renderHandler,
                [this.axes_anchors,
                this.datatype_anchor],
            )] : [this.axes_anchors];
        this.anchors = [
            ...this.axes_anchors.anchors,
            ...(this.datatype_anchor ? [this.datatype_anchor] : [])
        ];
    }
    public kept_axes(weave: cat.Weave<B, A>): cr.Meridian<A> {
        return new cr.ConcatMeridian<A>(
            this.categoryRenderer,
            weave.select_target(this.axes_anchors.anchors)
        );
    }
    public kept_mask(weave: cat.Weave<B, A>): boolean[] {
        return [
            ...weave._shape.map(
                (s) => s instanceof cat.Axis
            ),
            ...(this.datatype_anchor ? [true] : [])
        ]
    }
    public enableAnnotation(): void {
        this.axes_anchors.enableAnnotation();
    }
}

export class BroadcastedRenderer<
    B extends cat.Datatype, 
    A extends cat.Axis> 
    extends cr.CategoryRenderer<cat.Array<B, A>, cat.Broadcasted<B, A>, A | B> {
        
    public settings: crs.BroadcastedRendererSettings<B, A>;
    constructor(
        public renderHandler: rh.RenderHandler,
        public strideRenderer: scr.StrideRenderer<A> = new scr.StrideRenderer<A>(renderHandler),
        _settings: Partial<crs.BroadcastedRendererSettings<B, A>> = {},
    ) {
        super(renderHandler, _settings);
        this.settings = {
            ...crs.DefaultBroadcastedRendererSettings,
            // @ts-ignore: ts(2855)
            ...super.settings
        };
    }

    public display_lone(target: cat.Array<B, A>): ArrayMeridian<B, A> {
        return new ArrayMeridian(this, target);
    }
    public display_prod_object(target: cat.ProdObject<cat.Array<B, A>>): cr.ProdObjectMeridian<cat.Array<B, A>, A | B> {
        return new cr.ProdObjectMeridian(this, target);
    }
    public display_morphism(
        target: cat.Broadcasted<B, A>
    ): cr.MorphismBox<cat.Array<B, A>, cat.Broadcasted<B, A>, A | B> {
        return display_broadcasted(this, target);
    }
}

export function display_broadcasted<B extends cat.Datatype, A extends cat.Axis>(
    categoryRenderer: BroadcastedRenderer<B, A>,
    target: cat.Broadcasted<B, A>,
) {
    //const mode = find_broadcast_display_type(target);
    return new BroadcastedBox(categoryRenderer, target);
}

export enum BroadcastDisplayType {
    /*
     * Every reindexing is a plain rearrangement, so it needs no figure of its
     * own: the degree wires route around the operator, output back to input.
     */
    WEAVE = 'WEAVE',
    /*
     * One reindexing shared by every input, drawn as a single node the degree
     * anchors all pass into before fanning back out to the inputs.
     */
    NODE = 'NODE',
    /*
     * Inputs reindexed differently from one another, so no one node speaks for
     * all of them. Not rendered yet.
     */
    JOIN = 'JOIN',
}

function find_broadcast_display_type(
    target: cat.Broadcasted<any, any>,
    op_box: OperationBox<any, any, any>
): BroadcastDisplayType {
    const reindexings = target.reindexings;
    if (reindexings.every((r) => tu.isIdentity(r) && r.dom().length === 0)) {
        return BroadcastDisplayType.WEAVE;
    }
    if (op_box.override_display_type !== undefined) {
        return op_box.override_display_type;
    }
    if (reindexings.every((r) => tu.is_mappable(r))) {
        return BroadcastDisplayType.WEAVE;
    }
    /*
     * Structural equality, via `deep_equals` inside `iallequals` - reindexings
     * carry no uid, so equal ones arrive as separate objects and a reference
     * test would send every multi-input broadcast to JOIN.
     */
    const unified = ut.iallequals(reindexings, undefined);
    if (unified !== undefined) {
        return BroadcastDisplayType.NODE;
    }
    return BroadcastDisplayType.JOIN;
}

function label_kept<B extends cat.Datatype, A extends cat.Axis>(
    anchors: cr.ProdObjectMeridian<cat.Array<B, A>, B | A>,
    weaves: cat.Weave<B, A>[],
): boolean[] {
    const array_anchors = anchors.lone_elements as ArrayMeridian<B, A>[];
    const flat_weave = ut.zip(array_anchors, weaves).map(
        ([array_anchor, weave]) => array_anchor.kept_mask(weave)
    );
    if (anchors.separated) {
        return ut.join(
            () => [true],
            flat_weave
        ).flat();
    }
    return flat_weave.flat();
}

export class BroadcastedBox<B extends cat.Datatype, A extends cat.Axis, Op extends cat.Operator = any>
    extends cr.MorphismBox<cat.Array<B, A>, cat.Broadcasted<B, A>, A | B> {
        // The basic set up is the following:
        // BroadcastedBox
        // - Left Anchors
        // - Core
        //   - Node Box (reindexing)
        //   - Base Box (operation)
        // - Right Anchors
    get settings(): crs.BroadcastedRendererSettings<B, A> {
        return this.categoryRenderer.settings;
    }
    
    public left_anchors: cr.ProdObjectMeridian<cat.Array<B, A>, B | A>;
    public right_anchors: cr.ProdObjectMeridian<cat.Array<B, A>, B | A>;

    public left_kept_labels: boolean[];
    public right_kept_labels: boolean[];

    public left_kept_anchors: cr.ConcatMeridian<B | A>;
    public right_kept_anchors: cr.ConcatMeridian<B | A>;

    private core: rh.DiagramElement;
    private display_type: BroadcastDisplayType;
    private node_box?: cr.AnchoredBox<A | B>;
    private hover_box: rh.DiagramElement;
    private op_box: OperationBox<B, A, Op>;

    constructor(
        public categoryRenderer: BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, Op>,
    ) {
        super(categoryRenderer, target);
        // Setup anchors
        this.left_anchors = this.categoryRenderer.display_prod_object(
            this.target.dom());
        this.right_anchors = this.categoryRenderer.display_prod_object(
            this.target.cod());

        this.left_kept_labels = label_kept(this.left_anchors, this.target.input_weaves);
        this.right_kept_labels = label_kept(this.right_anchors, this.target.output_weaves);

        this.left_kept_anchors = new cr.ConcatMeridian(this.categoryRenderer,
            ut.mask(this.left_kept_labels, this.left_anchors.anchors));
        this.right_kept_anchors = new cr.ConcatMeridian(this.categoryRenderer,
            ut.mask(this.right_kept_labels, this.right_anchors.anchors));

        // Setup base box - Represents the underlying operation.
        this.op_box = opsRegistry.getConstructor(this.target.operator)(this.categoryRenderer, this.target);
        this.left_kept_anchors.link(this.op_box.left_anchors);
        this.op_box.right_anchors.link(this.right_kept_anchors);
        
        this.display_type = find_broadcast_display_type(
            this.target, this.op_box);
    
        // WEAVE FORM
        // The weave form is used for:
        // -- Einops
        // -- Addition
        // -- Rearrangements
        // -- Elementwise
        if (this.display_type === BroadcastDisplayType.WEAVE) {
            this.link_weaves();
            this.setBorderColor('cyan');
        }
        // NODE FORM
        // The node form is used for:
        // -- Linears
        else if (this.display_type === BroadcastDisplayType.NODE) {
            this.node_box = this.categoryRenderer.strideRenderer.display_category(
                this.target.reindexings[0],
                false,
            );
            this.link_node();
            this.right_anchors.anchors.forEach((a) => a.allow_skip = true);
            this.setBorderColor('grey');
            console.log(this.node_box?.dims.y);
        }
        
        // Setup core
        const core_width = Math.max(
            this.op_box.dims.x, this.node_box?.dims.x ?? 0
        ) + 2 * (
            this.op_box.parent_gap ??
            this.categoryRenderer.settings.broadcast_offset_x
        ) + 2 * (
            this.node_box ? 5 : 0
        );
        const degree_gap = (
            this.target.degree().length 
            * this.settings.anchor_height) * 0.5;
        
        const height = Math.max(
            this.left_anchors.dims.y,
            this.right_anchors.dims.y,
            this.op_box.dims.y + degree_gap,
        )
        
        if (this.node_box) {
            this.hover_box = new rh.Vertical(
                this.renderHandler,
                [this.node_box, this.op_box],
            )
        } else {
            this.hover_box = this.op_box;
        }
        this.core = new rh.CoreElement(
            this.renderHandler,
            {x: core_width, y: height},
            [this.hover_box]
        );

        this.children = [
            this.left_anchors,
            this.core,
            this.right_anchors,
        ]
             
    }
    private link_node(): void {
        // LHS
        const input_tiled = ut.zip(
            this.target.input_weaves,
            this.left_anchors.lone_elements as ArrayMeridian<B, A>[]
        ).map(([weave, lone_element]) => new cr.ConcatMeridian(
            this.categoryRenderer,
            weave.select_degree(lone_element.axes_anchors.anchors)
        ));
        input_tiled.forEach((tiling_axes) => {
            // tiling_axes.anchors.forEach((a) => a.loose = true);
            tiling_axes.link(this.node_box!.left_anchors);
        });
        // RHS
        const degrees = ut.zip(
            this.target.output_weaves,
            this.right_anchors.lone_elements as ArrayMeridian<B, A>[]
        ).map(([weave, lone_element]) => new cr.ConcatMeridian(
            this.categoryRenderer,
            weave.select_degree(lone_element.axes_anchors.anchors)
        ));
        degrees.forEach((degree) => {
            // degree.anchors.forEach((a) => a.loose = true);
            this.node_box?.right_anchors.link(degree);
        });
    }
    private link_weaves(): void {
        const degree = this.target.output_weaves[0].select_degree(
            (this.right_anchors.lone_elements[0] as ArrayMeridian<B, A>).axes_anchors.anchors
        );
        /*
         * A reindexing's mapping is indexed by its codomain - an input array's
         * degree - and names the broadcast degree slot each input axis is drawn
         * from. So every input degree anchor is linked by construction, and the
         * deletions sit on the other side: broadcast degree slots that no
         * mapping names, whose wire arrives with nothing feeding it.
         */
        const passed_through: Set<number> = new Set();
        for (const [input_anchors, input_weave, reindexing] of ut.zip(
            this.left_anchors.lone_elements, this.target.input_weaves, this.target.reindexings
        )) {
            const degree_out = input_weave.select_degree(
                (input_anchors as ArrayMeridian<B, A>)
                .axes_anchors.anchors);
            const mapping = tu.get_mapping(reindexing as tu.Mappable);
            degree_out.forEach((a, i) => {
                a.link(degree[mapping[i]]);
                passed_through.add(mapping[i]);
            });
        }
        /*
         * Dotted against every reindexing at once rather than one at a time.
         * The degree anchors are shared by the whole weave, so an axis some
         * other input does supply is not a deletion here, however many inputs
         * are broadcast over it.
         */
        degree.forEach((anchor, i) => {
            if (!passed_through.has(i)) {
                anchor.add_dot = true;
            }
        });
    }
    post_placement(): void {
        this.apply_translation_update();
        super.post_placement();
    }
    update(): void {
        super.update();
    }
    protected apply_translation_update(): void {
        const kept_anchors = [
            ...(this.display_type == BroadcastDisplayType.WEAVE ?
                this.left_kept_anchors.anchors : this.left_anchors.anchors),
            ...(this.display_type == BroadcastDisplayType.WEAVE ?
                this.right_kept_anchors.anchors : this.right_anchors.anchors)
        ];
        const locations = kept_anchors.map(
            (a) => a.rectangle()?.getLocation({x:0, y:0.5}).y!
        );
        const avg_y = ut.sum(locations) / locations.length;
        const avg_x = (this.left_anchors.rectangle().left + this.right_anchors.rectangle().right) / 2;
        const reference_box = this.hover_box;
        const base_rect = reference_box.rectangle();
        const my_x = this.rectangle().left;
        const base_x = base_rect.left;
        const base_y = base_rect.top;
        reference_box.transform.offset = {
            x: (avg_x - base_x),
            //x: (this.base_box.parent_gap ?? this.settings.broadcast_offset_x),//my_x - base_x,
            // x: this.base_box.parent_gap ??
            //     this.settings.broadcast_offset_x,
            y: (avg_y - base_y)
        }
        reference_box.transform.positioning = {x: -0.5, y: -0.5};
    }
    protected get_axis_midpoint(): number {
        // const summation = this.left_kept.reduce((acc, kept, i) => 
        //     kept ? acc + i + 0.5 : acc, 0);
        // const numerator = this.left_kept.reduce((acc, kept) => 
        //     kept ? acc + 1 : acc, 0);
        const locations = ut.join(
            () => [cat.WeaveMode.TILED],
            this.target.input_weaves.map((weave) => weave._shape)
        ).flatMap((x, i) => x);
        const locations_index: [cat.Axis | cat.WeaveMode, number][] = locations.map((x, i) => ([x, i]));
        const summation = locations_index.reduce((acc, [x, i]) => 
            x instanceof cat.Axis ? acc + i + 0.5 : acc, 0);
        if (summation === 0) {
            return 0;
        }
        const numerator = locations_index.reduce((acc, [x, i]) =>
            x instanceof cat.Axis ? acc + 1 : acc, 0);
        return summation / numerator;
    }
    highlight(): void {
        this.op_box.highlight();
    }
    dehighlight(): void {
        this.op_box.dehighlight();
    }
}

@opsRegistry.registerDefaultClass
export class OperationBox<B extends cat.Datatype, A extends cat.Axis, Op extends cat.Operator = any>
    extends cr.MorphismBox<cat.Array<B, A>, cat.Broadcasted<B, A, Op>, A | B> {
    public left_anchors: cr.ProdObjectMeridian<cat.Array<B, A>, B | A>;
    public right_anchors: cr.ProdObjectMeridian<cat.Array<B, A>, B | A>;
    public core: rh.DiagramElement;
    public parent_gap?: number;
    public override_display_type?: BroadcastDisplayType;
    // public annotation?: rh.AnnotationElement;
    constructor(
        public categoryRenderer: BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, Op>,
        public core_dims: pt.Point = categoryRenderer.settings.operation_core_dims,
    ) {
        super(categoryRenderer, target);
        /*
         * Built a meridian at a time rather than through `display_prod_object`,
         * so each one is told which weave it is the target of. Without that an
         * array broadcast over every axis is indistinguishable here from a
         * scalar - see `realsDatatypeAnchor`.
         */
        this.left_anchors = new cr.ProdObjectMeridian(
            this.categoryRenderer,
            this.target.input_weaves.map(
                (w) => new ArrayMeridian(this.categoryRenderer, w.target(), w)));
        this.right_anchors = new cr.ProdObjectMeridian(
            this.categoryRenderer,
            this.target.output_weaves.map(
                (w) => new ArrayMeridian(this.categoryRenderer, w.target(), w)));
        this.core = new rh.CoreElement(
            this.renderHandler,
            this.core_dims,
        )
        this.children = [
            this.left_anchors,
            this.core,
            this.right_anchors,
        ];
        this.setBorderColor('magenta');
    }
    get settings(): crs.BroadcastedRendererSettings<B, A> {
        return this.categoryRenderer.settings;
    }
    update(): void {
        super.update();
    }
}