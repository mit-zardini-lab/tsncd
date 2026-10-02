// Claude Opus 5.5 (1M context), effort 40.
// Revised by Claude Opus 5.5 (1M context), effort 40: the naturals of the legend.
/*
 * A figure a page derives from another by a functor it applies itself, with
 * the auxiliary information of the figure carried across.
 *
 * A page carrying several variants of a model may carry one of them as the
 * image of another under a named functor, which `embedded_variants.ts` reads.
 * `dequantise` is the one functor. It takes every quantisation off the term
 * through `quantization/algebra/strip_quantisations.ts`, and gives the blocks
 * that became equal one tag through
 * `data_structure_processing/share_block_tags.ts`.
 *
 * Each `Broadcasted` the functor rebuilt keeps the number the importer gave
 * the one it was built from, so the expansions of the figure it came from
 * stay keyed by the same numbers. The auxiliary information of the derived
 * figure keeps the records of the blocks and the operators it still holds
 * and drops the others, so a deleted conversion takes its record with it and
 * a block whose tag was shared keeps the record of the tag it received. Every
 * expansion is marked with the functor, and an inspection box applies the
 * functor to the expansion's own term and auxiliary information when it
 * draws the expansion, so an operator inside the derived figure opens its
 * derived expansion.
 */
import * as cat from '../data_structure/Category';
import * as dt_json from '../data_transfer/json';
import * as strip_quantisations from '../quantization/algebra/strip_quantisations';
import * as share_block_tags from '../data_structure_processing/share_block_tags';
import type * as drt from '../display/diagramRenderTarget';
import type * as aux from './AuxiliaryInformation';

export const DEQUANTISE = 'dequantise';

/* A term together with the auxiliary information it is drawn with. */
export interface FigureWithAuxiliary {
    term: drt.DiagramFigure;
    auxiliary?: aux.DiagramAuxiliary;
}

export type FigureFunctor = (figure: FigureWithAuxiliary) => FigureWithAuxiliary;

export class UnknownFunctor extends Error {}

function carry_broadcast_occurrences(images: ReadonlyMap<object, unknown>): void {
    images.forEach((image: unknown, original: object) => {
        if (original instanceof cat.Broadcasted && image instanceof cat.Broadcasted
            && image !== original) {
            dt_json.carry_broadcast_occurrence(original, image);
        }
    });
}

/* The keys of the auxiliary information that name something `term` holds:
 * the uid of every block's tag and the number of every `Broadcasted`, each
 * written as the decimal string the auxiliary information keys it by. */
interface KeysHeld {
    tags: Set<string>;
    occurrences: Set<string>;
}

function keys_held(term: unknown): KeysHeld {
    const held: KeysHeld = {tags: new Set(), occurrences: new Set()};
    const entered = new Set<object>();
    const unentered: unknown[] = [term];
    while (unentered.length) {
        const node = unentered.pop();
        if (node === null || typeof node !== 'object' || entered.has(node)) {
            continue;
        }
        entered.add(node);
        if (node instanceof cat.Block) {
            held.tags.add(String(node.block_tag.uid._id));
        }
        if (node instanceof cat.Broadcasted) {
            const occurrence = dt_json.broadcast_occurrence(node);
            if (occurrence !== undefined) {
                held.occurrences.add(String(occurrence));
            }
        }
        Object.values(node).forEach((part: unknown) => unentered.push(part));
    }
    return held;
}

function records_held<R>(
    records: Record<string, R>, held: Set<string>, carried: (record: R) => R,
): Record<string, R> {
    return Object.fromEntries(Object.entries(records)
        .filter(([key]) => held.has(key))
        .map(([key, record]) => [key, carried(record)]));
}

/**
 * The auxiliary information of `term`, a term `functor` derived from the term
 * `auxiliary` was written for.
 */
export function auxiliary_of_derived_term(
    auxiliary: aux.DiagramAuxiliary,
    term: drt.DiagramFigure,
    functor: string,
): aux.DiagramAuxiliary {
    const held = keys_held(term);
    return {
        ...(auxiliary.legend === undefined ? {} : {legend: auxiliary.legend}),
        ...(auxiliary.naturals === undefined ? {} : {naturals: auxiliary.naturals}),
        ...(auxiliary.blocks === undefined ? {} : {
            blocks: records_held(auxiliary.blocks, held.tags, (record) => record),
        }),
        ...(auxiliary.expansions === undefined ? {} : {
            expansions: records_held(
                auxiliary.expansions, held.occurrences,
                (expansion) => ({...expansion, functor})),
        }),
    };
}

export function dequantised_figure(figure: FigureWithAuxiliary): FigureWithAuxiliary {
    const stripped = strip_quantisations.strip_quantisations(figure.term);
    const shared = share_block_tags.share_tags_between_equal_blocks(stripped.term);
    carry_broadcast_occurrences(stripped.images);
    carry_broadcast_occurrences(shared.images);
    return {
        term: shared.term,
        ...(figure.auxiliary === undefined ? {} : {
            auxiliary: auxiliary_of_derived_term(
                figure.auxiliary, shared.term, DEQUANTISE),
        }),
    };
}

export const FIGURE_FUNCTORS: ReadonlyMap<string, FigureFunctor> = new Map([
    [DEQUANTISE, dequantised_figure],
]);

export function figure_functor(name: string): FigureFunctor {
    const functor = FIGURE_FUNCTORS.get(name);
    if (functor === undefined) {
        throw new UnknownFunctor(
            `No functor is named ${JSON.stringify(name)}. The page knows `
            + `${[...FIGURE_FUNCTORS.keys()].join(', ')}.`);
    }
    return functor;
}
