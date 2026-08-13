
import * as rh from '../display/Render/RenderHandler';
import * as cr from '../display/Framework/CategoryRenderer';
//import * as bm from '../BroadcastedMeridian';
import * as ut from '../utilities/utilities';
import * as cat from '../data_structure/Category';
import * as ops from '../data_structure/Operators';
import { Separated } from '../utilities/Separated';
//import * as cr from '../StandardCategoryRenderer';
import * as crs from '../display/Framework/CategoryRendererSettings';
import * as pt from '../utilities/Point';
import * as utcr from '../utilities/ConstructorRegistry';
import * as bb from '../display/Framework/BroadcastedCategoryRenderer';
import * as tu from '../data_structure_processing/term_utilities';

import { Color } from '../utilities/Color';
import * as scr from '../display/Framework/StrideCategoryRenderer';

import * as ds from './data_structure';
import * as cv from '../utilities/Curve';

const RADIUS = 22.5;
// Each successive arc is this much wider than the previous (chirp / rotary embedding effect)
const ARC_SCALE = 1.2;
const NUM_ARCS  = 4;

/** Widths of NUM_ARCS arcs in geometric progression, summing to 2 * radius. */
function arcWidths(radius: number): number[] {
    const scaleSum = Array.from({length: NUM_ARCS}, (_, i) => Math.pow(ARC_SCALE, i))
                         .reduce((a, b) => a + b, 0);
    const w0 = 2 * radius / scaleSum;
    return Array.from({length: NUM_ARCS}, (_, i) => w0 * Math.pow(ARC_SCALE, i));
}

/** Maximum y-amplitude the circle permits at horizontal position x. */
function maxAmpAt(x: number, cx: number, radius: number): number {
    return Math.sqrt(Math.max(0, radius * radius - (x - cx) * (x - cx)));
}

/**
 * Chirp sine: half-arch segments (cy → cy), arches alternating up/down.
 * Amplitude at each arch peak is clamped to the circle boundary.
 */
function chirpSine(center: pt.Point, radius: number): cv.CurveSequence {
    const amp = radius / 2;
    const cp_ratio = 4 / 3;
    const widths = arcWidths(radius);
    const segments: cv.CubicBezierSegment[] = [];
    let x = center.x - radius;
    for (let i = 0; i < NUM_ARCS; i++) {
        const w = widths[i];
        const sign = i % 2 === 0 ? -1 : 1;   // first arch goes up (−y)
        const xEnd = x + w;
        const clampedAmp = Math.min(amp, maxAmpAt(x + w / 2, center.x, radius));
        const cp = clampedAmp * cp_ratio;
        segments.push(new cv.CubicBezierSegment(
            {x,            y: center.y},
            {x: x + w / 3, y: center.y + sign * cp},
            {x: xEnd - w / 3, y: center.y + sign * cp},
            {x: xEnd,      y: center.y},
        ));
        x = xEnd;
    }
    return new cv.CurveSequence(segments);
}

/**
 * Chirp cosine: S-curve segments between successive extrema (±amp → ∓amp).
 * Tangents are horizontal at both endpoints (cosine dy/dx = 0 at extrema).
 * Amplitude at each boundary is clamped to the circle.
 */
function chirpCosine(center: pt.Point, radius: number): cv.CurveSequence {
    const amp = radius / 2;
    const widths = arcWidths(radius);
    const segments: cv.CubicBezierSegment[] = [];
    let x = center.x - radius;
    for (let i = 0; i < NUM_ARCS; i++) {
        const w = widths[i];
        const signStart = i % 2 === 0 ? -1 : 1;   // first arch starts at top (−y)
        const signEnd   = -signStart;
        const xEnd = x + w;
        const yStart = center.y + signStart * Math.min(amp, maxAmpAt(x,    center.x, radius));
        const yEnd   = center.y + signEnd   * Math.min(amp, maxAmpAt(xEnd, center.x, radius));
        segments.push(new cv.CubicBezierSegment(
            {x,            y: yStart},
            {x: x + w / 3, y: yStart},    // horizontal tangent at start
            {x: xEnd - w / 3, y: yEnd},   // horizontal tangent at end
            {x: xEnd,      y: yEnd},
        ));
        x = xEnd;
    }
    return new cv.CurveSequence(segments);
}

@bb.opsRegistry.registerClass(ds.ComplexRotary)
class ComplexRotaryBox<B extends cat.Datatype, A extends cat.Axis> extends bb.OperationBox<B, A, ds.ComplexRotary<B>> {
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ds.ComplexRotary<B>>,
    ) {
        super(categoryRenderer, target, {x: 40, y: 25});
    }
    update(): void {
        this.right_anchors.transform.offset = {x: -10, y: 0};
        super.update();
        const rect = this.rectangle();
        // this.draw?.drawRectangle(rect);
        const midpoint = this.rectangle().midpoint();
        // const RADIUS = 22.5;

        this.draw?.circle(
            {x: midpoint.x + 0, y: midpoint.y},
            {radius:RADIUS, fill: 'white'},
            {dropShadow: true}
        );
        this.draw?.curve(chirpSine(midpoint, RADIUS),
            {'stroke': '#2255cc', 'stroke-width': '1.5px'});
        this.draw?.curve(chirpCosine(midpoint, RADIUS),
            {'stroke': '#cc4422', 'stroke-width': '1.5px'});
        const midline = new cv.StraightLine(
            {x: midpoint.x - RADIUS, y: midpoint.y},
            {x: midpoint.x + RADIUS, y: midpoint.y}
        );
        this.draw?.curve(midline, 
            {'stroke': 'black', 'stroke-width': '1px', 'stroke-dasharray': '1,2'});
    }
}

const DECOMPLEX_DEPTH = 5;

@bb.opsRegistry.registerClass(ds.Decomplex)
class DecomplexBox<B extends cat.Datatype, A extends cat.Axis> extends bb.OperationBox<B, A, ds.Decomplex> {
    private annotation: rh.AnnotationElement;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ds.Decomplex>,
    ) {
        super(categoryRenderer, target, {x: 30, y: 25});
        this.annotation = new rh.AnnotationElement(
            this.categoryRenderer.renderHandler, 
            '\\mathbb{R}^2', 
            {font_size: 1});
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        const left = rect.left -2;
        const right = rect.right + 2;
        const top = (this.left_anchors.anchors[0].location()?.y ?? rect.top) - 2;
        const bottom = (this.left_anchors.anchors[1].location()?.y ?? rect.bottom) + 2;
        this.draw?.deltaPolygon(
            [{x: left, y: top},
                {x: right - left - DECOMPLEX_DEPTH, y: 0},
                {x: DECOMPLEX_DEPTH, y: (bottom - top)/2},
                {x: -DECOMPLEX_DEPTH, y: (bottom - top)/2},
                {x: DECOMPLEX_DEPTH - right + left, y: 0},
                {x: DECOMPLEX_DEPTH, y: (top - bottom)/2},
            ],
            {fill: Color.from_h360sv(0, 0.5, 1).hex(), stroke: 'black', 'stroke-width': '1px'},
            {dropShadow: true}
        );
        this.annotation.place(rect);
    }
}

@bb.opsRegistry.registerClass(ds.TopK)
class TopKBox<B extends cat.Datatype, A extends cat.Axis> extends bb.OperationBox<B, A, ds.TopK> {
    //private annotation: rh.AnnotationElement;
    constructor(
        public categoryRenderer: bb.BroadcastedRenderer<B, A>,
        public target: cat.Broadcasted<B, A, ds.TopK>,
    ) {
        super(categoryRenderer, target, {x: 30, y: 30});
    }
    update(): void {
        super.update();
        const rect = this.rectangle();
        if (this.right_anchors.anchors.length > 1) {
            const bite_size = this.settings.operation_multilinear_bite;
            this.draw?.deltaPolygon(
                [{x: rect.left, y: rect.top},
                 {x: rect.width, y: 0},
                 {x: 0, y: rect.height},
                 {x: -rect.width + bite_size, y: 0},
                 {x: -bite_size, y: -bite_size}
                ],
                {fill: '#7ED321', stroke: 'none'},
                {dropShadow: true}
            )
        }
        const width = rect.width / 2;
        const height = rect.height / 2;
        const square_size = Math.min(width, height);
        // Draw a diamond shape centered at the midpoint
        this.draw?.deltaPolygon(
            [{x: rect.midpoint().x, y: rect.midpoint().y - square_size},
             {x:  square_size, y:  square_size},
             {x: -square_size, y:  square_size},
             {x: -square_size, y: -square_size},
            ],
            {fill: '#7ED321'}
        );
        this.draw?.deltaPolygon(
            [{x: rect.midpoint().x, y: rect.midpoint().y - square_size},
             {x:  square_size/2, y:  square_size/2},
             {x: -square_size/2, y:  square_size/2},
             {x: -square_size/2, y: -square_size/2},
            ],
            {fill: '#D8D8D8'}
        );
        // Draw a line cutting through
        this.draw?.polyline([
            {x: rect.midpoint().x, y: rect.midpoint().y - square_size},
            {x: rect.midpoint().x, y: rect.midpoint().y + square_size},
        ]);
        // Draw a background indent
    }
}