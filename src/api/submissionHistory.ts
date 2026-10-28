// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { IGraphQLRequest } from "./client";
import { send } from "./http";

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
    return {
        items: mapSubmissionDump(response.data),
        hasNext: Boolean(response.data?.has_next),
    };
}
