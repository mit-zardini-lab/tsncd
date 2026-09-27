// Claude Opus 5.5 (1M context), effort 40.
/*
 * The name written above an operator in the two arrow forms, which says what
 * the operator does, and the room kept for it.
 *
 * `ArrowCappedBox` of `ArrowRenderer.ts` writes the name on the plate above
 * the operator's glyph under `arrows-and-broadcasted`, and `OperatorFaceBox`
 * of `BoxRenderer.ts` writes it above the operator's box under
 * `arrows-and-boxes`. Both read it through `written_plate_label` and stand it
 * in a `PlateNameStack`. The two forms therefore write the same name, in the
 * small type of a block's title, directly above the element that draws the
 * operator. The user asked on 2026-09-27 for the box form to write the names
 * written by the arrow form, such as `Linear` and `Cache`.
 *
 * The name is the plate name registered by the operator's class in
 * `plateNamesRegistry`, and the operator's own name where the class registers
 * none. The name is left off where the drawing under it writes that name
 * already. A glyph or a face that writes the operator's own name does so, and
 * the face of an `Einops` writes the contraction given by its plate name.
 */
import * as rh from '../../Render/RenderHandler';
import * as TextEstimator from '../../Render/TextEstimator';
import * as cat from '../../../data_structure/Category';
import * as ops from '../../../data_structure/Operators';
import * as crs from '../CategoryRendererSettings';
import * as utcr from '../../../utilities/ConstructorRegistry';
import * as operator_faces from './operatorFaces';

/*
 * The name written above an operator in place of its own, which says what the
 * operator does, keyed by the exact class of the operator as `bb.opsRegistry`
 * keys its glyph. An operator whose glyph or face writes its own name, such as
 * the weight of a `Linear` or the name of a cache, registers the name of what
 * it does here, and both arrow forms write that name above the weight or the
 * cache. A module that registers a glyph in `bb.opsRegistry` registers the
 * plate name beside it, as `caching/cachingBoxes.ts` does, and both forms then
 * write the name with no edit to either renderer. A class that registers none
 * has no plate name, and its own name is written above it where the drawing
 * writes none.
 *
 * An `Einops` is named by the contraction written by its signature, `Matmul`,
 * `Sum`, `Product` or `Contraction`, as `operatorFaces.einops_face_name` names
 * its face, rather than by the word `einops`. A `Linear` is named `Linear`. The
 * user asked for both on 2026-09-26, and for a cache to be named `Cache` the
 * same day.
 */
export const plateNamesRegistry = new utcr.ConstructorRegistry<
    cat.Operator, string | undefined, [cat.Operator]>();

const LINEAR_PLATE_NAME = '\\mathrm{Linear}';

plateNamesRegistry.registerDefaultFunc((_operator: cat.Operator) => undefined);
plateNamesRegistry.registerFunction(ops.Einops)(
    (operator: ops.Einops) => operator_faces.einops_face_name(operator));
plateNamesRegistry.registerFunction(ops.Linear)(() => LINEAR_PLATE_NAME);

export function plate_name(operator: cat.Operator): string | undefined {
    return plateNamesRegistry.getAndProcess(operator);
}

/* The name written above `operator`, which is its plate name, and its own name
 * where it has none. An operator with neither has none. */
export function plate_label_text(operator: cat.Operator): string | undefined {
    return plate_name(operator) || operator.name?.to_latex() || undefined;
}

/* The settings used to set the name. */
type PlateLabelSettings = Pick<crs.ArrowRendererSettings, 'block_title_font_size'>;

/*
 * The width taken by the name written above `operator`, in px, measured bare,
 * and nothing where it has none. The box form builds a face at least this
 * wide, so the name never reaches past the box under it. A face that writes the
 * name itself writes it at least as large, so the width takes nothing from a
 * face whose name is left off.
 */
export function plate_label_width(
    operator: cat.Operator,
    settings: PlateLabelSettings,
): number {
    const latex = plate_label_text(operator);
    return latex === undefined ? 0 : TextEstimator.estimate_bare_text_width(
        [latex], settings.block_title_font_size);
}

/*
 * The name written above `operator`, set at `block_title_font_size`. There is
 * none where the operator has no name, and none where `drawing_writes_name`
 * reports that the drawing under the name writes it already.
 */
export function written_plate_label(
    renderHandler: rh.RenderHandler,
    operator: cat.Operator,
    settings: PlateLabelSettings,
    drawing_writes_name: (latex: string) => boolean,
): rh.AnnotationElement | undefined {
    const latex = plate_label_text(operator);
    if (latex === undefined || drawing_writes_name(latex)) {
        return undefined;
    }
    return new rh.AnnotationElement(
        renderHandler, latex, {font_size: settings.block_title_font_size});
}

/*
 * `drawn`, the element that draws an operator, with `label` written above it.
 *
 * The name stands in a room as wide as its text and as tall as its line of
 * text, directly above `drawn`. An empty room of the same height stands
 * below `drawn`, so `drawn` stands where it stands with no name, and the
 * arrows either side of it stay level with the arrows of the columns beside
 * them. A stack with no name holds `drawn` alone. The name is placed in its
 * room in the update phase.
 *
 * The rooms and `drawn` stand in `column`, the stack's one child. The stack
 * does not extend `rh.Vertical`, because `HTMLRenderHandler` lays out an
 * element as a column only where its class is `rh.Vertical` itself, and it
 * lays out every other element as a row.
 */
export class PlateNameStack extends rh.DiagramElement {
    public readonly label_room?: rh.CoreElement;
    public readonly column: rh.Vertical;

    constructor(
        renderHandler: rh.RenderHandler,
        public drawn: rh.DiagramElement,
        public label?: rh.AnnotationElement,
    ) {
        super(renderHandler);
        const label_room = label === undefined ? undefined
            : new rh.CoreElement(renderHandler, {
                x: label.estimated_bare_text_width(),
                y: label.estimated_text_dims().y,
            });
        this.label_room = label_room;
        this.column = new rh.Vertical(
            renderHandler, label_room === undefined ? [drawn] : [
                label_room,
                drawn,
                new rh.CoreElement(renderHandler, {x: 0, y: label_room.dims.y}),
            ]);
        this.children = [this.column];
    }

    update(): void {
        super.update();
        if (this.label !== undefined && this.label_room !== undefined) {
            this.label.place(this.label_room.rectangle());
        }
    }
}
