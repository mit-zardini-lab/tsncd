import {randomUUID} from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as preview from './data_transfer/server_preview_client.ts';

interface CommandOptions {
    output: string;
    server: string;
    timeoutMs: number;
    watchMs: number | null;
    darkMode: boolean | undefined;
    width: number | undefined;
}

function usage(): string {
    return [
        'Usage: npm run capture -- --output FILE [options]',
        '',
        'Options:',
        '  --server URL             WebSocket relay URL (default ws://localhost:8765)',
        '  --timeout MS             Total timeout per capture (default 60000)',
        '  --dark-mode true|false   Override the held dark-mode setting',
        '  --width PX               Override the held diagram width',
        '  --watch MS               Capture repeatedly at this interval',
    ].join('\n');
}

function require_value(arguments_: string[], index: number, option: string): string {
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith('--')) {
        throw new preview.ServerPreviewError(`${option} requires a value.`);
    }
    return value;
}

function positive_number(value: string, option: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new preview.ServerPreviewError(`${option} must be a positive number.`);
    }
    return parsed;
}

function parse_dark_mode(value: string): boolean {
    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }
    throw new preview.ServerPreviewError('--dark-mode must be true or false.');
}

function parse_command(arguments_: string[]): CommandOptions | 'help' {
    let output: string | undefined;
    let server = 'ws://localhost:8765';
    let timeoutMs = 60_000;
    let watchMs: number | null = null;
    let darkMode: boolean | undefined;
    let width: number | undefined;
    for (let index = 0; index < arguments_.length; index += 1) {
        const option = arguments_[index];
        if (option === '--help' || option === '-h') {
            return 'help';
        }
        const value = require_value(arguments_, index, option);
        index += 1;
        switch (option) {
            case '--output':
                output = value;
                break;
            case '--server':
                server = value;
                break;
            case '--timeout':
                timeoutMs = positive_number(value, option);
                break;
            case '--watch':
                watchMs = positive_number(value, option);
                break;
            case '--dark-mode':
                darkMode = parse_dark_mode(value);
                break;
            case '--width':
                width = positive_number(value, option);
                break;
            default:
                throw new preview.ServerPreviewError(`Unknown option ${option}.`);
        }
    }
    if (output === undefined) {
        throw new preview.ServerPreviewError('--output is required.');
    }
    const protocol = new URL(server).protocol;
    if (protocol !== 'ws:' && protocol !== 'wss:') {
        throw new preview.ServerPreviewError('--server must use ws:// or wss://.');
    }
    return {output, server, timeoutMs, watchMs, darkMode, width};
}

function image_format(output: string): preview.ImageFormat {
    const extension = path.extname(output).toLowerCase();
    if (extension === '.png') {
        return 'png';
    }
    if (extension === '.svg') {
        return 'svg';
    }
    throw new preview.ServerPreviewError('--output must end in .png or .svg.');
}

async function write_image(output: string, bytes: Buffer): Promise<void> {
    const directory = path.dirname(output);
    const temporary = path.join(directory, `.${path.basename(output)}.${randomUUID()}.tmp`);
    await fs.mkdir(directory, {recursive: true});
    try {
        await fs.writeFile(temporary, bytes);
        await fs.rename(temporary, output);
    } catch (error) {
        await fs.rm(temporary, {force: true});
        throw error;
    }
}

function wait(milliseconds: number): Promise<void> {
    return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function capture_once(options: CommandOptions, format: preview.ImageFormat): Promise<void> {
    const settings = {
        ...(options.darkMode === undefined ? {} : {darkMode: options.darkMode}),
        ...(options.width === undefined ? {} : {width: options.width}),
    };
    const image = await preview.capture_server_image({
        server: options.server,
        timeoutMs: options.timeoutMs,
        format,
        settings,
    });
    await write_image(options.output, image.bytes);
    console.log(`Saved ${options.output} (${image.width} x ${image.height}, ${image.mime}).`);
}

async function run_command(): Promise<void> {
    const options = parse_command(process.argv.slice(2));
    if (options === 'help') {
        console.log(usage());
        return;
    }
    const format = image_format(options.output);
    do {
        try {
            await capture_once(options, format);
        } catch (error) {
            if (options.watchMs === null) {
                throw error;
            }
            console.error(error instanceof Error ? error.message : String(error));
        }
        if (options.watchMs !== null) {
            await wait(options.watchMs);
        }
    } while (options.watchMs !== null);
}

run_command().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
