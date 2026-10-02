// Claude Opus 5.5 (1M context), effort 40.
/*
 * The selector between the variants a page carries, and the switch that draws
 * the variant chosen.
 *
 * A page written with a `tsncd-variants` element carries several variants of
 * one model: the Decode, Cached and Training forms, each quantised and
 * unquantised. `draw_variant_selector` draws a dropdown after the rules of the
 * lab website's selector in `_includes/diagram-viewer.html` and
 * `css/diagrams.css`. Its summary names the group and the title of the variant
 * on display beside a triangle that turns while the dropdown is open, and its
 * panel lists each group under a small uppercase label, with every variant as
 * a title and a line of detail and the variant on display marked. The rules
 * are in `public/index.html`, and `with_variant_selector` sets the colours
 * they read for the theme of every draw, so the selector reads in a light
 * figure and in a dark one.
 *
 * The selector is the first group of the row of controls that
 * `displaySelector.with_display_controls` draws under the heading, before the
 * buttons of the form and of the theme, wherever the page carries two or more
 * variants. The row, the selector with it, is hidden where `settings.controls`
 * is `hidden`, because the lab website embeds a page with `controls=hidden`
 * and draws a toolbar of its own, with a selector of variants that the page's
 * `tsncd-state` messages fill.
 *
 * `make_variant_switch` draws a variant through the same `termPass` the page
 * draws every figure with. The variant is reached four ways: the selector,
 * the query parameter `variant` of the page's address, a
 * `{type: 'tsncd-display', variant}` message posted to the window, and
 * `window.tsncd.variant(id)`, the last three through the page switch of
 * `pageChoices.ts`, which refuses a variant the page does not offer. A
 * variant asked for while another is being prepared replaces it, and the
 * switch draws the variant asked for last. Each option of the selector is a
 * link to the page's address naming its variant and the form and the theme on
 * display, and the links are written again after every draw. `PROTOCOL.md`
 * states the mechanism under *A page that carries several variants*.
 */
import * as rhs from '../display/Render/RenderHandlerSettings';
import * as DiagramTheme from '../display/Render/DiagramTheme';
import * as variantFigures from './variantFigures';
import * as displaySelector from './displaySelector';
import type * as embedded_variants from '../data_transfer/embedded_variants';
import type * as drt from '../display/diagramRenderTarget';

/*
 * The settings a variant is drawn with. `own` is what the page makes of the
 * variant's own settings, after the address, the system's theme and a choice
 * made before any figure. Once a figure is on display, the form and the theme it
 * is drawn in are kept, so a reader who chose them keeps them from one variant
 * to the next. The wrap width is not kept, because each variant carries a
 * width of its own. `chosen` is a form, a theme or a width asked for together
 * with the variant, and wins over both, which is how a width the reader typed
 * reaches the next variant.
 */
export function settings_for_variant(
    own: rhs.RenderHandlerSettings,
    displayed: rhs.RenderHandlerSettings | undefined,
    chosen: displaySelector.DisplayChoice = {},
): rhs.RenderHandlerSettings {
    const merged = {...rhs.defaultRenderHandlerSettings, ...own};
    const kept = displayed === undefined
        ? merged
        : {...merged, form: displayed.form, darkMode: displayed.darkMode};
    return displaySelector.settings_with_choice(kept, chosen);
}

export interface VariantSwitchContext {
    figures: variantFigures.VariantFigures;
    /* Draws the figure of the variant `id` with `chosen` applied. */
    draw: (
        id: string,
        figure: variantFigures.VariantFigure,
        chosen: displaySelector.DisplayChoice,
    ) => void;
    announce: variantFigures.Announce;
    /* Removes the loading screen where nothing is left to draw. */
    dismiss: () => void;
    report_failure: (error: unknown) => void;
    /* Resolves once the page has painted the figure drawn last. */
    settled: () => Promise<void>;
    /* Told the id of every variant once it is drawn. */
    drawn: (id: string) => void;
}

/*
 * `variant` draws the variant `id` with the form and the theme `chosen` names
 * and resolves once the page has painted the variant asked for last, which is
 * `id` unless another was asked for while it was prepared. The choices of
 * form and theme made with requests that were replaced are kept for the draw,
 * each over the one before. A request for the variant on display with no
 * choice draws nothing. It rejects for an id the page does not carry and for
 * a variant that could not be built. `current` is the variant on display.
 */
export interface VariantSwitch {
    variant: (id: string, chosen?: displaySelector.DisplayChoice) => Promise<void>;
    current: () => string | undefined;
}

export function make_variant_switch(context: VariantSwitchContext): VariantSwitch {
    const repository = context.figures.repository;
    let wanted: string | undefined;
    let chosen_with_wanted: displaySelector.DisplayChoice = {};
    let drawn: string | undefined;
    let steps: Promise<void> = Promise.resolve();

    async function draw_the_variant_wanted(): Promise<void> {
        const id = wanted;
        if (id === undefined
            || (id === drawn && Object.keys(chosen_with_wanted).length === 0)) {
            context.dismiss();
            return;
        }
        const label = variantFigures.variant_label(repository, repository.variant(id));
        const figure = await context.figures.figure_of(id, context.announce);
        if (wanted !== id) {
            return;
        }
        await context.announce(`Drawing ${label}…`);
        if (wanted !== id) {
            return;
        }
        const chosen = chosen_with_wanted;
        chosen_with_wanted = {};
        context.draw(id, figure, chosen);
        drawn = id;
        context.drawn(id);
        await context.settled();
    }

    return {
        variant: (id: string, chosen: displaySelector.DisplayChoice = {}): Promise<void> => {
            if (!repository.has_variant(id)) {
                return Promise.reject(new Error(
                    `No variant has the id ${JSON.stringify(id)}. The page carries `
                    + `${repository.variants.variants.map((v) => v.id).join(', ')}.`));
            }
            wanted = id;
            chosen_with_wanted = {...chosen_with_wanted, ...chosen};
            const step = steps.then(draw_the_variant_wanted);
            steps = step.catch((error: unknown) => context.report_failure(error));
            return step;
        },
        current: (): string | undefined => drawn,
    };
}

/* The colours the rules of the selector read, for a figure drawn in the
 * theme `settings` names. The surface and the ink are the canvas and the ink
 * of the figure. The rest follow the lab website's viewer in the light theme
 * and are lightened to read on the dark canvas in the dark one. */
interface SelectorColours {
    ink: string;
    muted: string;
    line: string;
    panel: string;
    surface: string;
    accent: string;
    focus: string;
}

const LIGHT_SELECTOR_COLOURS = {
    muted: '#666666', line: '#d6d6d6', panel: '#f5f5f5',
    accent: '#750014', focus: '#2864b7',
};
const DARK_SELECTOR_COLOURS = {
    muted: '#a3a3a3', line: '#4a4a4a', panel: '#2a2a2a',
    accent: '#ef8a98', focus: '#86b0ec',
};

export function selector_colours(settings: rhs.RenderHandlerSettings): SelectorColours {
    const merged = {...rhs.defaultRenderHandlerSettings, ...settings};
    const surface = DiagramTheme.surfaceColors(merged);
    return {
        ink: surface.color,
        surface: surface.backgroundColor,
        ...(merged.darkMode === false ? LIGHT_SELECTOR_COLOURS : DARK_SELECTOR_COLOURS),
    };
}

/* The selector's element, and the two things written into it after a draw:
 * the variant on display, and the address each option links to. */
export interface VariantSelector {
    node: HTMLDetailsElement;
    mark_current: (id: string) => void;
    link_options: (address_of_variant: (id: string) => string) => void;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function triangle_indicator(page: Document): SVGSVGElement {
    const svg = page.createElementNS(SVG_NAMESPACE, 'svg');
    svg.setAttribute('class', 'variant-selector-indicator');
    svg.setAttribute('width', '10');
    svg.setAttribute('height', '7');
    svg.setAttribute('viewBox', '0 0 10 7');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = page.createElementNS(SVG_NAMESPACE, 'path');
    path.setAttribute('d', 'M0 0H10L5 7Z');
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    return svg;
}

function text_span(page: Document, class_name: string, text: string): HTMLSpanElement {
    const span = page.createElement('span');
    span.className = class_name;
    span.textContent = text;
    return span;
}

function is_plain_click(event: MouseEvent): boolean {
    return event.button === 0 && !event.ctrlKey && !event.metaKey
        && !event.shiftKey && !event.altKey;
}

/*
 * The option of one variant: a link to the page's address naming the variant,
 * holding its title and its detail. A plain click is answered in place, and
 * a modified click follows the link.
 */
function variant_option(
    page: Document,
    variant: embedded_variants.EmbeddedVariant,
    address_of_variant: (id: string) => string,
    choose: (id: string) => void,
): HTMLAnchorElement {
    const option = page.createElement('a');
    option.href = address_of_variant(variant.id);
    option.dataset.variant = variant.id;
    option.appendChild(text_span(page, 'variant-option-title', variant.title));
    if (variant.detail) {
        option.appendChild(text_span(page, 'variant-option-detail', variant.detail));
    }
    option.addEventListener('click', (event: MouseEvent) => {
        if (!is_plain_click(event)) {
            return;
        }
        event.preventDefault();
        choose(variant.id);
    });
    return option;
}

/**
 * The selector of the variants `repository` carries, built once. `choose` is
 * called with the id of the variant a reader picks, and `mark_current` names
 * the variant on display in the summary and marks its option. Each option
 * links to `address_of_variant` of its id, and `link_options` writes the links
 * again, so that a link opened in a page of its own names the form and the
 * theme on display.
 *
 * The dropdown closes on the escape key, which returns the focus to the
 * summary, on a click outside it, and when the window loses the focus, as the
 * lab website's does. A click inside it is stopped there, because a click the
 * page answers outside every inspection box closes them all.
 */
export function draw_variant_selector(
    page: Document,
    repository: embedded_variants.VariantRepository,
    address_of_variant: (id: string) => string,
    choose: (id: string) => void,
): VariantSelector {
    const node = page.createElement('details');
    node.className = 'variant-selector';
    const summary = page.createElement('summary');
    const label = text_span(page, 'variant-selector-label', '');
    const group_name = text_span(page, 'variant-selector-group', '');
    const title = text_span(page, 'variant-selector-title', '');
    label.append(group_name, title);
    summary.append(label, triangle_indicator(page));
    const panel = page.createElement('div');
    panel.className = 'variant-options';
    const options = new Map<string, HTMLAnchorElement>();

    function close(): void {
        node.open = false;
    }

    function pick(id: string): void {
        close();
        summary.focus();
        choose(id);
    }

    repository.variants.groups.forEach((group, index) => {
        const members = repository.variants.variants
            .filter((variant) => variant.group === group.id);
        if (!members.length) {
            return;
        }
        const heading = page.createElement('p');
        heading.className = 'variant-options-group';
        heading.id = `variant-group-${index}`;
        heading.textContent = group.title;
        const list = page.createElement('ul');
        list.setAttribute('aria-labelledby', heading.id);
        members.forEach((variant) => {
            const option = variant_option(page, variant, address_of_variant, pick);
            options.set(variant.id, option);
            const item = page.createElement('li');
            item.appendChild(option);
            list.appendChild(item);
        });
        panel.append(heading, list);
    });
    node.append(summary, panel);

    node.addEventListener('click', (event: MouseEvent) => event.stopPropagation());
    node.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Escape' && node.open) {
            event.stopPropagation();
            close();
            summary.focus();
        }
    });
    page.addEventListener('click', (event: MouseEvent) => {
        if (event.target instanceof Node && !node.contains(event.target)) {
            close();
        }
    }, true);
    page.defaultView?.addEventListener('blur', close);

    return {
        node,
        mark_current: (id: string): void => {
            const variant = repository.variant(id);
            const group = repository.group_title(variant);
            group_name.textContent = group;
            title.textContent = variant.title;
            summary.setAttribute(
                'aria-label', `Choose a variant. Showing ${group}, ${variant.title}`);
            options.forEach((option, option_id) => {
                if (option_id === id) {
                    option.setAttribute('aria-current', 'true');
                } else {
                    option.removeAttribute('aria-current');
                }
            });
        },
        link_options: (address_of: (id: string) => string): void => {
            options.forEach((option, id) => {
                option.href = address_of(id);
            });
        },
    };
}

function paint_selector(node: HTMLElement, settings: rhs.RenderHandlerSettings): void {
    const colours = selector_colours(settings);
    Object.entries(colours).forEach(([name, colour]) =>
        node.style.setProperty(`--variant-${name}`, colour));
}

/**
 * `target` with the selector painted in the theme of every draw, and in the
 * theme of `settings_before_a_draw` until the first. The selector stands in
 * the row of controls that `displaySelector.with_display_controls` draws.
 */
export function with_variant_selector(
    target: drt.RenderTarget,
    selector: VariantSelector,
    settings_before_a_draw: rhs.RenderHandlerSettings,
): drt.RenderTarget {
    paint_selector(selector.node, settings_before_a_draw);
    return {
        container: target.container,
        termPass: (term, settings, auxiliary): void => {
            target.termPass(term, settings, auxiliary);
            paint_selector(selector.node, settings ?? {});
        },
    };
}
