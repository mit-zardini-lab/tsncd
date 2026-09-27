// Claude Opus 5.5 (1M context), effort 40.
/*
 * The figure of each variant a page carries, built the first time the variant
 * is asked for and kept for the life of the page.
 *
 * A variant carrying a message is built by decoding the records its message
 * reaches and importing its term. A derived variant is built by building the
 * variant it is derived from and applying the named functor to that variant's
 * term and auxiliary information, through `derivedFigures.ts`. An auxiliary
 * the page supplies for a derived variant, keyed by the numbering of its
 * source's message, is carried across the functor as the source's is, so the
 * records of what the functor removed are dropped and every expansion is
 * marked with the functor. A return to a
 * variant already built draws the kept term, and a derived variant whose
 * source was drawn first reuses the source's imported term.
 *
 * Each step says what it is doing through `announce` before it starts, and
 * the page shows the words on its loading screen. The words for applying the
 * dequantisation functor are the user's, `Applying Dequantization Functor...`.
 * Each step also records how long it took, which `window.tsncd.variantTimings`
 * hands to a driving browser.
 */
import * as dt_json from '../data_transfer/json';
import * as derivedFigures from './derivedFigures';
import type * as embedded_variants from '../data_transfer/embedded_variants';
import type * as rhs from '../display/Render/RenderHandlerSettings';
import type * as drt from '../display/diagramRenderTarget';
import type * as aux from './AuxiliaryInformation';

export const FUNCTOR_ANNOUNCEMENTS: ReadonlyMap<string, string> = new Map([
    [derivedFigures.DEQUANTISE, 'Applying Dequantization Functor...'],
]);

/* The figure of one variant, with the settings its message carries, before
 * the page's own choices of form and theme are applied. */
export interface VariantFigure {
    term: drt.DiagramFigure;
    settings: rhs.RenderHandlerSettings;
    auxiliary?: aux.DiagramAuxiliary;
}

/* Shows `text` on the loading screen, and resolves once the page shows it. */
export type Announce = (text: string) => Promise<void>;

export type VariantStep = 'decode' | 'import' | 'functor';

export interface VariantTiming {
    variant: string;
    step: VariantStep;
    milliseconds: number;
}

/* The group and the title of `variant`, as the loading screen names it. */
export function variant_label(
    repository: embedded_variants.VariantRepository,
    variant: embedded_variants.EmbeddedVariant,
): string {
    return `${repository.group_title(variant)}, ${variant.title}`;
}

function timed<T>(
    timings: VariantTiming[], variant: string, step: VariantStep, run: () => T,
): T {
    const start = performance.now();
    const result = run();
    timings.push({variant, step, milliseconds: performance.now() - start});
    return result;
}

export class VariantFigures {
    private readonly figures = new Map<string, Promise<VariantFigure>>();
    private readonly built = new Set<string>();
    readonly timings: VariantTiming[] = [];

    constructor(readonly repository: embedded_variants.VariantRepository) {}

    is_built(id: string): boolean {
        return this.built.has(id);
    }

    /* The figure of the variant `id`, built once. A build that failed is
     * forgotten, so asking again tries again. */
    figure_of(id: string, announce: Announce): Promise<VariantFigure> {
        const known = this.figures.get(id);
        if (known !== undefined) {
            return known;
        }
        const figure = this.build(this.repository.variant(id), announce);
        this.figures.set(id, figure);
        figure.then(
            () => this.built.add(id),
            () => this.figures.delete(id));
        return figure;
    }

    private async build(
        variant: embedded_variants.EmbeddedVariant,
        announce: Announce,
    ): Promise<VariantFigure> {
        if (variant.message !== undefined) {
            return this.imported_figure(variant, announce);
        }
        return this.derived_figure(variant, announce);
    }

    private async imported_figure(
        variant: embedded_variants.EmbeddedVariant,
        announce: Announce,
    ): Promise<VariantFigure> {
        await announce(`Loading ${variant_label(this.repository, variant)}…`);
        const message = timed(this.timings, variant.id, 'decode',
            () => this.repository.message_of(variant));
        const document = typeof message.data === 'string'
            ? JSON.parse(message.data) : message.data;
        const start = performance.now();
        const term = await dt_json.TermJSONConverter.import(document);
        this.timings.push({
            variant: variant.id, step: 'import',
            milliseconds: performance.now() - start,
        });
        return {
            term: term as drt.DiagramFigure,
            settings: message.settings ?? {},
            ...(message.auxiliary === undefined ? {} : {auxiliary: message.auxiliary}),
        };
    }

    private async derived_figure(
        variant: embedded_variants.EmbeddedVariant,
        announce: Announce,
    ): Promise<VariantFigure> {
        const source = await this.figure_of(variant.derivedFrom as string, announce);
        const name = variant.functor as string;
        const functor = derivedFigures.figure_functor(name);
        await announce(FUNCTOR_ANNOUNCEMENTS.get(name) ?? `Applying ${name}…`);
        const derived = timed(this.timings, variant.id, 'functor',
            () => functor({term: source.term, auxiliary: source.auxiliary}));
        const auxiliary = variant.auxiliary === undefined
            ? derived.auxiliary
            : derivedFigures.auxiliary_of_derived_term(
                this.repository.auxiliary_at(variant.auxiliary), derived.term, name);
        return {
            term: derived.term,
            settings: {...source.settings, ...(variant.settings ?? {})},
            ...(auxiliary === undefined ? {} : {auxiliary}),
        };
    }
}
