// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { createHash } from "node:crypto";
import { IProblem, ProblemState, SortingStrategy } from "../shared";
import { shouldUseEndpointTranslation } from "../utils/settingUtils";
import { graphql, IGraphQLRequest, isCnSite } from "./client";
import { fetchCompanyTagNames } from "./companyTags";
import { fetchDailyChallenge, fetchDailyChallengeStatus, IDailyChallenge } from "./dailyChallenge";
import { fetchFavoriteData, IFavoriteData } from "./favoriteLists";
import { mapQuestion, IQuestionNode, ICompanyTag } from "./problemMapper";
import { problemCache } from "./problemCache";
import { getLeetCodeRequest } from "./request";

export interface IProblemQuery {
    skip?: number;
    limit?: number;
    search?: string;
    difficulty?: string;
    tag?: string;
    company?: string;
    hideSolved?: boolean;
    sort?: SortingStrategy;
    /** Any of these difficulties, when `difficulty` names none. */
    difficulties?: string[];
    /** Any of TO_DO, ATTEMPTED and SOLVED. */
    statuses?: string[];
    premium?: "free" | "premium";
}

type FilterFields = "difficulties" | "statuses" | "premium";
type NormalizedQuery = Required<Omit<IProblemQuery, FilterFields>> & Pick<IProblemQuery, FilterFields>;

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

let current: { scope: string; controller: AbortController } | undefined;

function context(): { request: IGraphQLRequest; scope: string; translated: boolean; cn: boolean } {
    const request = getLeetCodeRequest();
    const translated = shouldUseEndpointTranslation();
    // A session hash isolates account data without persisting credentials.
    const identity = createHash("sha256").update(request.cookie || "anonymous").digest("hex");
    const scope = `${request.endpoint}:${identity}:${translated}:`;
    if (current?.scope !== scope) {
        // Whatever is still loading for another account, site or language would be thrown away; stop it.
        current?.controller.abort();
        current = { scope, controller: new AbortController() };
    }
    return { request: { ...request, signal: current.controller.signal }, scope, translated, cn: isCnSite(request) };
}

export function getProblemCacheScope(): string { return context().scope; }

export function problemPageKey(query: IProblemQuery = {}): string {
    return `${getProblemCacheScope()}page:${JSON.stringify(normalize(query))}`;
}

function normalize(query: IProblemQuery): NormalizedQuery {
    const options: NormalizedQuery = {
        skip: Math.max(0, query.skip || 0), limit: Math.min(100, Math.max(1, query.limit || 50)),
        search: (query.search || "").trim(), difficulty: query.difficulty || "",
        tag: query.tag || "", company: query.company || "", hideSolved: Boolean(query.hideSolved),
        sort: query.sort || SortingStrategy.None,
    };
    // Set only to filter, so pages cached before filters existed keep their keys.
    if (query.difficulties?.length) { options.difficulties = [...query.difficulties].sort(); }
    if (query.statuses?.length) { options.statuses = [...query.statuses].sort(); }
    if (query.premium) { options.premium = query.premium; }
    return options;
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
        const difficulties: string[] | undefined = options.difficulty ? [options.difficulty] : options.difficulties;
        if (difficulties) { filters.difficultyFilter = { difficulties: difficulties.map((value) => value.toUpperCase()), operator: "IS" }; }
        if (options.tag) { filters.topicFilter = { topicSlugs: [options.tag], operator: "IS" }; }
        if (options.company) { filters.companyFilter = { companySlugs: [options.company], operator: "IS" }; }
        const statuses: string[] | undefined = options.hideSolved ? options.statuses?.filter((status) => status !== "SOLVED") : options.statuses;
        if (statuses?.length === 0) {
            // Only solved problems were asked for, and they are hidden.
            return { problems: [], total: 0, next: options.skip, hasMore: false };
        }
        if (statuses) { filters.statusFilter = { questionStatuses: statuses, operator: "IS" }; }
        else if (options.hideSolved) { filters.statusFilter = { questionStatuses: ["SOLVED"], operator: "IS_NOT" }; }
        // Premium problems are those that are not NOT_PREMIUM, so one value, checked on leetcode.cn, serves both.
        if (options.premium) { filters.premiumFilter = { premiumStatus: ["NOT_PREMIUM"], operator: options.premium === "free" ? "IS" : "IS_NOT" }; }
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

interface IProblemMetadata {
    questionFrontendId: string; questionId: string; title: string; translatedTitle?: string;
    titleSlug: string; difficulty: string; isPaidOnly: boolean; acRate: number; status?: string; isFavor?: boolean;
    extra?: { topCompanyTags?: ICompanyTag[] };
    companyTags?: ICompanyTag[];
    topicTags: Array<{ name: string; slug: string; translatedName?: string }>;
}
type Context = ReturnType<typeof context>;
interface ILookup { slug: string; resolve: (question: IProblemMetadata | null) => void; reject: (error: unknown) => void; }

/** The most problems one request asks for; a favorites page lists 20. */
const LOOKUP_BATCH_SIZE = 20;
const lookups = new Map<string, { ctx: Context; waiting: ILookup[] }>();

/** Lookups made in the same tick share one request, with one aliased `question` field per problem. */
function lookUpProblem(ctx: Context, slug: string): Promise<IProblemMetadata | null> {
    return new Promise((resolve, reject) => {
        let batch = lookups.get(ctx.scope);
        if (!batch) {
            const created = { ctx, waiting: [] as ILookup[] };
            lookups.set(ctx.scope, batch = created);
            setTimeout(() => {
                lookups.delete(ctx.scope);
                for (let i = 0; i < created.waiting.length; i += LOOKUP_BATCH_SIZE) {
                    void sendLookups(ctx, created.waiting.slice(i, i + LOOKUP_BATCH_SIZE));
                }
            }, 0);
        }
        batch.waiting.push({ slug, resolve, reject });
    });
}

async function sendLookups(ctx: Context, batch: ILookup[]): Promise<void> {
    const fields = `questionFrontendId questionId title translatedTitle titleSlug difficulty isPaidOnly acRate status isFavor
        topicTags { name slug translatedName }
        ${ctx.cn ? "extra { topCompanyTags { name slug } }" : "companyTags { name slug }"}`;
    try {
        const data = await graphql<Record<string, IProblemMetadata | null>>(ctx.request, `
            query problemMetadata(${batch.map((_, i) => `$s${i}: String!`).join(", ")}) {
                ${batch.map((_, i) => `q${i}: question(titleSlug: $s${i}) { ${fields} }`).join("\n")}
            }`, Object.fromEntries(batch.map((lookup, i) => [`s${i}`, lookup.slug])));
        batch.forEach((lookup, i) => lookup.resolve(data[`q${i}`] ?? null));
    } catch (error) {
        batch.forEach((lookup) => lookup.reject(error));
    }
}

export async function getProblemBySlug(slug: string, force: boolean = false): Promise<IProblem | undefined> {
    const ctx = context();
    const result = await problemCache.get<IProblem | null>(`${ctx.scope}single:${slug}`, async () => {
        const q = await lookUpProblem(ctx, slug);
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

/** A random problem among those the filters in `query` allow. */
export async function getRandomProblem(query: IProblemQuery = {}): Promise<IProblem | undefined> {
    const first = await getProblemPage({ ...query, limit: 1 }, false, false);
    if (!first.total) { return undefined; }
    const page = await getProblemPage({ ...query, limit: 1, skip: Math.floor(Math.random() * first.total) }, false, false);
    return page.problems[0];
}

/** The account's favorite lists and LeetCode's Hot 100; changing a favorite drops them, see updateCachedFavorite. */
export async function getFavoriteData(force: boolean = false): Promise<IFavoriteData> {
    const ctx = context();
    return problemCache.get(`${ctx.scope}favorites`, () => fetchFavoriteData(ctx.request), force);
}

/** Today's problem, or undefined when LeetCode has none. */
export async function getDailyProblem(force: boolean = false): Promise<IProblem | undefined> {
    const ctx = context();
    const daily = await problemCache.get<IProblem | null>(`${ctx.scope}daily`, async () => await fetchDailyChallenge(ctx.request) || null, force);
    return daily || undefined;
}

/** Today's problem and whether the account solved it today, asked of LeetCode each time; the cached daily problem follows it. */
export async function getDailyChallenge(): Promise<IDailyChallenge | undefined> {
    const ctx = context();
    const challenge = await fetchDailyChallengeStatus(ctx.request);
    if (ctx.scope !== getProblemCacheScope()) { return undefined; }
    await problemCache.get<IProblem | null>(`${ctx.scope}daily`, async () => challenge?.problem ?? null, true);
    return challenge;
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
