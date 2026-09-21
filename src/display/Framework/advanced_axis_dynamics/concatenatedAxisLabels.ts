/*
 * Written by Claude Opus 5, effort high.
 *
 * The label on the wire of an axis whose positions are the positions of several
 * other axes laid end to end.
 *
 * `pyncd`'s `AxisConcatenation.ConcatenatedAxis` carries no name of its own, so
 * the label is built from the parts: each part labelled by the processor
 * `axesRegistry` holds for its class, the labels joined by `PART_SEPARATOR`. A
 * part therefore reads on this wire exactly as it reads on a wire of its own, a
 * guarded part through `guardedAxisLabels` and a part that is itself a
 * concatenation through this processor in turn. The concatenation of the window
 * slots and the selected slots reads `w|x + s|x`, and `w^{128}|x + s^{512}|x`
 * once the sizes have been assigned. The sum of the parts' sizes is left out,
 * since the parts state their own sizes.
 *
 * `pyncd/obsidian/02-categories/Advanced Axis Dynamics.md` states the feature.
 */
import * as rh from '../../Render/RenderHandler';
import * as sc from '../../../data_structure/StrideCategory';
import * as scr from '../StrideCategoryRenderer';
import * as AxisConcatenation from '../../../advanced_axis_dynamics/data_structure/AxisConcatenation';

export function establish(): void {
    console.log("Loaded the concatenated axis labels.");
}

@scr.axesRegistry.registerClass(AxisConcatenation.ConcatenatedAxis)
class ConcatenatedAxisProcessor<A extends AxisConcatenation.ConcatenatedAxis>
    extends scr.AxisProcessor<A> {
    annotation_text(): string {
        return this.axis.parts
            .map((part) => this.part_label(part))
            .join(AxisConcatenation.PART_SEPARATOR);
    }

    private part_label(part: sc.Axis): string {
        return scr.axesRegistry.getConstructor(part)(
            this.categoryRenderer,
            part,
            this.axisAnchor,
            this.array,
        ).annotation_text();
    }

    label_width(): number {
        return rh.estimated_label_width(
            [this.annotation_text()],
            this.annotation_settings().font_size);
    }
}
