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
import * as bb from './BroadcastedCategoryRenderer';
import * as locked_highlights from '../Render/locked_highlights';
import * as lockable_plate from '../Render/lockablePlate';
import * as padlock from '../Render/padlock';
import * as DiagramTheme from '../Render/DiagramTheme';
import * as Curve from '../../utilities/Curve';
import * as dms from './dynamicMultilineSizing';

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

/* One row of a wrapped figure: the part of the figure it holds, and that part
 * drawn. */
interface RowContent<L, M extends cat.Morphism<L>, A=L> {
    box: cr.MorphismBox<L, M, A>;
    target: cat.ProdCategory<L, M>;
}

function is_loop(block: cat.Block<any, any>): boolean {
    return !(block.repetition instanceof nm.Integer && block.repetition._value === 1);
}

/*
 * `target` as the layout tree that `dynamicMultilineSizing.plan_rows` reads. A
 * `Composed` is a sequence and a `Block` whose body is drawn in full is a
 * group, as `split_composed` and `split_block` divide them. A product whose
 * widest factor is one of those two is a parallel node, as `split_product`
 * divides it. Anything else is a leaf, built once as `display_category` builds
 * it inside a row. The gap
 * between two neighbouring leaves and the caps of a row starting or ending at
 * a leaf are read from the anchors of the leaves built, as `split_composed`
 * and `split_row` read them.
 */
function measured_layout<L, M extends cat.Morphism<L>, A=L>(
    categoryRenderer: cr.CategoryRenderer<L, M, A>,
    target: cat.ProdCategory<L, M>,
): dms.RowLayout<cat.ProdCategory<L, M>> {
    const reversed = categoryRenderer.settings.reversed;
    const leaf_boxes: cr.MorphismBox<L, M, A>[] = [];

    function gap_between(before: number, after: number): number {
        const [left, right] = reversed
            ? [leaf_boxes[after], leaf_boxes[before]]
            : [leaf_boxes[before], leaf_boxes[after]];
        return cr.ComposedGap.required_width(
            categoryRenderer, left.right_anchors, right.left_anchors);
    }

    function group_of(
        block: cat.Block<L, cat.ProdCategory<L, M>>,
    ): dms.GroupNode<cat.ProdCategory<L, M>> {
        const processor = cr.blocksRegistry.getConstructor(block.block_tag.aesthetics)(
            categoryRenderer, block.block_tag.aesthetics, null);
        const title_padding = categoryRenderer.settings.block_title_padding.x;
        const title = processor.title_dims(categoryRenderer.settings.block_title_font_size);
        const label = processor.label_dims();
        return dms.layout_group(
            block as cat.ProdCategory<L, M>,
            node_of(block.body),
            processor.placement_padding().x,
            Math.max(
                (title?.x ?? 0) + 2 * title_padding,
                (label?.x ?? 0) + 2 * title_padding),
            is_loop(block));
    }

    function is_divisible(part: cat.ProdCategory<L, M>): boolean {
        return part instanceof cat.Composed
            || (part instanceof cat.Block
                && cr.block_body_display(categoryRenderer, part) === cr.BlockBody.FULL);
    }

    /* A product as a parallel node dividing its widest factor, where that
     * factor is a composition or a block drawn in full, and as `undefined`
     * otherwise, in which case the product is one leaf. */
    function parallel_of(
        product: cat.ProductOfMorphisms<L, cat.ProdCategory<L, M>>,
    ): dms.ParallelNode<cat.ProdCategory<L, M>> | undefined {
        const factor_widths = product.content.map(
            (factor) => categoryRenderer.display_category(factor, false).dims.x);
        const main_index = factor_widths.indexOf(Math.max(...factor_widths));
        if (!is_divisible(product.content[main_index])) {
            return undefined;
        }
        return dms.layout_parallel(
            product as cat.ProdCategory<L, M>,
            node_of(product.content[main_index]),
            main_index,
            Math.max(0, ...factor_widths.filter((_, i) => i !== main_index)));
    }

    function node_of(part: cat.ProdCategory<L, M>): dms.LayoutNode<cat.ProdCategory<L, M>> {
        if (part instanceof cat.ProductOfMorphisms) {
            const parallel = parallel_of(
                part as cat.ProductOfMorphisms<L, cat.ProdCategory<L, M>>);
            if (parallel !== undefined) {
                return parallel;
            }
        }
        if (part instanceof cat.Composed) {
            const children = part.content.map(
                (member: cat.ProdCategory<L, M>) => node_of(member));
            return dms.layout_sequence(
                part as cat.ProdCategory<L, M>,
                children,
                children.slice(1).map((child, i) => gap_between(children[i].last, child.first)));
        }
        if (part instanceof cat.Block
            && cr.block_body_display(categoryRenderer, part) === cr.BlockBody.FULL) {
            return group_of(part as cat.Block<L, cat.ProdCategory<L, M>>);
        }
        const box = categoryRenderer.display_category(part, false);
        leaf_boxes.push(box);
        return dms.layout_leaf(part, box.dims.x, leaf_boxes.length - 1);
    }

    const root = node_of(target);
    const column = (object: cat.ProdObject<L>) =>
        categoryRenderer.display_prod_object(object);
    const cap = (left: cr.Meridian<A>, right: cr.Meridian<A>): number =>
        cr.ComposedGap.required_width(categoryRenderer, left, right, 0);
    return {
        root,
        start_caps: leaf_boxes.map((box) => reversed
            ? cap(box.right_anchors, column(box.target.dom()))
            : cap(column(box.target.dom()), box.left_anchors)),
        end_caps: leaf_boxes.map((box) => reversed
            ? cap(column(box.target.cod()), box.left_anchors)
            : cap(box.right_anchors, column(box.target.cod()))),
    };
}

/*
 * The part of `node` holding the leaves of `span`, drawn. A node the span holds
 * whole is drawn by `display_category`. A group the span cuts is drawn as a
 * `PartialBlock` numbered by the rows of the group before it, so that its
 * title, its label and its left bracket stand on its first piece and its right
 * bracket on its last, as `split_block` numbers them.
 */
function drawn_span<L, M extends cat.Morphism<L>, A=L>(
    categoryRenderer: cr.CategoryRenderer<L, M, A>,
    node: dms.LayoutNode<cat.ProdCategory<L, M>>,
    span: dms.RowSpan,
    row_starts: number[],
): RowContent<L, M, A> {
    if (node.kind === 'leaf' || (span.first <= node.first && node.last <= span.last)) {
        return {
            box: categoryRenderer.display_category(node.source, false),
            target: node.source,
        };
    }
    if (node.kind === 'group') {
        const block = node.source as cat.Block<L, cat.ProdCategory<L, M>>;
        const body = drawn_span(categoryRenderer, node.body, span, row_starts);
        const order = (block._display_order ?? 0) + row_starts.filter(
            (start) => node.first < start && start <= span.first).length;
        const piece = new cat.Block<L, cat.ProdCategory<L, M>>(
            body.target, block.block_tag, order);
        const position = span.last >= node.last
            ? PartialBlockPosition.LAST : PartialBlockPosition.MIDDLE;
        return {
            box: new PartialBlock(categoryRenderer, piece, CAPPED, body.box, order, position),
            target: piece,
        };
    }
    if (node.kind === 'parallel') {
        return drawn_parallel_span(categoryRenderer, node, span, row_starts);
    }
    const parts = node.children
        .filter((child) => child.last >= span.first && child.first <= span.last)
        .map((child) => drawn_span(categoryRenderer, child, span, row_starts));
    const composed = new cat.Composed<L, cat.ProdCategory<L, M>>(
        parts.map((part) => part.target));
    return {
        box: new cr.ComposedBox<L, M, A>(
            categoryRenderer, composed, CAPPED, parts.map((part) => part.box)),
        target: composed,
    };
}

/* The part of a product holding the leaves of `span`: the part of its main
 * factor, and each other factor whole on the product's first row and as the
 * identity of its codomain on every later row, as `split_product` draws them. */
function drawn_parallel_span<L, M extends cat.Morphism<L>, A=L>(
    categoryRenderer: cr.CategoryRenderer<L, M, A>,
    node: dms.ParallelNode<cat.ProdCategory<L, M>>,
    span: dms.RowSpan,
    row_starts: number[],
): RowContent<L, M, A> {
    const product = node.source as cat.ProductOfMorphisms<L, cat.ProdCategory<L, M>>;
    const holds_first_row = span.first <= node.first;
    const parts = product.content.map((factor, i): RowContent<L, M, A> => {
        if (i === node.main_index) {
            return drawn_span(categoryRenderer, node.main, span, row_starts);
        }
        const part = holds_first_row
            ? factor : factor.cod().identity() as cat.ProdCategory<L, M>;
        return {box: categoryRenderer.display_category(part, false), target: part};
    });
    const target = new cat.ProductOfMorphisms<L, cat.ProdCategory<L, M>>(
        parts.map((part) => part.target));
    return {
        box: new cr.ProductBox<L, M, A>(
            categoryRenderer, target, CAPPED, parts.map((part) => part.box)),
        target,
    };
}

/* The rows of `target` that `dynamicMultilineSizing.plan_rows` chooses at the
 * target `max_width`, measured as `split_row` measures a row. */
function planned_rows<L, M extends cat.Morphism<L>, A=L>(
    categoryRenderer: cr.CategoryRenderer<L, M, A>,
    target: cat.ProdCategory<L, M>,
    max_width: number,
): RowContent<L, M, A>[] {
    const layout = measured_layout(categoryRenderer, target);
    const rows = dms.plan_rows(
        layout, max_width + 2 * categoryRenderer.settings.composed_gap_dims.x);
    const row_starts = rows.map((row) => row.first);
    return rows.map((row) => drawn_span(categoryRenderer, layout.root, row, row_starts));
}

/* The side of a row a cap stands at, in the order the row is read. */
export enum RowSide {
    START,
    END,
}

/*
 * The keys of the wires a row carries over from the row before it and on to
 * the row after it. The first row of a figure has no row before it and the
 * last has no row after it.
 */
export interface RowContinuations {
    from_previous_row?: string;
    to_next_row?: string;
}

/* The highlight that lights the arcs ending the wires of the array at
 * `array_index` of one row's codomain and the arcs starting them on the next
 * row, which share `continuation_key`. */
export function continuation_highlight_token(
    continuation_key: string,
    array_index: number,
): string {
    return `continuation:${continuation_key}:${array_index}`;
}

/* The second highlight a locked continuation holds, which closes the padlocks
 * beside its two plates, as `slot_lock_highlight_token` does for a slot. */
export function continuation_lock_highlight_token(
    continuation_key: string,
    array_index: number,
): string {
    return `continuation-lock:${continuation_key}:${array_index}`;
}

/* The continuations a click has locked, held under a source of their own so
 * that the pointer's hover comes and goes beneath a lock, as the tape slots
 * are held. */
const CONTINUATION_LOCKS = new locked_highlights.LockedHighlights('continuation-lock');

export interface ContinuationArc {
    curve: Curve.CurveSequence;
    arrow_tip: pt.Point;
    arrow_angle: number;
}

/*
 * The stretch of wire a cap draws between the wire's anchor `inner` in the
 * row and the row's outer column at `outer_x`, in the order the wire's data
 * travels, and the arrow standing on the wire where it meets the arc.
 *
 * At the end of a row the wire runs level from `inner` to the junction
 * `radius` short of the outer column, and turns down the page through a
 * quarter circle of `radius` that ends on the outer column. The start of a row
 * is the same shape turned half a turn. The wire comes down the page on the
 * outer column, turns through the quarter circle to meet its own height at
 * the junction, and runs level to `inner`. The arrow points the way the data
 * travels and stands on the level run, with its tip at the junction at the end
 * of a row and its back at the junction at the start of one.
 *
 * The outer column may stand on either side of `inner`, so a mirrored row ends
 * in an arc turning left and down and starts in one turning down and left.
 */
export function continuation_arc(
    side: RowSide,
    inner: pt.Point,
    outer_x: number,
    radius: number,
): ContinuationArc {
    const towards_outer = Math.sign(outer_x - inner.x) || 1;
    const junction = {x: outer_x - towards_outer * radius, y: inner.y};
    const bend = radius * cr.TURN_KAPPA;
    if (side === RowSide.END) {
        const turned = {x: outer_x, y: inner.y + radius};
        return {
            curve: new Curve.CurveSequence([
                new Curve.StraightLine(inner, junction),
                new Curve.CubicBezierSegment(
                    junction,
                    {x: junction.x + towards_outer * bend, y: junction.y},
                    {x: turned.x, y: turned.y - bend},
                    turned),
            ]),
            arrow_tip: junction,
            arrow_angle: towards_outer > 0 ? 0 : Math.PI,
        };
    }
    const turned = {x: outer_x, y: inner.y - radius};
    return {
        curve: new Curve.CurveSequence([
            new Curve.CubicBezierSegment(
                turned,
                {x: turned.x, y: turned.y + bend},
                {x: junction.x + towards_outer * bend, y: junction.y},
                junction),
            new Curve.StraightLine(junction, inner),
        ]),
        arrow_tip: {
            x: junction.x - towards_outer * bb.DATATYPE_ANCHOR_TRIANGLE_X,
            y: junction.y,
        },
        arrow_angle: towards_outer > 0 ? Math.PI : 0,
    };
}

/*
 * The rectangle one wire's part of a continuation plate covers: the level run
 * from `inner` to the outer column at `outer_x`, the quarter circle of `radius`
 * below the wire at the end of a row or above it at the start of one, and the
 * arrow standing on the run, padded by `padding` px.
 */
export function continuation_plate_region(
    side: RowSide,
    inner: pt.Point,
    outer_x: number,
    radius: number,
    padding: number,
): pt.Rectangle {
    const [above, below] = side === RowSide.END
        ? [bb.DATATYPE_ANCHOR_TRIANGLE_Y, radius]
        : [radius, bb.DATATYPE_ANCHOR_TRIANGLE_Y];
    const left = Math.min(inner.x, outer_x);
    return new pt.Rectangle(
        {x: left, y: inner.y - above},
        {x: Math.max(inner.x, outer_x) - left, y: above + below},
    ).pad({x: padding, y: padding});
}

/* A wire a cap continues: the location of its anchor in the row, and the x of
 * the row's outer column. */
export interface ContinuedWire {
    inner: pt.Point;
    outer_x: number;
}

/*
 * The rectangle the plate of one array's continuation covers: the region
 * `continuation_plate_region` gives each wire of the array, and the room
 * between them. `wires` holds at least one wire.
 */
export function array_continuation_plate_region(
    side: RowSide,
    wires: readonly ContinuedWire[],
    radius: number,
    padding: number,
): pt.Rectangle {
    return pt.Rectangle.bounding_rectangle(wires.map((wire) =>
        continuation_plate_region(side, wire.inner, wire.outer_x, radius, padding)));
}

/*
 * Where the padlock of an array's plate stands: outside the row, beyond the
 * edge of the plate on the outer column's side, midway between the highest and
 * the lowest wire of the array. A padlock of `dims` stands `gap` px clear of
 * the plate. `wires` holds at least one wire.
 */
export function continuation_padlock_centre(
    region: pt.Rectangle,
    wires: readonly ContinuedWire[],
    dims: pt.Point,
    gap: number,
): pt.Point {
    const heights = wires.map((wire) => wire.inner.y);
    return {
        x: wires[0].outer_x >= wires[0].inner.x
            ? region.right + gap + dims.x / 2
            : region.left - gap - dims.x / 2,
        y: (Math.min(...heights) + Math.max(...heights)) / 2,
    };
}

interface ContinuedWireOfArray extends ContinuedWire {
    array_index: number;
}

/*
 * The cap at the side of a row whose wires continue on another row. Each wire
 * is drawn as `continuation_arc` gives it, and a separator is drawn in the
 * same arc with no arrow.
 *
 * The arcs of the wires of one array stand on one lockable plate, as a taped
 * array does, with one padlock outside the row beside it. The arrays are the
 * objects of the row's domain or codomain that the outer column draws, so in
 * the axis form the plate covers the arcs of every axis of the array and of
 * its datatype. The two plates of one array, at the end of a row and at the
 * start of the next, share a highlight. A pointer resting on either plate
 * fills both and lights the halos of every arc on them, and a click locks them
 * lit until a second click. The halo of an arc is lit with the wire's axis as
 * well, as the rest of the wire's halo is.
 *
 * The cap links neither of its columns, so no anchor paints a wire across it.
 * The arcs are measured from the positions of the columns in `update`, which
 * is after `ContravariantBox` has mirrored the row.
 */
export class RowContinuationCap<L, A=L> extends cr.AnchoredBox<A> {
    constructor(
        public categoryRenderer: cr.CategoryRenderer<L, any, A>,
        public readonly outer_column: cr.ProdObjectMeridian<L, A>,
        public readonly inner_column: cr.Meridian<A>,
        public readonly side: RowSide,
        public readonly continuation_key: string,
    ) {
        super(categoryRenderer);
        [this.left_anchors, this.right_anchors] = side === RowSide.START
            ? [outer_column, inner_column] : [inner_column, outer_column];
        this.children = [new rh.CoreElement(this.renderHandler, {
            x: this.settings.multiline_curve_width,
            y: this.settings.composed_gap_dims.y,
        })];
        this.height = this.settings.anchor_height * Math.max(
            outer_column.anchors.length, inner_column.anchors.length);
    }

    update(): void {
        super.update();
        const continued_wires = cr.ComposedGap.align(
            this.outer_column.anchors, this.inner_column.anchors)
            .flatMap(([outer, inner]) => this.draw_continuation(outer, inner));
        const array_indices = [...new Set(
            continued_wires.map((wire) => wire.array_index))];
        array_indices.forEach((array_index) => this.draw_array_plate(
            array_index,
            continued_wires.filter((wire) => wire.array_index === array_index)));
    }

    /*
     * The arc, the arrow and the halo of the wire from `outer` to `inner`.
     * Returns the wire, for the plate of its array, and returns nothing for a
     * separator, which belongs to no array, and for an anchor that draws no
     * wire.
     */
    private draw_continuation(
        outer: cr.Anchor<A>,
        inner: cr.Anchor<A>,
    ): ContinuedWireOfArray[] {
        const inner_point = inner.location();
        const outer_point = outer.location();
        if (inner_point === undefined || outer_point === undefined
                || !inner.draws_wire()) {
            return [];
        }
        const arc = continuation_arc(
            this.side, inner_point, outer_point.x, this.settings.multiline_arc_radius);
        const attributes = inner.wire_attributes();
        const array_index = this.outer_column.lone_elements.findIndex(
            (array) => array.anchors.includes(outer));
        if (array_index < 0) {
            this.draw?.curve(arc.curve, attributes, undefined, inner.wire_layer);
            return [];
        }
        const halo = cr.draw_wire_halo(
            this.draw, arc.curve, attributes,
            this.settings.axis_halo_extra_width, inner.wire_layer);
        this.draw?.curve(arc.curve, attributes, undefined, inner.wire_layer);
        this.draw?.deltaPolygon(
            [arc.arrow_tip,
             ...pt.Point.rotate(bb.DATATYPE_TRIANGLE_DELTAS, arc.arrow_angle)],
            {stroke: 'none', fill: attributes.stroke ?? 'black'},
            undefined, inner.wire_layer);
        cr.link_halo(this.renderHandler, halo,
                     [continuation_highlight_token(this.continuation_key, array_index),
                      ...inner.wire_highlight_tokens()],
                     this.settings.halo_opacity);
        return [{inner: inner_point, outer_x: outer_point.x, array_index}];
    }

    private draw_array_plate(
        array_index: number,
        wires: readonly ContinuedWire[],
    ): void {
        const region = array_continuation_plate_region(
            this.side, wires,
            this.settings.multiline_arc_radius, this.settings.multiline_plate_padding);
        lockable_plate.draw_lockable_plate(this.renderHandler, {
            region,
            color: DiagramTheme.highlightHaloColor(this.renderHandler.settings),
            tint: this.settings.multiline_plate_tint,
            highlight_token: continuation_highlight_token(
                this.continuation_key, array_index),
            lock_token: continuation_lock_highlight_token(
                this.continuation_key, array_index),
            locks: CONTINUATION_LOCKS,
            padlock_centre: continuation_padlock_centre(
                region, wires,
                padlock.padlock_dims(padlock.DEFAULT_PADLOCK_SHAPE),
                this.settings.multiline_padlock_gap),
            source: `${this.diagram_id}:${array_index}`,
        });
    }
}


export class MultilineSpreadBox<L, M extends cat.Morphism<L>, A=L> extends cr.SpreadBox<L, M, A> {
    constructor(
        public categoryRenderer: cr.CategoryRenderer<L, M, A>,
        public target: cat.ProdCategory<L, M>,
        public body: cr.MorphismBox<L, M, A>,
        public target_width: number | undefined,
        public annotated: boolean = false,
        public continuations: RowContinuations = {},
    ) {
        super(
            categoryRenderer,
            target, body, target_width,
            annotated);

        this.offset_caps();

        const start_cap = this.make_row_cap(
            RowSide.START, this.target.dom(), this.left_cap.left_anchors,
            continuations.from_previous_row);
        const end_cap = this.make_row_cap(
            RowSide.END, this.target.cod(), this.right_cap.right_anchors,
            continuations.to_next_row);
        this.children = [
            start_cap.left_anchors,
            start_cap,
            ...this.children,
            end_cap,
            end_cap.right_anchors,
        ];
    }

    public fit_width(target_width: number): void {
        super.fit_width(target_width);
        this.offset_caps();
    }

    protected caps_spread_the_wires(): boolean {
        return true;
    }

    /*
     * The cap between the row's outer column for `object` and the column
     * `inner_column` of the spread. A side of the row that another row
     * continues is a `RowContinuationCap`, and a side at the figure's own
     * domain or codomain is a plain gap.
     */
    private make_row_cap(
        side: RowSide,
        object: cat.ProdObject<L>,
        inner_column: cr.Meridian<A>,
        continuation_key: string | undefined,
    ): cr.AnchoredBox<A> {
        const outer_column = this.categoryRenderer.display_prod_object(object);
        if (continuation_key !== undefined) {
            return new RowContinuationCap<L, A>(
                this.categoryRenderer, outer_column, inner_column, side,
                continuation_key);
        }
        const [left, right] = side === RowSide.START
            ? [outer_column, inner_column] : [inner_column, outer_column];
        return new cr.ComposedGap<L, A>(
            this.categoryRenderer, left, right,
            this.settings.multiline_curve_width, false);
    }

    private offset_caps(): void {
        if (!this.settings.offset_multiline) {
            return;
        }
        const total_width = this.left_cap.dims.x + this.right_cap.dims.x;
        if (this.continuations.to_next_row === undefined) {
            this.set_cap_widths(total_width, this.settings.composed_gap_dims.x);
        } else if (this.continuations.from_previous_row === undefined) {
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

        this.rows = this.renderHandler.settings.dynamicMultilineSizing !== false
            ? this.planned_rows()
            : this.filled_rows();
        const row_width = Math.max(0, ...this.rows.map((row) => row.dims.x));
        this.rows.forEach((row) => row.fit_width(row_width));
        this.children = [
            new rh.Vertical(
                this.renderHandler,
                this.rows,
            )
        ]
    }

    /* The rows each filled by `split_row` until the width runs out. */
    private filled_rows(): MultilineSpreadBox<L, M, A>[] {
        const rows: MultilineSpreadBox<L, M, A>[] = [];
        let current_target = this.target;
        while (true) {
            const split_info = split_row(
                this.categoryRenderer,
                current_target,
                this.max_width,
            );
            const row_index = rows.length;
            const is_last_row = split_info.target1 === undefined;
            const thin_display = row_index === 0 && is_last_row;
            rows.push(this.spread_row(
                {box: split_info.box, target: split_info.target0},
                row_index,
                is_last_row,
                thin_display ?
                    undefined
                    : this.max_width + 2 * this.settings.composed_gap_dims.x,
            ));
            if (split_info.target1 === undefined) {
                return rows;
            }
            current_target = split_info.target1;
        }
    }

    /* The rows `planned_rows` chooses, each as wide as its content until the
     * constructor fits every row to the widest. */
    private planned_rows(): MultilineSpreadBox<L, M, A>[] {
        const contents = planned_rows(this.categoryRenderer, this.target, this.max_width);
        return contents.map((content, row_index) => this.spread_row(
            content, row_index, row_index === contents.length - 1, undefined));
    }

    private spread_row(
        content: RowContent<L, M, A>,
        row_index: number,
        is_last_row: boolean,
        target_width: number | undefined,
    ): MultilineSpreadBox<L, M, A> {
        return new MultilineSpreadBox<L, M, A>(
            this.categoryRenderer,
            content.target,
            content.box,
            target_width,
            true,
            {
                from_previous_row: row_index === 0
                    ? undefined : this.continuation_key(row_index - 1),
                to_next_row: is_last_row
                    ? undefined : this.continuation_key(row_index),
            },
        );
    }

    /* The key of the wires that run from the end of row `row_index` to the
     * start of the row after it. */
    private continuation_key(row_index: number): string {
        return `${this.diagram_id}:${row_index}`;
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
