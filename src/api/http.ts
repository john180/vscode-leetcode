// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import type { IGraphQLRequest } from "./client";
import { isRetryableError, MAX_RETRIES, retryDelayMs, sleep } from "./retry";
import { assertJsonObject, LeetCodeApiError } from "./errors";
import { assertRequestActive, requestLifetime } from "./cancellation";
import { isSessionExpiredError, reportAuthenticationFailure } from "../auth/session";

const PLATFORMS: { [platform: string]: string } = {
    win32: "Windows NT 10.0; Win64; x64",
    darwin: "Macintosh; Intel Mac OS X 10_15_7",
};

let clientVersion: string = "";

/** Called on activation with the extension's version, which the User-Agent reports. */
export function setClientVersion(version: string | undefined): void {
    clientVersion = version || "";
}

export function getUserAgent(): string {
    const platform: string = PLATFORMS[process.platform] || "X11; Linux x86_64";
    return `Mozilla/5.0 (${platform}) vscode-leetcode${clientVersion ? `/${clientVersion}` : ""}`;
}

/** Whether a request failed only because its signal aborted it, which callers do not report as a failure. */
export function isCanceled(error: unknown): boolean {
    return axios.isCancel(error);
}

export function getCsrfToken(cookie: string | undefined): string | undefined {
    return cookie?.match(/(?:^|;\s*)csrftoken=([^;]+)/)?.[1];
}

/** The headers LeetCode's own pages send. `referer` is the path of the page a request comes from. */
export function getLeetCodeHeaders(request: IGraphQLRequest, referer: string = "/problemset/"): { [key: string]: string } {
    const csrfToken: string | undefined = getCsrfToken(request.cookie);
    return {
        ...(request.cookie ? { cookie: request.cookie } : {}),
        ...(csrfToken ? { "x-csrftoken": csrfToken } : {}),
        "x-requested-with": "XMLHttpRequest",
        "origin": request.origin,
        "referer": `${request.origin}${referer}`,
        "user-agent": getUserAgent(),
    };
}

export interface ISendOptions {
    referer?: string;
    /** Retry transient failures. Defaults to GET only, since a retried POST may run twice. */
    retry?: boolean;
}

/** Every request to LeetCode goes through here, so all of them share headers, timeout, retries and cancellation. */
export async function send<T>(request: IGraphQLRequest, config: AxiosRequestConfig, options: ISendOptions = {}): Promise<AxiosResponse<T>> {
    const retry: boolean = options.retry ?? (config.method || "GET").toUpperCase() === "GET";
    const headers: { [key: string]: string } = getLeetCodeHeaders(request, options.referer);
    const lifetime = requestLifetime(request, 65000);
    try {
        for (let attempt: number = 0; ; attempt += 1) {
            assertRequestActive(lifetime.request);
            let response: AxiosResponse<T>;
            try {
                response = await axios.request<T>({ timeout: 20000, ...config, signal: lifetime.request.signal, headers });
            } catch (error) {
                assertRequestActive(lifetime.request);
                if (isSessionExpiredError(error)) { reportAuthenticationFailure(request); }
                const wait = retryDelayMs(attempt, error);
                if (!retry || attempt >= MAX_RETRIES || !isRetryableError(error) || wait >= lifetime.request.deadline! - Date.now()) {
                    throw describeFailure(error);
                }
                await sleep(wait, lifetime.request.signal);
                continue;
            }
            assertRequestActive(lifetime.request);
            assertJsonObject(response.data, response.status);
            return response;
        }
    } finally {
        lifetime.dispose();
    }
}

function describeFailure(error: unknown): unknown {
    if (isCanceled(error) || error instanceof LeetCodeApiError) { return error; }
    const failure = error as { message?: string; code?: string; response?: AxiosResponse } | undefined;
    const response = failure?.response;
    const retryAfter = response?.headers?.["retry-after"];
    const details = response ? { status: response.status, data: response.data,
        headers: retryAfter === undefined ? undefined : { "retry-after": String(retryAfter) } } : undefined;
    // An empty body (typical of gateway errors) says nothing; keep the status-based kind.
    if (typeof response?.data === "string" && response.data.trim()) {
        try { assertJsonObject(response.data, response.status); } catch (pageError) {
            return new LeetCodeApiError("response", (pageError as Error).message, details);
        }
    }
    const kind = isSessionExpiredError(error) ? "authentication" : response?.status === 429 ? "rate-limit"
        : response ? "http" : /^(ECONNABORTED|ETIMEDOUT)$/.test(failure?.code || "") ? "timeout" : "network";
    return new LeetCodeApiError(kind, failure?.message || String(error), details);
}
