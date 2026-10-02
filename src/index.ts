import * as cat from './data_structure/Category';
import * as transfer from './data_transfer/json';

import * as rhs from './display/Render/RenderHandlerSettings';
import * as addops from './display/Framework/Operations/additionalOperationBoxes';
import * as para_wrap from './para/data_structure/ParaWrap';
import * as para_block_operator from './para/data_structure/ParaBlockOperator';
import * as contravariant from './para/data_structure/Contravariant';
import * as multicategory from './para/data_structure/MultiCategory';
import * as para_wrap_display from './display/Framework/para/ParaWrapDisplay';
import * as para_wrap_broadcasted from './display/Framework/para/ParaWrapBroadcastedDisplay';

import * as advanced_display from './advanced_display';
import * as locked_highlights from './display/Render/locked_highlights';
import * as diagram_render_target from './display/diagramRenderTarget';
import * as page_heading from './display/pageHeading';
import * as loading_screen from './display/loadingScreen';
import * as wst from './data_transfer/websockets_transfer';
import * as diagram_protocol from './data_transfer/diagram_protocol';
import * as capture from './data_transfer/capture';
import * as embedded_message from './data_transfer/embedded_message';
import * as embedded_localisations from './data_transfer/embedded_localisations';
import * as embedded_variants from './data_transfer/embedded_variants';
import * as boot_message from './data_transfer/boot_message';

import * as deepseek from './deepseek/display_deepseek';
import * as affine_guards from './advanced_axis_dynamics/data_structure/AffineGuards';
import * as advanced_axis_operators from './advanced_axis_dynamics/data_structure/Operators';
import * as axis_concatenation from './advanced_axis_dynamics/data_structure/AxisConcatenation';
import * as covariant_operator_boxes from './display/Framework/advanced_axis_dynamics/covariantOperatorBoxes';
import * as guarded_axis_labels from './display/Framework/advanced_axis_dynamics/guardedAxisLabels';
import * as concatenated_axis_labels from './display/Framework/advanced_axis_dynamics/concatenatedAxisLabels';
import * as caching from './caching/data_structure/Caching';
import * as caching_boxes from './display/Framework/caching/cachingBoxes';
import * as quantization from './quantization/data_structure/Quantization';
import * as quantisation_labels from './display/Framework/quantization/quantisationLabels';
import * as arrow_renderer from './display/Framework/arrows/ArrowRenderer';
import * as box_renderer from './display/Framework/arrows/BoxRenderer';

console.log(addops);
console.log(deepseek);
class DiagramContainer {
}

document.addEventListener('DOMContentLoaded', async () => {
    cat.establish();
    para_wrap.establish();
    para_block_operator.establish();
    contravariant.establish();
    multicategory.establish();
    para_wrap_display.establish();
    para_wrap_broadcasted.establish();
    quantization.establish();
    quantisation_labels.establish();
    arrow_renderer.establish();
    box_renderer.establish();
    affine_guards.establish();
    advanced_axis_operators.establish();
    axis_concatenation.establish();
    covariant_operator_boxes.establish();
    guarded_axis_labels.establish();
    concatenated_axis_labels.establish();
    caching.establish();
    caching_boxes.establish();
    advanced_display.establish();

    /*
     * The off-screen twin, for captures that must not disturb the display.
     *
     * Parked outside the viewport rather than hidden, because the whole
     * renderer measures itself with `getBoundingClientRect` and a
     * `display: none` subtree measures zero - the diagram would come out with
     * every box collapsed onto the origin. `visibility: hidden` lays out
     * correctly but would capture as a blank image, since the clone inherits
     * it. Off to the *left*, because overflow in the negative direction does
     * not create a scrollbar.
     *
     * Parked with a transform rather than `left`, which matters more than it
     * looks. `html-to-image` seeds the clone from the computed style via
     * `cssText`, and that text carries the logical shorthand `inset-inline`
     * *after* `left`; assigning `style.left` afterwards updates `left` in
     * place, so the later shorthand still wins and the clone stays parked
     * off-frame - capturing as blank. `transform` has no such competing
     * shorthand, and the capture overwrites it outright.
     */
    function makeOffscreenContainer(): HTMLElement {
        const offscreen = document.createElement('div');
        offscreen.id = 'diagram-offscreen';
        offscreen.className = 'stack_main';
        offscreen.style.position = 'absolute';
        offscreen.style.top = '0px';
        offscreen.style.transform = 'translateX(-100000px)';
        document.body.appendChild(offscreen);
        return offscreen;
    }

    const container = document.getElementById('diagram') as HTMLElement;
    const heading = document.getElementById('page-heading') as HTMLElement;
    const loading = document.getElementById(loading_screen.LOADING_SCREEN_ID);
    const system_theme = advanced_display.system_theme_query(window);

    /*
     * The variants of a model the page carries, which are read before the
     * address is checked because the address may name one of them. A page
     * offers its variants for choice where it carries two or more, and a page
     * carrying one variant draws it with no selector.
     */
    let carried_variants: embedded_variants.EmbeddedVariants | undefined;
    try {
        carried_variants = embedded_variants.read_embedded_variants(document);
    } catch (error: unknown) {
        loading_screen.report_loading_failure(loading, error);
        throw error;
    }
    const offered = advanced_display.offered_variants(carried_variants);
    const offered_ids = advanced_display.offered_ids(offered);

    /*
     * The address is checked before anything is drawn and before a socket is
     * opened. A refused address draws no figure: the page writes the refusal
     * where the ring stood, posts it to a host page holding it in a frame, and
     * builds nothing else.
     */
    let requested: advanced_display.AddressedChoice;
    try {
        requested = advanced_display.choice_requested_by_address(document.URL, offered_ids);
    } catch (error: unknown) {
        if (!(error instanceof advanced_display.RefusedChoice)) {
            throw error;
        }
        loading_screen.report_refused_address(loading, [
            'The address of this page was refused, and no figure was drawn.',
            error.message,
        ]);
        advanced_display.post_to_host(window, advanced_display.refused_message(error.refusal));
        return;
    }
    const {variant: requested_variant, ...requested_settings} = requested;
    const variant_repository = carried_variants === undefined
        ? undefined : new embedded_variants.VariantRepository(carried_variants);

    /* The settings a message of the page's own is drawn with before any switch
     * is made: its own, in the all-broadcasted form and the system's theme,
     * below the address. */
    function settings_before_a_switch(
        own: rhs.RenderHandlerSettings | undefined,
    ): rhs.RenderHandlerSettings {
        return advanced_display.settings_for_page(
            own, requested_settings, advanced_display.system_dark_mode(system_theme));
    }

    const variant_selector = variant_repository !== undefined && offered_ids.length
        ? advanced_display.draw_variant_selector(
            document, variant_repository,
            (id: string) => advanced_display.address_of_state(
                document.URL,
                advanced_display.state_of_settings(
                    id, settings_before_a_switch(variant_repository.variants.settings))),
            (id: string) => void switch_page({variant: id}).catch((error: unknown) =>
                console.error(`The variant ${id} was not drawn:`, error)))
        : undefined;

    const controlled = advanced_display.with_display_controls(
        diagram_render_target.make_render_target(
            container, document.body, advanced_display.DIAGRAM_DECORATORS),
        heading,
        (choice) => {
            pick_theme_if_named(choice);
            return display_switch.display(choice).then(write_displayed_address);
        },
        variant_selector?.node);
    const selected = variant_selector === undefined || variant_repository === undefined
        ? controlled
        : advanced_display.with_variant_selector(
            controlled, variant_selector,
            settings_before_a_switch(variant_repository.variants.settings));
    const display = loading_screen.with_loading_screen(
        page_heading.with_page_heading(selected, heading),
        document);
    const offscreen = diagram_render_target.make_render_target(
        makeOffscreenContainer(), undefined, advanced_display.DIAGRAM_DECORATORS);

    /*
     * Whether a figure has reached the display. The boot figure is drawn only
     * where none has, so a term the relay was holding and a term a driving
     * browser renders each keep the screen.
     */
    let a_figure_has_been_drawn = false;
    /* The figure the display drew last, which a switch of form or theme draws
     * again. Every sender draws through `recording_each_draw`, so the relay
     * page holds the last term it received. */
    let held_figure: advanced_display.HeldFigure | undefined;
    /* The variant the display drew last, which a switch of form or theme keeps. */
    let variant_on_display: string | undefined;

    function displayed_state(): advanced_display.PageState | undefined {
        if (held_figure === undefined) {
            return undefined;
        }
        return advanced_display.state_of_settings(
            offered_ids.length ? variant_on_display ?? null : null, held_figure.settings);
    }

    function post_state(state: advanced_display.PageState | undefined): void {
        if (state !== undefined) {
            advanced_display.post_to_host(
                window, advanced_display.state_message(state, offered));
        }
    }

    /* The state on display written into the links of the selector's options,
     * and posted to a host page holding the page in a frame, after every draw. */
    function report_state(): void {
        const state = displayed_state();
        if (state === undefined) {
            return;
        }
        variant_selector?.link_options((id: string) =>
            advanced_display.address_of_state(document.URL, {...state, variant: id}));
        post_state(state);
    }

    /* The state on display written into the address, after a switch. The
     * address of a page no one has switched is left as it was opened, so it
     * keeps following the system's theme when it is opened again. */
    function write_displayed_address(): void {
        const state = displayed_state();
        if (state !== undefined) {
            advanced_display.write_address_of_state(window, state);
        }
    }

    function recording_each_draw(
        target: diagram_render_target.RenderTarget,
    ): diagram_render_target.RenderTarget {
        return {
            container: target.container,
            termPass: (term, settings, auxiliary) => {
                a_figure_has_been_drawn = true;
                held_figure = {
                    term,
                    settings: {...rhs.defaultRenderHandlerSettings, ...(settings ?? {})},
                    auxiliary,
                };
                target.termPass(term, settings, auxiliary);
                report_state();
            },
        };
    }

    const recorded_display = recording_each_draw(display);
    const termPass = recorded_display.termPass;
    const display_switch = advanced_display.make_display_switch({
        held: () => held_figure,
        redraw: termPass,
        settled: capture.waitForRenderSettled,
    });

    /*
     * The page's own figure is drawn again in the system's theme each time the
     * system's theme changes, until the address, a reader or a host picks a
     * theme, or a sender draws a figure of its own. An address the page has
     * already written names the theme on display, so it is written again.
     */
    const theme_follower = advanced_display.follow_system_theme(
        system_theme,
        requested_settings.darkMode === undefined,
        (dark_mode: boolean) => {
            if (held_figure === undefined) {
                return;
            }
            void display_switch.display({darkMode: dark_mode}).then(() => {
                if (new URL(document.URL).searchParams.has('darkMode')) {
                    write_displayed_address();
                }
            });
        });

    function pick_theme_if_named(choice: advanced_display.DisplayChoice): void {
        if (choice.darkMode !== undefined) {
            theme_follower.stop();
        }
    }

    /* The settings a message of the page's own is drawn with, which is the
     * message written into the page, a variant of it, or the figure it boots
     * with. A switch made before the page held a figure wins over the rest. */
    function settings_for_own_message(
        own: rhs.RenderHandlerSettings | undefined,
    ): rhs.RenderHandlerSettings {
        return advanced_display.settings_for_page(
            own,
            requested_settings,
            advanced_display.system_dark_mode(system_theme),
            display_switch.chosen_before_a_figure());
    }

    /*
     * The figures of the page's variants, built once each, and the switch
     * that draws the variant a reader, the address, a host page or a driving
     * browser asks for. A variant is drawn in the form and the theme of the
     * figure on display, and at the width and with the rows a reader chose
     * where they chose them, so a reader's choice of each holds across
     * variants, unless the request names a form or a theme of its own.
     */
    const variant_figures = variant_repository === undefined
        ? undefined : new advanced_display.VariantFigures(variant_repository);
    const variant_switch = variant_figures === undefined
        ? undefined
        : advanced_display.make_variant_switch({
            figures: variant_figures,
            draw: (id, figure, chosen) => {
                variant_on_display = id;
                termPass(
                    figure.term,
                    advanced_display.settings_for_variant(
                        settings_for_own_message(figure.settings), held_figure?.settings,
                        {...display_switch.chosen_sizing(), ...chosen}),
                    figure.auxiliary);
            },
            announce: (text) => loading_screen.show_loading_screen(document, text),
            dismiss: () =>
                document.getElementById(loading_screen.LOADING_SCREEN_ID)?.remove(),
            report_failure: (error) => {
                console.error('A variant was not drawn:', error);
                loading_screen.report_loading_failure(
                    document.getElementById(loading_screen.LOADING_SCREEN_ID), error);
            },
            settled: capture.waitForRenderSettled,
            drawn: (id) => variant_selector?.mark_current(id),
        });

    /*
     * The one switch the selector, a host page and a driving browser reach. It
     * checks a choice strictly before it changes anything, draws a variant
     * named with its form and theme in one draw, and hands a choice of form or
     * theme alone to the display switch. A choice naming a theme ends the
     * following of the system's theme, and the address is written once the
     * switch has settled.
     */
    const checked_switch = advanced_display.make_page_switch({
        offered_variants: offered_ids,
        display: (chosen: advanced_display.DisplayChoice): Promise<void> => {
            pick_theme_if_named(chosen);
            return display_switch.display(chosen);
        },
        ...(variant_switch === undefined || !offered_ids.length ? {} : {
            variant: (id: string, chosen: advanced_display.DisplayChoice): Promise<void> => {
                pick_theme_if_named(chosen);
                return variant_switch.variant(id, chosen);
            },
        }),
    });
    const switch_page: advanced_display.PageSwitch = (choice) =>
        checked_switch(choice).then(() => {
            if (Object.values(choice).some((value) => value !== undefined)) {
                write_displayed_address();
            }
        });
    advanced_display.answer_host_messages(window, {
        switch_page,
        answer_with_state: () => post_state(displayed_state()),
        answer_with_refusal: (refusal) => advanced_display.post_to_host(
            window, advanced_display.refused_message(refusal)),
    });

    async function render_payload(
        payload: string | object,
        settings?: rhs.RenderHandlerSettings,
        auxiliary?: advanced_display.DiagramAuxiliary,
    ): Promise<{width: number; height: number}> {
        const jsondata = typeof payload === 'string' ? JSON.parse(payload) : payload;
        const term = await transfer.TermJSONConverter.import(jsondata);
        termPass(
            term as diagram_render_target.DiagramFigure,
            {...rhs.defaultRenderHandlerSettings, ...(settings ?? {})},
            auxiliary,
        );
        await capture.waitForRenderSettled();
        const rect = container.getBoundingClientRect();
        return {width: rect.width, height: rect.height};
    }

    /*
     * The figure the page carries for the case where no sender chooses one.
     *
     * The term is built before the figure is claimed, and the claim and the
     * draw stand in one synchronous run, so a `dataUpdate` that arrives while
     * the 13 MB message is being fetched and imported keeps the screen. The
     * message carries its own settings and auxiliary information, and it is
     * drawn through the `termPass` the relay draws through, so its legend and
     * its inspection boxes answer the pointer as a sent figure's do.
     */
    async function draw_boot_figure(): Promise<void> {
        const message = await boot_message.fetch_boot_message();
        if (!a_figure_has_been_drawn) {
            loading_screen.paint_surface(
                document.body, settings_for_own_message(message.settings));
        }
        const term = await transfer.TermJSONConverter.import(
            JSON.parse(message.data));
        if (a_figure_has_been_drawn) {
            return;
        }
        termPass(
            term as diagram_render_target.DiagramFigure,
            {
                ...rhs.defaultRenderHandlerSettings,
                ...settings_for_own_message(message.settings),
            },
            message.auxiliary,
        );
    }

    const embedded = embedded_message.read_embedded_message(document);
    if (variant_repository !== undefined && variant_switch !== undefined) {
        const first_variant = requested_variant ?? variant_repository.variants.initial;
        const first_settings = settings_for_own_message(variant_repository.variants.settings);
        loading_screen.paint_surface(document.body, first_settings);
        post_state(advanced_display.state_of_settings(
            offered_ids.length ? first_variant : null, first_settings));
        await variant_switch.variant(first_variant)
            .catch((error: unknown) => console.error('The first variant was not drawn:', error));
    } else if (embedded === undefined) {
        const client = new wst.WebSocketClient(
            diagram_protocol.SERVER_URI,
            {
                container: recorded_display.container,
                termPass: (term, settings, auxiliary): void => {
                    theme_follower.stop();
                    termPass(term, settings, auxiliary);
                },
            },
            offscreen,
        );
        console.log(client);
        void draw_boot_figure().catch((error: unknown) => {
            console.error('The boot figure was not drawn:', error);
            if (!a_figure_has_been_drawn) {
                loading_screen.report_loading_failure(loading, error);
            }
        });
    } else {
        const own_settings = settings_for_own_message(embedded.settings);
        loading_screen.paint_surface(document.body, own_settings);
        post_state(advanced_display.state_of_settings(null, own_settings));
        await loading_screen.after_the_screen_has_painted();
        await render_payload(
            embedded.data, settings_for_own_message(embedded.settings),
            embedded.auxiliary);
    }

    /*
     * The wordings the page carries, applied to the auxiliary information of
     * the rendered figure. `termPass` hands that same object to the decorators,
     * and `attach_inspection_boxes` holds it for the container, so writing a
     * description into it reaches the box that reads the description.
     */
    const localise = advanced_display.attach_localisation_selector(
        heading,
        container,
        embedded?.auxiliary,
        embedded_localisations.read_embedded_localisations(document));

    /*
     * Control surface for a driving browser (see `pyncd`'s
     * `websocket_transfer/headless.py`). Headless capture deliberately does not
     * go through the websocket server: a batch figure rebuild should not depend
     * on a server being up, and driving the page directly makes it deterministic.
     * The render path is the same one the socket uses, so the two agree.
     */
    (window as any).tsncd = {
        /* A figure a driving browser sends is drawn with its own settings, so
         * the page stops following the system's theme. */
        render: (
            payload: string | object,
            settings?: rhs.RenderHandlerSettings,
            auxiliary?: advanced_display.DiagramAuxiliary,
        ): Promise<{width: number; height: number}> => {
            theme_follower.stop();
            return render_payload(payload, settings, auxiliary);
        },
        /* The wording of every description on the page, by the name the
         * `tsncd-localisations` element gives it. A driving browser switches
         * the wording without clicking a button, and a page carrying no
         * wordings answers by doing nothing. */
        localise,
        /* The figure on the page drawn again in the variant, the form and the
         * theme a driving browser names, which resolves once the figure is
         * drawn and rejects, having changed nothing, for a choice the page
         * refuses. A host page reaches the same switch by posting a
         * `tsncd-display` message to the window. */
        display: switch_page,
        /* The variant of the model the page carries named `id`, drawn in the
         * form and the theme on display, through the same switch. `variants`
         * lists what the page carries, and `variantTimings` how long each step
         * of preparing a variant took, in milliseconds, for a driving browser
         * to read. */
        variant: (id: string): Promise<void> => switch_page({variant: id}),
        variants: (): {id: string; group: string; title: string}[] =>
            (variant_repository?.variants.variants ?? []).map(
                ({id, group, title}) => ({id, group, title})),
        currentVariant: (): string | undefined => variant_switch?.current(),
        variantTimings: (): advanced_display.VariantTiming[] =>
            [...(variant_figures?.timings ?? [])],
        /* The rectangles an inspection box can be opened from, in page
         * coordinates, how many boxes are open and locked, how many highlights
         * a click holds locked, and how many drawn bodies and expansions wait
         * in the pool. All are here for a driving browser to read. Nothing in
         * the page reads them. */
        regions: (): advanced_display.PageRegion[] =>
            advanced_display.page_regions(),
        openBoxes: (): number => advanced_display.open_boxes(),
        lockedBoxes: (): number => advanced_display.locked_boxes(),
        lockedHighlights: (): number =>
            locked_highlights.locked_highlight_count(),
        pooledContent: (): number => advanced_display.pooled_content(),
        capture: (options?: capture.CaptureOptions) =>
            capture.captureElement(container, options),
        captureBackground: (background?: string | null): string | null =>
            capture.captureBackground(container, background),
        bounds: (padding?: number) => capture.captureBounds(container, padding),
        settled: () => capture.waitForRenderSettled(),
    };
});
