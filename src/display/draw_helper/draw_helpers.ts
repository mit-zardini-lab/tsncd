import * as Curve from '../../utilities/Curve';
import * as pt from '../../utilities/Point';

export function new_element(className: string, parent?: HTMLElement): HTMLDivElement {
	const element = document.createElement('div');
	element.className = className;
	if (parent != null) {
		parent.appendChild(element);
	}
	return element;
}
export function new_svg(parent: HTMLElement): SVGSVGElement {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('x','-50%');
	svg.setAttribute('y','-50%')
	svg.setAttribute('width','100%');
	svg.setAttribute('height','100%');
	parent.appendChild(svg);
	return svg;
}
// ################## //
// # SVG Operations # //
// ################## //

export function createRect(
	svg: SVGSVGElement,
	x: string = '0px',
	y: string = '0px',
	width: string = '100%',
	height: string = '100%',
	stroke: string = "blue",
	strokeWidth: string = "3",
) {
	const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
	const attrs = {
		'x': x,
		'y': y,
		'width': width,
		'height': height,
		'stroke': stroke,
		'fill-opacity': '0',
		'strokeWidth': strokeWidth
	}
	Object.entries(attrs).forEach(([key, value]) => {
		rect.setAttribute(key, value);
	});
	svg.appendChild(rect);
	return rect;
}
// interface lineAttrs {
//   x1: string,
//   y1: string,
//   x2: string,
//   y2: string,
//   color: string,
//   width: string,

// }
export function createLine(
	svg: SVGSVGElement,
	x1: Number | string = '0%',
	y1: Number | string = '50%',
	x2: Number | string = '100%',
	y2: Number | string = '50%',
	color: string = 'black',
	width: Number | string = 1,
 ): SVGLineElement {
	const line = document.createElementNS('http://www.w3.org/2000/svg','line');
	const attrs = {
		'x1': x1.toString(),
		'y1': y1.toString(),
		'x2': x2.toString(),
		'y2': y2.toString(),
		'stroke': color,
		'stroke-width': width.toString()
		// 'stroke-dasharray': '10,10'
	};
	Object.entries(attrs).forEach(([key, value]) => {
		line.setAttribute(key, value);
	});
	svg.appendChild(line);
	return line;
}

export function setAttributes(target: SVGElement, kwargs: object){
	Object.entries(kwargs).forEach(([key, value]) => {
		target.setAttribute(key, value);
	});
	return target;
}

export interface LineAttrs {
	'stroke': string,
	'stroke-width': string,
	'stroke-dasharray'?: string, 
}

export const defaultLineAttrs: LineAttrs = {
	'stroke': 'black',
	'stroke-width': '1px',
}

export function createLineCoords(
	svg: SVGSVGElement,
	p0: Point,
	p1: Point,
	attrs?: LineAttrs,
): SVGLineElement {
	const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
	line.setAttribute('x1', p0.x.toString());
	line.setAttribute('y1', p0.y.toString());
	line.setAttribute('x2', p1.x.toString());
	line.setAttribute('y2', p1.y.toString());
	attrs = attrs ?? defaultLineAttrs;
	Object.entries(attrs).map(
		([key, value]) => line.setAttribute(key, value)
	);
	svg.appendChild(line);
	return line;
}

export function createFloatingText(
	text: string,
	left: number | string,
	top:  number | string,
	parent?: HTMLDivElement,
): HTMLDivElement {
	const floating_text = new_element('floating-text', parent);
	floating_text.className = 'floating-text';
	floating_text.textContent = text;
	floating_text.style.left = left.toString();
	floating_text.style.top = top.toString();
	return floating_text;
}

export function curvedCup(
	svg: SVGSVGElement,
	p0: Point,
	p1: Point,
	lineAttrs: LineAttrs = defaultLineAttrs,
): SVGPathElement {
	const delta = pointDelta(p0, p1);
	const cx0 = {x: p0.x - delta.y*2/3, y: p0.y};
	const cx1 = {x: p1.x - delta.y*2/3, y: p1.y};
  	const pathData = `M ${p0.x} ${p0.y} C ${cx0.x} ${cx0.y} ${cx1.x} ${cx1.y} ${p1.x} ${p1.y}`;
	const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
	path.setAttribute("d", pathData);
	path.setAttribute('fill','none');
	applyAttrs(path, lineAttrs);
	svg.appendChild(path);
	return path	
}

export function polygon(
	svg: SVGSVGElement,
	points: Point[],
	color: string = 'black'): SVGPolygonElement {
	const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
	for (const point of points) {
		const svg_point = svg.createSVGPoint();
		svg_point.x = point.x;
		svg_point.y = point.y;
		polygon.points.appendItem(svg_point);
	}
	polygon.setAttribute('stroke', color);
	polygon.setAttribute('stroke-width','2');
	polygon.setAttribute('fill','none');
	svg.appendChild(polygon);
	return polygon;
}

export interface PolygonAttrs extends LineAttrs {
	fill: string
}

const defaultPolygonAttrs: PolygonAttrs = {
	...defaultLineAttrs,
	fill: 'none',
}

export function deltaPolygon(
	svg: SVGSVGElement,
	points: Point[],
	lineAttrs: Partial<PolygonAttrs> = {},
): SVGPolygonElement {
	lineAttrs = {...defaultPolygonAttrs, ...lineAttrs}
	const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
	let tracker: Point = {x:0,y:0};
	for (const point of points) {
		tracker = pointAdd(tracker, point);
		const svg_point = svg.createSVGPoint();
		svg_point.x = tracker.x;
		svg_point.y = tracker.y;
		polygon.points.appendItem(svg_point);
	}
	setAttributes(polygon, lineAttrs);
	svg.appendChild(polygon);
	return polygon;
}

export function polyline(
	svg: SVGSVGElement,
	points: Point[],
	lineAttrs: Partial<LineAttrs> = defaultLineAttrs,
): SVGPolylineElement {
	lineAttrs = {...defaultLineAttrs, ...lineAttrs}
	const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
	for (const point of points) {
		const svg_point = svg.createSVGPoint();
		svg_point.x = point.x;
		svg_point.y = point.y;
		polyline.points.appendItem(svg_point);
	}
	setAttributes(polyline, lineAttrs);
	svg.appendChild(polyline);
	return polyline;
}

let dropShadowCount = 0;

/*
 * `url(#…)` resolves document-wide, not within the referring SVG, so every
 * drop shadow sharing one id means the whole document answers to whichever
 * definition happens to come first. That was invisible while a single diagram
 * owned the page - the definitions are identical - but a second render target
 * puts another set of them in the document, and the visible diagram's shadows
 * start resolving against a subtree it has nothing to do with. Hence one id
 * per SVG layer, minted once and reused.
 */
export function addDropShadow(svg: SVGSVGElement, target: SVGElement) {
	let id = svg.dataset.dropShadowId;
	if (!id) {
		id = `drop-shadow-${++dropShadowCount}`;
		svg.dataset.dropShadowId = id;

		// Note the selector: this looked for 'svg' rather than 'defs', so it
		// never found one and appended a fresh <defs> on every call.
		let defs = svg.querySelector('defs');
		if (!defs) {
			defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
			svg.appendChild(defs);
		}

		// Create filter element
		const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
		filter.id = id;
		filter.setAttribute('x', '-50%');
		filter.setAttribute('y', '-50%');
		filter.setAttribute('width', '200%');
		filter.setAttribute('height', '200%');

		// Create drop shadow effect
		const dropShadow = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
		dropShadow.setAttribute('dx', '0');
		dropShadow.setAttribute('dy', '0');
		dropShadow.setAttribute('stdDeviation', '1');
		dropShadow.setAttribute('flood-color', 'rgba(0,0,0,1)');

		filter.appendChild(dropShadow);
		defs.appendChild(filter);
	}

	// Apply filter to target element
	target.style.filter = `url(#${id})`;
}

export function addDropShadowFilter(svg: SVGElement, elementId: string) {
  // Create defs element if it doesn't exist
  let defs = svg.querySelector('defs') as SVGDefsElement;
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.appendChild(defs);
  }

  // Create filter element
  const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filter.id = 'drop-shadow';
  filter.setAttribute('x', '-50%');
  filter.setAttribute('y', '-50%');
  filter.setAttribute('width', '200%');
  filter.setAttribute('height', '200%');

  // Create drop shadow effect
  const dropShadow = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
  dropShadow.setAttribute('dx', '3');
  dropShadow.setAttribute('dy', '3');
  dropShadow.setAttribute('stdDeviation', '2');
  dropShadow.setAttribute('flood-color', 'rgba(0,0,0,0.3)');

  filter.appendChild(dropShadow);
  defs.appendChild(filter);

  // Apply filter to target element
  const targetElement = svg.querySelector(`#${elementId}`) as SVGElement;
  if (targetElement) {
    targetElement.style.filter = 'url(#drop-shadow)';
  }
}

function applyAttrs(
	target: Element,
	attr: Object
) {
	Object.entries(attr).forEach(([key, value])=>
		target.setAttribute(key, value)
	);
}

export function _drawFlatCurve(
	svg: SVGSVGElement,
	p0: Point,
	p1: Point,
	attrs: LineAttrs = defaultLineAttrs,
) {
	const curve = Curve.flatCurve(p0, p1);
	if (curve instanceof Curve.StraightLine) {
		return polyline(svg, [p0, p1], attrs);
	}
	else if (curve instanceof Curve.CubicBezierCurve) {
		const pathData = `M ${p0.x} ${p0.y} C ${curve.control0.x} ${curve.control0.y} ${curve.control1.x} ${curve.control1.y} ${p1.x} ${p1.y}`;
		const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
		path.setAttribute("d", pathData);
		path.setAttribute('fill','none');
		applyAttrs(path, attrs);
		svg.appendChild(path);
		return path;
	}
}

// Legacy function - there are features here useful for later.
export function drawCurve(
	svg: SVGSVGElement,
	p0: Point,
	p1: Point,
	attrs: LineAttrs = defaultLineAttrs,
) {
	const xs = createAnchorLink(svg, p0.x, p0.y, p1.x, p1.y, 'black', 'blue');
	if (Array.isArray(xs)) {
		xs.map((x)=>applyAttrs(x, attrs));
	} else {
		applyAttrs(xs, attrs);
	}
}

export function createAnchorLink(
  svg: SVGSVGElement, 
  x1: number, 
  y1: number, 
  x2: number, 
  y2: number,
  startColor: string,
  endColor: string
): SVGPathElement | [SVGLineElement, SVGLineElement] {

  // Validate input coordinates
  if (![x1, y1, x2, y2].every(n => typeof n === 'number' && !isNaN(n) && isFinite(n))) {
    throw new Error(`Invalid coordinates: x1=${x1}, y1=${y1}, x2=${x2}, y2=${y2}`);
  }
  // Generate unique gradient ID for this path
  const gradientId = `gradient_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Create defs if it doesn't exist
  let defs = svg.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    svg.appendChild(defs);
  }
  
  // Create sharp gradient for this specific path
  const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
  gradient.setAttribute("id", gradientId);
  gradient.setAttribute("x1", "0%");
  gradient.setAttribute("y1", "0%");
  gradient.setAttribute("x2", "100%");
  gradient.setAttribute("y2", "0%");
  
  // Sharp transition stops at 50%
  const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  stop1.setAttribute("offset", "50%");
  stop1.setAttribute("style", `stop-color:${startColor};stop-opacity:1`);
  
  const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  stop2.setAttribute("offset", "50%");
  stop2.setAttribute("style", `stop-color:${endColor};stop-opacity:1`);
  
  gradient.appendChild(stop1);
  gradient.appendChild(stop2);
  defs.appendChild(gradient);
  
  // Calculate control points for horizontal tangents
  const deltaX = x2 - x1;
  const deltaY = y2 - y1;
  const controlDistance = Math.abs(deltaX) * 0.4;
  
  if (Math.abs(deltaY) < 1){
	const line0 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
	line0.setAttribute('x1',x1.toString());
	line0.setAttribute('y1',y1.toString());
	line0.setAttribute('x2',(x1+deltaX/2).toString());
	line0.setAttribute('y2',(y1+deltaY/2).toString());
	line0.setAttribute('stroke', startColor); //`url(#${gradientId})`);
	line0.setAttribute('stroke-width', '2');
	svg.appendChild(line0);

	const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
	line1.setAttribute('x1',(x1+deltaX/2).toString());
	line1.setAttribute('y1',(y1+deltaY/2).toString());
	line1.setAttribute('x2',x2.toString());
	line1.setAttribute('y2',y2.toString());
	line1.setAttribute('stroke', endColor); //`url(#${gradientId})`);
	line1.setAttribute('stroke-width', '2');
	svg.appendChild(line1);

	return [line0, line1];
  }

  
  const cx1 = x1 + controlDistance;
  const cy1 = y1;
  const cx2 = x2 - controlDistance;
  const cy2 = y2;
  
  // Format numbers to 2 decimal places to avoid precision issues
  const formatNum = (n: number) => Math.round(n * 100) / 100;
  
  // Create cubic Bezier path with horizontal tangents
  const pathData = `M ${formatNum(x1)} ${formatNum(y1)} C ${formatNum(cx1)} ${formatNum(cy1)} ${formatNum(cx2)} ${formatNum(cy2)} ${formatNum(x2)} ${formatNum(y2)}`;
  
  // Create the path element
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathData);
  path.setAttribute("stroke", `url(#${gradientId})`);
  path.setAttribute("stroke-width", "2");
  path.setAttribute("fill", "none");

  svg.appendChild(path);
  return path;
}

export interface Point {
	x: number,
	y: number
}

export function toPoint(x: HTMLElement): Point {
	const rect = x.getBoundingClientRect();
	return {
		x:(rect.left+rect.right)/2, 
		y:(rect.top+rect.bottom)/2
	}
}

export function pointsMidPoint(...xs: Point[]) {
	const xy = xs.reduce(
		([x,y], next)=>
		([x+next.x,y+next.y]),
		[0,0]);
	xy[0] = xy[0] / xs.length;
	xy[1] = xy[1] / xs.length;
	return {x:xy[0],y:xy[1]};
}

export function midpoint(...xs: HTMLDivElement[]):Point{
	return pointsMidPoint(...xs.map((x)=>toPoint(x)));
}
export function absoluteMidpoint(...xs: HTMLDivElement[]):Point{
	const top = Math.min(...xs.map((x)=>x.getBoundingClientRect().top));
	const bottom = Math.max(...xs.map((x)=>x.getBoundingClientRect().bottom));
	const left = Math.min(...xs.map((x)=>x.getBoundingClientRect().left));
	const right = Math.max(...xs.map((x)=>x.getBoundingClientRect().right));
	return {x: (left + right)/2, y: (top + bottom) / 2};

}
export function pointDelta(x: Point, y: Point): Point {
	return {x:x.x - y.x, y:x.y - y.y};
}
export function pointAdd(x: Point, y: Point): Point {
	return {x:x.x+y.x, y:x.y+y.y};
}
export function pointMul(scaler: number, p0: Point) {
	return {x: scaler * p0.x, y: scaler * p0.y};
}
export function pointSum(...xs: (Point | [number, Point])[]): Point {
	return xs.reduce<Point>((acc, x)=>{
		const y: Point = Array.isArray(x) ? pointMul(...x) : x;
		return {x: acc.x + y.x, y: acc.y + y.y};
	}, {x:0,y:0});
}

export function transformOffset(p0: Point): string {
	return `translate(${p0.x}px, ${p0.y}px)`;
}


interface Elemental {
	element: HTMLDivElement
}
export class TransformHandler<T extends Elemental> {
	private _scale: Point = {x:1,y:1};
	private _translate: Point = {x:0,y:0};
	constructor(
		private target: T,
	){}
	get scale() {
		return this._scale;
	}
	set scale(_scale: Point) {
		this._scale = _scale;
		this.set_transform();
	}
	get offset() {
		return this._translate;
	}
	set offset(_offset: Point) {
		this._translate = _offset;
		this.set_transform();
	}
	private transform_str(): string {
		return `scale(${this._scale.x}, ${this.scale.y}) translate(${this._translate.x/this._scale.x}px, ${this._translate.y/this._scale.y}px)`
	}
	public set_transform(): void {
		this.target.element.style.transform = this.transform_str();
	}
}

function pixelPoint(point: Point) {
	return {x: `${point.x}px`, y: `${point.y}px`}
}

export function pointRect(
	svg: SVGSVGElement,
	top_left: Point,
	width_height: Point,
	args: Partial<PolygonAttrs> = {},
) {
	args = {...defaultPolygonAttrs, ...args} 
	const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
	const attrs = {
		'x': pixelPoint(top_left).x,
		'y': pixelPoint(top_left).y,
		'width': pixelPoint(width_height).x,
		'height': pixelPoint(width_height).y,
	}
	setAttributes(rect, attrs);
	setAttributes(rect, args);
	svg.appendChild(rect);
	return rect;
}