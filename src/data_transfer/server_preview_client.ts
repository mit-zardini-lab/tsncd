import {randomUUID} from 'node:crypto';
import * as ws from 'ws';
import * as diagram_protocol from './diagram_protocol.ts';
import type * as rhs from '../display/Render/RenderHandlerSettings';

export type ImageFormat = 'png' | 'svg';

export interface ServerPreviewOptions {
    server?: string;
    timeoutMs?: number;
    format: ImageFormat;
    settings?: Pick<rhs.RenderHandlerSettings, 'darkMode' | 'width'>;
}

export interface ServerImage {
    bytes: Buffer;
    mime: string;
    width: number;
    height: number;
}

export class ServerPreviewError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ServerPreviewError';
    }
}

const DEFAULT_TIMEOUT_MS = 60_000;

function record_from_json(frame: ws.RawData): Record<string, unknown> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(frame.toString());
    } catch (error) {
        throw new ServerPreviewError(`The server sent invalid JSON: ${String(error)}.`);
    }
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new ServerPreviewError('The server sent a message that was not an object.');
    }
    return parsed as Record<string, unknown>;
}

function require_string(message: Record<string, unknown>, field: string): string {
    const value = message[field];
    if (typeof value !== 'string') {
        throw new ServerPreviewError(`The server message had no string ${field}.`);
    }
    return value;
}

function require_positive_number(message: Record<string, unknown>, field: string): number {
    const value = message[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new ServerPreviewError(`The render result had no positive ${field}.`);
    }
    return value;
}

function require_settings(message: Record<string, unknown>): rhs.RenderHandlerSettings {
    const settings = message.settings;
    if (settings === undefined) {
        return {};
    }
    if (settings === null || Array.isArray(settings) || typeof settings !== 'object') {
        throw new ServerPreviewError('The held data had invalid render settings.');
    }
    return settings as rhs.RenderHandlerSettings;
}

function expected_mime(format: ImageFormat): string {
    return format === 'png' ? 'image/png' : 'image/svg+xml';
}

function is_base64_character(code: number): boolean {
    return (code >= 65 && code <= 90)
        || (code >= 97 && code <= 122)
        || (code >= 48 && code <= 57)
        || code === 43
        || code === 47;
}

function is_base64_payload(payload: string): boolean {
    if (payload.length === 0 || payload.length % 4 !== 0) {
        return false;
    }
    const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
    for (let index = 0; index < payload.length - padding; index += 1) {
        if (!is_base64_character(payload.charCodeAt(index))) {
            return false;
        }
    }
    for (let index = payload.length - padding; index < payload.length; index += 1) {
        if (payload[index] !== '=') {
            return false;
        }
    }
    return true;
}

function merge_settings(
    held: rhs.RenderHandlerSettings,
    overrides: Pick<rhs.RenderHandlerSettings, 'darkMode' | 'width'>,
): rhs.RenderHandlerSettings {
    return {
        ...held,
        ...(overrides.darkMode === undefined ? {} : {darkMode: overrides.darkMode}),
        ...(overrides.width === undefined ? {} : {width: overrides.width}),
    };
}

function decode_image(message: Record<string, unknown>, format: ImageFormat): ServerImage {
    const mime = require_string(message, 'mime');
    const payload = require_string(message, 'payload');
    const encoding = require_string(message, 'encoding');
    const width = require_positive_number(message, 'width');
    const height = require_positive_number(message, 'height');
    if (mime !== expected_mime(format)) {
        throw new ServerPreviewError(`The render result had MIME type ${mime}, expected ${expected_mime(format)}.`);
    }
    if (format === 'png') {
        if (encoding !== 'base64' || !is_base64_payload(payload)) {
            throw new ServerPreviewError('The PNG render result did not contain valid base64 data.');
        }
        const bytes = Buffer.from(payload, 'base64');
        if (bytes.length < 8 || !bytes.subarray(0, 8).equals(
            Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
            throw new ServerPreviewError('The PNG render result did not contain a PNG image.');
        }
        return {bytes, mime, width, height};
    }
    if (encoding !== 'utf-8' || !payload.includes('<svg')) {
        throw new ServerPreviewError('The SVG render result did not contain SVG markup.');
    }
    return {bytes: Buffer.from(payload, 'utf8'), mime, width, height};
}

class MessageQueue {
    private readonly messages: Record<string, unknown>[] = [];
    private readonly waiting: Array<{
        resolve: (message: Record<string, unknown>) => void;
        reject: (error: Error) => void;
    }> = [];
    private failure: Error | null = null;
    private readonly socket: ws.WebSocket;

    constructor(socket: ws.WebSocket) {
        this.socket = socket;
        socket.on('message', (frame: ws.RawData) => this.add_message(frame));
        socket.on('error', (error: Error) => this.fail(error));
        socket.on('close', (code: number, reason: Buffer) => {
            this.fail(new ServerPreviewError(
                `The server closed the connection (${code}): ${reason.toString() || 'no reason provided'}.`));
        });
    }

    async wait_for_open(): Promise<void> {
        if (this.socket.readyState === ws.WebSocket.OPEN) {
            return;
        }
        await new Promise<void>((resolve, reject) => {
            this.socket.once('open', resolve);
            this.socket.once('error', reject);
            this.socket.once('close', (code: number, reason: Buffer) => reject(
                new ServerPreviewError(
                    `The server closed before connecting (${code}): ${reason.toString() || 'no reason provided'}.`)));
        });
    }

    send(message: diagram_protocol.Message): void {
        if (this.socket.readyState !== ws.WebSocket.OPEN) {
            throw new ServerPreviewError('The server connection was not open.');
        }
        this.socket.send(JSON.stringify(message));
    }

    next_message(): Promise<Record<string, unknown>> {
        const message = this.messages.shift();
        if (message !== undefined) {
            return Promise.resolve(message);
        }
        if (this.failure !== null) {
            return Promise.reject(this.failure);
        }
        return new Promise<Record<string, unknown>>((resolve, reject) => {
            this.waiting.push({resolve, reject});
        });
    }

    close(): void {
        if (this.socket.readyState === ws.WebSocket.OPEN) {
            this.socket.close();
        } else if (this.socket.readyState === ws.WebSocket.CONNECTING) {
            this.socket.terminate();
        }
    }

    private add_message(frame: ws.RawData): void {
        try {
            const message = record_from_json(frame);
            const waiting = this.waiting.shift();
            if (waiting === undefined) {
                this.messages.push(message);
            } else {
                waiting.resolve(message);
            }
        } catch (error) {
            this.fail(error instanceof Error ? error : new Error(String(error)));
        }
    }

    private fail(error: Error): void {
        if (this.failure !== null) {
            return;
        }
        this.failure = error;
        for (const waiting of this.waiting.splice(0)) {
            waiting.reject(error);
        }
    }
}

async function wait_for_message(
    messages: MessageQueue,
    predicate: (message: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
    while (true) {
        const message = await messages.next_message();
        if (predicate(message)) {
            return message;
        }
    }
}

async function request_server_image(
    options: Required<ServerPreviewOptions>,
    socket: ws.WebSocket,
): Promise<ServerImage> {
    const messages = new MessageQueue(socket);
    try {
        await messages.wait_for_open();
        messages.send({
            msgType: 'identify',
            clientType: 'DataClient',
            clientVersion: 'python',
            clientID: `tsncd-preview-${randomUUID()}`,
        });
        await wait_for_message(messages, (message) => message.msgType === 'Connected');

        messages.send({msgType: 'dataRequest'});
        const held = await wait_for_message(
            messages,
            (message) => message.msgType === 'dataUpdate' || message.msgType === 'No Data Available');
        if (held.msgType === 'No Data Available') {
            throw new ServerPreviewError('The server has no held diagram data.');
        }
        const data = require_string(held, 'data');
        const settings = merge_settings(require_settings(held), options.settings);
        const requestId = randomUUID();
        messages.send({
            msgType: 'renderRequest',
            requestId,
            data,
            settings,
            capture: {format: options.format},
            disturbDisplay: false,
        });
        const result = await wait_for_message(
            messages,
            (message) => message.msgType === 'renderResult' && message.requestId === requestId);
        if (typeof result.error === 'string') {
            throw new ServerPreviewError(result.error);
        }
        return decode_image(result, options.format);
    } finally {
        messages.close();
    }
}

export async function capture_server_image(options: ServerPreviewOptions): Promise<ServerImage> {
    const complete = {
        server: options.server ?? diagram_protocol.SERVER_URI,
        timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        format: options.format,
        settings: options.settings ?? {},
    };
    if (!Number.isFinite(complete.timeoutMs) || complete.timeoutMs <= 0) {
        throw new ServerPreviewError('The timeout must be a positive number of milliseconds.');
    }
    const socket = new ws.WebSocket(complete.server, {
        maxPayload: diagram_protocol.MAX_MESSAGE_BYTES,
    });
    let timeout: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            request_server_image(complete, socket),
            new Promise<never>((_resolve, reject) => {
                timeout = setTimeout(
                    () => {
                        socket.terminate();
                        reject(new ServerPreviewError(
                            `The server did not return an image within ${complete.timeoutMs} ms.`));
                    },
                    complete.timeoutMs);
            }),
        ]);
    } finally {
        if (timeout !== undefined) {
            clearTimeout(timeout);
        }
    }
}
