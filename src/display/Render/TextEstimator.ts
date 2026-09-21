import * as pt from '../../utilities/Point';

const BASE_FONT_SIZE = 16;
const KATEX_FONT_FACTOR = 1.21;
const HORIZONTAL_PADDING = 8;
const VERTICAL_PADDING = 4;
const SCRIPT_WIDTH_FACTOR = 1.1;

function character_width(character: string): number {
    if (/[A-Z]/.test(character)) { return 0.68; }
    if (/[a-z]/.test(character)) { return 0.53; }
    if (/[0-9]/.test(character)) { return 0.5; }
    if (/[=+\-<>]/.test(character)) { return 0.58; }
    if (/[()[\]{}]/.test(character)) { return 0.38; }
    if (/[.,:;|]/.test(character)) { return 0.28; }
    return 0.5;
}

function group_end(latex: string, start: number): number {
    if (latex[start] !== '{') { return start + 1; }
    let depth = 1;
    let index = start + 1;
    while (index < latex.length && depth > 0) {
        if (latex[index] === '{') { depth += 1; }
        if (latex[index] === '}') { depth -= 1; }
        index += 1;
    }
    return index;
}

function group_width(latex: string, start: number): [number, number] {
    const end = group_end(latex, start);
    return [latex_width(latex.slice(start + 1, Math.max(start + 1, end - 1))), end];
}

function command_width(command: string): number {
    if (command === 'quad') { return 1; }
    if (command === 'qquad') { return 2; }
    if (command === ' ') { return 0.28; }
    if (command === 'cdot') { return 0.32; }
    // KaTeX sets the three letters of the name and a thick space on each side.
    if (command === 'bmod') { return 1.9; }
    if (command === 'oplus' || command === 'otimes') { return 0.82; }
    if (command === 'times' || command === 'circ') { return 0.58; }
    if (command === 'in') { return 0.62; }
    if (command === 'top' || command === 'bot') { return 0.56; }
    if (command === 'sum' || command === 'prod') { return 0.82; }
    if (command === 'partial' || command === 'nabla') { return 0.64; }
    return 0.75;
}

function latex_width(latex: string): number {
    let width = 0;
    let index = 0;
    while (index < latex.length) {
        const character = latex[index];
        if (character === '\\') {
            const command_match = latex.slice(index + 1).match(/^[a-zA-Z]+/);
            const command = command_match?.[0] ?? latex[index + 1] ?? '';
            index += command.length + 1;
            if (command === 'left' || command === 'right' || command === 'displaystyle') {
                continue;
            }
            if (['text', 'mathrm', 'mathtt', 'mathbb', 'mathbf', 'operatorname',
                 'textcolor'].includes(command) && latex[index] === '{') {
                if (command === 'textcolor') {
                    index = group_end(latex, index);
                }
                const [content_width, end] = group_width(latex, index);
                width += content_width;
                index = end;
                continue;
            }
            if (command === 'frac' || command === 'dfrac' || command === 'tfrac') {
                const [numerator, numerator_end] = group_width(latex, index);
                const [denominator, denominator_end] = group_width(latex, numerator_end);
                width += Math.max(numerator, denominator) + 0.24;
                index = denominator_end;
                continue;
            }
            width += command_width(command);
            continue;
        }
        if (character === '^' || character === '_') {
            index += 1;
            const [script_width, end] = latex[index] === '{'
                ? group_width(latex, index)
                : [character_width(latex[index] ?? ''), index + 1];
            width += script_width * SCRIPT_WIDTH_FACTOR;
            index = end;
            continue;
        }
        if (character === '{' || character === '}') {
            index += 1;
            continue;
        }
        if (/\s/.test(character)) {
            width += 0.28;
            index += 1;
            continue;
        }
        width += character_width(character);
        index += 1;
    }
    return width;
}

function latex_height(latex: string): number {
    let height = 1;
    let index = 0;
    while (index < latex.length) {
        const character = latex[index];
        if (character === '\\') {
            const command_match = latex.slice(index + 1).match(/^[a-zA-Z]+/);
            const command = command_match?.[0] ?? latex[index + 1] ?? '';
            index += command.length + 1;
            if (command === 'frac' || command === 'dfrac' || command === 'tfrac') {
                const numerator_end = group_end(latex, index);
                const numerator_height = latex_height(
                    latex.slice(index + 1, Math.max(index + 1, numerator_end - 1)));
                const denominator_end = group_end(latex, numerator_end);
                const denominator_height = latex_height(
                    latex.slice(numerator_end + 1,
                        Math.max(numerator_end + 1, denominator_end - 1)));
                height = Math.max(
                    height, 0.25 + 0.62 * (numerator_height + denominator_height));
                index = denominator_end;
                continue;
            }
            if (['text', 'mathrm', 'mathtt', 'mathbb', 'mathbf', 'operatorname',
                 'textcolor'].includes(command) && latex[index] === '{') {
                if (command === 'textcolor') {
                    index = group_end(latex, index);
                }
                index = group_end(latex, index);
            }
            continue;
        }
        if (character === '^' || character === '_') {
            index += 1;
            const end = group_end(latex, index);
            const script_height = latex_height(
                latex.slice(index + (latex[index] === '{' ? 1 : 0),
                    Math.max(index + 1, end - (latex[index] === '{' ? 1 : 0))));
            height = Math.max(height, 1 + 0.42 * script_height);
            index = end;
            continue;
        }
        index += 1;
    }
    return height;
}

/* The width of the widest of `lines` as KaTeX sets it, with no padding. */
export function estimate_bare_text_width(
    lines: readonly string[],
    font_size: number = 0.65,
): number {
    const longest_line = Math.max(0, ...lines.map(latex_width));
    return longest_line * BASE_FONT_SIZE * KATEX_FONT_FACTOR * font_size;
}

export function estimate_text_dims(
    lines: readonly string[],
    font_size: number = 0.65,
): pt.Point {
    const text_height = Math.max(1, lines.reduce(
        (total, line) => total + latex_height(line), 0));
    return {
        x: HORIZONTAL_PADDING + estimate_bare_text_width(lines, font_size),
        y: VERTICAL_PADDING
            + text_height * BASE_FONT_SIZE * KATEX_FONT_FACTOR * font_size,
    };
}
