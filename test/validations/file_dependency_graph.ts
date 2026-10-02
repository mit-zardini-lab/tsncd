// Written by Claude Opus 5.5 (1M context), effort high.
/*
 * The dependencies of each TypeScript file under `src/` and `test/`, direct and at
 * any depth.
 *
 * A file depends on the modules imported by it and on the data files read by it.
 * Both are read from the syntax tree built for the file by `typescript`, in one walk.
 *
 * An import names a module by a specifier. A relative specifier is resolved as
 * written, then with `.ts`, then with `/index.ts`, and the first path that names a
 * file is the module imported. A specifier that resolves to no file keeps all three
 * paths, so a test that imports a deleted module is still selected when git reports
 * the deletion. A package specifier names nothing in the repository and is left out.
 *
 * A data file is named by the static text of a path. An import graph does not see
 * it. The static text is a string literal, or the head of a template literal before
 * its first substitution, or the run of string literals that follows the first
 * argument of a `join` or `resolve` call. The three are resolved in three ways.
 *
 * - A literal or head beginning with `./` or `../` is resolved against the folder of
 *   the file holding it, as `new URL('./fixtures/x.json', import.meta.url)` is.
 * - Any other literal or head holding a `/` and no colon or white space is resolved
 *   against the repository root, which is the working folder of a test run. It is
 *   kept only where it names a path that exists, because most such literals are not
 *   paths.
 * - The run of literals after the first argument of `path.join` or `path.resolve` is
 *   resolved against both folders, because the first argument names a folder that
 *   cannot be known without running the code. Each resolution is kept only where it
 *   names a path that exists.
 *
 * A text made of `.` and `..` alone names a folder holding the reading file rather
 * than a file read by it, and is left out. The `'./'` of `specifier.startsWith('./')`
 * and the `'..'` of `path.resolve(import.meta.dirname, '..')` are two such texts.
 *
 * A literal, and a run that ends the call, is the whole of a path. The path is a
 * dependency, and so is every path under it where it names a folder. A head, and a
 * run followed by another argument, is the start of a path, and every path that
 * begins with it is a dependency. A test that reads one fixture of a folder is
 * therefore selected by a change to any file in the folder. Selecting a test that did
 * not need to run costs time. Missing a test that did need to run is the failure
 * avoided by these rules.
 *
 * A path is held relative to the repository root with forward slashes, which is the
 * form of the paths reported by `git status --porcelain`, so a modified path is looked
 * up directly.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

export type RepositoryPath = string;

export const REPOSITORY_ROOT: string = path.resolve(import.meta.dirname, '..', '..');

const SOURCE_FOLDERS: readonly RepositoryPath[] = ['src', 'test'];
const FOLDERS_HOLDING_NO_SOURCE: ReadonlySet<string> = new Set(['node_modules', 'dist', '.git']);
const SPECIFIER_RESOLUTION_SUFFIXES: readonly string[] = ['', '.ts', '/index.ts'];
const PATH_JOINING_FUNCTIONS: ReadonlySet<string> = new Set(['join', 'resolve']);

/** The files named by the exact `paths` and by every path beginning with one of `path_prefixes`. */
export interface DependencySet {
    readonly paths: ReadonlySet<RepositoryPath>;
    readonly path_prefixes: ReadonlySet<string>;
}

export interface DependencyGraph {
    readonly source_files: readonly RepositoryPath[];
    readonly direct_imports: ReadonlyMap<RepositoryPath, readonly RepositoryPath[]>;
    readonly data_read: ReadonlyMap<RepositoryPath, DependencySet>;
}

type PathAnchor = 'reading folder' | 'repository root' | 'either folder';

/** The static text of a path, as it stands in the source. */
interface PathText {
    readonly text: string;
    readonly is_whole_path: boolean;
    readonly anchor: PathAnchor;
}

interface ScannedReferences {
    readonly module_specifiers: readonly string[];
    readonly path_texts: readonly PathText[];
}

export function includes_path(dependencies: DependencySet, candidate: RepositoryPath): boolean {
    if (dependencies.paths.has(candidate)) {
        return true;
    }
    for (const prefix of dependencies.path_prefixes) {
        if (candidate.startsWith(prefix)) {
            return true;
        }
    }
    return false;
}

export function union_of_dependency_sets(sets: readonly DependencySet[]): DependencySet {
    return {
        paths: new Set(sets.flatMap((set) => [...set.paths])),
        path_prefixes: new Set(sets.flatMap((set) => [...set.path_prefixes])),
    };
}

/** `absolute` relative to `root` with forward slashes, or null when it lies outside `root`. */
export function repository_path_of(absolute: string, root: string): RepositoryPath | null {
    const relative = path.relative(root, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return null;
    }
    return relative.split(path.sep).join('/');
}

/** Every file under `folder`, skipping `node_modules`, `dist` and `.git`, sorted. */
export function list_files_under(folder: RepositoryPath, root: string): RepositoryPath[] {
    const files: RepositoryPath[] = [];
    const visit_folder = (current: RepositoryPath): void => {
        const entries = fs.readdirSync(path.join(root, current), {withFileTypes: true});
        for (const entry of entries) {
            const entry_path = current === '' ? entry.name : `${current}/${entry.name}`;
            if (entry.isDirectory()) {
                if (!FOLDERS_HOLDING_NO_SOURCE.has(entry.name)) {
                    visit_folder(entry_path);
                }
            } else {
                files.push(entry_path);
            }
        }
    };
    visit_folder(folder);
    return files.sort();
}

function path_exists(candidate: RepositoryPath, root: string): boolean {
    return fs.existsSync(path.join(root, candidate));
}

function is_existing_file(candidate: RepositoryPath, root: string): boolean {
    return fs.statSync(path.join(root, candidate), {throwIfNoEntry: false})?.isFile() ?? false;
}

function is_relative_specifier(specifier: string): boolean {
    return specifier === '.' || specifier === '..'
        || specifier.startsWith('./') || specifier.startsWith('../');
}

function lies_inside_repository(normalised: string): boolean {
    return normalised !== '..' && !normalised.startsWith('../')
        && !path.posix.isAbsolute(normalised);
}

function resolve_module_specifier(
    reading_file: RepositoryPath, specifier: string, source_files: ReadonlySet<RepositoryPath>,
    root: string,
): RepositoryPath[] {
    if (!is_relative_specifier(specifier)) {
        return [];
    }
    const base = path.posix.join(path.posix.dirname(reading_file), specifier);
    if (!lies_inside_repository(base)) {
        return [];
    }
    const candidates = SPECIFIER_RESOLUTION_SUFFIXES.map((suffix) => `${base}${suffix}`);
    const resolved = candidates.find(
        (candidate) => source_files.has(candidate) || is_existing_file(candidate, root));
    return resolved === undefined ? candidates : [resolved];
}

function module_specifier_of(node: ts.Node): ts.StringLiteralLike | undefined {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        && node.moduleSpecifier !== undefined && ts.isStringLiteralLike(node.moduleSpecifier)) {
        return node.moduleSpecifier;
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)
        && ts.isStringLiteralLike(node.moduleReference.expression)) {
        return node.moduleReference.expression;
    }
    if (ts.isCallExpression(node) && node.arguments.length > 0
        && ts.isStringLiteralLike(node.arguments[0])
        && (node.expression.kind === ts.SyntaxKind.ImportKeyword
            || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        return node.arguments[0];
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
        && ts.isStringLiteralLike(node.argument.literal)) {
        return node.argument.literal;
    }
    return undefined;
}

function ambient_module_name_of(node: ts.Node): ts.StringLiteral | undefined {
    return ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name) ? node.name : undefined;
}

function called_function_name(call: ts.CallExpression): string | undefined {
    if (ts.isPropertyAccessExpression(call.expression)) {
        return call.expression.name.text;
    }
    return ts.isIdentifier(call.expression) ? call.expression.text : undefined;
}

/** The literals after a first argument that is not a literal, in a `join` or `resolve` call. */
function joined_literal_run_of(
    node: ts.Node,
): {readonly literals: readonly ts.StringLiteralLike[], readonly path_text: PathText} | undefined {
    if (!ts.isCallExpression(node) || node.arguments.length < 2
        || ts.isStringLiteralLike(node.arguments[0])) {
        return undefined;
    }
    const name = called_function_name(node);
    if (name === undefined || !PATH_JOINING_FUNCTIONS.has(name)) {
        return undefined;
    }
    const literals: ts.StringLiteralLike[] = [];
    for (const argument of node.arguments.slice(1)) {
        if (!ts.isStringLiteralLike(argument)) {
            break;
        }
        literals.push(argument);
    }
    const joined = literals.map((literal) => literal.text).join('/');
    if (literals.length === 0 || names_a_folder_holding_the_reading_file(joined)) {
        return undefined;
    }
    const is_whole_path = literals.length === node.arguments.length - 1;
    return {
        literals,
        path_text: {
            text: is_whole_path ? joined : `${joined}/`,
            is_whole_path,
            anchor: 'either folder',
        },
    };
}

function names_a_folder_holding_the_reading_file(text: string): boolean {
    return text.split('/').every(
        (segment) => segment === '' || segment === '.' || segment === '..');
}

function static_text_of(
    node: ts.Node,
): {readonly text: string, readonly is_whole_path: boolean} | undefined {
    if (ts.isStringLiteralLike(node)) {
        return {text: node.text, is_whole_path: true};
    }
    if (ts.isTemplateExpression(node)) {
        return {text: node.head.text, is_whole_path: false};
    }
    return undefined;
}

function path_text_of_literal(node: ts.Node): PathText | undefined {
    const static_text = static_text_of(node);
    if (static_text === undefined || names_a_folder_holding_the_reading_file(static_text.text)) {
        return undefined;
    }
    const {text, is_whole_path} = static_text;
    if (text.startsWith('./') || text.startsWith('../')) {
        return {text, is_whole_path, anchor: 'reading folder'};
    }
    if (text.includes('/') && !text.startsWith('/') && !/[:\s]/.test(text)) {
        return {text, is_whole_path, anchor: 'repository root'};
    }
    return undefined;
}

function scan_references(source_file: ts.SourceFile): ScannedReferences {
    const module_specifiers: string[] = [];
    const path_texts: PathText[] = [];
    const literals_already_read = new Set<ts.Node>();
    const visit = (node: ts.Node): void => {
        const specifier = module_specifier_of(node);
        if (specifier !== undefined) {
            module_specifiers.push(specifier.text);
            literals_already_read.add(specifier);
        }
        const ambient_name = ambient_module_name_of(node);
        if (ambient_name !== undefined) {
            literals_already_read.add(ambient_name);
        }
        const joined_run = joined_literal_run_of(node);
        if (joined_run !== undefined) {
            path_texts.push(joined_run.path_text);
            joined_run.literals.forEach((literal) => literals_already_read.add(literal));
        }
        if (!literals_already_read.has(node)) {
            const path_text = path_text_of_literal(node);
            if (path_text !== undefined) {
                path_texts.push(path_text);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source_file);
    return {module_specifiers, path_texts};
}

const NO_DEPENDENCY: DependencySet = {paths: new Set(), path_prefixes: new Set()};

/** The dependencies named by a path text resolved against `folder`. */
function dependencies_of_path_text_in(folder: RepositoryPath, path_text: PathText): DependencySet {
    const resolved = path.posix.join(folder, path_text.text);
    if (!lies_inside_repository(resolved)) {
        return NO_DEPENDENCY;
    }
    if (!path_text.is_whole_path) {
        return {paths: new Set(), path_prefixes: new Set([resolved === '.' ? '' : resolved])};
    }
    const whole = resolved.replace(/\/$/, '');
    return {
        paths: new Set([whole]),
        path_prefixes: new Set([whole === '.' ? '' : `${whole}/`]),
    };
}

/** The path that must exist for a path text to be kept, which for a head is its folder. */
function path_that_must_exist(resolved: string, is_whole_path: boolean): string {
    if (is_whole_path || resolved.endsWith('/')) {
        return resolved;
    }
    return path.posix.dirname(resolved);
}

/** As `dependencies_of_path_text_in`, and nothing where the path text names no existing path. */
function dependencies_of_existing_path_text_in(
    folder: RepositoryPath, path_text: PathText, root: string,
): DependencySet {
    const resolved = path.posix.join(folder, path_text.text);
    if (!lies_inside_repository(resolved)
        || !path_exists(path_that_must_exist(resolved, path_text.is_whole_path), root)) {
        return NO_DEPENDENCY;
    }
    return dependencies_of_path_text_in(folder, path_text);
}

function resolve_path_text(
    reading_file: RepositoryPath, path_text: PathText, root: string,
): DependencySet {
    const reading_folder = path.posix.dirname(reading_file);
    switch (path_text.anchor) {
        case 'reading folder':
            return dependencies_of_path_text_in(reading_folder, path_text);
        case 'repository root':
            return dependencies_of_existing_path_text_in('', path_text, root);
        case 'either folder':
            return union_of_dependency_sets([
                dependencies_of_existing_path_text_in(reading_folder, path_text, root),
                dependencies_of_existing_path_text_in('', path_text, root),
            ]);
    }
}

export function list_source_files(root: string): RepositoryPath[] {
    return SOURCE_FOLDERS
        .filter((folder) => path_exists(folder, root))
        .flatMap((folder) => list_files_under(folder, root))
        .filter((file) => file.endsWith('.ts'));
}

function parse_source_file(file: RepositoryPath, root: string): ts.SourceFile {
    return ts.createSourceFile(
        file,
        fs.readFileSync(path.join(root, file), 'utf8'),
        {languageVersion: ts.ScriptTarget.Latest, jsDocParsingMode: ts.JSDocParsingMode.ParseNone},
        false,
        ts.ScriptKind.TS);
}

/** Parses every TypeScript file under `src/` and `test/`, and records its imports and data reads. */
export function build_dependency_graph(root: string = REPOSITORY_ROOT): DependencyGraph {
    const source_files = list_source_files(root);
    const known_source_files = new Set(source_files);
    const direct_imports = new Map<RepositoryPath, readonly RepositoryPath[]>();
    const data_read = new Map<RepositoryPath, DependencySet>();
    for (const file of source_files) {
        const references = scan_references(parse_source_file(file, root));
        const imported = references.module_specifiers.flatMap(
            (specifier) => resolve_module_specifier(file, specifier, known_source_files, root));
        direct_imports.set(
            file, [...new Set(imported)].filter((imported_file) => imported_file !== file));
        data_read.set(file, union_of_dependency_sets(references.path_texts.map(
            (path_text) => resolve_path_text(file, path_text, root))));
    }
    return {source_files, direct_imports, data_read};
}

/**
 * The entry points and every repository file imported by them, at any depth.
 *
 * The walk is over files rather than over import paths, so a module imported from
 * fifty files is entered once, and an import cycle ends.
 */
export function files_imported_from(
    graph: DependencyGraph, entry_points: readonly RepositoryPath[],
): Set<RepositoryPath> {
    const visited = new Set<RepositoryPath>(entry_points);
    const frontier = [...entry_points];
    for (let current = frontier.pop(); current !== undefined; current = frontier.pop()) {
        for (const imported of graph.direct_imports.get(current) ?? []) {
            if (!visited.has(imported)) {
                visited.add(imported);
                frontier.push(imported);
            }
        }
    }
    return visited;
}

/** The files imported by `entry_points` at any depth, and the data files read by each of them. */
export function files_imported_and_read_from(
    graph: DependencyGraph, entry_points: readonly RepositoryPath[],
): DependencySet {
    const imported = files_imported_from(graph, entry_points);
    const read = [...imported].flatMap((file) => {
        const data_read = graph.data_read.get(file);
        return data_read === undefined ? [] : [data_read];
    });
    return union_of_dependency_sets([{paths: imported, path_prefixes: new Set()}, ...read]);
}
