import * as pt from './Point';

export abstract class Curve {
    abstract get start(): pt.Point;
    abstract get end(): pt.Point;
    abstract y(x: number): pt.Point;
    abstract dy(x: number): number;
    abstract pathCommand(): string;
    abstract relative(origin: pt.Point): Curve;

    pathData(): string {
        return `M ${this.start.x} ${this.start.y} ${this.pathCommand()}`;
    }

    angle(x: number): number {
        const dy = this.dy(x);
        return Math.atan2(dy, 1);
    }
}

export class CubicBezierCurve extends Curve {
    constructor(
        readonly start: pt.Point,
        readonly control0: pt.Point,
        readonly control1: pt.Point,
        readonly end: pt.Point,
    ) {
        super();
    }
    y(x: number): pt.Point {
        const t = (x - this.start.x) / (this.end.x - this.start.x);
        const y = Math.pow(1 - t, 3) * this.start.y
            + 3 * Math.pow(1 - t, 2) * t * this.control0.y
            + 3 * (1 - t) * Math.pow(t, 2) * this.control1.y
            + Math.pow(t, 3) * this.end.y;
        return new pt.Point(x, y);
    }
    dy(x: number): number {
        // const t = (x - this.start.x) / (this.end.x - this.start.x);
        // const dy_dt = -3 * Math.pow(1 - t, 2) * this.start.y
        //     + 3 * Math.pow(1 - t, 2) * this.control0.y
        //     + 6 * (1 - t) * t * this.control1.y
        //     + 3 * Math.pow(t, 2) * this.end.y;
        // // This should give the derivative of y with respect to x at this point, but since t is a function of x, we need to apply the chain rule
        // const dt_dx = 1 / (this.end.x - this.start.x);
        return this.y(x + 1).y - this.y(x).y;
    }

    pathCommand(): string {
        return `C ${this.control0.x} ${this.control0.y} ${this.control1.x} ${this.control1.y} ${this.end.x} ${this.end.y}`;
    }

    relative(origin: pt.Point): CubicBezierCurve {
        const [start, control0, control1, end] = pt.Point.relative(origin, this.start, this.control0, this.control1, this.end);
        return new CubicBezierCurve(start, control0, control1, end);
    }
}

export class CubicBezierSegment extends CubicBezierCurve {
    constructor(
        readonly start: pt.Point,
        readonly control0: pt.Point,
        readonly control1: pt.Point,
        readonly end: pt.Point,
    ) {
        super(start, control0, control1, end);
    }

    get target(): pt.Point {
        return this.end;
    }

    relative(origin: pt.Point): CubicBezierSegment {
        const [start, control0, control1, end] = pt.Point.relative(origin, this.start, this.control0, this.control1, this.end);
        return new CubicBezierSegment(start, control0, control1, end);
    }
}

export class CurveSequence extends Curve {
    constructor(
        readonly curves: Curve[]
    ) {
        super();
        if (curves.length === 0) {
            throw new Error('CurveSequence requires at least one curve.');
        }
    }

    get start(): pt.Point {
        return this.curves[0].start;
    }

    get end(): pt.Point {
        return this.curves[this.curves.length - 1].end;
    }

    y(x: number): pt.Point {
        const segment = this.curves.find((curve) => {
            const left = Math.min(curve.start.x, curve.end.x);
            const right = Math.max(curve.start.x, curve.end.x);
            return x >= left && x <= right;
        }) ?? this.curves[this.curves.length - 1];
        return segment.y(x);
    }

    dy(x: number): number {
        const segment = this.curves.find((curve) => {
            const left = Math.min(curve.start.x, curve.end.x);
            const right = Math.max(curve.start.x, curve.end.x);
            return x >= left && x <= right;
        }) ?? this.curves[this.curves.length - 1];
        return segment.dy(x);
    }

    pathCommand(): string {
        return this.curves.map((curve) => curve.pathCommand()).join(' ');
    }

    pathData(): string {
        const [first, ...rest] = this.curves;
        const restCommands = rest.map((curve) => curve.pathCommand());
        return `M ${first.start.x} ${first.start.y} ${first.pathCommand()} ${restCommands.join(' ')}`.trim();
    }

    relative(origin: pt.Point): CurveSequence {
        return new CurveSequence(this.curves.map((curve) => curve.relative(origin)));
    }
}

export function cubicBezierPath(curve: Curve): string {
    return curve.pathData();
}

export class StraightLine extends Curve {
    constructor(
        readonly start: pt.Point,
        readonly end: pt.Point,
    ) {
        super();
    }
    y(x: number): pt.Point {
        const t = (x - this.start.x) / (this.end.x - this.start.x);
        const y = (1 - t) * this.start.y + t * this.end.y;
        return new pt.Point(x, y);
    }
    dy(x: number): number {
        return (this.end.y - this.start.y) / (this.end.x - this.start.x);
    }

    pathCommand(): string {
        return `L ${this.end.x} ${this.end.y}`;
    }

    relative(origin: pt.Point): StraightLine {
        const [start, end] = pt.Point.relative(origin, this.start, this.end);
        return new StraightLine(start, end);
    }
}

export function flatCurve(
    p0: pt.Point,
    p1: pt.Point,
    controlRatio: number = 0.4,
): Curve {
    if (Math.abs(p1.y - p0.y) < 1) {
        return new StraightLine(p0, p1);
    }
    const controlDistance = Math.abs(p1.x - p0.x) * controlRatio;
    const control0 = new pt.Point(
        p0.x + controlDistance,
        p0.y
    );
    const control1 = new pt.Point(
        p1.x - controlDistance,
        p1.y
    );
    return new CubicBezierCurve(p0, control0, control1, p1);
}