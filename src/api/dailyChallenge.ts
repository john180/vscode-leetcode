// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import type { IProblem } from "../shared";
import { graphql, IGraphQLRequest, isCnSite } from "./client";

interface IDailyQuestion {
    questionId?: string;
    questionFrontendId?: string;
    title?: string;
    translatedTitle?: string;
    titleSlug?: string;
    difficulty?: string;
    paidOnly?: boolean;
    isPaidOnly?: boolean;
    acRate?: number;
    status?: string | null;
    topicTags?: Array<{ name?: string; slug?: string }>;
}

interface IDailyRecord {
    /** Whether the account solved the problem today: NotStart or Finish on leetcode.com, NOT_START or FINISH on leetcode.cn. */
    userStatus?: string | null;
    question?: IDailyQuestion;
}

interface IGlobalDailyData {
    activeDailyCodingChallengeQuestion?: IDailyRecord;
}

interface ICnDailyData {
    todayRecord?: IDailyRecord[];
}

export interface IDailyChallenge {
    problem: IProblem;
    /** Solved today. The problem's state only says whether it was ever solved, which an old problem often was. */
    completed: boolean;
}

const GLOBAL_DAILY_QUERY: string = `query questionOfToday {
    activeDailyCodingChallengeQuestion {
        userStatus
        question {
            questionId
            questionFrontendId
            title
            titleSlug
            difficulty
            isPaidOnly
            acRate
            status
            topicTags { name slug }
        }
    }
}`;

const CN_DAILY_QUERY: string = `query questionOfToday {
    todayRecord {
        userStatus
        question {
            questionId
            questionFrontendId
            title
            translatedTitle
            titleSlug
            difficulty
            isPaidOnly
            acRate
            status
            topicTags { name slug }
        }
    }
}`;

/** Reads the `data` of leetcode.com's activeDailyCodingChallengeQuestion query. */
export function parseGlobalDailyChallenge(data: unknown): IProblem | undefined {
    return mapDailyQuestion((data as IGlobalDailyData | undefined)?.activeDailyCodingChallengeQuestion?.question);
}

/** Reads the `data` of LeetCode CN's todayRecord query. */
export function parseCnDailyChallenge(data: unknown): IProblem | undefined {
    const question = (data as ICnDailyData | undefined)?.todayRecord?.[0]?.question;
    return mapDailyQuestion(question && { ...question, title: question.translatedTitle || question.title });
}

function mapDailyQuestion(question: IDailyQuestion | undefined): IProblem | undefined {
    if (!question?.titleSlug || !question.title) {
        return undefined;
    }
    const id: string = question.questionFrontendId || question.titleSlug;
    const difficulty: string = (question.difficulty || "").trim();
    return {
        id,
        questionId: question.questionId || question.questionFrontendId,
        slug: question.titleSlug,
        name: question.title,
        difficulty: difficulty ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase() : "",
        passRate: Number.isFinite(Number(question.acRate)) ? `${(Number(question.acRate) * 100).toFixed(1)} %` : "",
        state: question.status === "SOLVED" || question.status === "AC"
            ? 1
            : question.status === "ATTEMPTED" || question.status === "TRIED"
                ? 2
                : 3,
        locked: Boolean(question.isPaidOnly ?? question.paidOnly),
        isFavorite: false,
        companies: [],
        tags: (question.topicTags || [])
            .map((tag) => tag.name || "")
            .filter((name) => Boolean(name)),
    } as IProblem;
}

function isFinished(record: IDailyRecord | undefined): boolean {
    return typeof record?.userStatus === "string" && record.userStatus.replace(/_/g, "").toUpperCase() === "FINISH";
}

/** Reads the `data` of either site's daily question query, with whether it was solved today. */
export function parseDailyChallenge(data: unknown, cn: boolean): IDailyChallenge | undefined {
    const record: IDailyRecord | undefined = cn
        ? (data as ICnDailyData | undefined)?.todayRecord?.[0]
        : (data as IGlobalDailyData | undefined)?.activeDailyCodingChallengeQuestion;
    const problem: IProblem | undefined = cn ? parseCnDailyChallenge(data) : parseGlobalDailyChallenge(data);
    return problem && { problem, completed: isFinished(record) };
}

/** Uncached, as whether it was solved today changes. */
export async function fetchDailyChallengeStatus(request: IGraphQLRequest): Promise<IDailyChallenge | undefined> {
    const cn: boolean = isCnSite(request);
    return parseDailyChallenge(await graphql<ICnDailyData | IGlobalDailyData>(request, cn ? CN_DAILY_QUERY : GLOBAL_DAILY_QUERY), cn);
}

/** Uncached; the problem cache keeps the result. */
export async function fetchDailyChallenge(request: IGraphQLRequest): Promise<IProblem | undefined> {
    return (await fetchDailyChallengeStatus(request))?.problem;
}
