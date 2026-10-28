// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { createHash } from "node:crypto";
import { globalState } from "../globalState";
import { getUrl, IProblem, ProblemState, SortingStrategy } from "../shared";
import { shouldUseEndpointTranslation } from "../utils/settingUtils";
import { graphql, IGraphQLRequest } from "./client";
import { fetchCompanyTagNames } from "./companyTags";
import { mapQuestion, IQuestionNode, ICompanyTag } from "./problemMapper";
import { problemCache } from "./problemCache";

export interface IProblemQuery {
    skip?: number;
    limit?: number;
    search?: string;
    difficulty?: string;
    tag?: string;
    company?: string;
    hideSolved?: boolean;
    sort?: SortingStrategy;
}

export interface IProblemPage {
    problems: IProblem[];
    total: number;
    next: number;
    hasMore: boolean;
}

export interface IProblemTag { name: string; slug: string; }
interface IRawProblem extends Omit<IQuestionNode, "frontendQuestionId"> {
    questionFrontendId: string;
    translatedTitle?: string;
}

function context(): { request: IGraphQLRequest; scope: string; translated: boolean; cn: boolean } {
    const endpoint = getUrl("graphql");
    const cookie = globalState.getCookie() || "";
    const translated = shouldUseEndpointTranslation();
    // A session hash isolates account data without persisting credentials.
    const identity = createHash("sha256").update(cookie || "anonymous").digest("hex");
    return {
        request: { endpoint, origin: endpoint.replace(/\/graphql\/?$/, ""), cookie },
        scope: `${endpoint}:${identity}:${translated}:`, translated, cn: endpoint.includes("leetcode.cn"),
    };
}

export function getProblemCacheScope(): string { return context().scope; }

export function problemPageKey(query: IProblemQuery = {}): string {
    return `${getProblemCacheScope()}page:${JSON.stringify(normalize(query))}`;
}

function normalize(query: IProblemQuery): Required<IProblemQuery> {
    return {
        skip: Math.max(0, query.skip || 0), limit: Math.min(100, Math.max(1, query.limit || 50)),
        search: (query.search || "").trim(), difficulty: query.difficulty || "",
        tag: query.tag || "", company: query.company || "", hideSolved: Boolean(query.hideSolved),
        sort: query.sort || SortingStrategy.None,
    };
}

/**
 * One server-filtered page; never scans the rest of the question bank.
 * Pass `persist: false` for one-off queries that should not be written to disk.
 */
export async function getProblemPage(query: IProblemQuery = {}, force: boolean = false, persist: boolean = true): Promise<IProblemPage> {
    const ctx = context();
    const options = normalize(query);
    const key = `${ctx.scope}page:${JSON.stringify(options)}`;
    return problemCache.get(key, async () => {
        const filters: Record<string, unknown> = { filterCombineType: "ALL" };
        if (options.difficulty) { filters.difficultyFilter = { difficulties: [options.difficulty.toUpperCase()], operator: "IS" }; }
        if (options.tag) { filters.topicFilter = { topicSlugs: [options.tag], operator: "IS" }; }
        if (options.company) { filters.companyFilter = { companySlugs: [options.company], operator: "IS" }; }
        if (options.hideSolved) { filters.statusFilter = { questionStatuses: ["SOLVED"], operator: "IS_NOT" }; }
        const sortBy = options.sort === SortingStrategy.AcceptanceRateAsc || options.sort === SortingStrategy.AcceptanceRateDesc
            ? { sortField: "AC_RATE", sortOrder: options.sort === SortingStrategy.AcceptanceRateAsc ? "ASCENDING" : "DESCENDING" }
            : { sortField: "CUSTOM", sortOrder: "ASCENDING" };
        const data = await graphql<{ problemsetQuestionListV2: { questions: IRawProblem[]; totalLength: number } }>(ctx.request, `
            query problemsetQuestionListV2($limit: Int, $skip: Int, $filters: QuestionFilterInput, $searchKeyword: String, $sortBy: QuestionSortByInput) {
                problemsetQuestionListV2(limit: $limit, skip: $skip, filters: $filters, searchKeyword: $searchKeyword, sortBy: $sortBy) {
                    totalLength
                    questions {
                        questionFrontendId title titleSlug difficulty paidOnly acRate status isInMyFavorites
                        ${ctx.cn ? "translatedTitle" : ""}
                        topicTags { name slug ${ctx.cn ? "nameTranslated" : ""} }
                    }
                }
            }`, { limit: options.limit, skip: options.skip, searchKeyword: options.search, filters, sortBy });
        const page = data.problemsetQuestionListV2;
        const problems = page.questions.map((question) => mapQuestion({
            ...question, frontendQuestionId: question.questionFrontendId, titleCn: question.translatedTitle,
        }, ctx.translated));
        const next = options.skip + page.questions.length;
        return { problems, total: page.totalLength, next, hasMore: page.questions.length > 0 && next < page.totalLength };
    }, force, persist);
}

export async function getProblemTags(kind: "tag" | "company", force: boolean = false): Promise<IProblemTag[]> {
    const ctx = context();
    return problemCache.get(`${ctx.scope}tags:${kind}`, async () => {
        if (kind === "company") {
            if (ctx.cn) {
                return [...await fetchCompanyTagNames(ctx.request)].map(([slug, name]) => ({ slug, name: ctx.translated ? name : slug }));
            }
            const data = await graphql<{ companyTags: IProblemTag[] }>(ctx.request, "query companyTags { companyTags { name slug } }");
            return data.companyTags;
        }
        const data = await graphql<{ questionTopicTags: { edges: Array<{ node: IProblemTag & { translatedName?: string } }> } }>(ctx.request,
            "query questionTopicTags { questionTopicTags { edges { node { name slug translatedName } } } }");
        return data.questionTopicTags.edges.map(({ node }) => ({ slug: node.slug, name: ctx.translated ? node.translatedName || node.name : node.name }));
    }, force);
}

export async function getProblemBySlug(slug: string, force: boolean = false): Promise<IProblem | undefined> {
    const ctx = context();
    const result = await problemCache.get<IProblem | null>(`${ctx.scope}single:${slug}`, async () => {
        const data = await graphql<{ question: {
            questionFrontendId: string; questionId: string; title: string; translatedTitle?: string;
            titleSlug: string; difficulty: string; isPaidOnly: boolean; acRate: number; status?: string; isFavor?: boolean;
            extra?: { topCompanyTags?: ICompanyTag[] };
            companyTags?: ICompanyTag[];
            topicTags: Array<{ name: string; slug: string; translatedName?: string }>;
        } | null }>(ctx.request, `query problemMetadata($titleSlug: String!) {
            question(titleSlug: $titleSlug) {
                questionFrontendId questionId title translatedTitle titleSlug difficulty isPaidOnly acRate status isFavor
                topicTags { name slug translatedName }
                ${ctx.cn ? "extra { topCompanyTags { name slug } }" : "companyTags { name slug }"}
            }
        }`, { titleSlug: slug });
        const q = data.question;
        if (!q) { return null; }
        return { ...mapQuestion({
            ...q, frontendQuestionId: q.questionFrontendId, titleCn: q.translatedTitle, paidOnly: q.isPaidOnly,
            acRate: ctx.cn ? q.acRate : q.acRate / 100,
            extra: q.extra || { topCompanyTags: q.companyTags || [] },
            topicTags: q.topicTags.map((tag) => ({ ...tag, nameTranslated: tag.translatedName })),
        }, ctx.translated), questionId: q.questionId };
    }, force);
    return ctx.scope === getProblemCacheScope() ? result || undefined : undefined;
}

export async function getProblemById(id: string): Promise<IProblem | undefined> {
    const scope = getProblemCacheScope();
    const singles = problemCache.values<IProblem | null>(`${scope}single:`);
    const pages = problemCache.values<IProblemPage>(`${scope}page:`);
    const cached = singles.find((problem) => problem?.id === id) || pages.flatMap((page) => page.problems).find((problem) => problem.id === id);
    if (cached) { return cached; }
    const page = await getProblemPage({ search: id, limit: 100 }, false, false);
    // Never substitute a fuzzy match for the requested frontend id (including LCR/LCP ids).
    return scope === getProblemCacheScope() ? page.problems.find((problem) => problem.id === id) : undefined;
}

export async function getRandomProblem(): Promise<IProblem | undefined> {
    const first = await getProblemPage({ limit: 1 }, false, false);
    if (!first.total) { return undefined; }
    const page = await getProblemPage({ limit: 1, skip: Math.floor(Math.random() * first.total) }, false, false);
    return page.problems[0];
}

export function invalidateProblemCache(): void { problemCache.reset(); }

export async function updateCachedProblem(id: string, changes: Partial<IProblem>): Promise<void> {
    await problemCache.update<IProblemPage | IProblem | null>(getProblemCacheScope(), (value) => {
        const problems = value && "problems" in value ? value.problems : value && "id" in value ? [value] : [];
        for (const problem of problems) {
            if (problem.id === id) { Object.assign(problem, changes); }
        }
    });
}

export async function updateCachedFavorite(id: string, isFavorite: boolean): Promise<void> {
    await updateCachedProblem(id, { isFavorite });
    await problemCache.remove(`${getProblemCacheScope()}favorites`);
}

export async function recordSubmission(problem: IProblem, accepted: boolean): Promise<void> {
    await updateCachedProblem(problem.id, { state: accepted || problem.state === ProblemState.AC ? ProblemState.AC : ProblemState.NotAC });
}
