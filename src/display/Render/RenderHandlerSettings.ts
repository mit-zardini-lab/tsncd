export type BlockBackground = 'none' | 'subtle' | 'medium' | 'strong';

export interface RenderHandlerSettings {
    darkMode?: boolean;
    blockBackground?: BlockBackground;
    blockHoverIntensity?: number;
    debugBorders?: boolean;
    coreDebug?: boolean;
    /*
     * Width in px at which a morphism wraps onto another line, so that
     * `F_0; F_1 = F`. This is the diagram's aspect-ratio control: a narrower
     * width means more rows and a taller figure, a wider one fewer rows and a
     * flatter figure. Worth setting per figure - what suits a screen is rarely
     * what suits a column of a paper.
     */
    width?: number;
    /*
     * Whether the bodies of `BlockOperator`s are drawn as sub-diagrams beside
     * the main figure. On by default; a figure export that wants the
     * high-level view alone (and the boxes as their own figures) turns it off.
     */
    subBlocks?: boolean;
    /*
     * The `BlockTag`s whose bodies have already been drawn, each as the
     * `uid._id` of its tag. A pending body whose tag is named here is left
     * out, and the main figure still holds the box that would have opened it.
     *
     * The sender owns the list. Nothing here can answer whether a body was
     * drawn already, because each render target is wiped at the start of every
     * message and a capture draws into a second target that never saw the
     * first, so the record has to be kept by the process that has been
     * sending. `pyncd`'s `notebooks/display/notebook_diagrams.py` keeps it for
     * the life of its kernel.
     */
    drawnBlockTags?: number[];
    /*
     * Whether a grab or a drop is labelled with the tape slot it reaches.
     *
     * On by default, because without it the picture does not say which grab
     * pairs with which drop. A `Grab` and the `Drop` that filled it are the
     * SAME parameter, but they are in general in different rows of the
     * diagram and are drawn with no line between them - so the slot has to be
     * named at each end or it is not shown at all.
     *
     * The label is the slot's name where the term carries one - `pyncd`'s
     * `para.new_slot` names them `s0, s1, ...` in creation order - and the low
     * byte of its UID in hex otherwise. Its hue comes off the UID, so a pair
     * reads by colour before it is read at all.
     * `ParaRendererSettings.tape_label_*` shapes it.
     */
    tapeLabels?: boolean;
    /*
     * Whether a table of the term's axes, each with its size and its code name,
     * is drawn beside the figure. Off by default. The rows themselves travel in
     * the `auxiliary` field of the message, and `advanced_display/legend.ts`
     * draws them.
     */
    legend?: boolean;
    /*
     * Whether a block, or an operator the sender writes an expansion for, opens
     * a box when the pointer rests on it. Off by default. What a box shows
     * travels in the `auxiliary` field of the message, and
     * `advanced_display/inspectionBoxes.ts` opens it.
     */
    inspectionBoxes?: boolean;
    /*
     * Where an axis answers the pointer. Under `legend`, the default, resting
     * the pointer on the axis's legend row halos every wire of the axis and
     * glows every name of it, and the wires and names themselves answer no
     * pointer. Under `everywhere`, resting the pointer on a wire or a name of
     * the axis lights the same, and the legend row with it. Under `off`, no
     * halo is drawn and nothing answers.
     */
    axisHover?: AxisHover;
    /*
     * The size, in em, of the label an axis carries on its wire, which is the
     * name and the size drawn in a composed gap and at the ends of a row.
     * `AXIS_LABEL_FONT_SIZE` is what a message naming none takes. Every place
     * that draws such a label and every place that measures the room for one
     * reads the setting through `axis_label_font_size`, so a figure asking for
     * a larger label is laid out at the size the label is drawn at. The label
     * of a datatype and the strides of a reindexing keep their own sizes.
     */
    axisLabelFontSize?: number;
    /*
     * The name of what the page shows. The heading of the page and the name of
     * its tab read `tsncd - <title>`, and `tsncd` when a message sends no
     * title. `display/pageHeading.ts` writes both for the display target, and
     * no other target reads the field.
     */
    title?: string;
}
export type AxisHover = 'off' | 'legend' | 'everywhere';

/* The size an axis label is drawn at where a message names none. */
export const AXIS_LABEL_FONT_SIZE = 0.8;

export function axis_label_font_size(settings: RenderHandlerSettings): number {
    return settings.axisLabelFontSize ?? AXIS_LABEL_FONT_SIZE;
}

export function draws_axis_halos(settings: RenderHandlerSettings): boolean {
    return (settings.axisHover ?? 'legend') !== 'off';
}

export function axes_answer_the_pointer(settings: RenderHandlerSettings): boolean {
    return (settings.axisHover ?? 'legend') === 'everywhere';
}

export const defaultRenderHandlerSettings: RenderHandlerSettings = {
    darkMode: true,
    blockBackground: 'subtle',
    blockHoverIntensity: 0.12,
    debugBorders: true,
    coreDebug: false,
    width: 750,
    subBlocks: true,
    drawnBlockTags: [],
    tapeLabels: true,
    legend: false,
    inspectionBoxes: false,
    axisHover: 'legend',
    axisLabelFontSize: AXIS_LABEL_FONT_SIZE,
}
