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
import * as boot_message from './data_transfer/boot_message';

import * as deepseek from './deepseek/display_deepseek';
import * as affine_guards from './advanced_axis_dynamics/data_structure/AffineGuards';
import * as advanced_axis_operators from './advanced_axis_dynamics/data_structure/Operators';
import * as axis_concatenation from './advanced_axis_dynamics/data_structure/AxisConcatenation';
import * as covariant_operator_boxes from './display/Framework/advanced_axis_dynamics/covariantOperatorBoxes';
import * as guarded_axis_labels from './display/Framework/advanced_axis_dynamics/guardedAxisLabels';
import * as concatenated_axis_labels from './display/Framework/advanced_axis_dynamics/concatenatedAxisLabels';
import * as quantization from './quantization/data_structure/Quantization';
import * as quantisation_labels from './display/Framework/quantization/quantisationLabels';

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
    affine_guards.establish();
    advanced_axis_operators.establish();
    axis_concatenation.establish();
    covariant_operator_boxes.establish();
    guarded_axis_labels.establish();
    concatenated_axis_labels.establish();
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
    const display = loading_screen.with_loading_screen(
        page_heading.with_page_heading(
            diagram_render_target.make_render_target(
                container, document.body, advanced_display.DIAGRAM_DECORATORS),
            heading),
        loading);
    const offscreen = diagram_render_target.make_render_target(
        makeOffscreenContainer(), undefined, advanced_display.DIAGRAM_DECORATORS);

    /*
     * Whether a figure has reached the display. The boot figure is drawn only
     * where none has, so a term the relay was holding and a term a driving
     * browser renders each keep the screen.
     */
    let a_figure_has_been_drawn = false;

    function recording_each_draw(
        target: diagram_render_target.RenderTarget,
    ): diagram_render_target.RenderTarget {
        return {
            container: target.container,
            termPass: (term, settings, auxiliary) => {
                a_figure_has_been_drawn = true;
                target.termPass(term, settings, auxiliary);
            },
        };
    }

    const recorded_display = recording_each_draw(display);
    const termPass = recorded_display.termPass;

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
            loading_screen.paint_surface(document.body, message.settings);
        }
        const term = await transfer.TermJSONConverter.import(
            JSON.parse(message.data));
        if (a_figure_has_been_drawn) {
            return;
        }
        termPass(
            term as diagram_render_target.DiagramFigure,
            {...rhs.defaultRenderHandlerSettings, ...(message.settings ?? {})},
            message.auxiliary,
        );
    }

    const embedded = embedded_message.read_embedded_message(document);
    if (embedded === undefined) {
        const client = new wst.WebSocketClient(
            diagram_protocol.SERVER_URI,
            recorded_display,
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
        loading_screen.paint_surface(document.body, embedded.settings);
        await loading_screen.after_the_screen_has_painted();
        await render_payload(
            embedded.data, embedded.settings, embedded.auxiliary);
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
        render: render_payload,
        /* The wording of every description on the page, by the name the
         * `tsncd-localisations` element gives it. A driving browser switches
         * the wording without clicking a button, and a page carrying no
         * wordings answers by doing nothing. */
        localise,
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
