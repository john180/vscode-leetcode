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
    /** The language asked for, when the article is tagged with it. */
    language?: string;
}

/**
 * Returns the top solution article for a problem, first among those tagged with `language` when one is given.
 * Falls back to the top article in any language, then to the official solution, and to undefined when none exists.
 */
export async function fetchTopSolution(
    request: IGraphQLRequest,
    titleSlug: string,
    language?: string,
): Promise<ISolution | undefined> {
    if (language) {
        const tagged = solutionAdapter(request, true);
        try {
            // Language tags are named like the languages of problem files, such as "python3" or "golang".
            const article = tagged.article(await graphql<ISolutionArticles>(request, tagged.query, { questionSlug: titleSlug, first: 1, tagSlugs: [language] }));
            if (article) { return { ...article, language }; }
        } catch (error) {
            // A site that cannot filter by language still has solutions in any language.
            if (!(error instanceof LeetCodeApiError) || error.kind !== "graphql") { throw error; }
        }
    }
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
