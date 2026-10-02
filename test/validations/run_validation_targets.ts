// Written by Claude Opus 5.5 (1M context), effort high.
/*
 * Running the selected targets as child processes that all run at once.
 *
 * The test files are run by one `node --test` invocation per loader, and
 * `node --test` runs each file in its own process, `--test-concurrency` of them at a
 * time. Each typecheck is one `tsc` process. The test invocations and the typechecks
 * start together, and the run ends when the last of them exits.
 *
 * A test invocation writes the records of `report_test_events.ts`, one per line. Each
 * file is reported on one line once its process has ended and its counts have
 * arrived, which can be in either order, and a file whose counts never arrive is
 * reported when the invocation exits. A typecheck is read from the errors printed by
 * `tsc --pretty false`. It passes when each of those errors is one declared a-priori
 * as pre-existing by its target.
 */

import * as child_process from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline';
import * as file_dependency_graph from './file_dependency_graph.ts';
import type * as report_test_events from './report_test_events.ts';
import * as validation_targets from './validation_targets.ts';

type RepositoryPath = file_dependency_graph.RepositoryPath;
type TestCounts = report_test_events.TestCounts;
type TestFileRecord = report_test_events.TestFileRecord;
type TypecheckError = validation_targets.TypecheckError;

export const DEFAULT_TEST_CONCURRENCY: number = Math.max(1, os.availableParallelism() - 1);

const TYPECHECK_ERROR_LINE = /^(?:(.+)\((\d+),(\d+)\): )?error (TS\d+): (.*)$/;
const TYPECHECK_BUILD_INFO_FOLDER = 'node_modules/.cache/typecheck';
const OUTPUT_LINES_SHOWN_FOR_A_FAILURE = 30;
const MESSAGE_LINES_SHOWN_FOR_A_FAILED_TEST = 12;

export interface FailedTest {
    readonly test_name: string;
    readonly line: number | null;
    readonly message: string;
}

export interface TestFileResult {
    readonly file: RepositoryPath;
    readonly passed: boolean;
    readonly duration_ms: number | null;
    readonly counts: TestCounts | null;
    readonly failures: readonly FailedTest[];
    readonly output: string;
}

export interface TestInvocationResult {
    readonly loader: validation_targets.TestLoader;
    readonly command: readonly string[];
    readonly exit_code: number | null;
    readonly seconds: number;
    readonly files: readonly TestFileResult[];
    readonly output_outside_records: string;
}

export interface ReportedTypecheckError extends TypecheckError {
    readonly line: number | null;
    readonly column: number | null;
    readonly text: string;
}

export interface TypecheckResult {
    readonly target: validation_targets.TypecheckTarget;
    readonly command: readonly string[];
    readonly exit_code: number | null;
    readonly seconds: number;
    readonly errors: readonly ReportedTypecheckError[];
    readonly new_errors: readonly ReportedTypecheckError[];
    readonly pre_existing_errors_not_reported: readonly TypecheckError[];
    readonly output: string;
}

export interface RunResults {
    readonly test_invocations: readonly TestInvocationResult[];
    readonly typechecks: readonly TypecheckResult[];
    readonly seconds: number;
}

interface FinishedProcess {
    readonly exit_code: number | null;
    readonly seconds: number;
    readonly stderr: string;
}

interface MutableTestFileState {
    finished: {passed: boolean, duration_ms: number} | null;
    counts: TestCounts | null;
    failures: FailedTest[];
    output: string[];
    is_reported: boolean;
}

export function test_command(
    loader: validation_targets.TestLoader, test_files: readonly RepositoryPath[],
    concurrency: number,
): string[] {
    const hook = loader === 'typescript hook'
        ? ['--enable-source-maps', '--import', `./${validation_targets.TYPESCRIPT_HOOK}`] : [];
    return [
        ...hook,
        '--test',
        `--test-concurrency=${concurrency}`,
        `--test-reporter=./${validation_targets.TEST_EVENT_REPORTER}`,
        '--test-reporter-destination=stdout',
        ...test_files,
    ];
}

/**
 * `tsc -p` over the configuration of `target`. `--incremental` keeps what the check
 * learned of each file in `node_modules/.cache/typecheck/`, and the next check reads
 * it for every file whose text is unchanged. The check of `tsconfig.json` took about
 * six seconds without it and between two and three with it, on 2026-09-27.
 */
export function typecheck_command(target: validation_targets.TypecheckTarget): string[] {
    return [
        validation_targets.TYPESCRIPT_COMPILER, '-p', target.config_file, '--noEmit',
        '--pretty', 'false', '--incremental',
        '--tsBuildInfoFile', `${TYPECHECK_BUILD_INFO_FOLDER}/${target.config_file}.tsbuildinfo`,
    ];
}

function start_node(
    node_arguments: readonly string[], root: string, on_stdout_line: (line: string) => void,
): Promise<FinishedProcess> {
    const started = performance.now();
    const child = child_process.spawn(process.execPath, node_arguments, {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stderr: string[] = [];
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => stderr.push(chunk));
    const lines = readline.createInterface({input: child.stdout, crlfDelay: Infinity});
    lines.on('line', on_stdout_line);
    const stdout_closed = new Promise<void>((resolve) => lines.once('close', () => resolve()));
    const exited = new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code: number | null) => resolve(code));
    });
    return Promise.all([exited, stdout_closed]).then(([exit_code]) => ({
        exit_code,
        seconds: (performance.now() - started) / 1000,
        stderr: stderr.join(''),
    }));
}

function parse_test_file_record(line: string): TestFileRecord | undefined {
    if (!line.startsWith('{')) {
        return undefined;
    }
    try {
        return JSON.parse(line) as TestFileRecord;
    } catch {
        return undefined;
    }
}

function empty_test_file_state(): MutableTestFileState {
    return {finished: null, counts: null, failures: [], output: [], is_reported: false};
}

function apply_test_file_record(state: MutableTestFileState, record: TestFileRecord): void {
    switch (record.record) {
        case 'file finished':
            state.finished = {passed: record.passed, duration_ms: record.duration_ms};
            return;
        case 'file counts':
            state.counts = record.counts;
            return;
        case 'test failed':
            state.failures.push(
                {test_name: record.test_name, line: record.line, message: record.message});
            return;
        case 'output':
            state.output.push(record.text);
            return;
    }
}

function result_of_test_file(file: RepositoryPath, state: MutableTestFileState): TestFileResult {
    return {
        file,
        passed: state.finished?.passed ?? false,
        duration_ms: state.finished?.duration_ms ?? null,
        counts: state.counts,
        failures: state.failures,
        output: state.output.join(''),
    };
}

/** `quantity` followed by `singular`, or by `plural` where the quantity is not one. */
export function counted_noun(
    quantity: number, singular: string, plural: string = `${singular}s`,
): string {
    return `${quantity} ${quantity === 1 ? singular : plural}`;
}

function failed_count(counts: TestCounts): number {
    return counts.tests - counts.passed - counts.skipped - counts.todo - counts.cancelled;
}

function describe_counts(counts: TestCounts | null): string {
    if (counts === null) {
        return 'reported no test';
    }
    const failed = failed_count(counts);
    const skipped = counts.skipped > 0 ? `, ${counts.skipped} skipped` : '';
    if (failed > 0) {
        return `${failed} of ${counted_noun(counts.tests, 'test')} failed${skipped}`;
    }
    return `${counted_noun(counts.tests, 'test')}${skipped}`;
}

function finished_target_line(
    passed: boolean, seconds: number | null, name: string, detail: string,
): string {
    const status = passed ? 'ok' : 'FAIL';
    const time = seconds === null ? '' : `${seconds.toFixed(1)} s`;
    return `${status.padEnd(5)}${time.padStart(8)}  ${name}  ${detail}`;
}

export function finished_test_file_line(result: TestFileResult): string {
    const seconds = result.duration_ms === null ? null : result.duration_ms / 1000;
    return finished_target_line(result.passed, seconds, result.file, describe_counts(result.counts));
}

export async function run_test_files(
    loader: validation_targets.TestLoader, test_files: readonly RepositoryPath[],
    concurrency: number, root: string, report: (line: string) => void,
): Promise<TestInvocationResult> {
    const states = new Map(test_files.map((file) => [file, empty_test_file_state()]));
    const output_outside_records: string[] = [];
    const command = test_command(loader, test_files, concurrency);
    const report_file = (file: RepositoryPath, state: MutableTestFileState): void => {
        state.is_reported = true;
        report(finished_test_file_line(result_of_test_file(file, state)));
    };
    const finished = await start_node(command, root, (line) => {
        const record = parse_test_file_record(line);
        if (record === undefined) {
            output_outside_records.push(line);
            return;
        }
        const state = states.get(record.file) ?? empty_test_file_state();
        states.set(record.file, state);
        apply_test_file_record(state, record);
        if (!state.is_reported && state.finished !== null && state.counts !== null) {
            report_file(record.file, state);
        }
    });
    for (const [file, state] of states) {
        if (!state.is_reported) {
            report_file(file, state);
        }
    }
    return {
        loader,
        command: [process.execPath, ...command],
        exit_code: finished.exit_code,
        seconds: finished.seconds,
        files: [...states].map(([file, state]) => result_of_test_file(file, state)),
        output_outside_records: [...output_outside_records, finished.stderr].join('\n').trim(),
    };
}

export function invocation_passed(result: TestInvocationResult): boolean {
    return result.exit_code === 0 && result.files.every((file) => file.passed);
}

function repository_file_of_typecheck_error(file: string | undefined, root: string): string {
    if (file === undefined) {
        return '';
    }
    return file_dependency_graph.repository_path_of(path.resolve(root, file), root) ?? file;
}

/** The errors of `tsc --pretty false` output, each with the indented lines that continue it. */
export function parse_typecheck_errors(output: string, root: string): ReportedTypecheckError[] {
    const errors: ReportedTypecheckError[] = [];
    const continuations: string[][] = [];
    for (const line of output.split(/\r?\n/)) {
        const matched = TYPECHECK_ERROR_LINE.exec(line);
        if (matched !== null) {
            const [, file, line_number, column, code, message] = matched;
            errors.push({
                file: repository_file_of_typecheck_error(file, root),
                line: line_number === undefined ? null : Number(line_number),
                column: column === undefined ? null : Number(column),
                code,
                message,
                text: line,
            });
            continuations.push([]);
        } else if (line.startsWith(' ') && continuations.length > 0) {
            continuations[continuations.length - 1].push(line);
        }
    }
    return errors.map((error, index) => ({
        ...error,
        text: [error.text, ...continuations[index]].join('\n'),
    }));
}

function is_same_error(reported: TypecheckError, known: TypecheckError): boolean {
    return reported.file === known.file && reported.code === known.code
        && reported.message === known.message;
}

/** Matches each reported error to one unused pre-existing error, so a second copy counts as new. */
function separate_new_errors(
    reported: readonly ReportedTypecheckError[], pre_existing: readonly TypecheckError[],
): {new_errors: ReportedTypecheckError[], not_reported: TypecheckError[]} {
    const unmatched = [...pre_existing];
    const new_errors: ReportedTypecheckError[] = [];
    for (const error of reported) {
        const index = unmatched.findIndex((known) => is_same_error(error, known));
        if (index === -1) {
            new_errors.push(error);
        } else {
            unmatched.splice(index, 1);
        }
    }
    return {new_errors, not_reported: unmatched};
}

export function typecheck_passed(result: TypecheckResult): boolean {
    return result.new_errors.length === 0 && (result.exit_code === 0 || result.errors.length > 0);
}

function describe_typecheck_errors(result: TypecheckResult): string {
    const pre_existing = result.errors.length - result.new_errors.length;
    if (result.new_errors.length > 0) {
        return `${counted_noun(result.new_errors.length, 'new error')} and ${pre_existing} pre-existing`;
    }
    if (result.errors.length > 0) {
        return `${counted_noun(pre_existing, 'pre-existing error')} and no new one`;
    }
    return result.exit_code === 0 ? 'no error' : `exit ${result.exit_code} with no error line`;
}

export function finished_typecheck_line(result: TypecheckResult): string {
    return finished_target_line(
        typecheck_passed(result), result.seconds, result.target.name,
        describe_typecheck_errors(result));
}

export async function run_typecheck(
    target: validation_targets.TypecheckTarget, root: string, report: (line: string) => void,
): Promise<TypecheckResult> {
    const stdout: string[] = [];
    const command = typecheck_command(target);
    const finished = await start_node(command, root, (line) => stdout.push(line));
    const output = [...stdout, finished.stderr].join('\n').trim();
    const errors = parse_typecheck_errors(output, root);
    const separated = separate_new_errors(errors, target.pre_existing_errors);
    const result: TypecheckResult = {
        target,
        command: [process.execPath, ...command],
        exit_code: finished.exit_code,
        seconds: finished.seconds,
        errors,
        new_errors: separated.new_errors,
        pre_existing_errors_not_reported: separated.not_reported,
        output,
    };
    report(finished_typecheck_line(result));
    return result;
}

export async function run_targets(
    targets: readonly validation_targets.ValidationTarget[], concurrency: number, root: string,
    report: (line: string) => void,
): Promise<RunResults> {
    const started = performance.now();
    const tests = targets.filter(
        (target): target is validation_targets.TestTarget => target.kind === 'test');
    const typechecks = targets.filter(
        (target): target is validation_targets.TypecheckTarget => target.kind === 'typecheck');
    const loaders = [...new Set(tests.map((target) => target.loader))];
    const test_files_of = (loader: validation_targets.TestLoader): RepositoryPath[] =>
        tests.filter((target) => target.loader === loader).map((target) => target.test_file);
    const [test_invocations, typecheck_results] = await Promise.all([
        Promise.all(loaders.map(
            (loader) => run_test_files(loader, test_files_of(loader), concurrency, root, report))),
        Promise.all(typechecks.map((target) => run_typecheck(target, root, report))),
    ]);
    return {
        test_invocations,
        typechecks: typecheck_results,
        seconds: (performance.now() - started) / 1000,
    };
}

export function run_passed(results: RunResults): boolean {
    return results.test_invocations.every(invocation_passed)
        && results.typechecks.every(typecheck_passed);
}

function last_lines(text: string, count: number): string[] {
    return text.split(/\r?\n/).filter((line) => line.trim() !== '').slice(-count);
}

function indented(lines: readonly string[], indent: string): string[] {
    return lines.map((line) => `${indent}${line}`);
}

function describe_failed_test_file(file: TestFileResult): string[] {
    const lines = [`--- ${file.file} failed ---`];
    for (const failure of file.failures) {
        const heading = failure.line === null
            ? `the test process failed  (${file.file})`
            : `${failure.test_name}  (${file.file}:${failure.line})`;
        const message = failure.message.split(/\r?\n/).slice(0, MESSAGE_LINES_SHOWN_FOR_A_FAILED_TEST);
        lines.push(`    ${heading}`, ...indented(message, '        '));
    }
    if (file.failures.length === 0 || file.counts === null) {
        const output = last_lines(file.output, OUTPUT_LINES_SHOWN_FOR_A_FAILURE);
        lines.push(output.length > 0 ? '    its output ends' : '    it wrote no output');
        lines.push(...indented(output, '        '));
    }
    return lines;
}

function describe_failed_invocation(invocation: TestInvocationResult): string[] {
    const lines = invocation.files.filter((file) => !file.passed).flatMap(describe_failed_test_file);
    if (lines.length > 0) {
        return lines;
    }
    return [
        `--- the ${invocation.loader} invocation exited ${invocation.exit_code} ---`,
        `    ${invocation.command.join(' ')}`,
        ...indented(
            last_lines(invocation.output_outside_records, OUTPUT_LINES_SHOWN_FOR_A_FAILURE), '    '),
    ];
}

function describe_failed_typecheck(result: TypecheckResult): string[] {
    const shown = result.new_errors.length > 0
        ? result.new_errors.flatMap((error) => error.text.split('\n'))
        : last_lines(result.output, OUTPUT_LINES_SHOWN_FOR_A_FAILURE);
    return [`--- ${result.target.name} failed ---`, ...indented(shown, '    ')];
}

function describe_pre_existing_errors_not_reported(result: TypecheckResult): string[] {
    if (result.pre_existing_errors_not_reported.length === 0 || !typecheck_passed(result)) {
        return [];
    }
    return [
        `${result.target.name} no longer reports these pre-existing errors, and each can be removed `
            + 'from PRE_EXISTING_TYPECHECK_ERRORS in test/validations/validation_targets.ts:',
        ...result.pre_existing_errors_not_reported.map(
            (error) => `    ${error.file} ${error.code}: ${error.message}`),
    ];
}

function describe_totals(results: RunResults): string[] {
    const files = results.test_invocations.flatMap((invocation) => invocation.files);
    const reported_counts = files.flatMap((file) => file.counts === null ? [] : [file.counts]);
    const total = (field: keyof TestCounts): number =>
        reported_counts.reduce((sum, counts) => sum + counts[field], 0);
    const failed_tests = reported_counts.reduce((sum, counts) => sum + failed_count(counts), 0);
    const failed_files = files.filter((file) => !file.passed).length;
    const failed_typechecks = results.typechecks.filter((result) => !typecheck_passed(result)).length;
    return [
        `${counted_noun(files.length, 'test file')}, ${failed_files} failed`,
        `${counted_noun(total('tests'), 'test')}, ${total('passed')} passed, ${failed_tests} failed, `
            + `${total('skipped')} skipped`,
        `${counted_noun(results.typechecks.length, 'typecheck')}, ${failed_typechecks} failed`,
        `${run_passed(results) ? 'passed' : 'FAILED'} in ${results.seconds.toFixed(1)} s of wall time`,
    ];
}

/** What failed, with each failing test and each new error, followed by the totals. */
export function summary_lines(results: RunResults): string[] {
    return [
        ...results.test_invocations.filter((invocation) => !invocation_passed(invocation))
            .flatMap(describe_failed_invocation),
        ...results.typechecks.filter((result) => !typecheck_passed(result))
            .flatMap(describe_failed_typecheck),
        ...results.typechecks.flatMap(describe_pre_existing_errors_not_reported),
        ...describe_totals(results),
    ];
}
