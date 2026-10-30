// Licensed under the MIT license.

import { CanceledError } from "axios";
import type { IGraphQLRequest } from "./client";
import { LeetCodeApiError } from "./errors";

export function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
        if (signal.reason instanceof LeetCodeApiError) { throw signal.reason; }
        throw new CanceledError("The operation was canceled or its session changed.");
    }
}

export function assertRequestActive(request: IGraphQLRequest): void {
    if (request.isCurrent?.() === false) { throw new CanceledError("The LeetCode session changed."); }
    throwIfAborted(request.sessionSignal);
    throwIfAborted(request.signal);
    if (request.deadline !== undefined && Date.now() >= request.deadline) {
        throw new LeetCodeApiError("timeout", "Timed out while waiting for the LeetCode response.");
    }
}

/** One lifetime spans every request and sleep within an operation. Always dispose its timer. */
export function requestLifetime(request: IGraphQLRequest, timeoutMs: number): { request: IGraphQLRequest; dispose: () => void } {
    assertRequestActive(request);
    const deadline = Math.min(request.deadline ?? Infinity, Date.now() + timeoutMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new LeetCodeApiError("timeout", "Timed out while waiting for the LeetCode response.")), Math.max(0, deadline - Date.now()));
    timer.unref?.();
    const signals = [request.sessionSignal, request.signal, controller.signal].filter((signal): signal is AbortSignal => Boolean(signal));
    return { request: { ...request, deadline, signal: AbortSignal.any(signals) }, dispose: () => clearTimeout(timer) };
}
