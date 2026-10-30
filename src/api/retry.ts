// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { throwIfAborted } from "./cancellation";
import { LeetCodeApiError } from "./errors";

export const MAX_RETRIES: number = 2;

interface IRetryError {
    code?: string;
    response?: {
        status?: number;
        headers?: { [key: string]: string | undefined };
    };
}

export function isRetryableError(error: unknown): boolean {
    if (error instanceof LeetCodeApiError) {
        return error.kind === "network" || error.kind === "timeout" || error.kind === "rate-limit";
    }
    if ((error as IRetryError | undefined)?.code === "ERR_CANCELED") {
        // Aborted on purpose, not by the network.
        return false;
    }
    const status: number | undefined = (error as IRetryError | undefined)?.response?.status;
    if (status === undefined) {
        // Network errors and timeouts have no response.
        return true;
    }
    return status === 408 || status === 429 || status >= 500;
}

export function retryDelayMs(attempt: number, error?: unknown): number {
    const headers: { [key: string]: string | undefined } | undefined = (error as IRetryError | undefined)?.response?.headers;
    const retryAfter: string | undefined = headers?.["retry-after"] || headers?.["Retry-After"];
    if (retryAfter) {
        const seconds: number = Number(retryAfter);
        if (Number.isFinite(seconds) && seconds >= 0) {
            return seconds * 1000;
        }
        const date: number = Date.parse(retryAfter);
        if (Number.isFinite(date)) {
            return Math.max(0, date - Date.now());
        }
    }
    return Math.min(500 * Math.pow(2, attempt), 5000);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject): void => {
        throwIfAborted(signal);
        const cleanup = (): void => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
        const abort = (): void => {
            cleanup();
            try { throwIfAborted(signal); } catch (error) { reject(error); }
        };
        const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
        signal?.addEventListener("abort", abort, { once: true });
    });
}
