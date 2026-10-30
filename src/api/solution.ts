// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { graphql, IGraphQLRequest } from "./client";
import { QUESTION_OFFICIAL_SOLUTION_QUERY } from "./queries";
import { LeetCodeApiError } from "./errors";
import { ISolutionArticles, solutionAdapter } from "./siteAdapter";

interface IOfficialSolutionResponse {
    question: {
        solution?: {
            content?: string;
        };
    } | null;
}

export interface ISolution {
    title: string;
    content: string;
}

/**
 * Returns the top solution article for a problem. Falls back to the official
 * solution when no article is available, and to undefined when neither exists.
 */
export async function fetchTopSolution(
    request: IGraphQLRequest,
    titleSlug: string,
): Promise<ISolution | undefined> {
    const adapter = solutionAdapter(request);
    try {
        const data = await graphql<ISolutionArticles>(request, adapter.query, { questionSlug: titleSlug, first: 1 });
        const article = adapter.article(data);
        if (article) { return article; }
    } catch (error) {
        // A schema mismatch may still leave the official solution available.
        if (!(error instanceof LeetCodeApiError) || error.kind !== "graphql"
            || !/Cannot query field|Unknown argument|Unknown type/.test(error.message)) { throw error; }
    }

    const fallback = await graphql<IOfficialSolutionResponse>(request, QUESTION_OFFICIAL_SOLUTION_QUERY, {
        titleSlug,
    });
    const officialContent: string | undefined = fallback.question?.solution?.content;
    return officialContent ? { title: "", content: officialContent } : undefined;
}
