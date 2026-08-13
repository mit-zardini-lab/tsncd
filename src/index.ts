import * as cat from './data_structure/Category';
import * as transfer from './data_transfer/json';
import * as basic_text from './display/basic_text';

import * as rh from './display/Render/RenderHandler';
import * as rhs from './display/Render/RenderHandlerSettings';
import * as html_render from './display/HTMLRender/HTMLRenderHandler';
import * as broadcasted_box from './display/Framework/BroadcastedCategoryRenderer';
import * as addops from './display/Framework/Operations/additionalOperationBoxes';

import * as wst from './data_transfer/websockets_transfer';
import * as capture from './data_transfer/capture';
import * as mlc from './display/Framework/Multiline';

import * as deepseek from './deepseek/display_deepseek';
import * as ut from './utilities/utilities';

import {CategoryRenderer} from './display/Framework/CategoryRenderer';

console.log(addops);
console.log(deepseek);
class DiagramContainer {
}

// export class StdRenderUpdate {
//   constructor(
//     private broadcast_renderer: bb.BroadcastedRenderer<any, any>,
//     private render_handler: rh.RenderHandler
//   ) {}

//   termPass(term: cat.BroadcastedCategory<any, any>): void {
//     this.render_handler.wipe();
//     const diagram_element = this.broadcast_renderer.display_category(term);
//     this.render_handler.add_child(diagram_element);
//     this.render_handler.post_placement();
//     this.render_handler.update();
//   }
// }

const WIDTH = 750;

// class SubblockRender extends rh.DiagramElement {
//     constructor(
//         private categoryRenderer: CategoryRenderer<any, any, any>,
//         private subblocks: rh.DiagramElement[],
//         private main_block: rh.DiagramElement,
//         private main_renderer = (morphism: cat.BroadcastedCategory<any, any>) => new mlc.MultilineComposedBox(
//             this.categoryRenderer, morphism, WIDTH
//         )
//     ) {
//         super(categoryRenderer.renderHandler);

//         if (this.subblocks.length === 0) {
//             this.children = [main_block];
//         }
//         else {
//             this.children = [
//                 new rh.Vertical(
//                     this.renderHandler,
//                     subblocks),
//                 main_block];
//         }
//     }

// }

document.addEventListener('DOMContentLoaded', async () => {
    cat.establish();
    // Additional initialization code can go here
    const json_term = await transfer.TermJSONConverter.import_from_file('/json_files/output.json');
    // Get the text layout
    console.log(basic_text.string_export_rows(json_term).join('\n'));

    /*
     * A container together with everything needed to draw into it. Built more
     * than once so that a capture can be taken without touching what is on
     * screen - the renderers hold per-container state (measured rectangles,
     * pending block references), so the second target has to be a second set of
     * them rather than the same ones pointed elsewhere.
     */
    function makeRenderTarget(container: HTMLElement): wst.RenderTarget {
        const html_renderer = new html_render.HTMLRenderHandler(container);
        const bc_renderer = new broadcasted_box.BroadcastedRenderer(html_renderer);

        function render_with_subblock(
            bc_renderer: broadcasted_box.BroadcastedRenderer<any, any>,
            term: cat.BroadcastedCategory<any, any>,
        ): rh.DiagramElement {
            const main_element = mlc.multiline_render(
                bc_renderer,
                term,
                // Read per render rather than captured once: `termPass` has
                // already installed this pass's settings on the handler.
                html_renderer.settings.width ?? WIDTH
            );

            const block_morphisms = bc_renderer.referencesHandler.pop_pending();
            if (!block_morphisms.length) {
                return main_element;
            }
            const blocks = block_morphisms.map((morphism) =>
                render_with_subblock(bc_renderer, morphism)
            );
            const vertical_blocks = new rh.Vertical(
                html_renderer,
                ut.join(
                    () => new rh.CoreElement(html_renderer, {x: 10, y: 10}),
                    blocks)
            );
            return new rh.Horizontal(
                html_renderer,
                ut.join(
                    () => new rh.CoreElement(html_renderer, {x: 10, y: 10}),
                    [vertical_blocks, main_element])
            )
        }

        function termPass(
            term: cat.BroadcastedCategory<any, any>,
            settings: rhs.RenderHandlerSettings = rhs.defaultRenderHandlerSettings,
        ): void {
            html_renderer.settings = settings;
            html_renderer.wipe();
            // const diagram_element = new mlc.MultilineComposedBox(
            //     bc_renderer,
            //     term,
            //     WIDTH,
            // );
            const diagram_element = render_with_subblock(bc_renderer, term);
            html_renderer.add_child(diagram_element);
            html_renderer.post_placement();
            html_renderer.update();
        }

        return {container, termPass};
    }

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
    const display = makeRenderTarget(container);
    const offscreen = makeRenderTarget(makeOffscreenContainer());
    const termPass = display.termPass;

    termPass(json_term);

    const client = new wst.WebSocketClient(
        'ws://localhost:8765',
        display,
        offscreen,
    );
    console.log(client);

    /*
     * Control surface for a driving browser (see `pyncd`'s
     * `websocket_transfer/headless.py`). Headless capture deliberately does not
     * go through the websocket server: a batch figure rebuild should not depend
     * on a server being up, and driving the page directly makes it deterministic.
     * The render path is the same one the socket uses, so the two agree.
     */
    (window as any).tsncd = {
        async render(
            payload: string | object,
            settings?: rhs.RenderHandlerSettings,
        ): Promise<{width: number; height: number}> {
            const jsondata = typeof payload === 'string' ? JSON.parse(payload) : payload;
            const term = await transfer.TermJSONConverter.import(jsondata);
            termPass(
                term as cat.BroadcastedCategory<any, any>,
                {...rhs.defaultRenderHandlerSettings, ...(settings ?? {})},
            );
            await capture.waitForRenderSettled();
            const rect = container.getBoundingClientRect();
            return {width: rect.width, height: rect.height};
        },
        capture: (options?: capture.CaptureOptions) =>
            capture.captureElement(container, options),
        bounds: (padding?: number) => capture.captureBounds(container, padding),
        settled: () => capture.waitForRenderSettled(),
    };
});