// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import axios, { AxiosResponse } from "axios";
import { isRetryableError, MAX_RETRIES, retryDelayMs, sleep } from "./retry";

export interface IGraphQLRequest {
    endpoint: string;
    origin: string;
    cookie?: string;
}

interface IGraphQLResponse<T> {
    data?: T;
    errors?: Array<{ message: string }>;
}

/**
 * Minimal GraphQL client for a LeetCode endpoint. The caller supplies the
 * cookie explicitly so this module stays independent of VS Code APIs and can be
 * exercised outside the extension host.
 */
export async function graphql<T>(
    request: IGraphQLRequest,
    query: string,
    variables: { [key: string]: unknown } = {},
): Promise<T> {
    if (!request.endpoint) {
        throw new Error("LeetCode endpoint is not configured.");
    }

    let response: AxiosResponse<IGraphQLResponse<T>>;
    try {
        response = await postWithRetry<T>(request, query, variables);
    } catch (error) {
        throw describeFailure(error);
    }
    const body = response.data;
    if (isPage(body)) {
        throw new Error(pageMessage(response.status));
    }
    const messages: string | undefined = errorMessages(body);
    if (messages) {
        throw new Error(messages);
    }
    if (!body?.data) {
        throw new Error("LeetCode returned an empty GraphQL response.");
    }
    return body.data;
}

/**
 * LeetCode answers a query that does not match its schema with a 400 whose body
 * says what is wrong; keep that, and the response for callers that check the status.
 */
function describeFailure(error: unknown): unknown {
    const response = (error as { response?: { status?: number; data?: unknown } } | undefined)?.response;
    const messages: string | undefined = errorMessages(response?.data);
    const message: string | undefined = messages
        ? `LeetCode rejected the GraphQL request (HTTP ${response?.status}): ${messages}`
        : isPage(response?.data) ? pageMessage(response?.status) : undefined;
    return message ? Object.assign(new Error(message), { response }) : error;
}

function errorMessages(body: unknown): string | undefined {
    const errors: unknown = (body as IGraphQLResponse<unknown> | undefined)?.errors;
    return Array.isArray(errors) && errors.length > 0
        ? errors.map((error: { message?: string }) => error?.message || "Unknown error").join("; ")
        : undefined;
}

/** A body that is not JSON, such as a CAPTCHA or proxy page. */
function isPage(body: unknown): boolean {
    return typeof body === "string" && body.trim().length > 0;
}

function pageMessage(status: number | undefined): string {
    return `LeetCode answered HTTP ${status} with a web page instead of JSON; a CAPTCHA, proxy or firewall may be blocking the request.`;
}

async function postWithRetry<T>(
    request: IGraphQLRequest,
    query: string,
    variables: { [key: string]: unknown },
): Promise<AxiosResponse<IGraphQLResponse<T>>> {
    const csrfMatch: RegExpMatchArray | null = request.cookie
        ? request.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/)
        : null;

    for (let attempt: number = 0; ; attempt += 1) {
        try {
            return await axios.post<IGraphQLResponse<T>>(
                request.endpoint,
                { query, variables },
                {
                    timeout: 20000,
                    headers: {
                        ...(request.cookie ? { cookie: request.cookie } : {}),
                        ...(csrfMatch ? { "x-csrftoken": csrfMatch[1], "x-requested-with": "XMLHttpRequest" } : {}),
                        "origin": request.origin,
                        "referer": `${request.origin}/problemset/`,
                        "content-type": "application/json",
                        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) vscode-leetcode/0.19",
                    },
                },
            );
        } catch (error) {
            if (attempt >= MAX_RETRIES || !isRetryableError(error)) {
                throw error;
            }
            await sleep(retryDelayMs(attempt, error));
        }
    }
}
