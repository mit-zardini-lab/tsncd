// Claude Opus 5.5 (1M context), effort 40.
/*
 * What stands inside an operator's box in the box form, which `BoxRenderer.ts`
 * draws under `arrows-and-boxes`.
 *
 * `facesRegistry` builds the face of an operator from the operator's class, as
 * `bb.opsRegistry` builds the glyph of the all-broadcasted form, and matches
 * the class by its exact name. A class the registry does not name is faced by
 * its name. A face is sized in the build phase, at least as large as the room
 * its box offers it, and in `update` it draws within its own rectangle, which
 * is the rectangle of the box.
 *
 * An operator is faced by its name written in the middle of the box, and an
 * elementwise map by its symbol, which is its name. An `Einops` is faced by a
 * name read off its signature through `EINOPS_FACE_NAMES`. A softmax and the
 * normalisations draw the glyph of the all-broadcasted form small, with their
 * name above it. A `View` is faced by the name of its reindexing where it has
 * none of its own. A `Linear` is the named rectangle `LinearBox` draws, and a
 * block operator is the titled box `BlockOperatorBox` draws. Each of those two
 * is the whole box, and the box draws no plate under it.
 *
 * A face reports as `written_name` the name written in its box.
 * `OperatorFaceBox` writes above the box the name written on the plate by the
 * arrow form, as given by `plateNames.written_plate_label`, and leaves it off
 * where it is the face's `written_name`. A `Linear` therefore carries `Linear` above the
 * rectangle that writes its weight, and a cache carries `Cache` above the box
 * that writes its name, while the face of an `Einops` writes `Matmul` and
 * nothing is written above it. A face is at least as wide as the name above
 * it, as measured by `plateNames.plate_label_width`.
 */
import * as rh from '../../Render/RenderHandler';
import * as cat from '../../../data_structure/Category';
import * as ops from '../../../data_structure/Operators';
import * as pbop from '../../../para/data_structure/ParaBlockOperator';
import * as crs from '../CategoryRendererSettings';
import * as aob from '../Operations/additionalOperationBoxes';
import * as gb from '../Operations/GlyphBox';
import * as pt from '../../../utilities/Point';
import * as utcr from '../../../utilities/ConstructorRegistry';
import * as arrows from './ArrowRenderer';
import type * as box_renderer from './BoxRenderer';

/* The room a box offers its face. `least` is the least width and height of the
 * box, which the arrows along its edges need. */
export interface FaceRoom {
    least: pt.Point;
}

/*
 * A face: an element as large as the box it stands in. A face that
 * `draws_box_outline` draws the outline of the box itself, and the box draws
 * its plate under every other face. `written_name` is the name written by the
 * face in its box, and a face that writes none has none.
 */
export interface OperatorFace extends rh.DiagramElement {
    readonly draws_box_outline: boolean;
    readonly written_name: string | undefined;
}

export const facesRegistry = new utcr.ConstructorRegistry<
    cat.Operator,
    OperatorFace,
    [box_renderer.BoxRenderer<any, any>, cat.Broadcasted<any, any, any>, FaceRoom]
>();

/* The name an operator is faced by, and its class set upright where the
 * operator carries no name. */
export function default_face_name(operator: cat.Operator): string {
    return operator.name?.to_latex() || `\\mathrm{${operator.constructor.name}}`;
}

/*
 * What of an `Einops` signature names the operator: how many operands the
 * operator reads, and how many contraction groups its signature holds.
 * `EinopsBox.setup_cups` draws every group of the signature as a cup or a dot,
 * so every group is contracted, and an axis the operator carries to its result
 * is a degree axis and stands in no group.
 */
export interface EinopsSignatureShape {
    operands: number;
    contracted_groups: number;
}

export function einops_signature_shape(operator: ops.Einops): EinopsSignatureShape {
    return {
        operands: operator.signature.length,
        contracted_groups: new Set(operator.signature.flat()).size,
    };
}

export interface EinopsFaceName {
    name: string;
    applies: (shape: EinopsSignatureShape) => boolean;
}

/* The names an `Einops` is faced by. The first row whose condition holds names
 * the operator, and `EINOPS_FALLBACK_FACE_NAME` names an operator no row
 * names. A row added here names the case it states. */
export const EINOPS_FACE_NAMES: readonly EinopsFaceName[] = [
    {
        name: '\\mathrm{Matmul}',
        applies: ({operands, contracted_groups}) =>
            operands === 2 && contracted_groups >= 1,
    },
    {
        name: '\\mathrm{Sum}',
        applies: ({operands, contracted_groups}) =>
            operands === 1 && contracted_groups >= 1,
    },
    {
        name: '\\mathrm{Product}',
        applies: ({operands, contracted_groups}) =>
            operands >= 2 && contracted_groups === 0,
    },
];
export const EINOPS_FALLBACK_FACE_NAME = '\\mathrm{Contraction}';

export function einops_face_name(operator: ops.Einops): string {
    const shape = einops_signature_shape(operator);
    return EINOPS_FACE_NAMES.find((row) => row.applies(shape))?.name
        ?? EINOPS_FALLBACK_FACE_NAME;
}

/* The name a `View` is faced by: its own, the name of the first of its seed
 * reindexings that carries one, and its class where neither is named. The
 * causal read is named `mask` and the read of a diagonal `diag`. */
export function view_face_name<B extends cat.Datatype, A extends cat.Axis>(
    target: cat.Broadcasted<B, A>,
): string {
    const reindexing_name = target.reindexings
        .flatMap((reindexing: cat.StrideCategory<A>) =>
            arrows.seed_reindexings(reindexing))
        .map((reindexing) => reindexing.name?.to_latex())
        .find((name) => !!name);
    return target.operator.name?.to_latex()
        || reindexing_name
        || default_face_name(target.operator);
}

/*
 * A face drawn by this module, which is a core as large as its content with
 * the padding of a box on every side, and at least as large as the room its
 * box offers it.
 */
abstract class FaceElement<B extends cat.Datatype, A extends cat.Axis>
    extends rh.DiagramElement implements OperatorFace {
    public readonly draws_box_outline: boolean = false;
    public abstract get written_name(): string | undefined;

    constructor(
        public box_renderer: box_renderer.BoxRenderer<B, A>,
        public target: cat.Broadcasted<B, A>,
    ) {
        super(box_renderer.renderHandler);
        this.setBorderColor('teal');
    }

    get settings(): crs.BoxRendererSettings<B, A> {
        return this.box_renderer.settings;
    }

    protected take_room_for(content: pt.Point, room: FaceRoom): void {
        const padding = this.settings.box_face_padding;
        this.children = [new rh.CoreElement(this.renderHandler, {
            x: Math.max(content.x + 2 * padding.x, this.settings.box_minimum_width,
                        room.least.x),
            y: Math.max(content.y + 2 * padding.y, room.least.y),
        })];
    }

    /* The rectangle of the box less its padding, in the update phase. */
    protected padded_rectangle(): pt.Rectangle {
        const padding = this.settings.box_face_padding;
        return this.rectangle().pad({x: -padding.x, y: -padding.y});
    }
}

/*
 * A name written in the middle of the box, at `box_face_font_size`. The name
 * is `latex` where the face is built with one, and the operator's own name
 * otherwise.
 */
@facesRegistry.registerDefaultClass
export class NameFace<B extends cat.Datatype, A extends cat.Axis>
    extends FaceElement<B, A> {
    public name: rh.AnnotationElement;

    constructor(
        box_renderer: box_renderer.BoxRenderer<B, A>,
        target: cat.Broadcasted<B, A>,
        room: FaceRoom,
        latex: string = default_face_name(target.operator),
    ) {
        super(box_renderer, target);
        this.name = new rh.AnnotationElement(
            this.renderHandler, latex, {font_size: this.settings.box_face_font_size});
        this.take_room_for({
            x: this.name.estimated_bare_text_width(),
            y: this.name.estimated_text_dims().y,
        }, room);
    }

    get written_name(): string {
        return this.name.latex;
    }

    update(): void {
        super.update();
        this.name.place(this.rectangle());
    }
}

facesRegistry.registerClass(ops.Elementwise)(NameFace);
facesRegistry.registerClass(ops.Arithmetic)(NameFace);
facesRegistry.registerClass(ops.ReLU)(NameFace);
facesRegistry.registerClass(ops.Dropout)(NameFace);
facesRegistry.registerClass(ops.Cast)(NameFace);

@facesRegistry.registerClass(ops.Einops)
export class EinopsFace<B extends cat.Datatype, A extends cat.Axis>
    extends NameFace<B, A> {
    constructor(
        box_renderer: box_renderer.BoxRenderer<B, A>,
        target: cat.Broadcasted<B, A, ops.Einops>,
        room: FaceRoom,
    ) {
        super(box_renderer, target, room, einops_face_name(target.operator));
    }
}

@facesRegistry.registerClass(ops.View)
export class ViewFace<B extends cat.Datatype, A extends cat.Axis>
    extends NameFace<B, A> {
    constructor(
        box_renderer: box_renderer.BoxRenderer<B, A>,
        target: cat.Broadcasted<B, A, ops.View>,
        room: FaceRoom,
    ) {
        super(box_renderer, target, room, view_face_name(target));
    }
}

/*
 * The glyph the all-broadcasted form draws for the operator, drawn small in a
 * square of side `box_glyph_side`, with the operator's name in the small type
 * of a block's title above it. The glyph stands in the middle of the part of
 * the box the name leaves.
 */
export abstract class LabelledGlyphFace<
    B extends cat.Datatype, A extends cat.Axis, Op extends cat.Operator>
    extends FaceElement<B, A> {
    public label: rh.AnnotationElement;

    constructor(
        box_renderer: box_renderer.BoxRenderer<B, A>,
        public target: cat.Broadcasted<B, A, Op>,
        room: FaceRoom,
    ) {
        super(box_renderer, target);
        this.label = new rh.AnnotationElement(
            this.renderHandler, default_face_name(target.operator),
            {font_size: this.settings.block_title_font_size});
        const side = this.settings.box_glyph_side;
        this.take_room_for({
            x: Math.max(this.label.estimated_bare_text_width(), side),
            y: this.label_height() + this.settings.box_glyph_label_gap + side,
        }, room);
    }

    protected abstract draw_glyph(glyph: pt.Rectangle): void;

    get written_name(): string {
        return this.label.latex;
    }

    private label_height(): number {
        return this.label.estimated_text_dims().y;
    }

    update(): void {
        super.update();
        const inside = this.padded_rectangle();
        const label_height = this.label_height();
        const glyph_room_height =
            inside.height - label_height - this.settings.box_glyph_label_gap;
        this.label.place(new pt.Rectangle(
            {x: inside.left, y: inside.top}, {x: inside.width, y: label_height}));
        this.draw_glyph(gb.centred_square(
            new pt.Rectangle(
                {x: inside.left, y: inside.bottom - glyph_room_height},
                {x: inside.width, y: glyph_room_height}),
            this.settings.box_glyph_side));
    }
}

@facesRegistry.registerClass(ops.SoftMax)
export class SoftMaxFace<B extends cat.Datatype, A extends cat.Axis>
    extends LabelledGlyphFace<B, A, ops.SoftMax> {
    protected draw_glyph(glyph: pt.Rectangle): void {
        aob.draw_normalisation_triangle(this.draw, glyph);
    }
}

/* The fraction bar across the triangle of an `L1Norm`, as shares of the
 * glyph's width and height, which are `L1NORM_BAR_START`, `L1NORM_BAR_END` and
 * `L1NORM_BAR_THICKNESS` of `additionalOperationBoxes.ts`. */
const L1NORM_BAR_START = 0.28;
const L1NORM_BAR_END = 0.86;
const L1NORM_BAR_THICKNESS = 0.18;

@facesRegistry.registerClass(ops.L1Norm)
export class L1NormFace<B extends cat.Datatype, A extends cat.Axis>
    extends LabelledGlyphFace<B, A, ops.L1Norm> {
    protected draw_glyph(glyph: pt.Rectangle): void {
        aob.draw_normalisation_triangle(this.draw, glyph);
        const thickness = Math.max(2, glyph.height * L1NORM_BAR_THICKNESS);
        const start = glyph.left + glyph.width * L1NORM_BAR_START;
        const end = glyph.left + glyph.width * L1NORM_BAR_END;
        this.draw?.drawRectangle(
            new pt.Rectangle(
                {x: start, y: glyph.top + glyph.height / 2 - thickness / 2},
                {x: end - start, y: thickness}),
            {fill: 'black', stroke: 'none'});
    }
}

/* Where the root tick stands inside the triangle of an `L2Norm`, as shares of
 * the glyph's width and height, which are the `L2NORM_TICK_` numbers of
 * `additionalOperationBoxes.ts`. */
const L2NORM_TICK_LEFT = 0.42;
const L2NORM_TICK_WIDTH = 0.5;
const L2NORM_TICK_TOP = 0.2;
const L2NORM_TICK_HEIGHT = 0.55;

@facesRegistry.registerClass(ops.L2Norm)
export class L2NormFace<B extends cat.Datatype, A extends cat.Axis>
    extends LabelledGlyphFace<B, A, ops.L2Norm> {
    protected draw_glyph(glyph: pt.Rectangle): void {
        aob.draw_normalisation_triangle(this.draw, glyph);
        aob.draw_root_tick(this.draw, new pt.Rectangle(
            glyph.getLocation({x: L2NORM_TICK_LEFT, y: L2NORM_TICK_TOP}),
            {x: glyph.width * L2NORM_TICK_WIDTH, y: glyph.height * L2NORM_TICK_HEIGHT}));
    }
}

/* The circle of a normalisation, its fill, and the stroke widths of its
 * outline and of the mark inside it, heavier where the operator multiplies by
 * a learned gain. They are the numbers `CircledNormalisationBox` of
 * `additionalOperationBoxes.ts` draws its circle with. */
const NORMALISATION_CIRCLE_FILL = '#F1FCFC';
const NORMALISATION_OUTLINE_STROKE = '2';
const NORMALISATION_MARK_STROKE = '1';
const GAINED_NORMALISATION_OUTLINE_STROKE = '3';
const GAINED_NORMALISATION_MARK_STROKE = '2';

export abstract class CircledNormalisationFace<
    B extends cat.Datatype, A extends cat.Axis, Op extends ops.Normalize | ops.LayerNorm>
    extends LabelledGlyphFace<B, A, Op> {
    protected abstract draw_circle_mark(glyph: pt.Rectangle, stroke_width: string): void;

    protected draw_glyph(glyph: pt.Rectangle): void {
        const gained = this.target.operator.gain;
        this.draw?.circle(
            glyph.midpoint(),
            {
                radius: glyph.height / 2,
                'stroke-width': gained
                    ? GAINED_NORMALISATION_OUTLINE_STROKE : NORMALISATION_OUTLINE_STROKE,
                fill: NORMALISATION_CIRCLE_FILL,
            },
            {dropShadow: true});
        this.draw_circle_mark(
            glyph,
            gained ? GAINED_NORMALISATION_MARK_STROKE : NORMALISATION_MARK_STROKE);
    }
}

@facesRegistry.registerClass(ops.Normalize)
export class NormalizeFace<B extends cat.Datatype, A extends cat.Axis>
    extends CircledNormalisationFace<B, A, ops.Normalize> {
    protected draw_circle_mark(glyph: pt.Rectangle, stroke_width: string): void {
        aob.draw_root_tick(this.draw, glyph, stroke_width);
    }
}

@facesRegistry.registerClass(ops.LayerNorm)
export class LayerNormFace<B extends cat.Datatype, A extends cat.Axis>
    extends CircledNormalisationFace<B, A, ops.LayerNorm> {
    protected draw_circle_mark(glyph: pt.Rectangle, stroke_width: string): void {
        aob.draw_vertical_diameter(this.draw, glyph, stroke_width);
    }
}

/*
 * The rectangle a `Linear` is drawn as, which is the whole box: the rectangle
 * `LinearBox` draws, with its bottom-left corner bitten off and the operator's
 * name in the middle at `linear_label_font_size`, and as large as the room the
 * box offers.
 */
@facesRegistry.registerClass(ops.Linear)
export class NamedRectangleFace<B extends cat.Datatype, A extends cat.Axis>
    extends FaceElement<B, A> {
    public readonly draws_box_outline: boolean = true;
    public name: rh.AnnotationElement;

    constructor(
        box_renderer: box_renderer.BoxRenderer<B, A>,
        target: cat.Broadcasted<B, A, ops.Linear>,
        room: FaceRoom,
    ) {
        super(box_renderer, target);
        this.name = new rh.AnnotationElement(
            this.renderHandler, target.operator.name?.to_latex() ?? 'L',
            {font_size: this.settings.linear_label_font_size});
        const text = this.name.estimated_text_dims();
        const padding = this.settings.linear_label_padding;
        const least = this.settings.linear_core_dims;
        this.children = [new rh.CoreElement(this.renderHandler, {
            x: Math.max(least.x, text.x + 2 * padding.x, room.least.x),
            y: Math.max(least.y, text.y + 2 * padding.y, room.least.y),
        })];
    }

    get written_name(): string {
        return this.name.latex;
    }

    update(): void {
        super.update();
        const rect = this.rectangle();
        this.draw?.deltaPolygon(
            gb.bitten_rectangle(
                rect, this.settings.operation_multilinear_bite, gb.Corner.BOTTOM_LEFT),
            {fill: this.settings.box_linear_fill, stroke: 'none'},
            {dropShadow: true});
        this.name.place(rect);
    }
}

/*
 * The titled box `BlockOperatorBox` draws for a block operator, which is the
 * whole box. The box is built by the broadcasted renderer, as the
 * all-broadcasted and the arrows-and-broadcasted forms build it, so it queues
 * the body of its block as a sub-diagram through the references handler every
 * renderer of a render target shares. The columns of axis anchors it builds
 * belong to the all-broadcasted form and stand in no figure, so its one child
 * is its core, as large as the room the box offers.
 */
export class TitledBlockFace<B extends cat.Datatype, A extends cat.Axis>
    extends aob.BlockOperatorBox<B, A> implements OperatorFace {
    public readonly draws_box_outline: boolean = true;

    constructor(
        box_renderer: box_renderer.BoxRenderer<B, A>,
        target: cat.Broadcasted<B, A, ops.BlockOperator<B, A>>,
        room: FaceRoom,
    ) {
        super(box_renderer.broadcasted_renderer, target);
        this.core = new rh.CoreElement(this.renderHandler, {
            x: Math.max(this.core_dims.x, room.least.x),
            y: Math.max(this.core_dims.y, room.least.y),
        });
        this.children = [this.core];
    }

    get written_name(): string | undefined {
        return this.target.operator.name?.to_latex();
    }
}

facesRegistry.registerClass(ops.BlockOperator)(TitledBlockFace);
facesRegistry.registerClass(pbop.ParaBlockOperator)(TitledBlockFace);
