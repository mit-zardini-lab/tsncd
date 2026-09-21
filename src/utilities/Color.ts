
function clip(x: number, min: number = 0, max: number = 1): number {
    return Math.max(min, Math.min(max, x));
}

export abstract class Color {
    static from_css(value: string): Color | undefined {
        const normalized = value.trim().toLowerCase();
        const named = CSS_COLOR_HEX[normalized];
        if (named !== undefined) {
            return Color.from_hex(named);
        }
        if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(normalized)) {
            return Color.from_hex(normalized);
        }
        const rgb = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*[\d.]+)?\s*\)$/.exec(normalized);
        if (rgb) {
            return new RGBColor(clip(Number(rgb[1]) / 255),
                clip(Number(rgb[2]) / 255), clip(Number(rgb[3]) / 255));
        }
        const hsl = /^hsla?\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%(?:\s*,\s*[\d.]+)?\s*\)$/.exec(normalized);
        return hsl ? Color.from_h360sl(Number(hsl[1]),
            Number(hsl[2]) / 100, Number(hsl[3]) / 100) : undefined;
    }
    static from_h360sl(hue360: number, saturation: number, lightness: number): Color {
        const boundedLightness = clip(lightness);
        const value = boundedLightness + clip(saturation)
            * Math.min(boundedLightness, 1 - boundedLightness);
        return Color.from_h360sv(hue360,
            value === 0 ? 0 : 2 * (1 - boundedLightness / value), value);
    }
    static from_h360sv(hue360: number, s: number = 1, v: number = 1): Color {
        const sextant = ((hue360 % 360) + 360) % 360 / 60;
        const chroma = s * v;
        const minimum = v - chroma;
        return new RGBColor(
            clip(Math.abs(sextant - 3) - 1) * chroma + minimum,
            clip(2-Math.abs(sextant - 2)) * chroma + minimum,
            clip(2-Math.abs(sextant - 4)) * chroma + minimum,
        )
    }
    static from_hex(hex: string): Color {
        if (hex.startsWith('#')) {
            hex = hex.slice(1);
        }
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        if (hex.length !== 6) {
            throw new Error('Invalid hex color');
        }
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;
        return new RGBColor(r, g, b);
    }
    get rgb(): [number, number, number] {
        return [this.red, this.green, this.blue];
    }
    abstract get red(): number;
    abstract get green(): number;
    abstract get blue(): number;
    get chroma(): number {
        return Math.max(...this.rgb) - Math.min(...this.rgb);
    }
    blend(other: Color, weight: number): Color {
        const amount = clip(weight);
        return new RGBColor(
            this.red + (other.red - this.red) * amount,
            this.green + (other.green - this.green) * amount,
            this.blue + (other.blue - this.blue) * amount,
        );
    }
    with_minimum_luminance(minimum: number): Color {
        const target = clip(minimum);
        return this.luminance >= target ? this
            : this.blend(new RGBColor(1, 1, 1),
                (target - this.luminance) / (1 - this.luminance));
    }
    get rgb256(): [number, number, number] {
        return this.rgb.map(x => Math.round(x * 255)) as [number, number, number];
    }
    hex(): string {
        const [r, g, b] = this.rgb256;
        const hex_string = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        return hex_string;
    }
    get luminance(): number {
        // Using the Rec. 709 formula for relative luminance
        return 0.2126 * this.red + 0.7152 * this.green + 0.0722 * this.blue;
    }
    background_contrast_color(): Color {
        return this.luminance > 0.5 ? new RGBColor(0, 0, 0) : new RGBColor(1, 1, 1);
    }


    get hsv(): [number, number, number] {
        return [this.hue360, this.s01, this.v01];
    }
    get hue360(): number {
        const [r, g, b] = this.rgb;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        if (max === min) return 0;
        let h: number;
        if (max === r) h = 60 * ((g - b) / (max - min));
        else if (max === g) h = 60 * (2 + (b - r) / (max - min));
        else h = 60 * (4 + (r - g) / (max - min));
        return (h + 360) % 360;
    }
    get s01(): number {
        return this.chroma === 0 ? 0 : this.chroma / Math.max(...this.rgb);
    }
    get v01(): number {
        return Math.max(...this.rgb);
    }
}

export class RGBColor extends Color {
    constructor(
        public readonly red01: number,
        public readonly green01: number,
        public readonly blue01: number,
    ) {
        super();
    }
    get red(): number {
        return this.red01;
    }
    get green(): number {
        return this.green01;
    }
    get blue(): number {
        return this.blue01;
    }
}

const CSS_COLOR_HEX: Readonly<Record<string, string>> = {
    black: '#000000', white: '#ffffff', gray: '#808080', grey: '#808080',
    lightgray: '#d3d3d3', lightgrey: '#d3d3d3', darkgray: '#a9a9a9', darkgrey: '#a9a9a9',
    red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
    orange: '#ffa500', purple: '#800080', pink: '#ffc0cb',
};
