// Claude Opus 5, effort high.
/*
 * What a message carries beside its term, for the legend and the information
 * boxes.
 *
 * `tsncd` does no algebra, so every fact a box or a legend shows is computed in
 * `pyncd` and sent in the `auxiliary` field of a `dataUpdate` or a
 * `renderRequest`. These interfaces mirror the TypedDicts of `pyncd`'s
 * `websocket_transfer/websockets_transfer.py`, which
 * `websocket_transfer/auxiliary_information.py` fills. `PROTOCOL.md` states the
 * field.
 */

/**
 * One row of the legend: an axis, the integer its size comes to, the code
 * forms of its name and of its size, and the uid of every axis of the term the
 * row stands for. The uids link the row to the wires of the figure, and a
 * sender from before the field existed leaves them out.
 */
export interface AxisLegendRow {
    latex: string;
    text: string;
    size: number | null;
    codeName: string | null;
    sizeCodeName: string | null;
    uids?: number[];
}

/**
 * A place in a codebase, with its url already resolved by the sender.
 *
 * `icon` names the icon drawn before the reference, which `referenceIcons.ts`
 * holds the drawing for. The sender chooses the name, so nothing here reads a
 * url, and a name the table does not hold draws no icon.
 */
export interface CodeReferenceRecord {
    label: string;
    url: string | null;
    path: string | null;
    line: number | null;
    endLine: number | null;
    icon?: string | null;
}

/**
 * What a box shows for a block, beside the block's body.
 *
 * `formula` is the LaTeX of what the block computes, drawn under the title the
 * way an expansion's formula is. A block whose aesthetics are drawn as
 * `BlockDrawing.BODY_IN_PLACE` has no box of its own in the figure, so the
 * formula and the description are all its inspection box says about it, and the
 * box draws no body.
 */
export interface BlockInformation {
    title: string | null;
    description: string | null;
    references: CodeReferenceRecord[];
    formula?: string | null;
}

/**
 * What a box shows for an operator the sender writes out.
 *
 * `expansion` is the expanded morphism as its own exported term, in the same
 * doubly encoded form a message's `data` takes, and `auxiliary` is that
 * morphism's own auxiliary information. An operator standing inside an
 * expansion is therefore opened the way one in the main figure is, and numbers
 * its broadcasts from zero again.
 *
 * `references` are the places in a codebase the operator stands for, drawn
 * under the description exactly as a block's references are. A sender that
 * attaches none leaves the field out.
 */
export interface OperatorExpansion {
    operator: string;
    latex: string | null;
    formula: string;
    description: string;
    expansion: string;
    auxiliary: DiagramAuxiliary;
    references?: CodeReferenceRecord[];
}

/**
 * `blocks` is keyed by the uid of each block's tag, and `expansions` by the
 * number `data_transfer/json.ts` gives each `Broadcasted` as it builds it, both
 * written as decimal strings because that is how JSON keys an object. Every
 * part is optional, and a message with no `auxiliary` field draws as it did
 * before the field existed.
 */
export interface DiagramAuxiliary {
    legend?: AxisLegendRow[];
    blocks?: Record<string, BlockInformation>;
    expansions?: Record<string, OperatorExpansion>;
}

/**
 * The descriptions of one wording, as the difference from the exported
 * wording.
 *
 * `blocks` is keyed by the uid of a block's tag and `expansions` by the
 * importer number, the same keys as `DiagramAuxiliary`, so each description
 * reaches its own box. A key left out of the record keeps the exported
 * description.
 */
export interface LocalisedDescriptions {
    blocks: Record<string, string>;
    expansions: Record<string, LocalisedExpansion>;
}

/**
 * The description of one operator the sender writes out, together with the
 * descriptions of the blocks and the operators inside its expansion, which are
 * held in the expansion's own auxiliary information.
 */
export interface LocalisedExpansion {
    description?: string;
    auxiliary?: LocalisedDescriptions;
}

/**
 * The wordings a page carries beside its message, by name. `default` names the
 * exported wording, and the selector draws the wordings in the insertion order
 * of `localisations`.
 *
 * A wording changes descriptions alone. A title and a formula are drawn in the
 * figure as well as in an inspection box, and the title of a block sets the
 * width and the height the block is drawn at, so a wording that changed one
 * would lay the figure out again.
 */
export interface EmbeddedLocalisations {
    default: string;
    localisations: Record<string, LocalisedDescriptions>;
}
