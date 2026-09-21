// Claude Opus 5, effort high.
/*
 * Writing the descriptions of one wording onto the auxiliary information of a
 * rendered figure.
 *
 * An inspection box reads its description out of the `DiagramAuxiliary` object
 * held for its container each time the box opens, and the diagram inside a box
 * is drawn from the auxiliary information of that operator's own expansion,
 * which is a part of the same object graph. A wording is therefore applied by
 * writing the descriptions into that object graph, and nothing is drawn again.
 *
 * `DescriptionLocalisations` reads every description of the graph when it is
 * built. Applying a wording writes those descriptions back and then writes the
 * descriptions of the wording over them, so the wordings are applied in any
 * order and a description left out of a wording reads as it was exported.
 */

import type * as aux from './AuxiliaryInformation';

/** Every description of one auxiliary information object, under the keys of
 * that object, and the same for each expansion's own auxiliary information. */
interface DescriptionSnapshot {
    blocks: Map<string, string | null>;
    expansions: Map<string, string>;
    nested: Map<string, DescriptionSnapshot>;
}

export class DescriptionLocalisations {
    private readonly snapshot: DescriptionSnapshot;

    constructor(private readonly auxiliary: aux.DiagramAuxiliary) {
        this.snapshot = snapshot_descriptions(auxiliary);
    }

    apply_localisation(
        localisation: aux.LocalisedDescriptions | undefined,
    ): void {
        restore_descriptions(this.auxiliary, this.snapshot);
        if (localisation !== undefined) {
            write_descriptions(this.auxiliary, localisation);
        }
    }
}

function snapshot_descriptions(
    auxiliary: aux.DiagramAuxiliary | undefined,
): DescriptionSnapshot {
    const blocks = new Map<string, string | null>();
    Object.entries(auxiliary?.blocks ?? {}).forEach(([key, information]) => {
        blocks.set(key, information.description);
    });
    const expansions = new Map<string, string>();
    const nested = new Map<string, DescriptionSnapshot>();
    Object.entries(auxiliary?.expansions ?? {}).forEach(([key, expansion]) => {
        expansions.set(key, expansion.description);
        nested.set(key, snapshot_descriptions(expansion.auxiliary));
    });
    return {blocks, expansions, nested};
}

function restore_descriptions(
    auxiliary: aux.DiagramAuxiliary | undefined,
    snapshot: DescriptionSnapshot,
): void {
    snapshot.blocks.forEach((description: string | null, key: string) => {
        const information = auxiliary?.blocks?.[key];
        if (information !== undefined) {
            information.description = description;
        }
    });
    snapshot.expansions.forEach((description: string, key: string) => {
        const expansion = auxiliary?.expansions?.[key];
        if (expansion === undefined) {
            return;
        }
        expansion.description = description;
        const inside = snapshot.nested.get(key);
        if (inside !== undefined) {
            restore_descriptions(expansion.auxiliary, inside);
        }
    });
}

function write_descriptions(
    auxiliary: aux.DiagramAuxiliary | undefined,
    localisation: aux.LocalisedDescriptions,
): void {
    Object.entries(localisation.blocks ?? {}).forEach(([key, description]) => {
        const information = auxiliary?.blocks?.[key];
        if (information !== undefined) {
            information.description = description;
        }
    });
    Object.entries(localisation.expansions ?? {}).forEach(([key, localised]) => {
        const expansion = auxiliary?.expansions?.[key];
        if (expansion === undefined) {
            return;
        }
        if (localised.description !== undefined) {
            expansion.description = localised.description;
        }
        if (localised.auxiliary !== undefined) {
            write_descriptions(expansion.auxiliary, localised.auxiliary);
        }
    });
}
