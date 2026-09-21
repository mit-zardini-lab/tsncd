/*
 * The dev server and a current `dist/`, from one command.
 *
 *     npm run watch
 *
 * The dev server rebuilds in memory on every save and never writes `dist/`,
 * which is what `pyncd`'s headless path serves. This script runs the dev
 * server and writes `dist/` with a production build once the sources have
 * stayed unchanged for the settle period. The dev server reads its build
 * inputs once as it starts, so a change to one of them restarts it.
 */

import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..');
const WEBPACK_CLI = path.join(PACKAGE_ROOT, 'node_modules', 'webpack', 'bin', 'webpack.js');
const SOURCE_DIRECTORIES = ['src', 'public'];
const BUILD_INPUTS = ['webpack.config.js', 'tsconfig.json', 'package-lock.json'];
const BUILD_INPUT_SETTLE_MS = 500;
const DEFAULT_SOURCE_SETTLE_MS = 3000;

const DEV_SERVER_ARGUMENTS = ['serve', '--mode', 'development'];
const PRODUCTION_BUILD_ARGUMENTS = ['--mode', 'production', '--stats', 'errors-only'];

const live_children = new Set<child_process.ChildProcess>();

function usage(): string {
    return [
        'Usage: npm run watch -- [options]',
        '',
        'Options:',
        `  --settle MS   Rebuild dist/ once the sources have stayed unchanged this long (default ${DEFAULT_SOURCE_SETTLE_MS})`,
    ].join('\n');
}

function parse_settle_period(arguments_: string[]): number | 'help' {
    if (arguments_.length === 0) {
        return DEFAULT_SOURCE_SETTLE_MS;
    }
    const [option, value] = arguments_;
    if (option === '--help' || option === '-h') {
        return 'help';
    }
    if (option !== '--settle' || arguments_.length !== 2) {
        throw new Error(`Unknown option ${option}.`);
    }
    const settleMs = Number(value);
    if (!Number.isFinite(settleMs) || settleMs <= 0) {
        throw new Error('--settle must be a positive number.');
    }
    return settleMs;
}

function log_watch_event(message: string): void {
    console.log(`[watch] ${message}`);
}

function run_webpack(arguments_: string[]): child_process.ChildProcess {
    const child = child_process.spawn(process.execPath, [WEBPACK_CLI, ...arguments_], {
        cwd: PACKAGE_ROOT,
        stdio: 'inherit',
    });
    live_children.add(child);
    child.once('exit', () => live_children.delete(child));
    return child;
}

function exit_code_of(child: child_process.ChildProcess): Promise<number | null> {
    return new Promise((resolve) => child.once('exit', (code) => resolve(code)));
}

function call_after_quiet_period(action: () => void, quietMs: number): () => void {
    let timer: NodeJS.Timeout | undefined;
    return () => {
        clearTimeout(timer);
        timer = setTimeout(action, quietMs);
    };
}

/** The returned function starts a build, or marks a running build stale so another follows it. */
function make_production_build_requester(): () => void {
    let build_is_running = false;
    let sources_changed_during_build = false;
    async function build_until_dist_is_current(): Promise<void> {
        build_is_running = true;
        do {
            sources_changed_during_build = false;
            const started_at = Date.now();
            const code = await exit_code_of(run_webpack(PRODUCTION_BUILD_ARGUMENTS));
            const seconds = ((Date.now() - started_at) / 1000).toFixed(1);
            log_watch_event(code === 0
                ? `dist/ rebuilt in ${seconds}s.`
                : `The production build failed with code ${code}. dist/ is stale.`);
        } while (sources_changed_during_build);
        build_is_running = false;
    }
    return () => {
        if (build_is_running) {
            sources_changed_during_build = true;
            return;
        }
        void build_until_dist_is_current();
    };
}

function start_dev_server(extra_arguments: string[]): child_process.ChildProcess {
    const dev_server = run_webpack([...DEV_SERVER_ARGUMENTS, ...extra_arguments]);
    dev_server.once('exit', (code, signal) => {
        if (signal === null) {
            log_watch_event(`The dev server exited with code ${code}. `
                + `A change to ${BUILD_INPUTS.join(', ')} starts it again.`);
        }
    });
    return dev_server;
}

/** The returned function restarts the dev server, one restart at a time. */
function make_dev_server_restarter(): () => void {
    let dev_server = start_dev_server([]);
    let pending_restart: Promise<void> = Promise.resolve();
    async function replace_dev_server(): Promise<void> {
        if (dev_server.exitCode === null && dev_server.signalCode === null) {
            const exited = exit_code_of(dev_server);
            dev_server.kill();
            await exited;
        }
        dev_server = start_dev_server(['--no-open']);
    }
    return () => {
        pending_restart = pending_restart.then(replace_dev_server);
    };
}

function watch_source_directories(report_change: () => void): void {
    for (const directory of SOURCE_DIRECTORIES) {
        fs.watch(path.join(PACKAGE_ROOT, directory), {recursive: true}, report_change);
    }
}

/*
 * An editor that saves by renaming a temporary file over the original ends a
 * watch held on the file itself. The watch is held on the directory for that
 * reason.
 */
function watch_build_inputs(report_change: () => void): void {
    fs.watch(PACKAGE_ROOT, (_event: fs.WatchEventType, filename: string | null) => {
        if (filename !== null && BUILD_INPUTS.includes(filename)) {
            report_change();
        }
    });
}

function stop_children_and_exit(): void {
    for (const child of live_children) {
        child.kill();
    }
    process.exit();
}

function run_command(): void {
    const settleMs = parse_settle_period(process.argv.slice(2));
    if (settleMs === 'help') {
        console.log(usage());
        return;
    }
    const request_production_build = make_production_build_requester();
    const restart_dev_server = make_dev_server_restarter();
    watch_source_directories(call_after_quiet_period(() => {
        log_watch_event('The sources changed. Rebuilding dist/.');
        request_production_build();
    }, settleMs));
    watch_build_inputs(call_after_quiet_period(() => {
        log_watch_event('A build input changed. Restarting the dev server and rebuilding dist/.');
        restart_dev_server();
        request_production_build();
    }, BUILD_INPUT_SETTLE_MS));
    process.on('SIGINT', stop_children_and_exit);
    process.on('SIGTERM', stop_children_and_exit);
    request_production_build();
}

try {
    run_command();
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
}
