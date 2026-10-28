// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import type { IGraphQLRequest } from "./client";
import { isRetryableError, MAX_RETRIES, retryDelayMs, sleep } from "./retry";

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

/** Every request to LeetCode goes through here, so all of them share headers, timeout and retries. */
export async function send<T>(request: IGraphQLRequest, config: AxiosRequestConfig, options: ISendOptions = {}): Promise<AxiosResponse<T>> {
    const retry: boolean = options.retry ?? (config.method || "GET").toUpperCase() === "GET";
    const headers: { [key: string]: string } = getLeetCodeHeaders(request, options.referer);
    for (let attempt: number = 0; ; attempt += 1) {
        try {
            return await axios.request<T>({ timeout: 20000, ...config, headers });
        } catch (error) {
            if (!retry || attempt >= MAX_RETRIES || !isRetryableError(error)) {
                throw error;
            }
            await sleep(retryDelayMs(attempt, error));
        }
    }
}
