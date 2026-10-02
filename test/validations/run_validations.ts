// Written by Claude Opus 5.5 (1M context), effort high.
/*
 * Running the repository's validations, all of them or the ones a change reaches.
 *
 *     npm run validate                                  # what the working tree reaches
 *     npm run validate:all                              # every target
 *     npm run validate -- src/data_structure/Term.ts    # what the named paths reach
 *     npm run validate -- --plan                        # the selection, run nothing
 *     npm run validate -- --since main                  # add what differs from main
 *     npm run validate -- --name arrow --kind test      # narrow the targets
 *     npm run validate -- --dependencies-of box_form    # the files a target depends on
 *
 * With no path named and no `--since`, the working tree decides. When git reports
 * modified files, the run covers the targets they reach, and when the tree is clean
 * the run covers every target. Paths named on the command line replace the working
 * tree, so an agent can name its own modified files and leave out the modifications
 * of others. `--since REF` adds every path that differs from REF.
 *
 * Node runs this file directly, with no build step, so this file and every module
 * imported by it use only the syntax accepted by type stripping, and name each
 * relative import with its `.ts` extension. `tsconfig.server.json` typechecks them.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as util from 'node:util';
import * as file_dependency_graph from './file_dependency_graph.ts';
import * as list_modified_files from './list_modified_files.ts';
import * as run_validation_targets from './run_validation_targets.ts';
import * as select_affected_targets from './select_affected_targets.ts';
import * as validation_targets from './validation_targets.ts';

type RepositoryPath = file_dependency_graph.RepositoryPath;
type ValidationTarget = validation_targets.ValidationTarget;

const ROOT = file_dependency_graph.REPOSITORY_ROOT;
const REACHING_FILES_SHOWN_PER_TARGET = 4;
const EXIT_CODE_OF_A_FAILED_RUN = 1;
const EXIT_CODE_OF_A_REFUSED_COMMAND = 2;

const OPTIONS = {
    'all': {type: 'boolean', default: false},
    'plan': {type: 'boolean', default: false},
    'since': {type: 'string'},
    'name': {type: 'string', multiple: true},
    'kind': {type: 'string', multiple: true},
    'concurrency': {type: 'string'},
    'dependencies-of': {type: 'string'},
    'help': {type: 'boolean', short: 'h', default: false},
} as const;

type CommandLine =
    ReturnType<typeof util.parseArgs<{options: typeof OPTIONS, allowPositionals: true}>>;

class CommandRefused extends Error {}

interface ModifiedPaths {
    readonly paths: readonly RepositoryPath[];
    readonly is_named_or_compared: boolean;
}

function usage(): string {
    return [
        'Usage: npm run validate -- [paths...] [options]',
        '',
        'A named path, relative to the repository root or absolute, stands for a modified',
        'file, and a named folder for every file under it. With no path named, git decides.',
        '',
        'Options:',
        '  --all                 Run every target, whatever is modified',
        '  --plan                Print the selected targets and run nothing',
        '  --since REF           Treat every path that differs from REF as modified as well',
        '  --name PATTERN        Keep the targets whose name contains PATTERN, repeatable',
        '  --kind test|typecheck Keep the targets of this kind, repeatable',
        '  --concurrency N       The number of test files run at once, by default '
            + `${run_validation_targets.DEFAULT_TEST_CONCURRENCY}`,
        '  --dependencies-of PATTERN  Print every dependency of the matching targets',
    ].join('\n');
}

function parse_concurrency(text: string | undefined): number {
    if (text === undefined) {
        return run_validation_targets.DEFAULT_TEST_CONCURRENCY;
    }
    const concurrency = Number(text);
    if (!Number.isInteger(concurrency) || concurrency < 1) {
        throw new CommandRefused(`--concurrency ${text} is not a positive integer.`);
    }
    return concurrency;
}

function narrowed_by_name_and_kind(
    targets: readonly ValidationTarget[], names: readonly string[], kinds: readonly string[],
): ValidationTarget[] {
    const unknown_kinds = kinds.filter(
        (kind) => !validation_targets.TARGET_KINDS.some((known) => known === kind));
    if (unknown_kinds.length > 0) {
        throw new CommandRefused(`--kind ${unknown_kinds.join(', ')} names no kind of target. `
            + `The kinds are ${validation_targets.TARGET_KINDS.join(' and ')}.`);
    }
    return targets.filter((target) =>
        (names.length === 0 || names.some((name) => target.name.includes(name)))
        && (kinds.length === 0 || kinds.includes(target.kind)));
}

function names_an_existing_file(candidate: RepositoryPath): boolean {
    return fs.statSync(path.join(ROOT, candidate), {throwIfNoEntry: false})?.isFile() ?? false;
}

/** Prints the dependencies of each matching target, less the prefix of a whole path naming a file. */
function print_dependencies_of(
    targets: readonly ValidationTarget[], graph: file_dependency_graph.DependencyGraph,
    pattern: string,
): void {
    const matching = targets.filter((target) => target.name.includes(pattern));
    if (matching.length === 0) {
        console.log(`no target's name contains ${pattern}`);
    }
    for (const target of matching) {
        const dependencies = validation_targets.dependencies_of_target(target, graph);
        const paths = [...dependencies.paths].sort();
        const prefixes = [...dependencies.path_prefixes]
            .filter((prefix) => !names_an_existing_file(prefix.replace(/\/$/, '')))
            .sort();
        const file_count = run_validation_targets.counted_noun(paths.length, 'file');
        const prefix_count = run_validation_targets.counted_noun(
            prefixes.length, 'path prefix', 'path prefixes');
        console.log(`${target.name}, ${file_count} and ${prefix_count}`);
        paths.forEach((file) => console.log(`    ${file}`));
        prefixes.forEach((prefix) => console.log(`    ${prefix === '' ? '(every path)' : prefix}*`));
    }
}

function modified_paths(command_line: CommandLine): ModifiedPaths {
    const named = command_line.positionals;
    const since = command_line.values.since;
    let paths: RepositoryPath[];
    if (named.length > 0) {
        const resolved = list_modified_files.repository_paths_of_named_paths(named, ROOT);
        resolved.paths_outside_repository.forEach(
            (outside) => console.log(`${outside} lies outside the repository and is left out`));
        paths = [...resolved.repository_paths];
        const named_count = run_validation_targets.counted_noun(paths.length, 'file');
        console.log(`the named paths hold ${named_count}`);
    } else {
        paths = list_modified_files.modified_files_in_working_tree(ROOT);
        const modified_count = run_validation_targets.counted_noun(paths.length, 'modified file');
        console.log(`git status reports ${modified_count}`);
    }
    if (since !== undefined) {
        const differing = list_modified_files.modified_files_since(since, ROOT);
        const differing_count = run_validation_targets.counted_noun(differing.length, 'file');
        console.log(`git diff reports ${differing_count} differing from ${since}`);
        paths = [...new Set([...paths, ...differing])].sort();
    }
    return {paths, is_named_or_compared: named.length > 0 || since !== undefined};
}

function print_selection(
    selection: select_affected_targets.TargetSelection, candidate_count: number,
): void {
    const candidates = run_validation_targets.counted_noun(candidate_count, 'target');
    console.log(`this run covers ${selection.selected.length} of ${candidates}`);
    for (const target of selection.selected) {
        const reaching = selection.modified_files_reaching.get(target.name) ?? [];
        const shown = reaching.slice(0, REACHING_FILES_SHOWN_PER_TARGET).join(', ');
        const remainder = reaching.length > REACHING_FILES_SHOWN_PER_TARGET
            ? ` and ${reaching.length - REACHING_FILES_SHOWN_PER_TARGET} more` : '';
        console.log(`    ${target.name}  reached by ${shown}${remainder}`);
    }
    const unreached = selection.modified_files_reaching_no_target;
    if (unreached.length > 0) {
        const unreached_count =
            run_validation_targets.counted_noun(unreached.length, 'modified file');
        const reach_and_are = unreached.length === 1
            ? 'reaches no target and is' : 'reach no target and are';
        console.log(`${unreached_count} ${reach_and_are} checked by no validation:`);
        unreached.forEach((file) => console.log(`    ${file}`));
    }
}

function selected_targets(
    command_line: CommandLine, candidates: readonly ValidationTarget[],
): ValidationTarget[] {
    const every_candidate = candidates.length === 1
        ? 'its one target' : `every one of the ${candidates.length} targets`;
    if (command_line.values.all) {
        console.log(`this run covers ${every_candidate}`);
        return [...candidates];
    }
    const modified = modified_paths(command_line);
    if (modified.paths.length === 0 && !modified.is_named_or_compared) {
        console.log(`the working tree is clean, so this run covers ${every_candidate}`);
        return [...candidates];
    }
    const graph = file_dependency_graph.build_dependency_graph(ROOT);
    const selection =
        select_affected_targets.targets_reached_by(candidates, modified.paths, graph);
    print_selection(selection, candidates.length);
    return [...selection.selected];
}

async function run_command(arguments_: readonly string[]): Promise<number> {
    const command_line = util.parseArgs(
        {args: [...arguments_], options: OPTIONS, allowPositionals: true});
    if (command_line.values.help) {
        console.log(usage());
        return 0;
    }
    const concurrency = parse_concurrency(command_line.values.concurrency);
    const every_target = validation_targets.all_targets(ROOT);
    const dependencies_pattern = command_line.values['dependencies-of'];
    if (dependencies_pattern !== undefined) {
        const graph = file_dependency_graph.build_dependency_graph(ROOT);
        print_dependencies_of(every_target, graph, dependencies_pattern);
        return 0;
    }
    const candidates = narrowed_by_name_and_kind(
        every_target, command_line.values.name ?? [], command_line.values.kind ?? []);
    const selected = selected_targets(command_line, candidates);
    if (command_line.values.plan) {
        return 0;
    }
    if (selected.length === 0) {
        console.log('no target was selected');
        return 0;
    }
    const results = await run_validation_targets.run_targets(
        selected, concurrency, ROOT, console.log);
    run_validation_targets.summary_lines(results).forEach((line) => console.log(line));
    return run_validation_targets.run_passed(results) ? 0 : EXIT_CODE_OF_A_FAILED_RUN;
}

function is_refused_command(error: unknown): boolean {
    if (error instanceof CommandRefused) {
        return true;
    }
    const code: unknown = error instanceof Error ? (error as {code?: unknown}).code : undefined;
    return typeof code === 'string' && code.startsWith('ERR_PARSE_ARGS');
}

try {
    process.exitCode = await run_command(process.argv.slice(2));
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if (is_refused_command(error)) {
        console.error(usage());
        process.exitCode = EXIT_CODE_OF_A_REFUSED_COMMAND;
    } else {
        process.exitCode = EXIT_CODE_OF_A_FAILED_RUN;
    }
}
