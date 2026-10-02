// Written by Claude Opus 5.5 (1M context), effort high.
/*
 * A reporter for `node --test` that writes one JSON record per line, for
 * `run_validation_targets.ts` to read while the tests run.
 *
 * `node --test` runs each test file in its own process and reports every file as a
 * test at nesting 0, named by the path of the file on the command line, whose
 * duration is the wall time of the process. That test fails with `subtestsFailed`
 * when a test inside the file failed. It fails with `testCodeFailure` when the
 * process itself failed, which is how a file that does not load is reported. The
 * reporter keeps the file tests, the per-file summaries, every failing test but the
 * ones failing only because a subtest failed, and the output written by each
 * process. It names each file relative to the working folder with forward slashes.
 *
 * The module has a default export because `node --test --test-reporter=<module>`
 * takes the default export of the module as the reporter.
 */

import * as path from 'node:path';
import type {TestEvent} from 'node:test/reporters';

export interface TestCounts {
    readonly tests: number;
    readonly passed: number;
    readonly skipped: number;
    readonly todo: number;
    readonly cancelled: number;
}

export type TestFileRecord =
    | {
        readonly record: 'file finished',
        readonly file: string,
        readonly passed: boolean,
        readonly duration_ms: number,
    }
    | {
        readonly record: 'file counts',
        readonly file: string,
        readonly counts: TestCounts,
    }
    | {
        readonly record: 'test failed',
        readonly file: string,
        readonly test_name: string,
        readonly line: number | null,
        readonly message: string,
    }
    | {
        readonly record: 'output',
        readonly file: string,
        readonly text: string,
    };

const FAILURE_OF_A_SUBTEST_ONLY = 'subtestsFailed';

function working_folder_path(file: string): string {
    return path.relative(process.cwd(), path.resolve(file)).split(path.sep).join('/');
}

function failure_type_of(error: Error): string | undefined {
    const failure_type: unknown = (error as {failureType?: unknown}).failureType;
    return typeof failure_type === 'string' ? failure_type : undefined;
}

function message_of_failure(error: Error): string {
    const cause: unknown = error.cause;
    if (cause instanceof Error) {
        return cause.message;
    }
    return cause === undefined ? error.message : String(cause);
}

function is_file_test(name: string, file: string, nesting: number): boolean {
    return nesting === 0 && path.resolve(name) === path.resolve(file);
}

function record_of_event(event: TestEvent): TestFileRecord | undefined {
    switch (event.type) {
        case 'test:complete': {
            const {file, name, nesting, details} = event.data;
            if (file === undefined || !is_file_test(name, file, nesting)) {
                return undefined;
            }
            return {
                record: 'file finished',
                file: working_folder_path(file),
                passed: details.passed,
                duration_ms: details.duration_ms,
            };
        }
        case 'test:fail': {
            const {file, name, nesting, line, details} = event.data;
            const fails_only_by_a_subtest =
                failure_type_of(details.error) === FAILURE_OF_A_SUBTEST_ONLY;
            if (file === undefined || fails_only_by_a_subtest) {
                return undefined;
            }
            return {
                record: 'test failed',
                file: working_folder_path(file),
                test_name: name,
                line: is_file_test(name, file, nesting) ? null : line ?? null,
                message: message_of_failure(details.error),
            };
        }
        case 'test:summary': {
            const {file, counts} = event.data;
            if (file === undefined) {
                return undefined;
            }
            return {
                record: 'file counts',
                file: working_folder_path(file),
                counts: {
                    tests: counts.tests,
                    passed: counts.passed,
                    skipped: counts.skipped,
                    todo: counts.todo,
                    cancelled: counts.cancelled,
                },
            };
        }
        case 'test:stdout':
        case 'test:stderr':
            return {
                record: 'output',
                file: working_folder_path(event.data.file),
                text: event.data.message,
            };
        default:
            return undefined;
    }
}

export default async function* write_test_file_records(
    source: AsyncIterable<TestEvent>,
): AsyncGenerator<string> {
    for await (const event of source) {
        const record = record_of_event(event);
        if (record !== undefined) {
            yield `${JSON.stringify(record)}\n`;
        }
    }
}
