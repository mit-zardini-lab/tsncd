import * as dt_json from './json';
import * as rh from '../display/Render/RenderHandler';
import * as cat from '../data_structure/Category';
import * as bb from '../display/Framework/BroadcastedCategoryRenderer';
import * as rhs from '../display/Render/RenderHandlerSettings';
import * as cap from './capture';

const HandshakeMessage = {
    msgType: 'identify',
    clientType: 'DiagramClient',
    clientVersion: `ts_client_001`,
    clientID: `${Math.random().toString(36).substring(2, 6)}`,
}

/**
 * A render that the sender wants an image back from. See `PROTOCOL.md`.
 *
 * With `disturbDisplay` (the default) the diagram is drawn on screen and the
 * image cut from it - a capture and a plain display are then the same
 * operation with different follow-through. Without it, the render happens in
 * an off-screen target instead and whatever is on screen is left alone.
 */
interface RenderRequest {
  msgType: 'renderRequest';
  requestId: string;
  data: string;
  settings?: rhs.RenderHandlerSettings;
  capture?: cap.CaptureOptions;
  disturbDisplay?: boolean;
}

/**
 * A container and the means to draw a term into it.
 *
 * The renderers hold per-container state, so an off-screen target is a second
 * set of them over a second container - not the same ones pointed elsewhere.
 */
export interface RenderTarget {
  container: HTMLElement;
  /* `settings` is optional, falling back to the render handler's own defaults. */
  termPass: (
    term: cat.BroadcastedCategory<any, any>,
    settings?: rhs.RenderHandlerSettings,
  ) => void;
}

export class StdRenderUpdate {
  constructor(
    private broadcast_renderer: bb.BroadcastedRenderer<any, any>,
    private render_handler: rh.RenderHandler
  ) {}

  termPass(
    term: cat.BroadcastedCategory<any, any>,
    settings: rhs.RenderHandlerSettings = rhs.defaultRenderHandlerSettings,
  ): void {
    this.render_handler.settings = settings;
    this.render_handler.wipe();
    const diagram_element = this.broadcast_renderer.display_category(term);
    this.render_handler.add_child(diagram_element);
    this.render_handler.update();
  }
}

export class WebSocketClient {
  private socket: WebSocket;

  constructor(
    url: string,
    // broadcast_renderer: bb.BroadcastedRenderer<any, any>,
    // render_handler: rh.RenderHandler,
    /* What the user sees, and where a `dataUpdate` always goes. */
    private display: RenderTarget,
    /*
     * Where an undisturbing capture is drawn. Optional, because a client
     * without one can answer such a request with a clear error rather than
     * silently disturb the display instead.
     */
    private offscreen?: RenderTarget,
  ) {
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      console.log('Connected');
      this.send(JSON.stringify(HandshakeMessage));
    };

    this.socket.onmessage = async (event: MessageEvent) => {
      console.log('Received:', JSON.parse(event.data));
      const data = JSON.parse(event.data);
      console.log(data['msgType']);
      if (data['msgType'] === 'dataUpdate') {
        await this.render(data);
      }
      else if (data['msgType'] === 'renderRequest') {
        await this.renderAndCapture(data as RenderRequest);
      }
    };

    this.socket.onclose = (event: CloseEvent) => {
      console.log('Disconnected', event.code, event.reason);
    };

    this.socket.onerror = (error: Event) => {
      console.error('Error:', error);
    };
  }

  private async render(
    data: {data: string; settings?: rhs.RenderHandlerSettings},
    target: RenderTarget = this.display,
  ): Promise<void> {
    const term = await dt_json.TermJSONConverter.import(
      JSON.parse(data['data']));
    // Merged over the defaults rather than over the previous message's
    // settings, so each send fully determines the display.
    target.termPass(
      term as cat.BroadcastedCategory<any, any>,
      {...rhs.defaultRenderHandlerSettings, ...(data['settings'] ?? {})},
    );
  }

  /**
   * Render, then send the image back under the same `requestId`.
   *
   * Failures are reported rather than thrown: the notebook cell on the other
   * end is blocked on this reply, so an exception that never reaches it would
   * show up as a timeout with no explanation of the cause.
   */
  private async renderAndCapture(request: RenderRequest): Promise<void> {
    const reply = (fields: cap.CaptureResult | {error: string}) => this.send(JSON.stringify({
      msgType: 'renderResult',
      requestId: request.requestId,
      ...fields,
    }));
    try {
      // Defaults to disturbing, which is what a plain send does - an absent
      // flag should not quietly change where the diagram appears.
      const disturb = request.disturbDisplay ?? true;
      if (!disturb && !this.offscreen) {
        throw new Error(
          'This client has no off-screen target, so it cannot capture without '
          + 'disturbing the display.');
      }
      const target = disturb ? this.display : this.offscreen!;
      await this.render(request, target);
      reply(await cap.captureElement(target.container, request.capture ?? {}));
    } catch (error) {
      console.error('Capture failed:', error);
      reply({error: error instanceof Error ? error.message : String(error)});
    }
  }

  send(message: string): void {
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(message);
    }
  }

  close(): void {
    this.socket.close();
  }
}

//export const client = new WebSocketClient('ws://localhost:8765');