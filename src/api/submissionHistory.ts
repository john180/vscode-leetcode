// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { graphql, IGraphQLRequest } from "./client";
import { send } from "./http";
import { invalidResponse } from "./errors";
import { ISubmissionDetail, submissionAdapter } from "./siteAdapter";

export interface ISubmissionHistoryItem {
    id: string;
    status: string;
    lang: string;
    timestamp: string;
    runtime: string;
    memory: string;
}

export interface ISubmissionHistoryPage {
    items: ISubmissionHistoryItem[];
    hasNext: boolean;
}

interface ISubmissionDump {
    id?: string | number;
    status_display?: string;
    status?: string;
    lang?: string;
    timestamp?: string | number;
    runtime?: string;
    memory?: string;
}

interface ISubmissionHistoryResponse {
    submissions_dump?: ISubmissionDump[];
    has_next?: boolean;
}

export function mapSubmissionDump(data: unknown): ISubmissionHistoryItem[] {
    const submissions: ISubmissionDump[] = (data as ISubmissionHistoryResponse | undefined)?.submissions_dump || [];
    return submissions
        .filter((submission: ISubmissionDump) => submission.id !== undefined && submission.id !== null)
        .map((submission: ISubmissionDump) => ({
            id: String(submission.id),
            status: submission.status_display || submission.status || "Unknown",
            lang: submission.lang || "",
            timestamp: submission.timestamp === undefined ? "" : String(submission.timestamp),
            runtime: submission.runtime || "",
            memory: submission.memory || "",
        }));
}

/** The slug of a submission's language, which leetcode.cn's history spells as it shows it, such as "Java" or "C++". */
export function getLanguageSlug(lang: string): string {
    const name: string = lang.trim().toLowerCase();
    const aliases: { [name: string]: string } = { "c++": "cpp", "c#": "csharp", "go": "golang" };
    return aliases[name] ?? name;
}

export function formatSubmissionLabel(item: ISubmissionHistoryItem): string {
    const accepted: boolean = /accepted|通过/i.test(item.status);
    const icon: string = accepted ? "$(check)" : "$(x)";
    return `${icon} ${item.status}${item.lang ? `  ${item.lang}` : ""}`;
}

export function formatSubmissionDate(timestamp: string): string {
    if (!timestamp) {
        return "";
    }
    const seconds: number = Number(timestamp);
    if (!Number.isFinite(seconds)) {
        return timestamp;
    }
    return new Date(seconds * 1000).toLocaleString();
}

export async function fetchSubmissionHistory(
    request: IGraphQLRequest,
    slug: string,
    offset: number = 0,
    limit: number = 10,
): Promise<ISubmissionHistoryPage> {
    if (!request.cookie) {
        throw new Error("Not signed in. Please sign in to LeetCode first.");
    }
    const response = await send<ISubmissionHistoryResponse>(
        request,
        { url: `${request.origin}/api/submissions/${encodeURIComponent(slug)}/`, params: { offset, limit } },
        { referer: `/problems/${encodeURIComponent(slug)}/` },
    );
    if (!Array.isArray(response.data.submissions_dump) || typeof response.data.has_next !== "boolean") {
        throw invalidResponse("LeetCode returned an invalid submission history response.");
    }
    return {
        items: mapSubmissionDump(response.data),
        hasNext: Boolean(response.data?.has_next),
    };
}

/** The code of one of the signed-in user's submissions, as it was submitted. */
export async function fetchSubmissionCode(request: IGraphQLRequest, id: string): Promise<string> {
    if (!request.cookie) {
        throw new Error("Not signed in. Please sign in to LeetCode first.");
    }
    const adapter = submissionAdapter(request);
    const code: string | undefined = adapter.code(await graphql<ISubmissionDetail>(request, adapter.query, adapter.variables(id)));
    if (typeof code !== "string") {
        throw invalidResponse(`LeetCode returned no code for submission ${id}.`);
    }
    return code;
}
