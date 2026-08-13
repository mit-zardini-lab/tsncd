export class Point {
    constructor(
        public x: number,
        public y: number,
        public reference?: Point,
    ){}
    static scale(point: Point, scaler: number){
        return {x: scaler*point.x, y: scaler*point.y};
    }
    static mulsum(...xs: (Point | [number, Point])[]){
        return xs.reduce<Point>(
            (acc, scaler_point) => {
                const next_point : Point = Array.isArray(scaler_point)
                    ? Point.scale(scaler_point[1], scaler_point[0])
                    : scaler_point;
                return {
                    x: acc.x + next_point.x, 
                    y: acc.y + next_point.y};
            },
            {x: 0, y: 0}
        );
    }
    static relative(origin: Point, ...points: Point[]): Point[] {
        return points.map(
            (point) => ({
                x: point.x - origin.x,
                y: point.y - origin.y,
            })
        )
    }
    static interpolate_x(p1: Point, p2: Point, x: number): Point {
        const lambda = (x - p1.x) / (p2.x - p1.x);
        return new Point(
            x,
            p1.y * lambda + p2.y * (1 - lambda),
        )
    }
    static rotate(points: Point[], angle: number): Point[] {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return points.map(point => ({
            x: point.x * cos - point.y * sin,
            y: point.x * sin + point.y * cos,
        }));
    }
}

export class Rectangle {
    constructor(
        public top_left: Point,
        public dims: Point,
    ) {}
    public getLocations(offsets: Partial<Point>[]): Point[] {
        return offsets.map((offset) => this.getLocation(offset));
    }
    public getLocation(offset: Partial<Point>): Point {
        const _offset = {...{x:0, y:0}, ...offset};
        return Point.mulsum(this.top_left, {x: _offset.x * this.dims.x, y: _offset.y * this.dims.y});
    }
    public midpoint(): Point {
        return this.getLocation({x: 0.5, y: 0.5});
    }
    get width(): number {
        return this.dims.x;
    }
    get height(): number {
        return this.dims.y;
    }
    public relativeLocations(offsets: Partial<Point>[]): Point[] {
        const _offsets = offsets.map(offset => this.getLocation(offset));
        const relativeOffsets: Point[] = [];
        let current = _offsets[0];
        relativeOffsets.push(current);
        for (const offset of _offsets.slice(1)) {
            relativeOffsets.push({
                x: offset.x - current.x,
                y: offset.y - current.y,
            });
            current = offset;
        }
        return relativeOffsets;
    }
    public relative(new_origin: Point): Rectangle {
        return new Rectangle(
            {
                x: this.top_left.x - new_origin.x,
                y: this.top_left.y - new_origin.y,
            },
            this.dims
        );
    }
    get bottom_right(): Point {
        return this.getLocation({x:1, y:1});
    }
    get left(): number {
        return this.top_left.x;
    }
    get top(): number {
        return this.top_left.y;
    }
    get right(): number {
        return this.top_left.x + this.dims.x;
    }
    get bottom(): number {
        return this.top_left.y + this.dims.y;
    }
    static bounding_rectangle(rectangles: Rectangle[]): Rectangle {
        const left = Math.min(...rectangles.map(r => r.left));
        const top = Math.min(...rectangles.map(r => r.top));
        const right = Math.max(...rectangles.map(r => r.right));
        const bottom = Math.max(...rectangles.map(r => r.bottom));
        return new Rectangle(
            new Point(left, top),
            new Point(right - left, bottom - top),
        );
    }
    public pad(padding: Point): Rectangle {
        return new Rectangle(
            {x: this.top_left.x - padding.x, y: this.top_left.y - padding.y},
            {x: this.dims.x + 2 * padding.x, y: this.dims.y + 2 * padding.y},
        )
    }
}