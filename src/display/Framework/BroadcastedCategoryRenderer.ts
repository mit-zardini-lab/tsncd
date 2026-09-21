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
    DatatypeDisplay<cat.Datatype> | undefined,
    [BroadcastedRenderer<any, any>,
    cat.Datatype,
    cat.Array<any, any>,
    // The weave the array is the target of, where there is one - see
    // `ArrayMeridian`. `undefined` for an array drawn in its own right.
    cat.Weave<any, any> | undefined]
>();

// TODO: Magic Numbers
const DATATYPE_ANCHOR_TRIANGLE_X = 7;
const DATATYPE_ANCHOR_TRIANGLE_Y = 4;

/* The triangle a datatype wire carries half way along, in the deltas
 * `deltaPolygon` reads, pointing along the positive x axis before it is
 * rotated onto the direction the wire travels in. */
const DATATYPE_TRIANGLE_DELTAS: pt.Point[] = [
    {x: -DATATYPE_ANCHOR_TRIANGLE_X,     y: -DATATYPE_ANCHOR_TRIANGLE_Y},
    {x:  DATATYPE_ANCHOR_TRIANGLE_X / 3, y:  DATATYPE_ANCHOR_TRIANGLE_Y},
    {x: -DATATYPE_ANCHOR_TRIANGLE_X / 3, y:  DATATYPE_ANCHOR_TRIANGLE_Y},
];

/* The shortest wire that carries a direction triangle, which is the length of
 * two triangles. A shorter one is most of the way covered by the mark. */
export const DATATYPE_TRIANGLE_SHORTEST_WIRE = 2 * DATATYPE_ANCHOR_TRIANGLE_X;

/*
 * The tip a direction triangle needs for its body to straddle `point` rather
 * than trail behind it, travelling along `angle`.
 *
 * The triangle is drawn from its tip and its body runs back along the
 * direction of travel, which stays on a straight wire wherever the tip is put.
 * On a curve the straight body leaves the wire, the more so the further back
 * it reaches, and it is also turned by however much the wire turned over that
 * distance. Advancing the tip half the body's length puts as much of the body
 * on each side of `point`. At the radius `ArrangeBox` draws its cup with, a
 * body of 7px then leaves the arc by 0.6px at its ends.
 */
export function datatype_triangle_tip_centred_on(
    point: pt.Point,
    angle: number,
): pt.Point {
    return {
        x: point.x + Math.cos(angle) * DATATYPE_ANCHOR_TRIANGLE_X / 2,
        y: point.y + Math.sin(angle) * DATATYPE_ANCHOR_TRIANGLE_X / 2,
    };
}

/*
 * The triangle that says which way a datatype wire travels, tip at `point` and
 * pointing along `angle`.
 *
 * `DatatypeAnchor.update` draws one half way along every wire it paints.
 * `ArrangeBox` draws one on the arc of its cup, which is a datatype wire no
 * anchor paints, and puts the tip where `datatype_triangle_tip_centred_on`
 * says.
 */
export function draw_datatype_direction_triangle(
    draw: dhd.DrawHandler<any> | undefined,
    point: pt.Point,
    angle: number,
    color: string | undefined,
    layer: 'main' | 'broadcast' = 'main',
): void {
    draw?.deltaPolygon(
        [point, ...pt.Point.rotate(DATATYPE_TRIANGLE_DELTAS, angle)],
        {stroke: 'none', fill: color}, undefined, layer,
    );
}

/* How far the two ends of a straight run stand apart. */
function straight_run_length(run: Curve.StraightLine): number {
    return Math.hypot(run.end.x - run.start.x, run.end.y - run.start.y);
}

/*
 * Where the direction triangle of a wire that turns is drawn, and the
 * direction of travel there, or nothing where no straight run of the wire is
 * long enough to hold the mark.
 *
 * `cr.wire_curve` builds a turning wire as a run along one axis, a quarter
 * circle and a run along the other. `Curve.midpoint` halves a curve's span in
 * x, and the vertical run of a turning wire spans no x at all, so the point it
 * returns lands on the turn or on the horizontal run and the gradient it
 * reports there is infinite. The mark therefore goes half way along the longer
 * of the two straight runs, at the angle that run travels at.
 */
export function turning_wire_direction_mark(
    curve: Curve.Curve,
): {point: pt.Point, angle: number} | undefined {
    if (!(curve instanceof Curve.CurveSequence)) {
        return undefined;
    }
    let longest: Curve.StraightLine | undefined;
    for (const piece of curve.curves) {
        if (!(piece instanceof Curve.StraightLine)) {
            continue;
        }
        if (longest === undefined
                || straight_run_length(piece) > straight_run_length(longest)) {
            longest = piece;
        }
    }
    if (longest === undefined
            || straight_run_length(longest) < DATATYPE_TRIANGLE_SHORTEST_WIRE) {
        return undefined;
    }
    const {point, angle} = longest.midpoint();
    return {point: datatype_triangle_tip_centred_on(point, angle), angle};
}

export class DatatypeAnchor<B extends cat.Datatype> extends cr.Anchor<B> {
    protected annotation?: rh.AnnotationElement;
    protected color?: string;
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

    /*
     * How many anchor heights the label of this anchor takes above the array's
     * axes. The default anchor is a wire of its own below the axes, which
     * takes none, and `ArrayMeridian` stacks it there.
     */
    public rows_above_axes(): number {
        return 0;
    }

    update(): void {
        if (this.skipped() || !this.draws_wire()) {
            return;
        }
        for (const {anchor: next, layer} of this.wire_connections()) {
            const [p0, p1] = [this.location()!, next.location()!];
            const curve = cr.wire_curve(
                p0, p1, this.horizontal, next.horizontal,
                this.settings.turn_radius);
            this.draw?.curve(curve, {...this.curve_attributes}, undefined, layer);
            if (Math.hypot(p1.x - p0.x, p1.y - p0.y)
                    < DATATYPE_TRIANGLE_SHORTEST_WIRE) {
                continue;
            }
            const mark = this.horizontal === next.horizontal
                ? curve.midpoint()
                : turning_wire_direction_mark(curve);
            if (mark === undefined) {
                continue;
            }
            draw_datatype_direction_triangle(
                this.draw, mark.point, mark.angle,
                this.curve_attributes.stroke, layer);
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

export class DatatypeDisplay<B extends cat.Datatype> {
    constructor(
        readonly anchor?: DatatypeAnchor<B>,
        readonly label?: cr.AnchorAnnotation,
        readonly axis_annotations: readonly (scr.AxisAnnotationFormat | undefined)[] = [],
    ) {}

    public recolor(color: string): void {
        this.anchor?.recolor(color);
        if (this.label) {
            this.label.annotation.annotationSettings.color = color;
        }
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
 * array, and it is labelled as the other datatype wires are. The user ruled on
 * 2026-09-17 that a drawn `Reals` wire is named.
 *
 * Inside an `OperationBox` the arrays are weave *targets*, with the `TILED`
 * slots taken out, so an array broadcast over its every axis reaches here
 * looking exactly like a true scalar. It is not one: its degree wires are drawn
 * around the operator and already carry it, and giving it an anchor as well
 * would put a second wire beside them. Hence the weave - when it has `TILED`
 * slots, the axes are only missing from this view, not missing.
 */
export function is_true_scalar(
    array: cat.Array<any, any>,
    weave?: cat.Weave<any, any>,
): boolean {
    const tiled = weave?._shape.some((s) => !(s instanceof cat.Axis)) ?? false;
    return array._shape.length === 0 && !tiled;
}

/*
 * The name a drawn `Reals` wire carries.
 *
 * `cat.Reals` mirrors `pyncd`'s, which has no latex of its own. The datatype
 * of an array is written into its quantisation label, which does not want
 * `\mathbb{R}` in it. The name belongs to the wire, so the anchor that draws
 * the wire is where it is written.
 */
export class RealsDatatypeAnchor<B extends cat.Datatype> extends DatatypeAnchor<B> {
    public getAnnotation(): rh.AnnotationElement {
        if (!this.annotation) {
            this.annotation = new rh.AnnotationElement(
                this.renderHandler,
                '\\mathbb{R}',
                {font_size: 0.7, color: this.color},
            );
        }
        return this.annotation;
    }
}

function realsDatatypeDisplay(
    categoryRenderer: BroadcastedRenderer<any, any>,
    target: cat.Datatype,
    array: cat.Array<any, any>,
    weave?: cat.Weave<any, any>
): DatatypeDisplay<cat.Datatype> | undefined {
    if (!is_true_scalar(array, weave)) {
        return undefined;
    }
    return new DatatypeDisplay(new RealsDatatypeAnchor(categoryRenderer, target));
}

function defaultDatatypeDisplay(
    categoryRenderer: BroadcastedRenderer<any, any>,
    target: cat.Datatype,
    array: cat.Array<any, any>,
    weave?: cat.Weave<any, any>
): DatatypeDisplay<cat.Datatype> {
    return new DatatypeDisplay(new DatatypeAnchor(categoryRenderer, target));
}

datatypesRegistry.registerFunction(cat.Reals)(realsDatatypeDisplay);
datatypesRegistry.registerDefaultFunc(defaultDatatypeDisplay);

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
        const datatype_display = datatypesRegistry.getConstructor(this.target.datatype)(
            categoryRenderer,
            this.target.datatype,
            this.target,
            this.weave
        ) as DatatypeDisplay<B> | undefined;
        this.datatype_anchor = datatype_display?.anchor;
        const column_elements = this.datatype_anchor
            ? this.stack_with_datatype(this.datatype_anchor)
            : [this.axes_anchors];
        const label = datatype_display?.label;
        const label_axis = label?.placement === 'below'
            ? this.axes_anchors.anchors[this.axes_anchors.anchors.length - 1]
            : this.axes_anchors.anchors[0];
        if (label && label_axis) {
            label_axis.auxiliary_annotations.push(label);
        }
        this.axes_anchors.anchors.forEach((anchor, index) => {
            const format = datatype_display?.axis_annotations[index];
            if (anchor instanceof scr.AxisAnchor && format) {
                anchor.set_annotation_format(format);
            }
        });
        this.children = column_elements.length === 1
            ? column_elements
            : [new rh.Vertical(this.renderHandler, column_elements)];
        this.anchors = [
            ...this.axes_anchors.anchors,
            ...(this.datatype_anchor ? [this.datatype_anchor] : [])
        ];
    }
    /*
     * The axes and the datatype anchor, top to bottom. An anchor whose label
     * stands above the axes goes above them, under room for each line of its
     * label past the first, and any other datatype anchor goes below them.
     * The order of `anchors` is the same either way, with the datatype last,
     * so the two sides of a gap and the two views of an operand pair their
     * anchors as they did.
     */
    private stack_with_datatype(datatype_anchor: DatatypeAnchor<B>): rh.DiagramElement[] {
        const rows_above = datatype_anchor.rows_above_axes();
        if (rows_above === 0) {
            return [this.axes_anchors, datatype_anchor];
        }
        const room_for_further_lines = rows_above > 1
            ? [new rh.CoreElement(this.renderHandler, {
                x: 0,
                y: this.categoryRenderer.settings.anchor_height * (rows_above - 1),
            })]
            : [];
        return [...room_for_further_lines, datatype_anchor, this.axes_anchors];
    }
    public kept_axes(weave: cat.Weave<B, A>): cr.Meridian<A> {
        return new cr.ConcatMeridian<A>(
            this.categoryRenderer,
            weave.select_target(this.axes_anchors.anchors)
        );
    }
    /*
     * Which of this meridian's anchors the operator reads. One entry per
     * anchor, so it is asked of a meridian built from the ARRAY: an entry of
     * the weave's shape is an axis where the operator reads that position and
     * `TILED` where it is broadcast over it.
     */
    public kept_mask(weave: cat.Weave<B, A>): boolean[] {
        return [
            ...weave._shape.map(
                (s) => s instanceof cat.Axis
            ),
            ...(this.datatype_anchor ? [true] : [])
        ]
    }
    /*
     * One entry per position of the ARRAY, and one for the datatype: the
     * anchor this meridian carries there, or nothing where it carries none.
     *
     * The two meridians of one operand - the array, and the weave's target -
     * are laid out against this list, so that the operator's anchor for a
     * position sits under the array's. A meridian of the array has an anchor
     * everywhere; one of the target, which is the case `weave` records, has
     * one only where the shape names an axis, since the operator does not see
     * the positions it is broadcast over.
     *
     * The datatype's slot is there in both views or in neither.
     * `is_true_scalar` accounts for tiled axes omitted from the target view.
     */
    public row_slots(weave: cat.Weave<B, A>): (cr.Anchor<A | B> | undefined)[] {
        const axes = [...this.axes_anchors.anchors];
        return [
            ...weave._shape.map(
                (s) => (this.weave === undefined || s instanceof cat.Axis)
                    ? axes.shift() : undefined),
            ...(this.datatype_anchor ? [this.datatype_anchor] : []),
        ];
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
    return broadcasted_box(categoryRenderer, target);
}

/*
 * The one `Broadcasted` a block asks to be drawn in place of, or `null` for
 * every other morphism.
 *
 * A sender wraps an operator in a block to give it a title, a formula and a
 * description for its inspection box, and sets `BlockDrawing.BODY_IN_PLACE` to
 * say that the block itself is not to be drawn. The wrapper's domain and
 * codomain are its body's, its weaves hold the whole arrays and its reindexings
 * are identities, so the body's own box draws the figure the bare operator
 * draws. A block whose body is anything but a single `Broadcasted` is drawn as
 * the box every other block is drawn as.
 */
export function body_drawn_in_place<B extends cat.Datatype, A extends cat.Axis>(
    target: cat.Broadcasted<B, A>,
): cat.Broadcasted<B, A> | null {
    const operator = target.operator;
    if (!(operator instanceof ops.BlockOperator)
        || !cat.draws_body_in_place(operator.block.aesthetics)) {
        return null;
    }
    const body = operator.block.body;
    return body instanceof cat.Broadcasted
        ? body as cat.Broadcasted<B, A> : null;
}

/*
 * The box a `Broadcasted` is drawn as: the box of the body where a block asks
 * for its body to be drawn in its place, and the box of the morphism itself
 * otherwise. The glyph is registered under the wrapper either way, so the
 * inspection box the pointer opens over it is the block's.
 */
export function broadcasted_box<B extends cat.Datatype, A extends cat.Axis>(
    categoryRenderer: BroadcastedRenderer<B, A>,
    target: cat.Broadcasted<B, A>,
    wrap?: WrapLayout,
): BroadcastedBox<B, A> {
    const body = body_drawn_in_place(target);
    if (body === null) {
        return new BroadcastedBox(
            categoryRenderer, target, wrap ?? no_wrap(target));
    }
    return new BroadcastedBox(
        categoryRenderer, body, wrap ?? no_wrap(body), target);
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
     * all of them. Not rendered yet - see TODO.md.
     */
    JOIN = 'JOIN',
}

/*
 * The three modes describe the DEGREE wires, and a wrapped box has degree
 * wires on two sides: the columns, and the rows a grabbed operand and a
 * dropped result are drawn on. `find_broadcast_display_type` answers for the
 * columns and `row_display_type` for the rows, and the two differ in one
 * thing: a row does not read the box's override.
 *
 * `LinearBox` and `TopKBox` force `NODE` so that the reindexing they carry is
 * drawn as a figure, and that figure stands in the core between the two
 * columns. A degree axis on a ROW would have to travel into the core and back
 * out to reach the right column, which is a detour across the width of the box
 * to pass through a rearrangement that draws nothing. So a row asks the
 * general question - is every reindexing a rearrangement - and weaves where
 * the answer is yes.
 */
export function row_display_type(
    target: cat.Broadcasted<any, any>,
): BroadcastDisplayType {
    return find_broadcast_display_type(target);
}

function find_broadcast_display_type(
    target: cat.Broadcasted<any, any>,
    op_box?: OperationBox<any, any, any>
): BroadcastDisplayType {
    const reindexings = target.reindexings;
    if (reindexings.every((r) => tu.isIdentity(r) && r.dom().length === 0)) {
        return BroadcastDisplayType.WEAVE;
    }
    if (op_box?.override_display_type !== undefined) {
        return op_box.override_display_type;
    }
    if (reindexings.every((r) => tu.is_mappable(r))) {
        return BroadcastDisplayType.WEAVE;
    }
    /*
     * Structural equality, via `deep_equals` inside `iallequals` - reindexings
     * carry no uid, so equal ones arrive as separate objects and a reference
     * test would send every multi-input broadcast to JOIN. The reindexings are
     * read as they are drawn, since a block explaining one carries a tag with a
     * uid of its own and two blocks around one reindexing are not equal.
     */
    const unified = ut.iallequals(
        reindexings.map((r) => tu.drawn_morphism(r)), undefined);
    if (unified !== undefined) {
        return BroadcastDisplayType.NODE;
    }
    return BroadcastDisplayType.JOIN;
}

/*
 * The reindexing the NODE form draws.
 *
 * `NODE` means one reindexing speaks for every input, and a parametrised
 * operator is the case where that is false. `show_grabbed_parameters` gives a
 * weight a weave with no TILED position and a reindexing deleting the whole
 * degree, and puts it in the FIRST slot, so `reindexings[0]` is the deletion.
 * Drawing the deletion gives a node with an empty codomain, and the output's
 * degree anchors are then left with nothing linking into them. The figure
 * wanted is the reindexing of an operand that is broadcast, meaning one whose
 * weave has a TILED position, which is what `LinearBox` and `TransposeBox`
 * force `NODE` on. Where no operand is broadcast, every reindexing deletes the
 * same degree and the first one speaks for the box as it did before.
 */
function degree_reindexing<B extends cat.Datatype, A extends cat.Axis>(
    target: cat.Broadcasted<B, A>,
): cat.StrideCategory<A> {
    const broadcast = ut.zip(target.input_weaves, target.reindexings).find(
        ([weave]) => weave.select_degree(weave._shape).length > 0);
    return broadcast ? broadcast[1] : target.reindexings[0];
}

/*
 * Which anchors of a column (or a row) the operator actually reads: the
 * target axes of each weave, plus the datatype anchor where there is one. A
 * column with separators keeps those too, since they cross the operator.
 */
function label_kept<B extends cat.Datatype, A extends cat.Axis>(
    anchors: {lone_elements: cr.Meridian<B | A>[], separated?: unknown},
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

/*
 * Which operands of a `Broadcasted` arrive from ABOVE and which results leave
 * BELOW, rather than from the left and to the right. This is the layout a
 * `ParaWrap` asks for - `para/ParaWrapBroadcastedDisplay` - so that an
 * operand taken off the tape is seen entering the operator.
 *
 * Two rows, as there are two columns. The `BroadcastedBox` puts the grabbed
 * operand's whole array - degree axes included - on a row along its own top
 * edge, where the tape reaches it; the `OperationBox` puts the operand's
 * TARGET on a row along the top of the glyph, exactly as its left column
 * holds the targets of the operands arriving from the left. Target to
 * target the two rows link straight down; the degree axes route round the
 * glyph to the right column as any other operand's do. Neither row reserves
 * height - each is zero tall at its box's edge - so a wrapped operation is
 * exactly as tall as the unwrapped one, and the tape, drawn by the wrapper
 * past the box, crosses whatever lies between. A box built with the trivial
 * layout is exactly the box built without one.
 */
export interface WrapLayout {
    grabbed: boolean[];
    dropped: boolean[];
}

export function no_wrap(target: cat.Broadcasted<any, any>): WrapLayout {
    return {
        grabbed: target.input_weaves.map(() => false),
        dropped: target.output_weaves.map(() => false),
    };
}

export function is_wrapped(wrap: WrapLayout): boolean {
    return wrap.grabbed.some(Boolean) || wrap.dropped.some(Boolean);
}

/*
 * A row of taped operands or results over or under an operator, laid out so
 * that its wires do not cross: the anchors the operator reads sit on the side
 * of the row nearest the column they pair with - left, for a top row whose
 * cups reach the left column - and the degree anchors, which bypass the
 * operator to the far column, on the other side. A bottom row is the mirror:
 * its degree arrives from the left, its targets from the operator.
 */
/* The anchors of a column or row that the operator reads, as one meridian
 * to link to the operator box's own. */
function kept_anchors<B extends cat.Datatype, A extends cat.Axis>(
    categoryRenderer: BroadcastedRenderer<B, A>,
    anchors: cr.Meridian<B | A> & {lone_elements: cr.Meridian<B | A>[], separated?: unknown},
    weaves: cat.Weave<B, A>[],
): cr.ConcatMeridian<B | A> {
    return new cr.ConcatMeridian(
        categoryRenderer, ut.mask(label_kept(anchors, weaves), anchors.anchors));
}

/*
 * A product laid out along a box's top or bottom edge, as `ProdObjectMeridian`
 * lays one out down a box's side.
 *
 * A `BroadcastedBox` and the `OperationBox` inside it hold two views of one
 * product. The box's meridian for an operand is the whole array; the
 * operator's is the target the weave leaves, so a position the operator is
 * broadcast over has an anchor in the first and none in the second. Both rows
 * are built here, from the product itself, so that the two agree: the order is
 * the product's own, each operand in turn and each operand's anchors in the
 * order of its shape with the datatype last, and a view with no anchor at a
 * position leaves the slot empty. Each operator anchor then sits under the
 * anchor of the array it reads, and the wire between them is vertical.
 *
 * The separator between one operand and the next is the one a column gets,
 * from `Separated`, so a row of several operands reads as the product it is.
 */
export function vertical_product<B extends cat.Datatype, A extends cat.Axis>(
    categoryRenderer: BroadcastedRenderer<B, A>,
    meridians: ArrayMeridian<B, A>[],
    weaves: cat.Weave<B, A>[],
): cr.RowMeridian<B | A> {
    const separated = (categoryRenderer.settings.separator_settings
                       && meridians.length > 1)
        ? new Separated<cr.Meridian<B | A>, cr.SeparatorAnchor<B | A>>(
            meridians, () => new cr.SeparatorAnchor<B | A>(categoryRenderer))
        : undefined;
    const spacing = categoryRenderer.settings.anchor_height;
    const order: rh.DiagramElement[] = [];
    ut.zip(meridians, weaves).forEach(([meridian, weave], i) => {
        if (i > 0 && separated) {
            order.push(separated.separators[i - 1]);
        }
        order.push(...meridian.row_slots(weave).map((anchor) => anchor
            ?? new rh.CoreElement(
                categoryRenderer.renderHandler, {x: spacing, y: 0})));
    });
    return new cr.RowMeridian(
        categoryRenderer, meridians, spacing, order, separated);
}

/*
 * The layer every degree wire is drawn in.
 *
 * The broadcast layer is painted over the glyph. A degree wire belongs there
 * because the operation is broadcast over the axis it carries, and the reader
 * sees the axis cross the operator rather than stop at one side of it and
 * start again at the other.
 *
 * A wire reaching a row used to be drawn on the main layer, which is painted
 * before the glyph. A row lies on the core's edge with the glyph filling the
 * core between the rows, so such a wire turns down at the row anchor's x and
 * descends the height of the glyph to reach it, and on the main layer the
 * glyph covered that descent. The user ruled on 2026-09-17 that the axis the
 * operation is broadcast over is drawn above the operator box, so the descent
 * is painted over the glyph and the wire is seen crossing the box and turning
 * down into the tape.
 */
export const DEGREE_WIRE_LAYER: 'main' | 'broadcast' = 'broadcast';

export function mark_broadcast_wire_layer(element: rh.DiagramElement): void {
    if (element instanceof cr.Anchor) {
        element.wire_layer = 'broadcast';
    }
    element.children.forEach(mark_broadcast_wire_layer);
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
    /*
     * The rows, where the layout asks for them: the grabbed inputs along the
     * top edge, the dropped outputs along the bottom. The meridians are
     * indexed as the operator indexes its operands and results, whichever
     * side each ended up on.
     */
    public top_anchors?: cr.RowMeridian<B | A>;
    public bottom_anchors?: cr.RowMeridian<B | A>;
    /* The mode of the columns, and the mode of the rows. See `row_display_type`. */
    public row_display_type: BroadcastDisplayType;
    public input_meridians: ArrayMeridian<B, A>[];
    public output_meridians: ArrayMeridian<B, A>[];

    public left_kept_labels: boolean[];
    public right_kept_labels: boolean[];

    public left_kept_anchors: cr.ConcatMeridian<B | A>;
    public right_kept_anchors: cr.ConcatMeridian<B | A>;

    private core: rh.CoreElement;
    private display_type: BroadcastDisplayType;
    private node_box?: cr.AnchoredBox<A | B>;
    /* The node box stacked above the operation box where the operator has
     * one, and the operation box alone otherwise. */
    private glyph_stack: rh.DiagramElement;
    /* The box the registry built for the operator, which this box draws in its
     * core and hands its own anchors to. */
    public op_box: OperationBox<B, A, Op>;

    constructor(
        public categoryRenderer: BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, Op>,
        public wrap: WrapLayout = no_wrap(target),
        /* The morphism the glyph answers the pointer as. It is the target
         * itself, except where a block asks for its body to be drawn in its
         * place: `broadcasted_box` then builds the body's box and names the
         * block's wrapper here, so the region is the block's. */
        public region_target: cat.Broadcasted<B, A> = target,
    ) {
        super(categoryRenderer, target);
        // Setup anchors: one meridian per operand and result, dealt onto the
        // left/right columns or the top/bottom rows as the layout says.
        this.input_meridians = this.target.dom().content.map(
            (array) => this.categoryRenderer.display_lone(array));
        this.output_meridians = this.target.cod().content.map(
            (array) => this.categoryRenderer.display_lone(array));
        const kept_in = wrap.grabbed.map((g) => !g);
        const kept_out = wrap.dropped.map((d) => !d);
        this.left_anchors = new cr.ProdObjectMeridian(
            this.categoryRenderer, ut.mask(kept_in, this.input_meridians));
        this.right_anchors = new cr.ProdObjectMeridian(
            this.categoryRenderer, ut.mask(kept_out, this.output_meridians));
        this.left_kept_labels = label_kept(
            this.left_anchors, ut.mask(kept_in, this.target.input_weaves));
        this.right_kept_labels = label_kept(
            this.right_anchors, ut.mask(kept_out, this.target.output_weaves));

        this.left_kept_anchors = new cr.ConcatMeridian(this.categoryRenderer,
            ut.mask(this.left_kept_labels, this.left_anchors.anchors));
        this.right_kept_anchors = new cr.ConcatMeridian(this.categoryRenderer,
            ut.mask(this.right_kept_labels, this.right_anchors.anchors));
        // Setup base box - Represents the underlying operation. The layout is
        // applied to whatever box the registry built, so no operator's box has
        // to know about wrapping.
        this.op_box = opsRegistry.getConstructor(this.target.operator)(this.categoryRenderer, this.target);
        const grabbed_weaves = ut.mask(wrap.grabbed, this.target.input_weaves);
        const dropped_weaves = ut.mask(wrap.dropped, this.target.output_weaves);
        /*
         * The layout is applied BEFORE the columns are linked. `link` pairs two
         * meridians by position, and the operator box is built with every
         * operand in its left column, so a grabbed operand still sitting there
         * takes the slot of the kept operand that follows it: the first kept
         * operand's wire is drawn to the grabbed operand's anchor and turns up
         * onto the row it has since moved to. `apply_wrap` moves the meridians
         * and leaves the anchors alone, so linking afterwards pairs kept with
         * kept and grabbed with grabbed.
         *
         * The case is any operator whose parameter comes first, which is every
         * one of them since `grab_parameters` began prepending the weight, and
         * `Inject` reading its selector is where it was found: the values wire
         * ran to the selector's anchor on the top row and the two were drawn
         * arriving at one point.
         */
        if (is_wrapped(wrap)) {
            this.op_box.apply_wrap(wrap);
        }
        if (!this.op_box.link_holder_anchors(this)) {
            this.left_kept_anchors.link(this.op_box.left_anchors);
            this.op_box.right_anchors.link(this.right_kept_anchors);
        }
        if (is_wrapped(wrap)) {
            if (this.op_box.top_anchors) {
                this.top_anchors = vertical_product(
                    this.categoryRenderer,
                    ut.mask(wrap.grabbed, this.input_meridians),
                    grabbed_weaves);
                const top_kept = kept_anchors(
                    this.categoryRenderer, this.top_anchors, grabbed_weaves);
                top_kept.link(this.op_box.top_anchors);
            }
            if (this.op_box.bottom_anchors) {
                this.bottom_anchors = vertical_product(
                    this.categoryRenderer,
                    ut.mask(wrap.dropped, this.output_meridians),
                    dropped_weaves);
                const bottom_kept = kept_anchors(
                    this.categoryRenderer, this.bottom_anchors, dropped_weaves);
                this.op_box.bottom_anchors.link(bottom_kept);
            }
        }

        this.display_type = find_broadcast_display_type(
            this.target, this.op_box);
        this.row_display_type = row_display_type(this.target);
        /*
         * A node needs an operand to draw it from. Where every operand
         * carrying a degree axis is on a row, and the rows weave, nothing
         * enters the node and nothing would leave it, so the whole box weaves
         * and the row's degree axis runs straight across to the far column.
         * The selecting `Linear` of
         * `notebooks/para/MixtureOfExpertsBackward.ipynb` is the case: the
         * index is its only broadcast operand and it arrives on the tape.
         */
        if (this.display_type === BroadcastDisplayType.NODE
            && this.row_display_type === BroadcastDisplayType.WEAVE
            && this.degree_arrives_on_a_row(wrap)) {
            this.display_type = BroadcastDisplayType.WEAVE;
        }
    
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
                degree_reindexing(this.target),
                false,
            );
            this.link_node();
            /*
             * Pinning is for the BRANCHING node - more than one input, or more
             * than one output, or both.
             *
             * Where a node has one of each - a linear - the degree wire runs
             * straight through and letting it skip keeps it straight, which
             * reads better than the kink a pin puts in. As soon as either side
             * has several, the wires fan in to the node or out of it, and the
             * node has to be visibly where they meet or part, so it must not be
             * skipped through.
             *
             * `allow_skip`, not `loose`, throughout:
             * `ComposedGap.make_composed_gap` sets `loose` on the shorter side
             * of every gap and runs when the box is composed, i.e. after this
             * constructor, so clearing `loose` here would simply be set again.
             * `allow_skip` is the pin nothing else writes - the same idiom as
             * `SpreadBox`'s caps and the block edges.
             */
            if (this.target.output_weaves.length > 1
                || this.target.input_weaves.length > 1) {
                this.left_anchors.anchors.forEach((a) => a.allow_skip = false);
                this.right_anchors.anchors.forEach((a) => a.allow_skip = false);
                /*
                 * And the node's OWN columns. A reindexing that is a
                 * `Rearrangement` rather than a seed `StrideMorphism` is drawn
                 * by `RearrangementBox`, which has no glyph and calls
                 * `loosen()` on itself in its constructor - so without this the
                 * node collapses to a straight wire and the NODE form is
                 * indistinguishable from WEAVE.
                 */
                this.node_box.left_anchors.anchors.forEach((a) => a.allow_skip = false);
                this.node_box.right_anchors.anchors.forEach((a) => a.allow_skip = false);
            } else {
                this.right_anchors.anchors.forEach((a) => a.allow_skip = true);
            }
            this.setBorderColor('grey');
        }
        
        // Setup core
        // TODO: Magic!
        this.glyph_stack = this.stack_node_with_glyph();
        const core_width = Math.max(
            this.glyph_stack.dims.x,
            this.top_anchors?.dims.x ?? 0, this.bottom_anchors?.dims.x ?? 0,
        ) + 2 * (
            this.op_box.parent_gap ??
            this.categoryRenderer.settings.broadcast_offset_x
        ) + 2 * (
            this.node_box ? 5 : 0
        );
        const height = Math.max(
            this.left_anchors.dims.y,
            this.right_anchors.dims.y,
            this.glyph_row_height() + this.core_room(),
        )
        this.renderHandler.register_term_region(
            this.op_box.region_element(this), this.region_target);
        this.core = new rh.CoreElement(
            this.renderHandler,
            {x: core_width, y: height},
            [this.glyph_stack]
        );

        this.children = cr.four_sided(
            this.renderHandler, this.left_anchors, this.core, this.right_anchors,
            this.top_anchors, this.bottom_anchors);
    }
    /*
     * The node and the glyph, as one element in the core.
     *
     * A node normally stands above the glyph, so the degree wires fan into it
     * over the wires the operator reads. A node whose own right column is
     * empty carries no degree out of itself, and under `reversed` that column
     * is the codomain of the morphism, so the case is a result that is
     * broadcast over nothing and a pentagon whose point stands free. The glyph
     * goes beside the point there, and what the operator emits leaves the
     * point on its mid-line. The user asked on 2026-09-17 for the wire of a
     * read at an index to come out of the right of the indexing.
     */
    private stack_node_with_glyph(): rh.DiagramElement {
        if (!this.node_box) {
            return this.op_box;
        }
        return this.glyph_stands_beside_the_node()
            ? new rh.Horizontal(this.renderHandler, [this.node_box, this.op_box])
            : new rh.Vertical(this.renderHandler, [this.node_box, this.op_box]);
    }
    private glyph_stands_beside_the_node(): boolean {
        return this.node_box?.right_anchors.anchors.length === 0;
    }
    /*
     * The height the core keeps for the glyph. A node above the glyph is left
     * out of it, because the wires fanning into that node are drawn in the
     * room the columns already take. A node beside the glyph shares its row.
     */
    private glyph_row_height(): number {
        return this.glyph_stands_beside_the_node()
            ? Math.max(this.op_box.dims.y, this.node_box?.dims.y ?? 0)
            : this.op_box.dims.y;
    }
    /*
     * The core's height beyond the glyph's own.
     *
     * With operands, half an anchor per degree axis: the degree wires route
     * over the glyph from the right column back to the left, and the glyph
     * sits below them on its target anchors. With none, no wire routes around
     * the glyph, and the room is on the side of a row alone: `row_room`
     * between the glyph and each row the wrap gave the box, so that a dropped
     * result's tape and label leave from clear of the glyph, and a box with no
     * row is as tall as what it emits.
     */
    private core_room(): number {
        if (this.target.has_empty_domain()) {
            return this.row_room(this.top_anchors)
                + this.row_room(this.bottom_anchors);
        }
        return this.target.degree().length * this.settings.anchor_height * 0.5;
    }
    private row_room(row: cr.RowMeridian<B | A> | undefined): number {
        return row && this.target.has_empty_domain()
            ? this.settings.empty_domain_row_padding : 0;
    }

    public operation_rectangle(): pt.Rectangle {
        return this.op_box.rectangle();
    }
    /* The middle of the core, between the rooms its rows reserve. */
    private centre_between_rows(): number {
        const core = this.core.rectangle();
        const above = this.row_room(this.top_anchors);
        const below = this.row_room(this.bottom_anchors);
        return core.top + above + (core.bottom - core.top - above - below) / 2;
    }
    /*
     * The height the glyph is set against, in page coordinates, once the
     * browser has laid the columns out.
     *
     * The mean of the anchors the operator reads: the targets of both columns
     * where the box weaves, every column anchor where a node stands in the
     * core. A box that reads no axis of columns that have them - an
     * elementwise map, an addition of tiled scalars - is set against the top
     * wire of the bundle, and a morphism with an empty domain against the
     * middle of all it emits, nothing routing around its glyph. A box with no
     * column anchor at all, every operand and result on the tape, is set on
     * the core's middle.
     */
    private glyph_line(): number {
        const heights = (anchors: cr.Anchor<B | A>[]): number[] =>
            anchors.filter((a) => a.draws_wire()).map(
                (a) => a.rectangle().getLocation({x: 0, y: 0.5}).y);
        const read = heights(this.display_type === BroadcastDisplayType.WEAVE
            ? [...this.left_kept_anchors.anchors,
               ...this.right_kept_anchors.anchors]
            : [...this.left_anchors.anchors, ...this.right_anchors.anchors]);
        if (read.length > 0) {
            return ut.sum(read) / read.length;
        }
        const columns = heights(
            [...this.left_anchors.anchors, ...this.right_anchors.anchors]);
        if (columns.length === 0) {
            return this.centre_between_rows();
        }
        return this.target.has_empty_domain()
            ? ut.sum(columns) / columns.length
            : Math.min(...columns);
    }
    /*
     * Whether every operand carrying a degree axis is grabbed, and so drawn on
     * the top row rather than in the left column.
     */
    private degree_arrives_on_a_row(wrap: WrapLayout): boolean {
        const broadcast = ut.zip(this.target.input_weaves, wrap.grabbed).filter(
            ([weave]) => weave.select_degree(weave._shape).length > 0);
        return broadcast.length > 0 && broadcast.every(([, grabbed]) => grabbed);
    }

    /*
     * The broadcast degree of each output. `Broadcasted.cod` imprints the same
     * degree onto every output weave, so a morphism with several outputs has
     * several degree columns, each standing for the one broadcast tiling, and
     * all of them are linked.
     */
    private output_degrees(): cr.Anchor<B | A>[][] {
        return ut.zip(this.target.output_weaves, this.output_meridians).map(
            ([weave, lone_element]) => weave.select_degree(
                lone_element.axes_anchors.anchors));
    }

    /*
     * One operand's degree, wired straight onto the degree of every output.
     *
     * The mapping is indexed by the reindexing's codomain, which is the
     * operand's own degree, and it names the broadcast slot each of the
     * operand's axes is drawn from. It is returned for the caller that dots
     * the slots nothing reached.
     */
    private link_degree_to_outputs(
        operand_degree: cr.Anchor<B | A>[],
        reindexing: cat.Morphism<A>,
        degrees: cr.Anchor<B | A>[][],
    ): number[] {
        const mapping = tu.get_mapping(reindexing as tu.Mappable);
        operand_degree.forEach((anchor, i) => {
            const reached = degrees.map((degree) => degree[mapping[i]]);
            anchor.wire_layer = DEGREE_WIRE_LAYER;
            for (const degree of reached) {
                anchor.link(degree);
            }
        });
        return mapping;
    }

    /*
     * Whether one operand's degree reaches the far column without passing
     * through the node.
     *
     * Two conditions hold. The operand is drawn on a row, where the node
     * stands in the core between the two columns, so a wire into it leaves
     * the row, crosses into the middle of the box and comes back out. Its own
     * reindexing is a rearrangement, where the node draws the reindexing of
     * whichever operand `degree_reindexing` picked, so the detour also reads
     * as a map this operand does not have.
     *
     * A grabbed index on a `Linear` is the case. The box is `NODE` because
     * `LinearBox` forces it, and the index is broadcast over the tokens by
     * the identity.
     */
    private degree_bypasses_node(operand: number): boolean {
        return this.wrap.grabbed[operand]
            && tu.is_mappable(this.target.reindexings[operand]);
    }

    private link_node(): void {
        const degrees = this.output_degrees();
        mark_broadcast_wire_layer(this.node_box!);
        this.target.input_weaves.forEach((weave, operand) => {
            const tiling = weave.select_degree(
                this.input_meridians[operand].axes_anchors.anchors);
            if (this.degree_bypasses_node(operand)) {
                this.link_degree_to_outputs(
                    tiling, this.target.reindexings[operand], degrees);
                return;
            }
            tiling.forEach((anchor) => anchor.wire_layer = DEGREE_WIRE_LAYER);
            new cr.ConcatMeridian(this.categoryRenderer, tiling).link(
                this.node_box!.left_anchors);
        });
        for (const degree of degrees) {
            this.node_box?.right_anchors.link(
                new cr.ConcatMeridian(this.categoryRenderer, degree));
        }
    }
    private link_weaves(): void {
        const degrees = this.output_degrees();
        /*
         * Every input degree anchor is linked by construction, the mapping
         * being indexed by the operand's own degree, and the deletions sit on
         * the other side: broadcast degree slots that no mapping names, whose
         * wire arrives with nothing feeding it. `AxisAnchor.update` dots an
         * anchor that fans out, so the copy shows where an input degree axis
         * feeds more than one output.
         */
        const passed_through: Set<number> = new Set();
        for (const [input_anchors, input_weave, reindexing] of ut.zip(
            this.input_meridians, this.target.input_weaves, this.target.reindexings
        )) {
            const degree_out = input_weave.select_degree(
                input_anchors.axes_anchors.anchors);
            for (const slot of this.link_degree_to_outputs(
                degree_out, reindexing, degrees)) {
                passed_through.add(slot);
            }
        }
        /*
         * Dotted against every reindexing at once rather than one at a time.
         * The degree anchors are shared by the whole weave, so an axis some
         * other input does supply is not a deletion here, however many inputs
         * are broadcast over it.
         */
        for (const degree of degrees) {
            degree.forEach((anchor, i) => {
                if (!passed_through.has(i)) {
                    anchor.add_dot = true;
                }
            });
        }
    }
    post_placement(): void {
        this.apply_translation_update();
        this.raise_operator_rows();
        super.post_placement();
    }
    /*
     * The operator's rows go to the edges of the core, not the edges of the
     * glyph.
     *
     * The glyph is centred on its kept anchors by `apply_translation_update`,
     * so its own top edge is mid-way down the core, and a row left there
     * would make the tape hop: straight down to this box's row at the top,
     * then on again to the glyph's. The row is a zero-height element with a
     * transform of its own, so it is displaced to the core's edge here and
     * the glyph - which draws against its own rectangle - is left exactly
     * where it was. The target anchors then sit directly under this box's
     * row anchors, and the wire between the two has no length.
     */
    private raise_operator_rows(): void {
        if (!this.op_box.raise_rows) {
            return;
        }
        const core = this.core.rectangle();
        const top = this.op_box.top_anchors;
        if (top) {
            top.transform.offset = {x: 0, y: core.top - top.rectangle().top};
        }
        const bottom = this.op_box.bottom_anchors;
        if (bottom) {
            bottom.transform.offset = {
                x: 0, y: core.bottom - bottom.rectangle().bottom};
        }
    }
    /*
     * The axes of a taped operand are NOT named here, though this is the box
     * that holds their anchors. A tape crosses no `ComposedGap`, so the name
     * has to be placed by hand somewhere; `ParaWrapBox.update` is where, since
     * it alone knows where the tape ran, and putting the name at the top of
     * that run keeps the grabbed array reading as one thing - `s0 | q d` - in
     * a way a name resting on the short link to the operator never did.
     */
    protected apply_translation_update(): void {
        const avg_y = this.glyph_line();
        const avg_x = (this.left_anchors.rectangle().left + this.right_anchors.rectangle().right) / 2;
        const reference_box = this.glyph_stack;
        const base_rect = reference_box.rectangle();
        const transform = reference_box.transform;
        const base_x = base_rect.left - transform.offset.x
            - (transform.positioning.x ?? 0) * reference_box.dims.x;
        const base_y = base_rect.top - transform.offset.y
            - (transform.positioning.y ?? 0) * reference_box.dims.y;
        const rides_a_wire = this.rides_a_wire();
        const vertical_shift = rides_a_wire ? this.op_box.vertical_alignment_shift() : 0;
        const positioning = rides_a_wire
            ? this.op_box.glyph_positioning : {x: -0.5, y: -0.5};
        reference_box.transform.offset = {
            x: avg_x - base_x,
            y: avg_y - base_y + vertical_shift + this.clearance_from_rows(
                avg_y + vertical_shift + positioning.y * reference_box.dims.y,
                reference_box.dims.y),
        };
        reference_box.transform.positioning = positioning;
    }
    /*
     * How far the glyph moves to clear the rows a `ParaWrap` gave the box.
     *
     * The glyph is set against the anchors the operator reads, so a box whose
     * kept anchors sit near one end of a column taller than the glyph is set
     * against that end and reaches past the core at that edge. A row lies on
     * the core's edge and carries the tapes of the wrap, so a tape would then
     * start inside the glyph. `top` is where the glyph's own top would land
     * and `height` is how tall it is.
     */
    private clearance_from_rows(top: number, height: number): number {
        const core = this.core.rectangle();
        const below = this.bottom_anchors
            ? Math.max(0, top + height - core.bottom) : 0;
        const above = this.top_anchors ? Math.max(0, core.top - top) : 0;
        return above - below;
    }
    /*
     * Whether the line the glyph is set against is a wire, so that the
     * operator's own `glyph_positioning` applies. It is the core's middle
     * instead where nothing is in the columns, and the node stands in it
     * where there is one.
     */
    private rides_a_wire(): boolean {
        return this.node_box === undefined
            && this.left_anchors.anchors.length + this.right_anchors.anchors.length > 0;
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
    public top_anchors?: cr.RowMeridian<B | A>;
    public bottom_anchors?: cr.RowMeridian<B | A>;
    /* One per operand and per result, in the operator's order, whichever side
     * `apply_wrap` has put each on. */
    public input_meridians: ArrayMeridian<B, A>[];
    public output_meridians: ArrayMeridian<B, A>[];
    /* The axis anchors the operator reads of each operand and result - the
     * meridian's target axes - wherever the meridian is. */
    public input_axes: cr.Anchor<A>[][];
    public output_axes: cr.Anchor<A>[][];
    public core: rh.CoreElement;
    public parent_gap?: number;
    public override_display_type?: BroadcastDisplayType;
    /*
     * Whether `BroadcastedBox.raise_operator_rows` lifts this box's rows to
     * the core's edges. True for a box whose row anchors continue into the
     * figure - `EinopsBox` cups a row anchor into its columns, so the turn
     * should happen at the edge and the wire between the two rows have no
     * length. A PARAMETRIC box - `LinearBox`, `NormalizeBox` - is where a
     * grabbed operand ENDS: its row stays at the glyph's own top edge, so
     * the wire from the box's row runs visibly down onto the operation,
     * which is the point of writing the parameter onto it.
     */
    public raise_rows: boolean = true;
    /*
     * Where the glyph sits against the line `BroadcastedBox.glyph_line` sets
     * it on, as the fraction of its own size placed above and left of that
     * point. `-0.5` centres it. `ElementwiseBox` rests its bottom edge on the
     * line with `y: -1`, so the name rides the wire rather than being cut by
     * it.
     */
    public glyph_positioning: pt.Point = {x: -0.5, y: -0.5};
    public vertical_alignment_shift(): number {
        return 0;
    }
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
         * scalar - see `is_true_scalar`.
         */
        this.input_meridians = this.target.input_weaves.map(
            (w) => new ArrayMeridian(this.categoryRenderer, w.target(), w));
        this.output_meridians = this.target.output_weaves.map(
            (w) => new ArrayMeridian(this.categoryRenderer, w.target(), w));
        this.input_axes = this.input_meridians.map((m) => m.axes_anchors.anchors);
        this.output_axes = this.output_meridians.map((m) => m.axes_anchors.anchors);
        this.left_anchors = new cr.ProdObjectMeridian(
            this.categoryRenderer, this.input_meridians);
        this.right_anchors = new cr.ProdObjectMeridian(
            this.categoryRenderer, this.output_meridians);
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

    /*
     * Wire the anchors of the box that holds this operator to one another, and
     * say whether it was done. The holder links its kept columns to this box's
     * own columns where the answer is false, which is every operator that has
     * a glyph of its own to draw between the two.
     *
     * `JunctionOfPartsBox` in
     * `advanced_axis_dynamics/covariantOperatorBoxes.ts` is the operator that
     * answers true. A concatenation and a deconcatenation are a circle on the
     * wire of the axis the parts meet on, and the user asked on 2026-09-17 for
     * that circle to sit on the holder's own anchor, with the holder's two
     * columns wired straight to each other and this box's columns left out of
     * the figure.
     */
    public link_holder_anchors(_holder: BroadcastedBox<B, A>): boolean {
        return false;
    }

    /*
     * The element whose rectangle answers the pointer for this operator, which
     * `advanced_display/inspectionBoxes.ts` reads as the region an inspection
     * box opens from. It is the glyph, except for an operator drawn on the
     * holder's anchors: that box has a rectangle of no width, and a region of
     * no width is dropped, so the holder stands for it.
     */
    public region_element(_holder: BroadcastedBox<B, A>): rh.DiagramElement {
        return this;
    }

    protected reserve_annotation_room(annotation: rh.AnnotationElement): void {
        const text_dims = annotation.estimated_text_dims();
        this.core_dims = {
            x: Math.max(this.core_dims.x, text_dims.x),
            y: Math.max(this.core_dims.y, text_dims.y),
        };
        this.core.width = this.core_dims.x;
        this.core.height = this.core_dims.y;
    }

    /*
     * Move the grabbed operands onto a row along the top edge and the dropped
     * results onto one along the bottom, leaving the columns with the rest.
     *
     * Called by `BroadcastedBox` after construction, on whatever box the
     * registry built, so no operator's box has to know about wrapping: the
     * meridians change sides and the ANCHORS do not, and a box that captured
     * anchors in its constructor - `EinopsBox`'s cups - goes on drawing
     * between the same anchors wherever they now are. The children are rebuilt
     * around `this.core`, which is the shape every box here sets them to, as
     * `Horizontal(left, Vertical(top, core, bottom), right)`; a row wider than
     * the glyph widens the core. `vertical_product` is what lays the row out,
     * and it leaves an empty slot wherever the row above has an anchor this one
     * has not, so the two sit anchor under anchor.
     */
    apply_wrap(wrap: WrapLayout): void {
        const kept_in = wrap.grabbed.map((g) => !g);
        const kept_out = wrap.dropped.map((d) => !d);
        const grabbed = ut.mask(wrap.grabbed, this.input_meridians);
        const dropped = ut.mask(wrap.dropped, this.output_meridians);
        const grabbed_weaves = ut.mask(wrap.grabbed, this.target.input_weaves);
        const dropped_weaves = ut.mask(wrap.dropped, this.target.output_weaves);
        this.left_anchors = new cr.ProdObjectMeridian(
            this.categoryRenderer, ut.mask(kept_in, this.input_meridians));
        this.right_anchors = new cr.ProdObjectMeridian(
            this.categoryRenderer, ut.mask(kept_out, this.output_meridians));
        this.top_anchors = grabbed.length
            ? vertical_product(this.categoryRenderer, grabbed, grabbed_weaves)
            : undefined;
        this.bottom_anchors = dropped.length
            ? vertical_product(this.categoryRenderer, dropped, dropped_weaves)
            : undefined;
        this.children = cr.four_sided(
            this.renderHandler, this.left_anchors, this.core,
            this.right_anchors, this.top_anchors, this.bottom_anchors);
    }

    get settings(): crs.BroadcastedRendererSettings<B, A> {
        return this.categoryRenderer.settings;
    }

    /*
     * Draw the wire arriving at `arriving` and the wire leaving `leaving` as
     * one line crossing this box, which is how a degree wire crosses it.
     *
     * A target anchor otherwise ends the wire at the operator's own column,
     * so something the operator hands on unchanged reads as two stubs at
     * whatever heights the two columns gave them. Loosening both hands the
     * wire to `Anchor.next_terminal`, which walks through them and draws a
     * single curve from the column before the box to the column after it.
     * The wire is drawn before the glyph, so the glyph covers the part of it
     * that crosses the core.
     */
    public pass_anchor_through(
        arriving: cr.Anchor<A | B>,
        leaving: cr.Anchor<A | B>,
    ): void {
        for (const anchor of [arriving, leaving]) {
            anchor.loose = true;
            anchor.allow_skip = true;
        }
        arriving.link(leaving);
    }

    update(): void {
        super.update();
    }
}
