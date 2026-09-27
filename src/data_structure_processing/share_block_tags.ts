// Claude Opus 5.5 (1M context), effort 40.
/*
 * One tag given to every block of a term whose body and aesthetics are equal.
 *
 * The renderer keys a block by its tag. A pointer resting on a block lights
 * every block carrying the same tag, an inspection box is opened and pooled by
 * the tag, and a body is queued as a sub-diagram once per tag. `pyncd`'s
 * `quantization/processing/quantise_model` quantises the body of a box once
 * for every quantisation its operands arrive in and gives each quantised body
 * a tag of its own, so the quantised DeepSeek-V4.1-Flash carries 1209 tags
 * where the model in the reals carries 298. Once `strip_quantisations` has
 * taken the quantisations off, the bodies of those blocks are equal again, and
 * this pass gives them back one tag, the first met in a depth-first walk of
 * the fields. `pyncd` has no such pass, because the Python functor keys
 * nothing by a tag.
 *
 * Two blocks are given one tag when their bodies, their repetitions, their
 * aesthetics and their display orders are equal as terms. The walk is bottom
 * up, so a block holding blocks is compared after the blocks it holds have
 * been given their tags.
 */
import * as cat from '../data_structure/Category';
import * as term_rewriting from './term_rewriting';

/*
 * A number for every distinct structure met, so two objects receive one
 * number exactly when they are equal as terms. Each object is described once,
 * by its class and the numbers of its fields, which makes the numbering linear
 * in the size of a term however many paths reach a shared part.
 */
class StructureNumbers {
    private readonly numbers = new Map<string, number>();
    private readonly numbers_of_objects = new WeakMap<object, number>();

    number_of(target: unknown): number {
        if (target === null || typeof target !== 'object') {
            return this.number_of_description(`${typeof target}:${String(target)}`);
        }
        const known = this.numbers_of_objects.get(target);
        if (known !== undefined) {
            return known;
        }
        const number = this.number_of_description(this.description_of(target));
        this.numbers_of_objects.set(target, number);
        return number;
    }

    private description_of(target: object): string {
        if (Array.isArray(target)) {
            return `[${target.map((part) => this.number_of(part)).join(',')}]`;
        }
        const fields = target as Record<string, unknown>;
        const parts = Object.keys(fields)
            .map((key) => `${key}=${this.number_of(fields[key])}`);
        return `${target.constructor?.name ?? 'Object'}(${parts.join(',')})`;
    }

    private number_of_description(description: string): number {
        const known = this.numbers.get(description);
        if (known !== undefined) {
            return known;
        }
        const number = this.numbers.size;
        this.numbers.set(description, number);
        return number;
    }
}

/**
 * `term` with every block whose body, repetition, aesthetics and display order
 * equal those of a block met before it given that block's tag, beside the
 * images of the rewrite.
 */
export function share_tags_between_equal_blocks<T>(
    term: T,
): term_rewriting.RewrittenTerm<T> {
    const structures = new StructureNumbers();
    const tags_by_block = new Map<string, cat.BlockTag>();
    const rewrite = new term_rewriting.MemoisedRewrite((target, apply) => {
        const rebuilt = term_rewriting.deep_reconstruct(target, apply);
        if (!(rebuilt instanceof cat.Block)) {
            return rebuilt;
        }
        const tag = rebuilt.block_tag;
        const key = [
            rebuilt.body, tag.repetition, tag.aesthetics, rebuilt._display_order,
        ].map((part) => structures.number_of(part)).join('|');
        const shared = tags_by_block.get(key);
        if (shared === undefined) {
            tags_by_block.set(key, tag);
            return rebuilt;
        }
        return shared === tag
            ? rebuilt : term_rewriting.reconstruct(rebuilt, {block_tag: shared});
    });
    return {term: rewrite.apply(term) as T, images: rewrite.images};
}
