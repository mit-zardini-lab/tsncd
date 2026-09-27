// Claude Opus 5.5 (1M context), effort 40.
/*
 * Every quantisation taken off a term, every cast that became an identity
 * turned into one, and the identities then simplified out of the term.
 *
 * Mirrors `pyncd`'s `quantization/algebra/strip_quantisations.py`, and
 * `pyncd/obsidian/04-quantization/Stripping Quantisations.md` states the
 * functor. The user stated its design on 2026-09-27, and the three steps
 * below follow it.
 *
 * First, every `Quantified` is replaced by the datatype it wraps, under
 * whatever wrappers hold it, and the `BlockScale` it carries goes with it. A
 * `Complex` of quantised reals becomes a `Complex` of the reals.
 *
 * Second, a cast, which is a `Broadcasted` whose operator is a `TypeConvert`,
 * whose source and target are equal once the quantisations are taken off,
 * becomes the identity on its operand's array. A cast that still converts, as
 * one between two bounds of an index does, stays.
 *
 * Third, the identities are simplified out from the bottom of the term up, so
 * a term that became an identity is removed from the term holding it in turn.
 * A composition drops every member that is an identity, and becomes the
 * identity where every member is one. A product whose every factor is an
 * identity becomes the identity on its domain, and a block whose body is an
 * identity is that identity wherever it stands as a morphism, whatever its
 * tag, repetition, title or colour, because a block only groups. The box of a
 * `BlockOperator` whose block is an identity is the identity too, which
 * removes the box `pyncd` draws in place around a cast to explain it. A
 * `ParaWrap` that grabs or drops acts on the tape and is not an identity, so
 * it is kept, with the identity as its body, the form `ParaWrap.of_grab` and
 * `ParaWrap.of_drop` build.
 *
 * The identity test is `is_identity`. It reads a morphism of the category of
 * arrays alone, so a reindexing, which is a morphism of the category of axes
 * and holds no datatype, is left as it stands, together with any block
 * explaining it.
 *
 * The functor rewrites every field of every term, so it reaches the bodies of
 * blocks, `BlockOperator`s, `ParaWrap`s and `ParaBlockOperator`s, and the
 * rewrite is memoised on object identity, so a subterm reached along many
 * paths is rewritten once.
 */
import * as fd from '../../data_structure/Term';
import * as cat from '../../data_structure/Category';
import * as ops from '../../data_structure/Operators';
import * as ut from '../../utilities/utilities';
import * as para_wrap from '../../para/data_structure/ParaWrap';
import * as term_rewriting from '../../data_structure_processing/term_rewriting';
import * as Quantization from '../data_structure/Quantization';

type AnyArray = cat.Array<cat.Datatype, cat.Axis>;
type AnyMorphism = cat.Morphism<AnyArray>;

/* The fields a datatype wrapping another holds it in, as
 * `WRAPPING_FIELDS` in `pyncd/quantization/data_structure/Quantization.py`
 * lists them: `wraps` for a `Quantified`, `base` for a `Complex`, and `form`
 * for a wrapper that names its contents that way. */
const WRAPPING_FIELDS = ['wraps', 'form', 'base'];

/** The datatype one wrapper holds, and `null` for a datatype that wraps none. */
export function wrapped_datatype(datatype: cat.Datatype): cat.Datatype | null {
    const fields = datatype as unknown as Record<string, unknown>;
    for (const name of WRAPPING_FIELDS) {
        const inner = fields[name];
        if (inner instanceof cat.Datatype) {
            return inner;
        }
    }
    return null;
}

/** The outermost `Quantified` held by `datatype`, whatever wraps it, and
 * `null` for a datatype that carries no quantisation. */
export function quantisation_of(
    datatype: cat.Datatype,
): Quantization.Quantified<cat.Datatype> | null {
    let current: cat.Datatype | null = datatype;
    while (current !== null) {
        if (current instanceof Quantization.Quantified) {
            return current;
        }
        current = wrapped_datatype(current);
    }
    return null;
}

/**
 * Whether `morphism` is an identity of the category of arrays: a
 * `Rearrangement` of arrays sending every wire to itself, a composition or a
 * product whose every part is an identity, a block whose body is one, or a
 * `ParaWrap` over one that grabs nothing and drops nothing.
 */
export function is_identity(morphism: unknown): boolean {
    if (morphism instanceof cat.Rearrangement) {
        return morphism.mapping.length === morphism._dom.length
            && morphism.mapping.every((image, index) => image === index)
            && morphism._dom.every((object) => object instanceof cat.Array);
    }
    if (morphism instanceof cat.Composed || morphism instanceof cat.ProductOfMorphisms) {
        return morphism.content.every(is_identity);
    }
    if (morphism instanceof cat.Block) {
        return is_identity(morphism.body);
    }
    if (morphism instanceof para_wrap.ParaWrap) {
        return morphism.grabs.every((entry) => entry === null)
            && morphism.drops.every((entry) => entry === null)
            && is_identity(morphism.body);
    }
    return false;
}

function identity_on(dom: AnyArray[]): cat.Rearrangement<AnyArray> {
    return new cat.Rearrangement<AnyArray>(ut.range(dom.length), dom);
}

/* `morphism` where it is not an identity, and the identity `Rearrangement` on
 * its domain where it is one, which is `morphism` itself where it is already
 * that `Rearrangement`. */
function simplified_part(morphism: AnyMorphism): AnyMorphism {
    if (!is_identity(morphism) || morphism instanceof cat.Rearrangement) {
        return morphism;
    }
    return identity_on(morphism.dom().content);
}

class QuantisationStripper {
    readonly rewrite = new term_rewriting.MemoisedRewrite(
        (target, apply) => this.rewrite_object(target, apply));

    is_identity_once_dequantised(convert: Quantization.TypeConvert): boolean {
        return ut.deep_equals(
            this.rewrite.apply(convert.source), this.rewrite.apply(convert.target));
    }

    private rewrite_object(target: object, apply: (part: unknown) => unknown): unknown {
        if (target instanceof Quantization.Quantified) {
            return apply(target.wraps);
        }
        if (target instanceof cat.Broadcasted) {
            return this.rewrite_broadcasted(target, apply);
        }
        if (target instanceof cat.Composed) {
            return this.rewrite_composed(target, apply);
        }
        if (target instanceof cat.ProductOfMorphisms) {
            return this.rewrite_product(target, apply);
        }
        if (target instanceof para_wrap.ParaWrap) {
            return this.rewrite_para_wrap(target, apply);
        }
        return term_rewriting.deep_reconstruct(target, apply);
    }

    /* A cast that became an identity, and the box of a `BlockOperator` whose
     * block became one, are the identity on their operands, where the
     * operands and the results are the same arrays. */
    private rewrite_broadcasted(
        target: cat.Broadcasted<cat.Datatype, cat.Axis>,
        apply: (part: unknown) => unknown,
    ): unknown {
        const rebuilt = term_rewriting.deep_reconstruct(target, apply);
        const is_an_identity = (
            target.operator instanceof Quantization.TypeConvert
            && this.is_identity_once_dequantised(target.operator)
        ) || (
            rebuilt.operator instanceof ops.BlockOperator
            && is_identity(rebuilt.operator.block)
        );
        if (!is_an_identity) {
            return rebuilt;
        }
        const dom = rebuilt.dom().content as AnyArray[];
        return ut.deep_equals(dom, rebuilt.cod().content) ? identity_on(dom) : rebuilt;
    }

    private rewrite_composed(
        target: cat.Composed<AnyArray, AnyMorphism>,
        apply: (part: unknown) => unknown,
    ): unknown {
        const parts = target.content.map(apply) as AnyMorphism[];
        const kept = parts.filter((part) => !is_identity(part));
        if (!kept.length) {
            return identity_on(parts[0].dom().content);
        }
        if (kept.length === 1) {
            return kept[0];
        }
        return kept.length === target.content.length
            && kept.every((part, index) => part === target.content[index])
            ? target : term_rewriting.reconstruct(target, {content: kept});
    }

    private rewrite_product(
        target: cat.ProductOfMorphisms<AnyArray, AnyMorphism>,
        apply: (part: unknown) => unknown,
    ): unknown {
        const parts = target.content.map(apply) as AnyMorphism[];
        if (parts.length && parts.every(is_identity)) {
            return identity_on(parts.flatMap((part) => part.dom().content));
        }
        const factors = parts.map(simplified_part);
        return factors.every((factor, index) => factor === target.content[index])
            ? target : term_rewriting.reconstruct(target, {content: factors});
    }

    private rewrite_para_wrap(
        target: para_wrap.ParaWrap<AnyArray, AnyMorphism>,
        apply: (part: unknown) => unknown,
    ): unknown {
        const rebuilt = term_rewriting.deep_reconstruct(target, apply);
        const body = simplified_part(rebuilt.body as AnyMorphism);
        return body === rebuilt.body ? rebuilt : term_rewriting.reconstruct(rebuilt, {body});
    }
}

/**
 * `datatype` with every quantisation taken off it, and `datatype` itself where
 * it carries none.
 */
export function without_quantisations<D extends cat.Datatype>(datatype: D): cat.Datatype {
    return new QuantisationStripper().rewrite.apply(datatype) as cat.Datatype;
}

/**
 * Whether `convert` reads a value into a datatype that is the same as its own
 * once the quantisations are taken off both, which makes the cast an identity
 * of the term the functor returns.
 */
export function is_identity_once_dequantised(convert: Quantization.TypeConvert): boolean {
    return new QuantisationStripper().is_identity_once_dequantised(convert);
}

/**
 * `term` with every quantisation taken off it, every cast that became an
 * identity turned into one and the identities simplified out, beside
 * `images`, which holds every object of `term` against what it became.
 */
export function strip_quantisations<T extends fd.Term>(
    term: T,
): term_rewriting.RewrittenTerm<T> {
    const stripper = new QuantisationStripper();
    return {
        term: stripper.rewrite.apply(term) as T,
        images: stripper.rewrite.images,
    };
}
