// Written by Claude Opus 5.5 (1M context), effort high.
/*
 * The validation targets reached by a set of modified files.
 *
 * A target is selected when a modified file is among its dependencies, which are the
 * modules imported by it at any depth and the files read by those modules. Keeping each
 * feature in its own module keeps the selection narrow. A test of the arrow forms is
 * not selected by a change to the inspection boxes, because none of its imports
 * imports them.
 */

import * as file_dependency_graph from './file_dependency_graph.ts';
import * as validation_targets from './validation_targets.ts';

type RepositoryPath = file_dependency_graph.RepositoryPath;

/**
 * The targets reached by a modification, with the modified files that reach each of
 * them, keyed by target name, and the modified files that reach no target.
 */
export interface TargetSelection {
    readonly selected: readonly validation_targets.ValidationTarget[];
    readonly modified_files_reaching: ReadonlyMap<string, readonly RepositoryPath[]>;
    readonly modified_files_reaching_no_target: readonly RepositoryPath[];
}

export function targets_reached_by(
    targets: readonly validation_targets.ValidationTarget[], modified: readonly RepositoryPath[],
    graph: file_dependency_graph.DependencyGraph,
): TargetSelection {
    const selected: validation_targets.ValidationTarget[] = [];
    const modified_files_reaching = new Map<string, readonly RepositoryPath[]>();
    const reaching_some_target = new Set<RepositoryPath>();
    for (const target of targets) {
        const dependencies = validation_targets.dependencies_of_target(target, graph);
        const reaching = modified.filter(
            (file) => file_dependency_graph.includes_path(dependencies, file));
        if (reaching.length === 0) {
            continue;
        }
        selected.push(target);
        modified_files_reaching.set(target.name, reaching);
        reaching.forEach((file) => reaching_some_target.add(file));
    }
    return {
        selected,
        modified_files_reaching,
        modified_files_reaching_no_target:
            modified.filter((file) => !reaching_some_target.has(file)),
    };
}
