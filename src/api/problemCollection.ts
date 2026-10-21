// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import type { IProblem } from "../shared";
import type { IQuestionListPage, IQuestionNode } from "./problemMapper";

/**
 * Maps pages into a deduplicated problem list. Empty ids are skipped so a
 * malformed page cannot create a node that cannot be opened later.
 */
export function collectProblems(
    pages: IQuestionListPage[],
    map: (question: IQuestionNode) => IProblem,
): IProblem[] {
    const seen: Set<string> = new Set<string>();
    const problems: IProblem[] = [];
    for (const page of pages) {
        for (const question of page.questions) {
            const problem: IProblem = map(question);
            if (!problem.id || seen.has(problem.id)) {
                continue;
            }
            seen.add(problem.id);
            problems.push(problem);
        }
    }
    return problems;
}
