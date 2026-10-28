// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

export const MAX_RETRIES: number = 2;

interface IRetryError {
    code?: string;
    response?: {
        status?: number;
        headers?: { [key: string]: string | undefined };
    };
}

export function isRetryableError(error: unknown): boolean {
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
            return Math.min(seconds * 1000, 10000);
        }
        const date: number = Date.parse(retryAfter);
        if (Number.isFinite(date)) {
            return Math.min(Math.max(0, date - Date.now()), 10000);
        }
    }
    return Math.min(500 * Math.pow(2, attempt), 5000);
}

export function sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve: () => void): void => {
        setTimeout(resolve, ms);
    });
}
