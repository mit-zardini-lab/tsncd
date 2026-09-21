import type {KatexOptions} from 'katex';

/*
 * KaTeX carries no `\mathbbm`, the command the `bbm` package gives, so the
 * indicator `nm.IsPositive` prints arrives as an undefined control sequence
 * and draws in the error colour. `\mathbb` is the command KaTeX has for the
 * blackboard bold face, and two facts rule it out. Its KaTeX_AMS file holds
 * the uppercase letters and no digit, so `\mathbb{1}` draws the `1` of the
 * browser's fallback face. `\mathbb{1}` is also the universal unit, per
 * `pyncd`'s `obsidian/02-categories/The Universal Unit.md`, which the
 * indicator may not draw as. Two ones from KaTeX_Main under a negative kern
 * draw the doubled stem out of the face the rest of the label is set in.
 */
const MACROS: Record<string, string> = {
    '\\mathbbm': '{#1\\mkern-6mu#1}',
};

/** The options every `katex.render` call in this package starts from. An
 * unparseable label draws as its own source in red rather than throwing out of
 * the update phase that drew it. */
export const KATEX_OPTIONS: KatexOptions = {
    throwOnError: false,
    macros: MACROS,
};
