import * as assert from 'node:assert/strict';
import {once} from 'node:events';
import {test} from 'node:test';
import * as ws from 'ws';
import * as preview from '../src/data_transfer/server_preview_client.ts';

interface MockRelay {
    url: string;
    close: () => Promise<void>;
}

async function mock_relay(
    respond: (socket: ws.WebSocket, message: Record<string, unknown>) => void,
): Promise<MockRelay> {
    const relay = new ws.WebSocketServer({port: 0});
    relay.on('connection', (socket: ws.WebSocket) => {
        socket.on('message', (frame: ws.RawData) => {
            respond(socket, JSON.parse(frame.toString()) as Record<string, unknown>);
        });
    });
    await once(relay, 'listening');
    const address = relay.address();
    if (address === null || typeof address === 'string') {
        throw new Error('The mock relay did not bind a TCP port.');
    }
    return {
        url: `ws://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((resolve, reject) => relay.close((error) => {
            if (error === undefined) {
                resolve();
            } else {
                reject(error);
            }
        })),
    };
}

const png_payload = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).toString('base64');

test('captures the held data with retained settings and a correlated result', async () => {
    const relay = await mock_relay((socket, message) => {
        switch (message.msgType) {
            case 'identify':
                assert.equal(message.clientType, 'DataClient');
                assert.equal(message.clientVersion, 'python');
                socket.send(JSON.stringify({msgType: 'Connected'}));
                return;
            case 'dataRequest':
                socket.send(JSON.stringify({
                    msgType: 'dataUpdate',
                    data: '{"held":true}',
                    settings: {darkMode: false, width: 750, tapeLabels: false,
                        blockBackground: 'medium', blockHoverIntensity: 0.16},
                }));
                return;
            case 'renderRequest':
                assert.equal(message.data, '{"held":true}');
                assert.deepEqual(message.settings, {darkMode: true, width: 900, tapeLabels: false,
                    blockBackground: 'medium', blockHoverIntensity: 0.16});
                assert.deepEqual(message.capture, {format: 'png'});
                assert.equal(message.disturbDisplay, false);
                socket.send(JSON.stringify({msgType: 'RenderRequested', requestId: message.requestId}));
                socket.send(JSON.stringify({
                    msgType: 'renderResult', requestId: 'another-request',
                    mime: 'image/png', payload: png_payload, encoding: 'base64', width: 1, height: 1,
                }));
                socket.send(JSON.stringify({
                    msgType: 'renderResult', requestId: message.requestId,
                    mime: 'image/png', payload: png_payload, encoding: 'base64', width: 640, height: 480,
                }));
                return;
            default:
                throw new Error(`Unexpected mock message ${String(message.msgType)}.`);
        }
    });
    try {
        const image = await preview.capture_server_image({
            server: relay.url,
            timeoutMs: 1_000,
            format: 'png',
            settings: {darkMode: true, width: 900},
        });
        assert.equal(image.width, 640);
        assert.equal(image.height, 480);
        assert.deepEqual(image.bytes, Buffer.from(png_payload, 'base64'));
    } finally {
        await relay.close();
    }
});

test('stops waiting when a relay acknowledges without returning an image', async () => {
    const relay = await mock_relay((socket, message) => {
        switch (message.msgType) {
            case 'identify':
                socket.send(JSON.stringify({msgType: 'Connected'}));
                return;
            case 'dataRequest':
                socket.send(JSON.stringify({msgType: 'dataUpdate', data: '{}', settings: {}}));
                return;
            case 'renderRequest':
                socket.send(JSON.stringify({msgType: 'RenderRequested', requestId: message.requestId}));
                return;
            default:
                throw new Error(`Unexpected mock message ${String(message.msgType)}.`);
        }
    });
    try {
        await assert.rejects(
            preview.capture_server_image({
                server: relay.url,
                timeoutMs: 50,
                format: 'png',
            }),
            /did not return an image within 50 ms/);
    } finally {
        await relay.close();
    }
});

test('reports a relay with no held diagram data', async () => {
    const relay = await mock_relay((socket, message) => {
        if (message.msgType === 'identify') {
            socket.send(JSON.stringify({msgType: 'Connected'}));
        } else if (message.msgType === 'dataRequest') {
            socket.send(JSON.stringify({msgType: 'No Data Available'}));
        } else {
            throw new Error(`Unexpected mock message ${String(message.msgType)}.`);
        }
    });
    try {
        await assert.rejects(
            preview.capture_server_image({server: relay.url, timeoutMs: 1_000, format: 'png'}),
            /no held diagram data/);
    } finally {
        await relay.close();
    }
});

test('reports the relay error when no browser can capture the diagram', async () => {
    const relay = await mock_relay((socket, message) => {
        if (message.msgType === 'identify') {
            socket.send(JSON.stringify({msgType: 'Connected'}));
        } else if (message.msgType === 'dataRequest') {
            socket.send(JSON.stringify({msgType: 'dataUpdate', data: '{}', settings: {}}));
        } else if (message.msgType === 'renderRequest') {
            socket.send(JSON.stringify({
                msgType: 'renderResult', requestId: message.requestId,
                error: 'No DiagramClient is connected.',
            }));
        } else {
            throw new Error(`Unexpected mock message ${String(message.msgType)}.`);
        }
    });
    try {
        await assert.rejects(
            preview.capture_server_image({server: relay.url, timeoutMs: 1_000, format: 'png'}),
            /No DiagramClient is connected/);
    } finally {
        await relay.close();
    }
});

test('accepts a multi-megabyte PNG payload', async () => {
    const bytes = Buffer.alloc(3 * 1024 * 1024);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
    const payload = bytes.toString('base64');
    const relay = await mock_relay((socket, message) => {
        if (message.msgType === 'identify') {
            socket.send(JSON.stringify({msgType: 'Connected'}));
        } else if (message.msgType === 'dataRequest') {
            socket.send(JSON.stringify({msgType: 'dataUpdate', data: '{}', settings: {}}));
        } else if (message.msgType === 'renderRequest') {
            socket.send(JSON.stringify({
                msgType: 'renderResult', requestId: message.requestId,
                mime: 'image/png', payload, encoding: 'base64', width: 1, height: 1,
            }));
        } else {
            throw new Error(`Unexpected mock message ${String(message.msgType)}.`);
        }
    });
    try {
        const image = await preview.capture_server_image({
            server: relay.url, timeoutMs: 1_000, format: 'png',
        });
        assert.equal(image.bytes.length, bytes.length);
    } finally {
        await relay.close();
    }
});

test('decodes an SVG render result', async () => {
    const payload = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';
    const relay = await mock_relay((socket, message) => {
        if (message.msgType === 'identify') {
            socket.send(JSON.stringify({msgType: 'Connected'}));
        } else if (message.msgType === 'dataRequest') {
            socket.send(JSON.stringify({msgType: 'dataUpdate', data: '{}', settings: {}}));
        } else if (message.msgType === 'renderRequest') {
            assert.deepEqual(message.capture, {format: 'svg'});
            socket.send(JSON.stringify({
                msgType: 'renderResult', requestId: message.requestId,
                mime: 'image/svg+xml', payload, encoding: 'utf-8', width: 1, height: 1,
            }));
        } else {
            throw new Error(`Unexpected mock message ${String(message.msgType)}.`);
        }
    });
    try {
        const image = await preview.capture_server_image({
            server: relay.url, timeoutMs: 1_000, format: 'svg',
        });
        assert.equal(image.bytes.toString('utf8'), payload);
    } finally {
        await relay.close();
    }
});

test('reports a relay that disconnects during a capture', async () => {
    const relay = await mock_relay((socket, message) => {
        if (message.msgType === 'identify') {
            socket.send(JSON.stringify({msgType: 'Connected'}));
        } else if (message.msgType === 'dataRequest') {
            socket.send(JSON.stringify({msgType: 'dataUpdate', data: '{}', settings: {}}));
        } else if (message.msgType === 'renderRequest') {
            socket.close(1011, 'diagram client disconnected');
        } else {
            throw new Error(`Unexpected mock message ${String(message.msgType)}.`);
        }
    });
    try {
        await assert.rejects(
            preview.capture_server_image({server: relay.url, timeoutMs: 1_000, format: 'png'}),
            /closed the connection \(1011\): diagram client disconnected/);
    } finally {
        await relay.close();
    }
});
