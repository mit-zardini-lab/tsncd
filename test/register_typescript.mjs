import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire, registerHooks} from 'node:module';

const require_from_here = createRequire(import.meta.url);
const TRANSPILE_OPTIONS = {
    target: 'ES2022', module: 'ESNext', useDefineForClassFields: false, inlineSourceMap: true,
};
const TYPESCRIPT_VERSION = JSON.parse(
    readFileSync(require_from_here.resolve('typescript/package.json'), 'utf8')).version;
const TRANSPILED_MODULE_STORE = new URL(
    '../node_modules/.cache/register_typescript/', import.meta.url);

/*
 * Loading `typescript` takes about a second in each test process, and transpiling
 * the modules imported by a test takes longer, so a module is transpiled once for each
 * text it has, and read from the store after that. `typescript` is loaded only when
 * the store lacks a module.
 */
let typescript = null;

function transpile(source, file_name) {
    typescript ??= require_from_here('typescript');
    return typescript.transpileModule(source, {
        compilerOptions: TRANSPILE_OPTIONS,
        fileName: file_name,
    }).outputText;
}

function stored_module_url(source, file_name) {
    const key = createHash('sha256')
        .update(JSON.stringify([TYPESCRIPT_VERSION, TRANSPILE_OPTIONS, file_name, source]))
        .digest('hex');
    return new URL(`${key}.js`, TRANSPILED_MODULE_STORE);
}

function read_stored_module(stored_url) {
    try {
        return readFileSync(stored_url, 'utf8');
    } catch {
        return null;
    }
}

/**
 * Writes the module beside its place in the store and renames it into that place, so
 * a process reading the store never reads part of a module. The store is left
 * unchanged where either step fails.
 */
function store_module(stored_url, output) {
    const partial_url = new URL(`${stored_url.href}.${process.pid}.partial`);
    try {
        mkdirSync(TRANSPILED_MODULE_STORE, {recursive: true});
        writeFileSync(partial_url, output);
        renameSync(partial_url, stored_url);
    } catch {
        rmSync(partial_url, {force: true});
    }
}

function transpiled_module(url) {
    const source = readFileSync(new URL(url), 'utf8');
    const file_name = new URL(url).pathname;
    const stored_url = stored_module_url(source, file_name);
    const stored = read_stored_module(stored_url);
    if (stored !== null) {
        return stored;
    }
    const output = transpile(source, file_name);
    store_module(stored_url, output);
    return output;
}

registerHooks({
    resolve(specifier, context, nextResolve) {
        try {
            return nextResolve(specifier, context);
        } catch (error) {
            if (error.code !== 'ERR_MODULE_NOT_FOUND'
                || !specifier.startsWith('.')
                || /\.[a-z]+$/i.test(specifier)) {
                throw error;
            }
            return nextResolve(`${specifier}.ts`, context);
        }
    },
    load(url, context, nextLoad) {
        if (!url.endsWith('.ts') || url.includes('/node_modules/')) {
            return nextLoad(url, context);
        }
        return {
            format: 'module',
            shortCircuit: true,
            source: transpiled_module(url),
        };
    },
});
