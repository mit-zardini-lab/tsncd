// Claude Opus 5.5 (1M context), effort 40.
/*
 * Several variants of one model written into one page.
 *
 * `pyncd` writes a page carrying the Decode, the Cached and the Training forms
 * of a model, each quantised and unquantised, as one `script` element of type
 * `application/json` with the id `tsncd-variants`. The element holds the
 * groups the variants stand in, the variants, and one repository of records in
 * the compressed form `json_compression.ts` decodes. A variant carries either
 * a `message`, the index of the record holding its `dataUpdate`, or the id of
 * the variant it is derived from and the name of the functor that derives it.
 * Every message is compressed into the one repository, so a subterm, a block
 * record or an expansion two variants share is stored once.
 *
 * The page decodes only the records the variant it draws reaches.
 * `VariantRepository` keeps every record it has decoded, so a second variant
 * reuses the containers of the records it shares with the first.
 * `PROTOCOL.md` states the element under *A page that carries several
 * variants*.
 */
import * as json_compression from './json_compression';
import type * as rhs from '../display/Render/RenderHandlerSettings';
import type * as aux from '../advanced_display/AuxiliaryInformation';
import type {JSONType} from './json';

export const EMBEDDED_VARIANTS_ID = 'tsncd-variants';
export const VARIANTS_VERSION = 1;

export interface VariantGroup {
    id: string;
    title: string;
}

/*
 * One variant. `message` is the index of the record holding its `dataUpdate`.
 * A variant with no message is derived: `derivedFrom` names a variant carrying
 * a message, and `functor` names the functor applied to that variant's term.
 * `settings` is merged over the source's settings, and `auxiliary`, the index
 * of a record, replaces the auxiliary information the functor derives.
 */
export interface EmbeddedVariant {
    id: string;
    group: string;
    title: string;
    detail?: string;
    message?: number;
    derivedFrom?: string;
    functor?: string;
    settings?: rhs.RenderHandlerSettings;
    auxiliary?: number;
}

/*
 * `settings` repeats the settings of the initial variant as plain JSON, so a
 * host reading the page as text finds its starting form and theme. The page
 * reads the settings of each variant from its message.
 */
export interface EmbeddedVariants {
    version: typeof VARIANTS_VERSION;
    settings?: rhs.RenderHandlerSettings;
    initial: string;
    groups: VariantGroup[];
    variants: EmbeddedVariant[];
    value_repository: unknown[];
}

/* A `dataUpdate` decoded from the repository. `data` is the term document
 * itself, which is how the variants share its records, or the doubly encoded
 * string a single message carries. */
export interface VariantMessage {
    msgType?: string;
    data: string | object;
    settings?: rhs.RenderHandlerSettings;
    auxiliary?: aux.DiagramAuxiliary;
}

export class MalformedVariants extends Error {}

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function is_index(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function checked_group(value: unknown): VariantGroup {
    if (!is_record(value) || typeof value.id !== 'string'
        || typeof value.title !== 'string') {
        throw new MalformedVariants(
            `A group needs a string id and title: ${JSON.stringify(value)}`);
    }
    return {id: value.id, title: value.title};
}

function checked_variant(value: unknown): EmbeddedVariant {
    if (!is_record(value) || typeof value.id !== 'string'
        || typeof value.group !== 'string' || typeof value.title !== 'string') {
        throw new MalformedVariants(
            `A variant needs a string id, group and title: ${JSON.stringify(value)}`);
    }
    const carries_message = is_index(value.message);
    const derived = typeof value.derivedFrom === 'string'
        && typeof value.functor === 'string';
    if (carries_message === derived) {
        throw new MalformedVariants(
            `Variant ${value.id} carries ${carries_message ? 'both' : 'neither'} `
            + 'a message and a derivation.');
    }
    if (value.auxiliary !== undefined && !is_index(value.auxiliary)) {
        throw new MalformedVariants(
            `Variant ${value.id} names auxiliary ${JSON.stringify(value.auxiliary)}.`);
    }
    return value as unknown as EmbeddedVariant;
}

/**
 * `value` as the variants of a page, after checking every fact the page reads
 * from it: the version, a group for every variant, a message or a derivation
 * for every variant, and a source carrying a message for every derivation.
 */
export function checked_variants(value: unknown): EmbeddedVariants {
    if (!is_record(value) || value.version !== VARIANTS_VERSION) {
        throw new MalformedVariants(
            `The variants element has version ${JSON.stringify(
                is_record(value) ? value.version : value)}, and the page reads `
            + `version ${VARIANTS_VERSION}.`);
    }
    if (!Array.isArray(value.groups) || !Array.isArray(value.variants)
        || !Array.isArray(value.value_repository)) {
        throw new MalformedVariants(
            'The variants element needs the arrays groups, variants and '
            + 'value_repository.');
    }
    const groups = value.groups.map(checked_group);
    const variants = value.variants.map(checked_variant);
    const by_id = new Map(variants.map((variant) => [variant.id, variant]));
    if (by_id.size !== variants.length) {
        throw new MalformedVariants(
            `${variants.length} variants carry ${by_id.size} distinct ids.`);
    }
    const group_ids = new Set(groups.map((group) => group.id));
    variants.forEach((variant) => {
        if (!group_ids.has(variant.group)) {
            throw new MalformedVariants(
                `Variant ${variant.id} stands in group ${variant.group}, and the `
                + `groups are ${[...group_ids].join(', ')}.`);
        }
        if (variant.derivedFrom !== undefined
            && by_id.get(variant.derivedFrom)?.message === undefined) {
            throw new MalformedVariants(
                `Variant ${variant.id} is derived from ${variant.derivedFrom}, `
                + 'which carries no message.');
        }
    });
    if (variants.length && (typeof value.initial !== 'string' || !by_id.has(value.initial))) {
        throw new MalformedVariants(
            `The initial variant ${JSON.stringify(value.initial)} is not one of `
            + `${[...by_id.keys()].join(', ')}.`);
    }
    return value as unknown as EmbeddedVariants;
}

/* The variants written into `page`, and nothing where the page holds no
 * variants element or an element carrying no variant, which the page treats
 * as a page with no variants. */
export function read_embedded_variants(page: Document): EmbeddedVariants | undefined {
    const element = page.getElementById(EMBEDDED_VARIANTS_ID);
    if (element === null) {
        return undefined;
    }
    const variants = checked_variants(JSON.parse(element.textContent ?? ''));
    return variants.variants.length ? variants : undefined;
}

/**
 * The records of a page's variants, decoded as each variant asks for them.
 * The page applies what its address asks for, the `displayMode` among it,
 * when it draws a variant.
 */
export class VariantRepository {
    private readonly decoded: JSONType[] = [];
    private readonly by_id: Map<string, EmbeddedVariant>;

    constructor(readonly variants: EmbeddedVariants) {
        this.by_id = new Map(variants.variants.map((variant) => [variant.id, variant]));
    }

    variant(id: string): EmbeddedVariant {
        const variant = this.by_id.get(id);
        if (variant === undefined) {
            throw new MalformedVariants(
                `No variant has the id ${JSON.stringify(id)}. The page carries `
                + `${[...this.by_id.keys()].join(', ')}.`);
        }
        return variant;
    }

    has_variant(id: string): boolean {
        return this.by_id.has(id);
    }

    group_title(variant: EmbeddedVariant): string {
        return this.variants.groups.find((group) => group.id === variant.group)
            ?.title ?? variant.group;
    }

    value_at(root: number): JSONType {
        return json_compression.decompress_root(
            this.variants.value_repository, root, this.decoded);
    }

    message_of(variant: EmbeddedVariant): VariantMessage {
        if (variant.message === undefined) {
            throw new MalformedVariants(`Variant ${variant.id} carries no message.`);
        }
        return this.value_at(variant.message) as unknown as VariantMessage;
    }

    auxiliary_at(root: number): aux.DiagramAuxiliary {
        return this.value_at(root) as unknown as aux.DiagramAuxiliary;
    }
}
