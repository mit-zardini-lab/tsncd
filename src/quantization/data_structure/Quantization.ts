/**
 * Written by Claude Opus 5 (1M context), effort 80.
 *
 * The quantisation of a datatype carries the packing, which is the number of
 * elements a register word holds.
 *
 * Mirrors `pyncd/quantization/data_structure/Quantization.py`: the number
 * format a value is held in together with the size of that format in bits,
 * and the operator that reads a value of one datatype into another. The
 * fields stand in the order Python declares them, because terms arrive
 * positionally from the JSON.
 *
 * `display/Framework/quantization/quantisationLabels.ts` draws a `Quantified`
 * as the label under an array's axes and a `TypeConvert` as the chevron
 * between two arrays.
 *
 * `BlockScale`, and the trailing `scale` field of `Quantified` that holds one,
 * were added by Claude Opus 5 (1M context), effort 80, on 2026-09-20. A format
 * with few bits holds few numbers, so a value held in one is scaled first, and
 * the quantisation of such a wire is the format of its elements together with
 * the format and the group of the scale they are multiplied by. A term
 * exported before the field existed carries four fields, and the default of
 * `null` stands for the fifth.
 */
import * as fd from '../../data_structure/Term';
import * as nm from '../../data_structure/Numeric';
import * as cat from '../../data_structure/Category';

export function establish(): void {
    console.log('Loaded the quantization data structures.');
}

/**
 * The encodings a value is held in, mirroring `Encoding` in
 * `pyncd/quantization/data_structure/Quantization.py`. Each member key is the
 * Python member name the JSON carries, and each value is the text
 * `Quantified.width_latex` prints.
 */
export enum Encoding {
    type = 'Encoding',
    FP32 = 'FP32',
    FP16 = 'FP16',
    BF16 = 'BF16',
    E5M2 = 'E5M2',
    E4M3 = 'E4M3',
    E2M1 = 'E2M1',
    UE8M0 = 'UE8M0',
    INT64 = 'INT64',
    INT32 = 'INT32',
}
fd.register_enum(Encoding);

/**
 * One scale, held in `form`, shared by `channels` consecutive values along the
 * axis a projection contracts, and by `rows` consecutive values along the
 * other axis of a weight. The value denoted by an element is the element
 * multiplied by the scale of its group.
 */
@fd.register_term
export class BlockScale extends fd.Term {
    constructor(
        readonly form: Encoding,
        readonly channels: nm.Numeric,
        readonly rows: nm.Numeric = new nm.Integer(1),
    ) { super(); }

    /** The group one scale covers, as `32` for a single row and `32{\times}8`
     * for eight rows of thirty-two channels. */
    group_latex(): string {
        const channels = this.channels.to_latex();
        const rows = this.rows.to_latex();
        return rows === '1' ? channels : `${channels}{\\times}${rows}`;
    }

    /** The scale as it is drawn after the encoding of the elements, in small
     * type so that the format of an element is read first. */
    to_latex(): string {
        return `{\\scriptstyle\\mathtt{${this.form}}/${this.group_latex()}}`;
    }
}

function same_block_scale(one: BlockScale, other: BlockScale): boolean {
    return one.form === other.form
        && one.channels.equals(other.channels)
        && one.rows.equals(other.rows);
}

const MICROSCALING_SCALE = new BlockScale(Encoding.UE8M0, new nm.Integer(32));

/**
 * The name the Open Compute Project's Microscaling specification gives to a
 * block-scaled format, and `null` for a format it does not name. The two
 * entries mirror `INDUSTRY_NAMES` in
 * `pyncd/quantization/data_structure/Quantization.py`: E4M3 elements with one
 * UE8M0 scale per 32 channels and 1 row are `MXFP8`, and E2M1 elements with
 * the same scale are `MXFP4`.
 */
const INDUSTRY_NAMES: ReadonlyArray<[Encoding, BlockScale, string]> = [
    [Encoding.E4M3, MICROSCALING_SCALE, 'MXFP8'],
    [Encoding.E2M1, MICROSCALING_SCALE, 'MXFP4'],
];

export function industry_name(
    form: Encoding | null, scale: BlockScale,
): string | null {
    for (const [elements, scaled, name] of INDUSTRY_NAMES) {
        if (form === elements && same_block_scale(scale, scaled)) {
            return name;
        }
    }
    return null;
}

/**
 * A datatype with a quantisation imposed. `vector` is the number of values
 * packed into one register word, `form` names the encoding of an element, and
 * `scale` is the block scale the elements are multiplied by, or `null` for a
 * format whose elements denote their own value.
 */
@fd.register_term
export class Quantified<B extends cat.Datatype = cat.Reals> extends cat.Datatype {
    constructor(
        readonly wraps: B,
        readonly size: nm.Numeric = new nm.Integer(16),
        readonly vector: nm.Numeric = new nm.Integer(1),
        readonly form: Encoding | null = null,
        readonly scale: BlockScale | null = null,
    ) { super(); }

    packs_one(): boolean {
        return this.vector instanceof nm.Integer && this.vector._value === 1;
    }

    /** The quantisation of one element. A block-scaled format that the
     * Microscaling specification names is written under that name, and every
     * other one is written as the encoding of its elements followed by its
     * scale. */
    format_latex(): string {
        const elements = this.form !== null
            ? `\\mathtt{${this.form}}`
            : `\\mathrm{f}${this.size.to_latex()}`;
        if (this.scale === null) {
            return elements;
        }
        const named = industry_name(this.form, this.scale);
        return named !== null
            ? `\\mathtt{${named}}`
            : `${elements}\\,${this.scale.to_latex()}`;
    }

    width_latex(): string {
        const format = this.format_latex();
        return this.packs_one()
            ? format
            : `${this.vector.to_latex()}${format}`;
    }

    to_latex(): string {
        const inner = this.wraps.to_latex();
        return inner ? `${this.width_latex()}(${inner})` : this.width_latex();
    }
}

/** The operator reading a value of `source` into `target`, entry by entry. */
@fd.register_term
export class TypeConvert<
    A extends cat.Datatype = cat.Datatype,
    B extends cat.Datatype = cat.Datatype,
> extends cat.Operator {
    constructor(
        readonly name: fd.DynamicName | null,
        readonly source: A,
        readonly target: B,
    ) { super(name); }
}
