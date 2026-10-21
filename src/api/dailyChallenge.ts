// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import axios from "axios";
import type { IProblem } from "../shared";
import { IGraphQLRequest } from "./client";

interface IDailyQuestion {
    id?: string;
    name?: string;
    slug?: string;
    progress?: number;
    link?: string;
}

interface IHomeSsrData {
    taskSchedule?: {
        dailyQuestions?: IDailyQuestion[];
    };
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let dailyCache: { origin: string; at: number; value: IProblem | undefined } | undefined;

/**
 * LeetCode CN does not expose the daily challenge through GraphQL. The homepage
 * embeds it in __NEXT_DATA__; keep the parser isolated so a markup change only
 * disables the Daily node instead of breaking the problem list.
 */
export function parseDailyChallenge(html: string): IProblem | undefined {
    const match: RegExpMatchArray | null = html.match(
        /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
    );
    if (!match) {
        return undefined;
    }
    let data: { props?: { pageProps?: { HomeSsrData?: IHomeSsrData } } };
    try {
        data = JSON.parse(match[1]);
    } catch {
        return undefined;
    }
    const daily: IDailyQuestion | undefined = data.props?.pageProps?.HomeSsrData?.taskSchedule?.dailyQuestions?.[0];
    if (!daily?.slug || !daily.name) {
        return undefined;
    }
    return {
        id: daily.id || daily.slug,
        questionId: daily.id,
        slug: daily.slug,
        name: daily.name,
        difficulty: "",
        passRate: "",
        state: (daily.progress ? 1 : 3) as IProblem["state"],
        locked: false,
        isFavorite: false,
        companies: [],
        tags: [],
    };
}

export async function fetchDailyChallenge(request: IGraphQLRequest, forceRefresh: boolean = false): Promise<IProblem | undefined> {
    if (!forceRefresh && dailyCache && dailyCache.origin === request.origin && Date.now() - dailyCache.at < CACHE_TTL_MS) {
        return dailyCache.value;
    }
    const response = await axios.get<string>(`${request.origin}/`, {
        timeout: 20000,
        responseType: "text",
        headers: {
            "referer": `${request.origin}/problemset/`,
        },
    });
    const value: IProblem | undefined = parseDailyChallenge(response.data);
    dailyCache = { origin: request.origin, at: Date.now(), value };
    return value;
}
