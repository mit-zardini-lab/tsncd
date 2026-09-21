import * as dt_json from './json';
import * as rh from '../display/Render/RenderHandler';
import * as cat from '../data_structure/Category';
import * as bb from '../display/Framework/BroadcastedCategoryRenderer';
import * as rhs from '../display/Render/RenderHandlerSettings';
import * as cap from './capture';
import * as diagram_protocol from './diagram_protocol';
import type * as aux from '../advanced_display/AuxiliaryInformation';

const HANDSHAKE_MESSAGE: diagram_protocol.HandshakeMessage = {
    msgType: 'identify',
    clientType: 'DiagramClient',
    clientVersion: `ts_client_001`,
    clientID: `${Math.random().toString(36).substring(2, 6)}`,
}

/**
 * A container and the means to draw a term into it.
 *
 * `display/diagramRenderTarget.ts` builds one and states what it holds. The
 * type is re-exported here because this module's clients have always named it
 * `wst.RenderTarget`.
 */
import type {DiagramFigure, RenderTarget} from '../display/diagramRenderTarget';
export type {RenderTarget};

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
  private messageChain: Promise<void> = Promise.resolve();

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
      this.send(JSON.stringify(HANDSHAKE_MESSAGE));
    };

    this.socket.onmessage = (event: MessageEvent<string>): void => {
      this.messageChain = this.messageChain
        .then(() => this.answerMessage(event.data))
        .catch((error: unknown): void => {
          console.error('Render failed:', error);
        });
    };

    this.socket.onclose = (event: CloseEvent) => {
      console.log('Disconnected', event.code, event.reason);
    };

    this.socket.onerror = (error: Event) => {
      console.error('Error:', error);
    };
  }

  private async answerMessage(message: string): Promise<void> {
    const data = JSON.parse(message) as diagram_protocol.ServerAnswer
      | diagram_protocol.RenderRequest;
    if (data.msgType === 'dataUpdate' && 'data' in data) {
      await this.render(data as diagram_protocol.DataUpdate);
    } else if (data.msgType === 'renderRequest' && 'data' in data) {
      await this.renderAndCapture(data as diagram_protocol.RenderRequest);
    }
  }

  private async render(
    data: {
      data: string;
      settings?: rhs.RenderHandlerSettings;
      auxiliary?: aux.DiagramAuxiliary;
    },
    target: RenderTarget = this.display,
  ): Promise<void> {
    const term = await dt_json.TermJSONConverter.import(
      JSON.parse(data['data']));
    // Merged over the defaults rather than over the previous message's
    // settings, so each send fully determines the display.
    target.termPass(
      term as DiagramFigure,
      {...rhs.defaultRenderHandlerSettings, ...(data['settings'] ?? {})},
      data['auxiliary'],
    );
  }

  /**
   * Render, then send the image back under the same `requestId`.
   *
   * Failures are reported rather than thrown: the notebook cell on the other
   * end is blocked on this reply, so an exception that never reaches it would
   * show up as a timeout with no explanation of the cause.
   */
  private async renderAndCapture(
      request: diagram_protocol.RenderRequest): Promise<void> {
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
