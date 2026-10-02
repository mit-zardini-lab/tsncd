// Claude Opus 5, effort high.
// Revised by Claude Opus 5.5 (1M context), effort 40: the naturals of the legend
// and the line of free indices.
/*
 * The display features that read the auxiliary information a message carries
 * beside its term.
 *
 * `AuxiliaryInformation.ts` mirrors the wire types `pyncd` sends.
 * `legend.ts` draws the tables of axes and of naturals beside the figure, and
 * `inspectionBoxes.ts` opens a box on the block or the operator the pointer
 * rests on. Each is a decorator run after a render, and `src/index.ts` installs
 * both on the render targets it builds. `freeIndexLine.ts` draws the line under
 * a box's formula that names the indices the formula holds for every position
 * of their axes, and the tooltip of each.
 *
 * `localisedDescriptions.ts` writes the descriptions of one wording onto the
 * auxiliary information the figure was rendered with, and
 * `localisationSelector.ts` draws the buttons that choose the wording. Neither
 * is a decorator, because a page carries its wordings once and a wording is
 * applied without drawing the figure again.
 *
 * `displaySelector.ts` holds the switch that draws the figure again in another
 * form or theme, and draws the row of controls that works it under the
 * heading. It wraps the display target alone, so no inspection box draws the
 * row.
 *
 * `pageChoices.ts` checks a choice of variant, form and theme strictly,
 * whether the address, a host page or a driving browser makes it, and writes
 * the choice on display into the address. `hostMessages.ts` posts the state
 * of the page to a host page holding it in a frame, and answers the host's
 * `tsncd-display` messages.
 *
 * `variantSelector.ts` draws the selector between the variants of a model a
 * page carries, as the first group of the row of controls, and holds the
 * switch that draws the variant chosen.
 * `variantFigures.ts` builds and keeps the figure of each variant, and
 * `derivedFigures.ts` applies the functor a derived variant names, which is
 * also what draws the expansions of a derived figure.
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
export {
    follow_system_theme, make_display_switch, settings_for_page, system_dark_mode,
    system_theme_query, with_display_controls,
} from './displaySelector';
export type {DisplayChoice, DisplaySwitch, HeldFigure} from './displaySelector';
export {
    address_of_state, choice_requested_by_address, make_page_switch, RefusedChoice,
    refusal_text, state_of_settings, write_address_of_state,
} from './pageChoices';
export type {AddressedChoice, PageState, PageSwitch, Refusal} from './pageChoices';
export {
    answer_host_messages, offered_ids, offered_variants, post_to_host,
    refused_message, state_message,
} from './hostMessages';
export type {OfferedVariants} from './hostMessages';
export {
    draw_variant_selector, make_variant_switch, settings_for_variant,
    with_variant_selector,
} from './variantSelector';
export type {VariantSelector, VariantSwitch} from './variantSelector';
export {VariantFigures} from './variantFigures';
export type {VariantFigure, VariantTiming} from './variantFigures';
export {DEQUANTISE, dequantised_figure, figure_functor} from './derivedFigures';

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
