// Licensed under the MIT license.

import { isCnSite, IGraphQLRequest } from "./client";
import { QUESTION_LANGUAGE_SOLUTION_QUERY, QUESTION_SOLUTION_QUERY } from "./queries";

interface IArticle {
    title?: string;
    content?: string;
    topic?: { post?: { content?: string } };
}

export interface ISolutionArticles {
    questionSolutionArticles?: { edges: Array<{ node: IArticle }> };
    ugcArticleSolutionArticles?: { edges: Array<{ node: IArticle }> };
}

const GLOBAL_SOLUTIONS = `query topSolution($questionSlug: String!, $first: Int) {
    ugcArticleSolutionArticles(questionSlug: $questionSlug, orderBy: MOST_VOTES, first: $first, skip: 0) {
        edges { node { title topic { post { content } } } }
    }
}`;

const GLOBAL_LANGUAGE_SOLUTIONS = `query topLanguageSolution($questionSlug: String!, $first: Int, $tagSlugs: [String!]) {
    ugcArticleSolutionArticles(questionSlug: $questionSlug, orderBy: MOST_VOTES, first: $first, skip: 0, tagSlugs: $tagSlugs) {
        edges { node { title topic { post { content } } } }
    }
}`;

export interface ISubmissionDetail {
    submissionDetail?: { code?: string } | null;
    submissionDetails?: { code?: string } | null;
}

// leetcode.com numbers submissions with an Int and leetcode.cn with an ID, under a field named one letter apart.
const GLOBAL_SUBMISSION = `query submissionDetails($submissionId: Int!) {
    submissionDetails(submissionId: $submissionId) { code }
}`;

const CN_SUBMISSION = `query mySubmissionDetail($submissionId: ID!) {
    submissionDetail(submissionId: $submissionId) { code }
}`;

export function submissionAdapter(request: IGraphQLRequest): {
    query: string;
    variables: (id: string) => { submissionId: string | number };
    code: (data: ISubmissionDetail) => string | undefined;
} {
    const cn = isCnSite(request);
    return {
        query: cn ? CN_SUBMISSION : GLOBAL_SUBMISSION,
        variables: (id) => ({ submissionId: cn ? id : Number(id) }),
        code: (data) => (cn ? data.submissionDetail : data.submissionDetails)?.code,
    };
}

/**
 * Site differences stay at the API boundary, rather than in command handlers.
 * A `tagged` query also takes `tagSlugs`, such as ["python3"], to find solutions in a language.
 */
export function solutionAdapter(request: IGraphQLRequest, tagged: boolean = false): {
    query: string;
    article: (data: ISolutionArticles) => { title: string; content: string } | undefined;
} {
    const cn = isCnSite(request);
    return {
        query: cn ? (tagged ? QUESTION_LANGUAGE_SOLUTION_QUERY : QUESTION_SOLUTION_QUERY) : (tagged ? GLOBAL_LANGUAGE_SOLUTIONS : GLOBAL_SOLUTIONS),
        article: (data) => {
            const node = (cn ? data.questionSolutionArticles : data.ugcArticleSolutionArticles)?.edges?.[0]?.node;
            const content = cn ? node?.content : node?.topic?.post?.content;
            return content ? { title: node?.title || "", content } : undefined;
        },
    };
}
