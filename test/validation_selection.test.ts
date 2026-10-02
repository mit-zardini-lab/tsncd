// Written by Claude Opus 5.5 (1M context), effort high.
/*
 * The selection made by `test/validations/`. The tests check the imports and the data
 * reads found for a test, the modified paths that reach it, and the form given to a
 * path named by an agent.
 *
 * The rules are checked on a small repository written to a temporary folder, whose
 * files are parsed and never run. The loaders are checked on this repository.
 * `tsconfig.server.json` includes this file, so it runs under node's own type
 * stripping, as the runner does.
 */

import * as assert from 'node:assert/strict';
import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {after, test} from 'node:test';
import * as file_dependency_graph from './validations/file_dependency_graph.ts';
import * as list_modified_files from './validations/list_modified_files.ts';
import * as select_affected_targets from './validations/select_affected_targets.ts';
import * as validation_targets from './validations/validation_targets.ts';

const TEMPORARY_REPOSITORY = fs.mkdtempSync(path.join(os.tmpdir(), 'tsncd-validation-selection-'));

const TEMPORARY_FILES: Readonly<Record<string, string>> = {
    'src/a.ts': 'export const A = 1;\n',
    'src/b/index.ts': "import {A} from '../a';\nexport const B = A;\n",
    'src/unrelated.ts': 'export const UNRELATED = 2;\n',
    'test/one.test.ts': [
        "import * as path from 'node:path';",
        "import {B} from '../src/b';",
        "import './missing';",
        'const DIRECTORY = path.dirname(new URL(import.meta.url).pathname);',
        "const name = 'x.json';",
        'export const fixture = new URL(`./samples/${name}`, import.meta.url);',
        "export const data = path.join(DIRECTORY, 'data', name);",
        "export const is_relative = (text: string): boolean => text.startsWith('./');",
        'export const value = B;',
        '',
    ].join('\n'),
    'test/samples/x.json': '{}\n',
    'test/data/x.json': '{}\n',
    'test/other.ts': 'export const OTHER = 3;\n',
    'README.md': '# A repository for the selection tests\n',
};

for (const [file, text] of Object.entries(TEMPORARY_FILES)) {
    fs.mkdirSync(path.dirname(path.join(TEMPORARY_REPOSITORY, file)), {recursive: true});
    fs.writeFileSync(path.join(TEMPORARY_REPOSITORY, file), text);
}

after(() => fs.rmSync(TEMPORARY_REPOSITORY, {recursive: true, force: true}));

const temporary_graph = file_dependency_graph.build_dependency_graph(TEMPORARY_REPOSITORY);
const temporary_targets = validation_targets.all_targets(TEMPORARY_REPOSITORY);

function dependencies_of(
    targets: readonly validation_targets.ValidationTarget[],
    graph: file_dependency_graph.DependencyGraph, name: string,
): file_dependency_graph.DependencySet {
    const target = targets.find((each) => each.name === name);
    assert.ok(target !== undefined, `no target is named ${name}`);
    return validation_targets.dependencies_of_target(target, graph);
}

test('an import resolves to the file with the .ts extension or to the index of a folder', (): void => {
    const imported = file_dependency_graph.files_imported_from(
        temporary_graph, ['test/one.test.ts']);
    assert.ok(imported.has('src/b/index.ts'));
    assert.ok(imported.has('src/a.ts'));
    assert.ok(!imported.has('src/unrelated.ts'));
});

test('an import that resolves to no file keeps every path it could name', (): void => {
    const imported = temporary_graph.direct_imports.get('test/one.test.ts') ?? [];
    assert.deepEqual(
        imported.filter((file) => file.startsWith('test/missing')),
        ['test/missing', 'test/missing.ts', 'test/missing/index.ts']);
});

test('the head of a template literal makes every file under its folder a dependency', (): void => {
    const dependencies = dependencies_of(temporary_targets, temporary_graph, 'test/one.test.ts');
    assert.ok(file_dependency_graph.includes_path(dependencies, 'test/samples/x.json'));
    assert.ok(file_dependency_graph.includes_path(dependencies, 'test/samples/added_later.json'));
});

test('the literals after the first argument of path.join resolve against the reading folder', (): void => {
    const dependencies = dependencies_of(temporary_targets, temporary_graph, 'test/one.test.ts');
    assert.ok(file_dependency_graph.includes_path(dependencies, 'test/data/x.json'));
});

test('a text made of dots and slashes alone names no dependency', (): void => {
    const dependencies = dependencies_of(temporary_targets, temporary_graph, 'test/one.test.ts');
    assert.ok(!file_dependency_graph.includes_path(dependencies, 'test/other.ts'));
});

test('a modified file reaches the targets that depend on it and is otherwise reported', (): void => {
    const selection = select_affected_targets.targets_reached_by(
        temporary_targets, ['README.md', 'src/a.ts', 'src/unrelated.ts'], temporary_graph);
    assert.deepEqual(selection.selected.map((target) => target.name), ['test/one.test.ts']);
    assert.deepEqual(selection.modified_files_reaching.get('test/one.test.ts'), ['src/a.ts']);
    assert.deepEqual(
        selection.modified_files_reaching_no_target, ['README.md', 'src/unrelated.ts']);
});

test('a named path takes the form of a path reported by git, and a folder stands for its files', (): void => {
    const named = list_modified_files.repository_paths_of_named_paths([
        'src\\a.ts',
        path.join(TEMPORARY_REPOSITORY, 'test', 'samples'),
        path.join(os.tmpdir(), 'outside.ts'),
    ], TEMPORARY_REPOSITORY);
    assert.deepEqual(named.repository_paths, ['src/a.ts', 'test/samples/x.json']);
    assert.equal(named.paths_outside_repository.length, 1);
});

test('a rename in the working tree reports both of its paths', (): void => {
    const git = (...git_arguments: string[]): void => {
        const finished = child_process.spawnSync('git', [
            '-c', 'user.name=validation', '-c', 'user.email=validation@localhost',
            '-c', 'core.autocrlf=false', ...git_arguments,
        ], {cwd: TEMPORARY_REPOSITORY, encoding: 'utf8'});
        assert.equal(finished.status, 0, finished.stderr);
    };
    git('init', '--quiet');
    git('add', '.');
    git('commit', '--quiet', '-m', 'the selection tests');
    git('mv', 'src/unrelated.ts', 'src/renamed.ts');
    assert.deepEqual(
        list_modified_files.modified_files_in_working_tree(TEMPORARY_REPOSITORY),
        ['src/renamed.ts', 'src/unrelated.ts']);
});

test('a test included by tsconfig.server.json runs under node type stripping', (): void => {
    const targets = validation_targets.all_targets(file_dependency_graph.REPOSITORY_ROOT);
    const loader_of = (name: string): validation_targets.TestLoader | undefined => {
        const target = targets.find((each) => each.name === name);
        return target?.kind === 'test' ? target.loader : undefined;
    };
    assert.equal(loader_of('test/server_preview_client.test.ts'), 'node type stripping');
    assert.equal(loader_of('test/validation_selection.test.ts'), 'node type stripping');
    assert.ok(targets.some((target) => target.kind === 'test' && target.loader === 'typescript hook'));
});
