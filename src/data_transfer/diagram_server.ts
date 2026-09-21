/*
 * The relay between a notebook and a browser, and a port of `DataServer` in
 * `pyncd/websocket_transfer/websockets_transfer.py`.
 *
 * Neither client can dial the other. A Jupyter kernel cannot accept a
 * connection a browser will reach. Neither end outlives the other either, so a
 * third process holds the most recent term and hands it to whichever page
 * connects. `PROTOCOL.md` sets out the messages and the capture round trip.
 *
 * It runs under `node src/run_server.ts` and answers exactly what the Python
 * server answers. Either may be up and no client can tell which.
 */

import * as http from 'node:http';
import * as ws from 'ws';
import * as diagram_protocol from './diagram_protocol.ts';
import type * as rhs from '../display/Render/RenderHandlerSettings';
import type * as aux from '../advanced_display/AuxiliaryInformation';

/**
 * Both loopback addresses, because `localhost` resolves to either one.
 *
 * Python's `websockets.serve` binds every address `localhost` resolves to,
 * while node's `listen` binds exactly one. Binding `::1` alone refuses a client
 * that resolved `localhost` to `127.0.0.1`. Binding `127.0.0.1` alone refuses a
 * client that resolved it to `::1`. The two families therefore get a listener
 * each and share one upgrade handler.
 */
const LOOPBACK_ADDRESSES = ['127.0.0.1', '::1'];

/** What `listen` reports when the machine has no such address family. */
const MISSING_ADDRESS_FAMILY = ['EADDRNOTAVAIL', 'EAFNOSUPPORT', 'EINVAL'];

const NO_DIAGRAM_CLIENT = (
    'No DiagramClient is connected. Open the tsncd page (npm run dev), or '
    + 'capture headlessly with websocket_transfer.headless.');

/** A WebSocket close reason is capped at 123 bytes by the protocol itself. */
const MAX_CLOSE_REASON_BYTES = 123;

interface ConnectedClient {
    socket: ws.WebSocket;
    clientType: diagram_protocol.ClientType | null;
    /**
     * Messages are answered in arrival order.
     *
     * `websockets` gets arrival order from `async for`, which does not read
     * the next frame until the current one is answered. `ws` fires an event per
     * frame instead, so a `renderResult` could otherwise overtake the
     * `renderRequest` that is still registering its `requestId`.
     */
    message_chain: Promise<void>;
}

function to_error(reason: unknown): Error {
    return reason instanceof Error ? reason : new Error(String(reason));
}

function is_missing_address_family(reason: unknown): boolean {
    const code = (reason as NodeJS.ErrnoException | null)?.code;
    return code !== undefined && MISSING_ADDRESS_FAMILY.includes(code);
}

function listen_for_upgrades(
    sockets: ws.WebSocketServer,
    address: string,
    port: number,
): Promise<http.Server> {
    const listener = http.createServer();
    listener.on('upgrade', (request, socket, head) => {
        sockets.handleUpgrade(request, socket, head, (client) =>
            sockets.emit('connection', client, request));
    });
    return new Promise<http.Server>((resolve, reject) => {
        listener.once('listening', () => resolve(listener));
        listener.once('error', reject);
        listener.listen(port, address);
    });
}

function require_field<T>(value: T | undefined, field: string, msgType: string): T {
    if (value === undefined) {
        throw new Error(`A ${msgType} message arrived without its ${field}.`);
    }
    return value;
}

function truncate_close_reason(reason: string): string {
    const encoded = new TextEncoder().encode(reason);
    if (encoded.length <= MAX_CLOSE_REASON_BYTES) {
        return reason;
    }
    return new TextDecoder().decode(encoded.slice(0, MAX_CLOSE_REASON_BYTES - 3)) + '...';
}

export class DiagramServer {
    private held_term: string | null = null;
    private held_settings: rhs.RenderHandlerSettings = {};
    /* Held beside the term, so a page that reconnects gets the legend and the
     * inspection boxes of the diagram it comes back up on. */
    private held_auxiliary: aux.DiagramAuxiliary | null = null;
    private connected_clients = new Map<ws.WebSocket, ConnectedClient>();
    /** `requestId` to the socket waiting for that image. */
    private pending_captures = new Map<string, ws.WebSocket>();

    /**
     * Resolves once the port is bound, and the process then stays up on it.
     *
     * A loopback address the machine does not have is passed over. Every other
     * failure throws, including the port already being held. A server that bound
     * only one of the two loopback addresses would answer some clients and
     * refuse the rest.
     */
    async serve_clients(port: number = diagram_protocol.SERVER_PORT): Promise<void> {
        const sockets = new ws.WebSocketServer({
            noServer: true,
            maxPayload: diagram_protocol.MAX_MESSAGE_BYTES,
        });
        sockets.on('connection', (socket: ws.WebSocket) => this.accept_client(socket));

        const outcomes = await Promise.allSettled(LOOPBACK_ADDRESSES.map(
            (address) => listen_for_upgrades(sockets, address, port)));
        const listeners: http.Server[] = [];
        const failures: Error[] = [];
        for (const outcome of outcomes) {
            if (outcome.status === 'fulfilled') {
                listeners.push(outcome.value);
            } else if (!is_missing_address_family(outcome.reason)) {
                failures.push(to_error(outcome.reason));
            }
        }
        if (failures.length > 0 || listeners.length === 0) {
            for (const listener of listeners) {
                listener.close();
            }
            throw failures[0]
                ?? new Error(`No loopback address could be bound on port ${port}.`);
        }
        console.log(`Server started at ws://${diagram_protocol.SERVER_HOST}:${port}`);
    }

    private accept_client(socket: ws.WebSocket): void {
        console.log('Client connected.');
        const client: ConnectedClient = {
            socket,
            clientType: null,
            message_chain: Promise.resolve(),
        };
        this.connected_clients.set(socket, client);
        socket.on('message', (frame: ws.RawData) => {
            client.message_chain = client.message_chain.then(
                () => this.answer_message(client, frame));
        });
        socket.on('close', () => this.forget_client(socket));
    }

    private forget_client(socket: ws.WebSocket): void {
        this.connected_clients.delete(socket);
        this.forget_pending_captures(socket);
        console.log('Client disconnected.');
    }

    private forget_pending_captures(socket: ws.WebSocket): void {
        for (const [requestId, requester] of this.pending_captures) {
            if (requester === socket) {
                this.pending_captures.delete(requestId);
            }
        }
    }

    private async answer_message(client: ConnectedClient, frame: ws.RawData): Promise<void> {
        try {
            const message = JSON.parse(frame.toString()) as diagram_protocol.Message;
            const answer = await this.process_message(message, client);
            this.send_to_one(client.socket, JSON.stringify(answer));
        } catch (error) {
            // The close frame carries the reason, so a client on a mismatched
            // protocol version is told why its diagrams stopped.
            const reason = error instanceof Error ? error.message : String(error);
            console.error(reason);
            client.socket.close(1011, truncate_close_reason(reason));
        }
    }

    private async process_message(
        message: diagram_protocol.Message,
        client: ConnectedClient,
    ): Promise<diagram_protocol.ServerAnswer> {
        switch (message.msgType) {
            case 'identify':
                return this.process_handshake(message, client);
            case 'dataUpdate':
                return this.process_data_update(message);
            case 'renderRequest':
                return this.process_render_request(message, client);
            case 'renderResult':
                return this.process_render_result(message);
            case 'dataRequest':
                return this.process_data_request();
            default:
                throw new Error('Unknown message type: ' + JSON.stringify(message));
        }
    }

    private process_handshake(
        message: diagram_protocol.HandshakeMessage,
        client: ConnectedClient,
    ): diagram_protocol.Acknowledgement {
        console.log(`Client identified: ${message.clientType} v${message.clientVersion}`
            + ` (ID: ${message.clientID})`);
        client.clientType = message.clientType;
        if (message.clientType === 'DiagramClient' && this.held_term !== null) {
            console.log('Sending data.');
            this.send_to_one(
                client.socket, JSON.stringify(this.make_data_update(this.held_term)));
        }
        return {msgType: 'Connected'};
    }

    private process_data_update(
        message: diagram_protocol.DataUpdate,
    ): diagram_protocol.Acknowledgement {
        const data = require_field(message.data, 'data', 'dataUpdate');
        this.held_term = data;
        this.held_settings = message.settings ?? {};
        this.held_auxiliary = message.auxiliary ?? null;
        console.log('Data Updated.');
        this.send_to_diagrams(JSON.stringify(this.make_data_update(data)));
        return {msgType: 'DataReceived'};
    }

    private process_render_request(
        message: diagram_protocol.RenderRequest,
        client: ConnectedClient,
    ): diagram_protocol.ServerAnswer {
        const requestId = require_field(message.requestId, 'requestId', 'renderRequest');
        const data = require_field(message.data, 'data', 'renderRequest');
        const settings = message.settings ?? {};
        const disturbDisplay = message.disturbDisplay ?? true;
        if (disturbDisplay) {
            // Stored like a `dataUpdate`, so a browser that reloads after the
            // capture comes back up on the same diagram.
            this.held_term = data;
            this.held_settings = settings;
            this.held_auxiliary = message.auxiliary ?? null;
        } else {
            // Deliberately not stored. Overwriting here would leave the display
            // intact only until the next reload, which is a disturbance with a
            // delay on it.
            console.log('Render request will not disturb the display.');
        }
        if (this.diagram_sockets().length === 0) {
            console.log(`Render request ${requestId} refused: no diagram client.`);
            return {msgType: 'renderResult', requestId, error: NO_DIAGRAM_CLIENT};
        }
        console.log(`Render requested: ${requestId}.`);
        this.pending_captures.set(requestId, client.socket);
        // Every diagram client renders, so they all stay on the same term, and
        // only the first image back is used.
        this.send_to_diagrams(JSON.stringify({
            msgType: 'renderRequest',
            requestId,
            data,
            // The request's own settings rather than `held_settings`, which is
            // only kept current for renders that disturb.
            settings,
            ...(message.auxiliary === undefined
                ? {} : {auxiliary: message.auxiliary}),
            capture: message.capture ?? {},
            disturbDisplay,
        } satisfies diagram_protocol.RenderRequest));
        return {msgType: 'RenderRequested', requestId};
    }

    private process_render_result(
        message: diagram_protocol.RenderResult,
    ): diagram_protocol.Acknowledgement {
        const requestId = require_field(message.requestId, 'requestId', 'renderResult');
        const requester = this.pending_captures.get(requestId);
        if (requester === undefined) {
            // A second diagram client answering a request the first one already
            // won, or a reply that arrived after the sender gave up waiting.
            console.log(`Render result ${requestId} dropped: nobody waiting.`);
            return {msgType: 'RenderResultDropped'};
        }
        this.pending_captures.delete(requestId);
        console.log(`Render result ${requestId} forwarded.`);
        this.send_to_one(requester, JSON.stringify(message));
        return {msgType: 'RenderResultForwarded'};
    }

    private process_data_request(): diagram_protocol.ServerAnswer {
        console.log('Data Requested.');
        if (this.held_term === null) {
            return {msgType: 'No Data Available'};
        }
        return this.make_data_update(this.held_term);
    }

    private make_data_update(term: string): diagram_protocol.DataUpdate {
        const update: diagram_protocol.DataUpdate = {
            msgType: 'dataUpdate', data: term, settings: this.held_settings};
        if (this.held_auxiliary === null) {
            return update;
        }
        return {...update, auxiliary: this.held_auxiliary};
    }

    private diagram_sockets(): ws.WebSocket[] {
        return [...this.connected_clients.values()]
            .filter((client) => client.clientType === 'DiagramClient')
            .map((client) => client.socket);
    }

    private send_to_one(socket: ws.WebSocket, message: string): void {
        socket.send(message);
    }

    private send_to_diagrams(message: string): void {
        for (const socket of this.diagram_sockets()) {
            socket.send(message);
        }
    }
}
