/*
 * The message types `pyncd` and `tsncd` exchange, and the two constants both
 * ends have to agree on.
 *
 * `PROTOCOL.md` is the contract these types encode; the Python half lives in
 * `pyncd/websocket_transfer/websockets_transfer.py`. A change here is a change
 * in all three.
 *
 * Nothing in this module runs in a browser, so it may be imported by the node
 * server as well as by `websockets_transfer.ts`. The two settings types are
 * imported with `import type` so the node server can import the module. A
 * type-only import is erased before node sees the file.
 */

import type * as cap from './capture';
import type * as rhs from '../display/Render/RenderHandlerSettings';
import type * as aux from '../advanced_display/AuxiliaryInformation';

export const SERVER_HOST = 'localhost';
export const SERVER_PORT = 8765;
export const SERVER_URI = `ws://${SERVER_HOST}:${SERVER_PORT}`;

/**
 * Frame ceiling in bytes, which both ends have to raise together.
 *
 * A captured PNG runs to several hundred KB once base64'd and an SVG to
 * megabytes. `ws` and Python's `websockets` each answer an oversized frame by
 * closing the connection rather than reporting anything, so a ceiling raised on
 * one side alone still drops the capture mid flight.
 */
export const MAX_MESSAGE_BYTES = 64 * 2 ** 20;

export type ClientType = 'DataClient' | 'DiagramClient';

export interface HandshakeMessage {
    msgType: 'identify';
    clientType: ClientType;
    clientVersion: string;
    clientID: string;
}

/**
 * A term to display.
 *
 * `data` is a JSON string inside a JSON object, because
 * `TermJSONConverter.export_to_json` returns serialised text that the server
 * relays without ever parsing it. The browser calls `JSON.parse` a second time.
 */
export interface DataUpdate {
    msgType: 'dataUpdate';
    data: string;
    settings?: rhs.RenderHandlerSettings;
    /* What the legend and the inspection boxes show. A message without it
     * draws as it did before the field existed. */
    auxiliary?: aux.DiagramAuxiliary;
}

export interface DataRequest {
    msgType: 'dataRequest';
}

/**
 * A `dataUpdate` whose sender is waiting for an image of the result.
 *
 * With `disturbDisplay`, the default and what an absent flag means, the diagram
 * is drawn on screen and the image cut from it. Without it the browser draws
 * into an off-screen target and the display is left as it was.
 */
export interface RenderRequest {
    msgType: 'renderRequest';
    requestId: string;
    data: string;
    settings?: rhs.RenderHandlerSettings;
    auxiliary?: aux.DiagramAuxiliary;
    capture?: cap.CaptureOptions;
    disturbDisplay?: boolean;
}

/**
 * The image, or the reason there is not one.
 *
 * A failure travels as a message rather than as a dropped connection because a
 * notebook cell is blocked on this reply, and an exception that never arrives
 * shows up only as a timeout with no cause attached.
 */
export interface RenderResult {
    msgType: 'renderResult';
    requestId: string;
    mime?: string;
    payload?: string;
    encoding?: 'base64' | 'utf-8';
    width?: number;
    height?: number;
    error?: string;
}

/** A bare receipt, naming what the server did with the message. */
export interface Acknowledgement {
    msgType: string;
    requestId?: string;
}

export type Message = (HandshakeMessage | DataUpdate | DataRequest
                       | RenderRequest | RenderResult);

/**
 * What the server sends back on the sender's own connection.
 *
 * A `dataRequest` is answered with the held term. A `renderRequest` with no
 * diagram client attached is answered with the failure directly. Not every
 * reply is a bare acknowledgement.
 */
export type ServerAnswer = Acknowledgement | DataUpdate | RenderResult;
