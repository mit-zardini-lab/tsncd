/*
 * Written by Claude Opus 5 (1M context), effort high.
 *
 * The label on the wire of an axis whose live positions an affine form of its
 * position states.
 *
 * `pyncd`'s `AffineGuards.sparse_axis_named` writes the name of such an axis as
 * the axis's own letter, a bar, and the letters of the axes the form reads, so
 * the 128 window slots a query reaches are named `w|x`. The name arrives as one
 * body, because the bar is a character of the string the Python builds, and
 * `DynamicName.to_latex` therefore draws an exponent after the guides.
 *
 * `pyncd/obsidian/02-categories/Advanced Axis Dynamics.md` states the feature.
 */
import * as fd from '../../../data_structure/Term';
import * as scr from '../StrideCategoryRenderer';
import * as AffineGuards from '../../../advanced_axis_dynamics/data_structure/AffineGuards';

export function establish(): void {
    console.log("Loaded the guarded axis labels.");
}

/* The bar `AffineGuards.sparse_axis_named` writes between the axis's own
 * letter and the letters of its guides. */
const GUIDE_BAR = '|';

/*
 * The name of a guarded axis with its exponent drawn on the axis's own letter.
 *
 * `pyncd`'s `algebra.write_axis_exponents` writes the size a configuration
 * assigned an axis as the exponent of that axis's name, and
 * `DynamicName.to_latex` draws an exponent after the whole name, which reads
 * `w|x^{128}` and says that the queries number 128. The 128 slots belong to the
 * window, so the exponent is drawn before the bar and the name reads `w^{128}|x`.
 *
 * The letter is built as a `DynamicName` of its own and asked for its latex,
 * rather than having the exponent appended to it here, so that the placement
 * the name's settings declare is applied in the one place that applies it
 * everywhere else. The letter therefore takes those settings, and the size
 * lowered into the subscript reads `w_{128}|x`.
 *
 * The letter carries the exponent and the guides carry the subscript, since
 * `sparse_axis_named` builds the name from a plain string and the string holds
 * whatever `DynamicName.from_str` read as a lineage.
 */
export function guarded_axis_latex(name: fd.DynamicName): string {
    const bar = (name.body ?? '').indexOf(GUIDE_BAR);
    if (bar < 0 || name.exponent_group_latex() === '') {
        return name.to_latex();
    }
    const letter = new fd.DynamicName(
        (name.body ?? '').slice(0, bar), null, name.settings, null, name.exponent);
    const guides = new fd.DynamicName(
        (name.body ?? '').slice(bar), name.subscript);
    return `${letter.to_latex()}${guides.to_latex()}`;
}

/*
 * An axis whose name carries an exponent is named by its name rather than by
 * its size, per `AxisProcessor.size_text`, and a guarded axis is named with the
 * exponent moved off the guides and onto its own letter. An axis whose name
 * carries none is labelled as any other axis is.
 */
@scr.axesRegistry.registerClass(AffineGuards.AffineSparseAxis)
class GuardedAxisProcessor<A extends AffineGuards.AffineSparseAxis>
    extends scr.AxisProcessor<A> {
    protected size_text(): string {
        const name = this.axis.uid._name;
        return name?.exponent == null
            ? super.size_text() : guarded_axis_latex(name);
    }
}
