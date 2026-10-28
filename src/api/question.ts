// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { graphql, IGraphQLRequest } from "./client";
import { QUESTION_DETAIL_QUERY, QUESTION_JUDGE_QUERY } from "./queries";

export interface ICodeSnippet {
    lang: string;
    langSlug: string;
    code: string;
}

export interface IQuestionTag {
    name: string;
    translatedName?: string;
    slug: string;
}

export interface IQuestionDetail {
    questionId: string;
    questionFrontendId: string;
    title: string;
    translatedTitle?: string;
    titleSlug: string;
    difficulty: string;
    isPaidOnly: boolean;
    content: string;
    translatedContent?: string;
    sampleTestCase?: string;
    metaData?: string;
    codeSnippets: ICodeSnippet[];
    topicTags: IQuestionTag[];
    /** HTML, one hint per entry. */
    hints?: string[];
    /** JSON: an array of ISimilarQuestion. */
    similarQuestions?: string;
    /** JSON with "acRate", "totalAccepted" and "totalSubmission". */
    stats?: string;
}

export interface ISimilarQuestion {
    title: string;
    translatedTitle?: string;
    titleSlug: string;
    difficulty: string;
}

function parseJson(text: string | undefined): unknown {
    try {
        return text ? JSON.parse(text) : undefined;
    } catch {
        return undefined;
    }
}

export function getSimilarQuestions(detail: Pick<IQuestionDetail, "similarQuestions">): ISimilarQuestion[] {
    const questions: unknown = parseJson(detail.similarQuestions);
    return Array.isArray(questions)
        ? questions.filter((question: ISimilarQuestion) => typeof question?.titleSlug === "string" && typeof question.title === "string")
        : [];
}

/** Like "55.2%". */
export function getAcceptanceRate(detail: Pick<IQuestionDetail, "stats">): string | undefined {
    const stats = parseJson(detail.stats) as { acRate?: unknown } | undefined;
    return typeof stats?.acRate === "string" && stats.acRate ? stats.acRate : undefined;
}

interface IQuestionResponse {
    question: IQuestionDetail | null;
}

/** The function's parameter names, one per input line of a test case; empty for problems without a function. */
export function getParamNames(detail: Pick<IQuestionDetail, "metaData">): string[] {
    const params: unknown = (parseJson(detail.metaData) as { params?: unknown } | undefined)?.params;
    return Array.isArray(params) ? params.map((param: { name?: unknown }) => String(param?.name ?? "")) : [];
}

export async function fetchQuestionDetail(
    request: IGraphQLRequest,
    titleSlug: string,
): Promise<IQuestionDetail> {
    const data = await graphql<IQuestionResponse>(request, QUESTION_DETAIL_QUERY, { titleSlug });
    if (!data.question) {
        throw new Error(`Problem not found: ${titleSlug}`);
    }
    return data.question;
}

/** What testing and submitting need, without the description and code templates of the full detail. */
export interface IJudgeInfo {
    questionId: string;
    metaData?: string;
    /** The first example's input. */
    sampleTestCase?: string;
    /** Every example's input, one after another, as LeetCode's Run uses them. */
    exampleTestcases?: string;
}

export async function fetchJudgeInfo(request: IGraphQLRequest, titleSlug: string): Promise<IJudgeInfo> {
    const data = await graphql<{ question: IJudgeInfo | null }>(request, QUESTION_JUDGE_QUERY, { titleSlug });
    if (!data.question) {
        throw new Error(`Problem not found: ${titleSlug}`);
    }
    return data.question;
}
