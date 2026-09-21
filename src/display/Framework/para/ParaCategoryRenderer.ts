import * as rh from '../../Render/RenderHandler';
import * as cat from '../../../data_structure/Category';
import * as cr from '../CategoryRenderer';
import * as crs from '../CategoryRendererSettings';
import * as pdt from '../../../para/data_structure/Para';
import * as pcon from '../../../para/data_structure/Contraction';
import * as ptr from '../../../para/data_structure/Transpose';
import * as pinj from '../../../para/data_structure/Inject';
import * as pwt from '../../../para/data_structure/ParaWrap';
import * as pbop from '../../../para/data_structure/ParaBlockOperator';
import * as pwd from './ParaWrapDisplay';
import * as pwbd from './ParaWrapBroadcastedDisplay';
import * as bb from '../BroadcastedCategoryRenderer';
import * as scr from '../StrideCategoryRenderer';
import {
    BlockOperatorBox, GenericOperatorBox,
} from '../Operations/additionalOperationBoxes';

export function establish(): void {
    console.log("Loaded Para renderer module.");
}

/*
 * Named so the bundle keeps `Contraction` and `Transpose`. Their classes
 * register themselves with the `TermDirectory` by decorator and nothing else in
 * the display layer refers to them, so an import for side effects alone can be
 * shaken out - and the symptom is a render that fails with "Term type not found
 * in TermDirectory: Zero", which reads like a missing class rather than a
 * dropped module.
 */
export const PARA_OPERATORS = [
    pcon.Zero, ptr.Transpose, ptr.ReindexTranspose, pwt.ParaWrap, pinj.Inject,
    pbop.ParaBlockOperator,
];

/*
 * `Zero` may not take the DEFAULT operation box, which builds anchors and a
 * core and then draws nothing at all. Drawing nothing is harmless for an
 * operator whose target passes straight through, where every wire leaving the
 * box also entered it; `Zero` is the opposite case - nullary, its whole output
 * comes from nowhere - so with no glyph its wires simply begin in mid-air.
 *
 * It takes `GenericOperatorBox`, the named box: a box saying `0` is what it
 * is. Registered by call rather than by decorator because the box is declared
 * elsewhere; the registry keys on the exact constructor, which is why
 * `ops.ReLU` and `ops.Dropout` need the same treatment beside `ElementwiseBox`.
 *
 * A repeat - the dual of a sum - once had a box of its own here (`BroadcastBox`,
 * the `EinopsBox` reflected). It is now an `ops.View` whose reindexing does not
 * name the repeated axis, which `ViewBox` already draws: the axis is degree,
 * broadcast over, and its wire starts at the box like any other broadcast.
 */
bb.opsRegistry.registerClass(pcon.Zero)(GenericOperatorBox);

/*
 * A `ParaBlockOperator` is a `BlockOperator` carrying the grabs and the drops
 * of its body, and it draws as one: the same titled box, with the body
 * rendered once beside the figure. The two lists are there for the algebra,
 * and the body already shows every grab and drop it holds, so there is nothing
 * extra to draw. Registered by call for the reason `Zero` is, that the
 * registry keys on the exact constructor and does not walk superclasses.
 */
bb.opsRegistry.registerClass(pbop.ParaBlockOperator)(BlockOperatorBox);

/*
 * A linear operator read the other way, drawn as its own glyph reflected.
 *
 * `LinearBox` is a rectangle with a bite taken out of its BOTTOM-LEFT corner -
 * an asymmetric mark, so the box says which way it is being read. Reflecting a
 * matrix in its main diagonal carries the bottom-left corner to the TOP-RIGHT
 * one, so that is where this one's bite goes, and the two glyphs sit either side
 * of a reverse pass as obvious mirror images.
 *
 * The label is the forward operator's own name, carried through `Transpose.name`
 * unchanged: a transpose is the SAME weight, and giving it a second name would
 * say it was a second parameter. The glyph is the only thing that differs, which
 * is exactly the claim being made.
 *
 * `NODE`, as `LinearBox` sets: a transposed `Linear` is broadcast over the same
 * degree the forward one was, and its reindexing wants drawing as a node the
 * degree wires pass into rather than routed invisibly around the box.
 */
@bb.opsRegistry.registerClass(ptr.Transpose)
export class TransposeBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ptr.Transpose> {
    private annotation: rh.AnnotationElement;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ptr.Transpose>,
    ) {
        super(categoryRenderer, target, {x: 40, y: 30});
        this.annotation = new rh.AnnotationElement(
            this.renderHandler,
            `${target.operator.name?.to_latex() ?? 'L'}^{\\top}`,
            {font_size: 1.2},
        );
        this.override_display_type = bb.BroadcastDisplayType.NODE;
        // A grabbed operand is the weight being transposed - the same slot
        // the forward grabbed - and ends here. See `LinearBox`.
        this.raise_rows = false;
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        const biteSize = this.settings.operation_multilinear_bite;
        this.renderHandler.draw_handler?.deltaPolygon(
            [rect.top_left,
            {x: rect.dims.x - biteSize, y: 0},
            {x: biteSize, y: biteSize},
            {x: 0, y: rect.dims.y - biteSize},
            {x: -rect.dims.x, y: 0}],
            {fill: '#E8EEEB', stroke: 'none'},
            {dropShadow: true}
        );
        this.renderHandler.annotation_handler.addAnnotation(
            rect,
            this.annotation,
        )
    }
}

/*
 * The transpose of a node: the reindexing itself, drawn as the figure it is.
 *
 * A forward node is a `Broadcasted` whose reindexing sits in `reindexings`, and
 * `BroadcastedBox` draws that with `BroadcastDisplayType.NODE`. This one cannot
 * use that path at all: a `reindexings` entry always maps output indices back to
 * input ones, the transpose runs the other way, and so `pyncd` carries the
 * reindexing inside the OPERATOR instead. The figure is the same figure; only
 * where it is read from differs, so this box builds it itself.
 *
 * The direction is a setting on the renderer the node is drawn by rather than
 * anything drawn here. `scr.CovariantStrideRenderer` puts the reindexing's
 * domain on the left and its codomain on the right, and carries the point to
 * the right with them, which is where the sum lands. `x*[j] = sum over the
 * fibre of eta` is what the picture then says.
 */
@bb.opsRegistry.registerClass(ptr.ReindexTranspose)
export class ReindexTransposeBox<B extends cat.Datatype, A extends cat.Axis>
    extends bb.OperationBox<B, A, ptr.ReindexTranspose<A>> {
    private node_box?: cr.MorphismBox<A, cat.StrideMorphism<A>, A>;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ptr.ReindexTranspose<A>>,
    ) {
        super(categoryRenderer, target, {x: 0, y: 0});
        const reindexing = target.operator.reindexing;
        if (reindexing === null || reindexing === undefined) { return; }
        this.node_box = new scr.CovariantStrideRenderer<A>(
            this.renderHandler, this.categoryRenderer.strideRenderer.settings)
            .display_category(reindexing, false);
        /*
         * Only the AXES, not the whole meridian: an `ArrayMeridian` carries a
         * datatype anchor beside its axes and the node has no column for it.
         * Every axis is a target axis here - the transpose is built with an
         * empty degree - so the two columns are the reindexing's two ends
         * entire, and pair up with the node's positionally.
         */
        const source = (this.left_anchors.lone_elements[0] as
                        bb.ArrayMeridian<B, A>)?.axes_anchors;
        const result = (this.right_anchors.lone_elements[0] as
                        bb.ArrayMeridian<B, A>)?.axes_anchors;
        source?.link(this.node_box.left_anchors);
        this.node_box.right_anchors.link(result!);
        /*
         * A scatter FANS IN - several inputs onto one output - so the node has
         * to be visibly where the wires meet, and none of the four columns may
         * be skipped through. `allow_skip`, not `loose`, for the reason
         * `BroadcastedBox.link_node` gives: `ComposedGap` sets `loose` after
         * this constructor has run and would simply set it again.
         */
        [source, result, this.node_box.left_anchors,
         this.node_box.right_anchors].forEach(
            (column) => column?.anchors.forEach((a) => a.allow_skip = false));
        this.core = new rh.CoreElement(
            this.renderHandler,
            {
                x: this.node_box.dims.x
                   + 2 * this.settings.broadcast_offset_x,
                y: Math.max(this.left_anchors.dims.y,
                            this.right_anchors.dims.y,
                            this.node_box.dims.y),
            },
            [this.node_box],
        );
        this.children = [this.left_anchors, this.core, this.right_anchors];
    }
}

/*
 * A morphism in `Para` is a morphism of the underlying category together with
 * two ways of reaching a tape: `Grab`, which takes a parameter off it, and
 * `Drop`, which puts one back - and `ParaWrap`, which writes either onto the
 * morphism it touches. Nothing else changes, so nothing in this file knows
 * what the objects are - it draws whatever `display_prod_object` hands back
 * and asks the underlying renderer for everything else.
 *
 * All three are drawn by `ParaWrapBox` (`ParaWrapDisplay`): a grab is a wrap
 * over the identity with its one input on the tape, a drop the same with its
 * one output. The box puts grabbed objects on a row along its top edge and
 * dropped ones along its bottom, and runs the tape out from there.
 */
export type ParaSeed<L, M extends cat.Morphism<L>> =
    M | pdt.Grab<L> | pdt.Drop<L> | pwt.ParaWrap<L, M>;

/*
 * `Para` over some other category, drawn by borrowing that category's renderer.
 *
 * Everything that knows what an object or a seed morphism IS is delegated to
 * `base` - in practice a `BroadcastedRenderer`, which is where arrays, weaves
 * and operator glyphs live. What is added here is the two morphisms `Para` adds
 * and nothing else, which is why this file is generic in `L` and `M`: a grab is
 * a grab whatever is on the wire.
 *
 * The delegation is one level deep, and deliberately so. A box the base renderer
 * builds holds the BASE as its `categoryRenderer`, so anything that box displays
 * recursively is displayed without `Para` in the picture. That is right for a
 * seed morphism, which is a leaf - a `Broadcasted` recurses only into its own
 * `strideRenderer`, for the reindexings - and it would be wrong for a container,
 * which is why the containers (`Composed`, `Block`, `ProductOfMorphisms`,
 * `Rearrangement`) stay with `display_category` on this renderer and never reach
 * `base` at all.
 *
 * The one thing the two renderers do NOT keep separately is the
 * `referencesHandler`, which is shared with the base - see the constructor.
 */
export class ParaCategoryRenderer<
    L,
    M extends cat.Morphism<L>,
    A = L> extends cr.CategoryRenderer<L, ParaSeed<L, M>, A> {

    public settings: crs.ParaRendererSettings<L, ParaSeed<L, M>, A>;
    constructor(
        public base: cr.CategoryRenderer<L, M, A>,
        _settings: Partial<crs.ParaRendererSettings<L, ParaSeed<L, M>, A>> = {},
    ) {
        super(base.renderHandler, _settings);
        /*
         * The base's settings sit ON TOP of the para defaults, not under them.
         * The two renderers draw into one figure and meet at every gap, so
         * anchor heights, separators and gap widths have to be the base's or the
         * columns on either side of a seed morphism will not line up. What the
         * defaults are here for is the `tape_*` numbers, which the base has no
         * opinion about.
         */
        this.settings = {
            ...crs.DefaultParaRendererSettings,
            ...base.settings,
            ..._settings,
        };
        /*
         * One references handler between the two renderers, not one each.
         *
         * `register_block` is called by `BlockOperatorBox`, a SEED box, so it
         * runs against the base, and the pending body it queues is popped by
         * whoever asks the base. With a handler each, a block registered
         * through this renderer would be queued in one handler and drained
         * from the other. Sharing the handler is what keeps `Para` transparent
         * here: a caller drains exactly where it did before it was wrapped.
         * The highlight a block's boxes share lives on the render handler,
         * which the two renderers already share.
         */
        this.referencesHandler = base.referencesHandler;
    }

    public display_lone(target: L): cr.Meridian<A> {
        return this.base.display_lone(target);
    }

    public display_prod_object(
        target: cat.ProdObject<L>,
    ): cr.ProdObjectMeridian<L, A> {
        return this.base.display_prod_object(target);
    }

    public display_morphism(
        target: ParaSeed<L, M>,
    ): cr.MorphismBox<L, ParaSeed<L, M>, A> {
        if (target instanceof pdt.Grab) {
            return new pwd.ParaWrapBox<L, any, A>(this, pwt.ParaWrap.of_grab(target)) as
                cr.MorphismBox<L, ParaSeed<L, M>, A>;
        }
        if (target instanceof pdt.Drop) {
            return new pwd.ParaWrapBox<L, any, A>(this, pwt.ParaWrap.of_drop(target)) as
                cr.MorphismBox<L, ParaSeed<L, M>, A>;
        }
        if (target instanceof pwt.ParaWrap) {
            return pwbd.display_para_wrap<L, M, A>(this, this.base, target) as
                cr.MorphismBox<L, ParaSeed<L, M>, A>;
        }
        return this.base.display_morphism(target as M) as
            cr.MorphismBox<L, ParaSeed<L, M>, A>;
    }
}
