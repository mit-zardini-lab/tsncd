// Written by Claude Opus 5.5 (1M context), effort high.
/*
 * The validations of the repository, and the dependencies of each. A change to a
 * dependency of a target selects the target. The dependencies are found from the
 * dependency graph, which a run over every target does not build.
 *
 * A test target is a file matching `test/*.test.ts`. It is found by that name rather
 * than read from a list, so a new test file runs as soon as it exists. It depends on
 * the modules imported by it at any depth and on the files read by those modules, on
 * the reporter used by the runner, on the hook where the test runs under it, and on
 * `package.json` and `package-lock.json`, which fix the version of every package used
 * by the run.
 *
 * A test file included by `tsconfig.server.json` is a test of the node entry points,
 * and runs under node's own type stripping, as `npm run capture` runs the module under
 * test. `test/register_typescript.mjs` transpiles any TypeScript and resolves an
 * import written without its `.ts`, so under that hook a test would pass where node
 * itself refuses to load the module. Every other test file runs under the hook.
 *
 * A typecheck target is a `tsconfig*.json` at the repository root, run as
 * `tsc -p <config> --noEmit`. It depends on its configuration, on the files named by
 * the configuration, on every module imported by those files, and on the package
 * files. `tsconfig.json` names every file under `src/` but the node entry points, and
 * names no test file.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import * as file_dependency_graph from './file_dependency_graph.ts';

type RepositoryPath = file_dependency_graph.RepositoryPath;
type DependencySet = file_dependency_graph.DependencySet;

export const TEST_FOLDER: RepositoryPath = 'test';
export const TEST_FILE_SUFFIX = '.test.ts';
export const TYPESCRIPT_HOOK: RepositoryPath = 'test/register_typescript.mjs';
export const TEST_EVENT_REPORTER: RepositoryPath = 'test/validations/report_test_events.ts';
export const NODE_ENTRY_POINT_CONFIG: RepositoryPath = 'tsconfig.server.json';
export const TYPESCRIPT_COMPILER: RepositoryPath = 'node_modules/typescript/bin/tsc';

const PACKAGE_FILES: readonly RepositoryPath[] = ['package.json', 'package-lock.json'];
const TYPECHECK_CONFIG_NAME = /^tsconfig.*\.json$/;

export type TestLoader = 'typescript hook' | 'node type stripping';

export interface TypecheckError {
    readonly file: RepositoryPath;
    readonly code: string;
    readonly message: string;
}

export interface TestTarget {
    readonly kind: 'test';
    readonly name: string;
    readonly test_file: RepositoryPath;
    readonly loader: TestLoader;
}

export interface TypecheckTarget {
    readonly kind: 'typecheck';
    readonly name: string;
    readonly config_file: RepositoryPath;
    readonly named_files: readonly RepositoryPath[];
    readonly pre_existing_errors: readonly TypecheckError[];
}

export type ValidationTarget = TestTarget | TypecheckTarget;
export type TargetKind = ValidationTarget['kind'];

export const TARGET_KINDS: readonly TargetKind[] = ['test', 'typecheck'];

/**
 * The errors `tsc -p tsconfig.json` reports in this repository before a change. It
 * reports none, so every error the typecheck finds is new.
 */
const PRE_EXISTING_ERRORS_OF_THE_BROWSER_TYPECHECK: readonly TypecheckError[] = [];

/**
 * The errors declared a-priori for each configuration. A typecheck passes while each
 * error reported by it is one of them.
 */
const PRE_EXISTING_TYPECHECK_ERRORS: ReadonlyMap<RepositoryPath, readonly TypecheckError[]> =
    new Map([['tsconfig.json', PRE_EXISTING_ERRORS_OF_THE_BROWSER_TYPECHECK]]);

export class TypecheckConfigUnreadable extends Error {}

export function discover_test_files(root: string): RepositoryPath[] {
    return fs.readdirSync(path.join(root, TEST_FOLDER))
        .filter((name) => name.endsWith(TEST_FILE_SUFFIX))
        .sort()
        .map((name) => `${TEST_FOLDER}/${name}`);
}

export function discover_typecheck_configs(root: string): RepositoryPath[] {
    return fs.readdirSync(root).filter((name) => TYPECHECK_CONFIG_NAME.test(name)).sort();
}

/** The root files of `tsc -p config_file`, which its `include`, `exclude` and `files` name. */
export function files_named_by_typecheck_config(
    config_file: RepositoryPath, root: string,
): RepositoryPath[] {
    const config_path = path.join(root, config_file);
    const read = ts.readConfigFile(config_path, ts.sys.readFile);
    if (read.error !== undefined) {
        throw new TypecheckConfigUnreadable(
            `${config_file}: ${ts.flattenDiagnosticMessageText(read.error.messageText, ' ')}`);
    }
    const parsed = ts.parseJsonConfigFileContent(
        read.config, ts.sys, path.dirname(config_path), undefined, config_path);
    return parsed.fileNames
        .map((file_name) => file_dependency_graph.repository_path_of(path.resolve(file_name), root))
        .filter((file): file is RepositoryPath => file !== null)
        .sort();
}

function dependencies_of_test(
    target: TestTarget, graph: file_dependency_graph.DependencyGraph,
): DependencySet {
    const started_through: RepositoryPath[] =
        target.loader === 'typescript hook' ? [TYPESCRIPT_HOOK] : [];
    return file_dependency_graph.union_of_dependency_sets([
        file_dependency_graph.files_imported_and_read_from(
            graph, [target.test_file, TEST_EVENT_REPORTER]),
        {paths: new Set([...started_through, ...PACKAGE_FILES]), path_prefixes: new Set()},
    ]);
}

function dependencies_of_typecheck(
    target: TypecheckTarget, graph: file_dependency_graph.DependencyGraph,
): DependencySet {
    return {
        paths: new Set([
            target.config_file,
            ...PACKAGE_FILES,
            ...file_dependency_graph.files_imported_from(graph, target.named_files),
        ]),
        path_prefixes: new Set(),
    };
}

/** Every repository path whose modification selects `target`. */
export function dependencies_of_target(
    target: ValidationTarget, graph: file_dependency_graph.DependencyGraph,
): DependencySet {
    switch (target.kind) {
        case 'test':
            return dependencies_of_test(target, graph);
        case 'typecheck':
            return dependencies_of_typecheck(target, graph);
    }
}

export function all_targets(root: string): ValidationTarget[] {
    const configs = discover_typecheck_configs(root);
    const files_of_config = new Map(configs.map(
        (config) => [config, files_named_by_typecheck_config(config, root)]));
    const node_entry_point_files = new Set(files_of_config.get(NODE_ENTRY_POINT_CONFIG) ?? []);
    const tests: ValidationTarget[] = discover_test_files(root).map((test_file) => ({
        kind: 'test',
        name: test_file,
        test_file,
        loader: node_entry_point_files.has(test_file) ? 'node type stripping' : 'typescript hook',
    }));
    const typechecks: ValidationTarget[] = configs.map((config_file) => ({
        kind: 'typecheck',
        name: `typecheck ${config_file}`,
        config_file,
        named_files: files_of_config.get(config_file) ?? [],
        pre_existing_errors: PRE_EXISTING_TYPECHECK_ERRORS.get(config_file) ?? [],
    }));
    return [...tests, ...typechecks];
}
