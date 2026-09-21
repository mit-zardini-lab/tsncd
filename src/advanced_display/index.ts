// Claude Opus 5, effort high.
/*
 * The display features that read the auxiliary information a message carries
 * beside its term.
 *
 * `AuxiliaryInformation.ts` mirrors the wire types `pyncd` sends.
 * `legend.ts` draws the table of axes beside the figure, and
 * `inspectionBoxes.ts` opens a box on the block or the operator the pointer
 * rests on. Each is a decorator run after a render, and `src/index.ts` installs
 * both on the render targets it builds.
 *
 * `localisedDescriptions.ts` writes the descriptions of one wording onto the
 * auxiliary information the figure was rendered with, and
 * `localisationSelector.ts` draws the buttons that choose the wording. Neither
 * is a decorator, because a page carries its wordings once and a wording is
 * applied without drawing the figure again.
 *
 * `settings.legend` and `settings.inspectionBoxes` are what ask for them, and
 * both default to false, so a message that sends neither draws the figure the
 * renderer drew before this folder existed.
 */

import * as legend from './legend';
import * as inspectionBoxes from './inspectionBoxes';
import type * as drt from '../display/diagramRenderTarget';

export * from './AuxiliaryInformation';
export {attach_legend} from './legend';
export {reference_icon_node, REFERENCE_ICONS} from './referenceIcons';
export {
    attach_inspection_boxes, close_every_box, locked_boxes, open_boxes,
    page_regions, pooled_content, refill_open_boxes,
} from './inspectionBoxes';
export type {PageRegion, RegionKind} from './inspectionBoxes';
export {DescriptionLocalisations} from './localisedDescriptions';
export {attach_localisation_selector} from './localisationSelector';

export function establish(): void {
    console.log("Loaded advanced_display module.");
}

/** The decorators a render target runs, in the order a figure is built up:
 * the legend inside the container, then the regions measured over what was
 * drawn. */
export const DIAGRAM_DECORATORS: drt.DiagramDecorator[] = [
    legend.attach_legend,
    inspectionBoxes.attach_inspection_boxes,
];
