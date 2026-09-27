// Claude Opus 5.5 (1M context), effort 40.
/*
 * The box form of the broadcasted category, which `RenderHandlerSettings.form`
 * selects under `arrows-and-boxes`.
 *
 * `BoxRenderer` draws every array as `ArrowRenderer` draws it, one arrow per
 * array, and draws every `Broadcasted` as an `OperatorFaceBox`. The box is a
 * rounded rectangle in the fill, the shadow and the radius of the arrow form's
 * plate. The arrow of each operand enters its left edge and the arrow of each
 * result leaves its right edge, and the arrows of one edge stand evenly spaced
 * down it. Nothing of the broadcasting is drawn: no axis wire, no fan, no cup
 * and no reindexing node. The face inside the box is built by
 * `operatorFaces.facesRegistry` from the class of the operator.
 *
 * The box carries above it the name written on the plate by the arrow form, in
 * the same type and directly above the box, as `plateNames.ts` gives it for
 * both forms. The name is the operator's plate name where its class
 * registers one, which is `Linear` over a `Linear` and `Cache` over a cache,
 * and the operator's own name otherwise. It is left off where the face writes
 * that name already, so an `Einops` faced by `Matmul` carries no name above
 * it.
 *
 * `arrows.ArrowParaCategoryRenderer` draws `Para` over this renderer as it
 * draws it over the arrow renderer. A `ParaWrap` over a `Broadcasted` keeps
 * every operand and result in the box's columns, and the tape of each taped
 * array bends into the array's arrow there.
 */
import * as rh from '../../Render/RenderHandler';
import * as cat from '../../../data_structure/Category';
import * as ops from '../../../data_structure/Operators';
import * as cr from '../CategoryRenderer';
import * as crs from '../CategoryRendererSettings';
import * as bb from '../BroadcastedCategoryRenderer';
import * as ut from '../../../utilities/utilities';
import * as arrows from './ArrowRenderer';
import * as operator_faces from './operatorFaces';
import * as plate_names from './plateNames';

export function establish(): void {
    console.log("Loaded the box display.");
}

/*
 * The term whose inspection box opens over the box of `target`.
 *
 * The box form draws no reindexing node, and a reindexing that `pyncd`'s
 * `explain_reindexings` wraps in a block has its region on that node, which
 * `StrideCategoryRenderer.display_category` registers in the other forms. A
 * `View` is its reindexing and nothing else, and its box writes the
 * reindexing's name, so the box opens the block's inspection box as the node
 * does. Every other operator keeps its own region. Before, the boxes of `grp`
 * and `mask` in Mixtral-8x7B opened nothing, which the user reported on
 * 2026-09-26.
 */
function region_target<B extends cat.Datatype, A extends cat.Axis>(
    target: cat.Broadcasted<B, A>,
): cat.Broadcasted<B, A> | cat.Block<any, any> {
    if (!(target.operator instanceof ops.View)) {
        return target;
    }
    const explained = target.reindexings.flatMap(
        (reindexing: cat.StrideCategory<A>) => explained_reindexings(reindexing));
    return explained.length === 1 ? explained[0] : target;
}

/* The blocks that wrap reindexings in `reindexing`, not looking inside them. */
function explained_reindexings<A extends cat.Axis>(
    reindexing: cat.StrideCategory<A>,
): cat.Block<any, any>[] {
    if (reindexing instanceof cat.Block) {
        return [reindexing];
    }
    if (reindexing instanceof cat.Composed
        || reindexing instanceof cat.ProductOfMorphisms) {
        return reindexing.content.flatMap(
            (part: cat.StrideCategory<A>) => explained_reindexings(part));
    }
    return [];
}

/*
 * An operator drawn as a box with a face inside it.
 *
 * The box is as wide as its face needs. It is as tall as its face needs, and at
 * least as tall as the arrows of either column need, which is the room the
 * wires of their arrays take in the all-broadcasted form, less `box_margin`
 * above and below. The margins stand outside the box, so the box and its
 * margins together take the room of the arrows, and two boxes stacked in a
 * product stand two margins apart. The arrows of a column are spread over the
 * height of the box and its margins, each in the middle of an equal share of
 * it, so an arrow stands where the arrows of a neighbouring column holding the
 * same arrays stand, and its wire runs level. A share is at least an anchor
 * height, which is more than two margins, so every arrow meets the box.
 *
 * The face is the element the box is drawn over. The box draws the plate of
 * the arrow form over the face's rectangle, unless the face draws the outline
 * of the box itself, and registers that rectangle as the region of `target`,
 * so an inspection box opens over the whole box. The face is built for the
 * body of a block that asks for its body to be drawn in its place, and for
 * `target` otherwise, and the region is `target`'s either way, except that the
 * box of a `View` takes the region of its explained reindexing, as
 * `region_target` says.
 *
 * The name above the box, `plate_label`, stands with the face in a
 * `plateNames.PlateNameStack` inside the margins. The stack puts an empty
 * room as tall as the name below the face, so the face and the arrows of its
 * columns stand where they stand with no name, and the arrows either side run
 * level. The face is built at least as wide as the name.
 *
 * The arrows are pinned with `allow_skip`, as the arrows of `ArrowCappedBox`
 * are, so the wire of a neighbouring gap ends at the edge of the box. The
 * label of the arrow of a result, which the gap after the box writes, starts
 * `box_result_label_inset` clear of the box. A box drawn mirrored stands its
 * operands' arrows on its right, and the label the gap after the box writes
 * for one of them starts as far clear.
 */
export class OperatorFaceBox<B extends cat.Datatype, A extends cat.Axis>
    extends cr.MorphismBox<cat.Array<B, A>, cat.Broadcasted<B, A>, cat.Array<B, A>> {
    public left_anchors: cr.ProdObjectMeridian<cat.Array<B, A>, cat.Array<B, A>>;
    public right_anchors: cr.ProdObjectMeridian<cat.Array<B, A>, cat.Array<B, A>>;
    /* The arrow of each operand and of each result, in the operator's order. */
    public operand_arrows: arrows.ArrayArrowAnchor<B, A>[];
    public result_arrows: arrows.ArrayArrowAnchor<B, A>[];
    public face: operator_faces.OperatorFace;
    /* The name written above the box, where it carries one. */
    public plate_label?: rh.AnnotationElement;

    constructor(
        public categoryRenderer: BoxRenderer<B, A>,
        public target: cat.Broadcasted<B, A>,
    ) {
        super(categoryRenderer, target);
        const operands = target.dom().content;
        const results = target.cod().content;
        const drawn = bb.body_drawn_in_place(target) ?? target;

        this.face = this.face_for(drawn, operands, results);
        this.plate_label = plate_names.written_plate_label(
            this.renderHandler, drawn.operator, this.settings,
            (latex) => latex === this.face.written_name);

        const height = this.face.dims.y + 2 * this.settings.box_margin;
        const operand_column = this.evenly_spaced_arrows(operands, height);
        const result_column = this.evenly_spaced_arrows(results, height);
        this.left_anchors = new cr.ProdObjectMeridian(categoryRenderer, operand_column);
        this.right_anchors = new cr.ProdObjectMeridian(categoryRenderer, result_column);
        this.operand_arrows = operand_column.map((meridian) => meridian.arrow);
        this.result_arrows = result_column.map((meridian) => meridian.arrow);
        this.pin_arrows();

        this.renderHandler.register_term_region(this.face, region_target(target));
        this.children = [
            this.left_anchors, this.stack_margins_around_face(), this.right_anchors];
        this.setBorderColor('purple');
    }

    /* The face of `drawn`, offered the room needed by the arrows of either
     * column and the width of the name written above it. */
    private face_for(
        drawn: cat.Broadcasted<B, A>,
        operands: readonly cat.Array<B, A>[],
        results: readonly cat.Array<B, A>[],
    ): operator_faces.OperatorFace {
        const margins = 2 * this.settings.box_margin;
        return operator_faces.facesRegistry.getConstructor(drawn.operator)(
            this.categoryRenderer, drawn, {
                least: {
                    x: plate_names.plate_label_width(drawn.operator, this.settings),
                    y: Math.max(0, this.room_of_column(operands) - margins,
                                this.room_of_column(results) - margins),
                },
            });
    }

    private pin_arrows(): void {
        [...this.operand_arrows, ...this.result_arrows].forEach((arrow) => {
            arrow.allow_skip = false;
        });
        this.inset_labels_after_the_box();
    }

    /* Start the label of each arrow of the column drawn on the right
     * `box_result_label_inset` clear of the box, and the label of each arrow
     * of the column drawn on the left at the arrow. */
    private inset_labels_after_the_box(): void {
        this.left_anchors.anchors.forEach((arrow) => {
            arrow.gap_label_inset = 0;
        });
        this.right_anchors.anchors.forEach((arrow) => {
            arrow.gap_label_inset = this.settings.box_result_label_inset;
        });
    }

    public mirror(): void {
        super.mirror();
        this.inset_labels_after_the_box();
    }

    /* The face with the name above it, and a margin above and below both. */
    private stack_margins_around_face(): rh.Vertical {
        const margin = (): rh.CoreElement => new rh.CoreElement(
            this.renderHandler, {x: 0, y: this.settings.box_margin});
        return new rh.Vertical(this.renderHandler, [
            margin(),
            new plate_names.PlateNameStack(
                this.renderHandler, this.face, this.plate_label),
            margin(),
        ]);
    }

    get settings(): crs.BoxRendererSettings<B, A> {
        return this.categoryRenderer.settings;
    }

    /* The height the arrows of `arrays` take in a column when each stands in
     * the room of its array's wires. */
    private room_of_column(arrays: readonly cat.Array<B, A>[]): number {
        return ut.sum(arrays.map(
            (array) => arrows.room_of_array_wires(array, this.settings)));
    }

    /* One arrow for each of `arrays`, each in the middle of an equal share of
     * `height`. */
    private evenly_spaced_arrows(
        arrays: readonly cat.Array<B, A>[],
        height: number,
    ): arrows.ArrayArrowMeridian<B, A>[] {
        return arrays.map((array) => new arrows.ArrayArrowMeridian(
            this.categoryRenderer, array, height / arrays.length));
    }

    update(): void {
        super.update();
        if (!this.face.draws_box_outline) {
            arrows.draw_operator_plate(this.draw, this.face.rectangle(), this.settings);
        }
    }
}

/*
 * The arrows of `arrows.ArrowRenderer` with every `Broadcasted` drawn as an
 * `OperatorFaceBox`.
 *
 * The references handler is the broadcasted renderer's, as the arrow
 * renderer's is, so a `TitledBlockFace` queues the body of its block where
 * `diagramRenderTarget.render_with_subblock` pops it.
 */
export class BoxRenderer<B extends cat.Datatype, A extends cat.Axis>
    extends arrows.ArrowRenderer<B, A> {
    public settings: crs.BoxRendererSettings<B, A>;

    constructor(
        broadcasted_renderer: bb.BroadcastedRenderer<B, A>,
        _settings: Partial<crs.BoxRendererSettings<B, A>> = {},
    ) {
        super(broadcasted_renderer, _settings);
        this.settings = {
            ...crs.DefaultBoxRendererSettings,
            ..._settings,
        };
    }

    public display_morphism(target: cat.Broadcasted<B, A>): OperatorFaceBox<B, A> {
        return new OperatorFaceBox(this, target);
    }
}
