// Written by Claude Opus 5.5 (1M context), effort high.
/*
 * The repository paths reported by git as modified, and the paths named by an agent.
 *
 * `git status --porcelain` reports the working tree, staged, unstaged and untracked,
 * and `git diff --name-only <ref>` reports what differs from a commit or a branch.
 * Both are read with `-z`, which separates paths with a NUL and quotes none of them.
 * A rename is reported with both of its paths. The old path is kept because a test
 * that imports it now imports a file that is gone, and the new path because a test
 * that imports it reaches a file that did not exist before.
 *
 * A path named by an agent may carry backslashes, may be absolute, and may be written
 * in the `/c/Users/...` form of Git Bash. Each is brought to the form of the paths held
 * by the dependency graph, relative to the repository root with forward slashes, and a
 * relative path is read against the repository root. A folder stands for every file
 * under it.
 */

import * as child_process from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as file_dependency_graph from './file_dependency_graph.ts';

type RepositoryPath = file_dependency_graph.RepositoryPath;

const STATUS_CODES_FOLLOWED_BY_A_SECOND_PATH: ReadonlySet<string> = new Set(['R', 'C']);
const GIT_BASH_DRIVE_PATH = /^\/([a-zA-Z])(\/|$)/;

export class GitCommandFailed extends Error {}

export interface NamedPaths {
    readonly repository_paths: readonly RepositoryPath[];
    readonly paths_outside_repository: readonly string[];
}

function git_output(git_arguments: readonly string[], root: string): string {
    const finished = child_process.spawnSync('git', git_arguments, {cwd: root, encoding: 'utf8'});
    if (finished.error !== undefined) {
        throw new GitCommandFailed(
            `git ${git_arguments.join(' ')} did not start: ${finished.error.message}`);
    }
    if (finished.status !== 0) {
        throw new GitCommandFailed(
            `git ${git_arguments.join(' ')} exited ${finished.status}: ${finished.stderr.trim()}`);
    }
    return finished.stdout;
}

/** Every path reported by `git status --porcelain`, with both paths of a rename or a copy. */
export function modified_files_in_working_tree(root: string): RepositoryPath[] {
    const fields = git_output(['status', '--porcelain=v1', '-z', '--untracked-files=all'], root)
        .split('\0');
    const paths = new Set<RepositoryPath>();
    for (let index = 0; index < fields.length; index += 1) {
        const field = fields[index];
        if (field.length < 4) {
            continue;
        }
        paths.add(field.slice(3));
        const status = field.slice(0, 2);
        if ([...status].some((code) => STATUS_CODES_FOLLOWED_BY_A_SECOND_PATH.has(code))) {
            index += 1;
            if (index < fields.length && fields[index] !== '') {
                paths.add(fields[index]);
            }
        }
    }
    return [...paths].sort();
}

/**
 * Every path that differs between `ref` and the working tree. `--no-renames` reports
 * a rename as the deletion of one path and the addition of the other, so both appear.
 */
export function modified_files_since(ref: string, root: string): RepositoryPath[] {
    const output = git_output(['diff', '--name-only', '--no-renames', '-z', ref, '--'], root);
    return [...new Set(output.split('\0').filter((field) => field !== ''))].sort();
}

function absolute_path_of_named_path(named: string, root: string): string {
    const forward_slashed = named.replace(/\\/g, '/');
    const drive_path = process.platform === 'win32'
        ? forward_slashed.replace(GIT_BASH_DRIVE_PATH, '$1:/') : forward_slashed;
    return path.resolve(root, drive_path);
}

/** The repository path of each of `named`, with a folder expanded to every file under it. */
export function repository_paths_of_named_paths(
    named: readonly string[], root: string,
): NamedPaths {
    const repository_paths = new Set<RepositoryPath>();
    const paths_outside_repository: string[] = [];
    for (const each_named of named) {
        const absolute = absolute_path_of_named_path(each_named, root);
        const repository_path = file_dependency_graph.repository_path_of(absolute, root);
        if (repository_path === null) {
            paths_outside_repository.push(each_named);
            continue;
        }
        const is_folder = fs.statSync(absolute, {throwIfNoEntry: false})?.isDirectory() ?? false;
        const expanded = is_folder
            ? file_dependency_graph.list_files_under(repository_path, root)
            : [repository_path];
        expanded.forEach((file) => repository_paths.add(file));
    }
    return {repository_paths: [...repository_paths].sort(), paths_outside_repository};
}
