// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { graphql, IGraphQLRequest } from "./client";
import { QUESTION_OFFICIAL_SOLUTION_QUERY, QUESTION_SOLUTION_QUERY } from "./queries";

interface IArticleNode {
    title: string;
    slug: string;
    content: string;
}

interface ISolutionListResponse {
    questionSolutionArticles: {
        edges: Array<{ node: IArticleNode }>;
    };
}

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
    const data = await graphql<ISolutionListResponse>(request, QUESTION_SOLUTION_QUERY, {
        questionSlug: titleSlug,
        first: 1,
    });
    const article: IArticleNode | undefined = data.questionSolutionArticles?.edges?.[0]?.node;
    if (article?.content) {
        return { title: article.title || "", content: article.content };
    }

    const fallback = await graphql<IOfficialSolutionResponse>(request, QUESTION_OFFICIAL_SOLUTION_QUERY, {
        titleSlug,
    });
    const officialContent: string | undefined = fallback.question?.solution?.content;
    return officialContent ? { title: "", content: officialContent } : undefined;
}
