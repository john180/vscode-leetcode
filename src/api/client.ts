// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import type { AxiosResponse } from "axios";
import { send } from "./http";
import { graphQLErrors, isAuthenticationError, LeetCodeApiError } from "./errors";
import { reportAuthenticationFailure } from "../auth/session";
import { Endpoint, getSite } from "../site";

export interface IGraphQLRequest {
    readonly endpoint: string;
    readonly origin: string;
    readonly cookie?: string;
    /** Aborts the request, including any retries still to come. */
    readonly signal?: AbortSignal;
    readonly sessionSignal?: AbortSignal;
    readonly isCurrent?: () => boolean;
    readonly authenticationCheck?: boolean;
    /** Absolute deadline shared by requests, retries, and polling. */
    readonly deadline?: number;
}

/** Whether a request goes to leetcode.cn, whose API differs from leetcode.com's in places. */
export function isCnSite(request: Pick<IGraphQLRequest, "origin">): boolean {
    try {
        return new URL(request.origin).hostname === getSite(Endpoint.LeetCodeCN).host;
    } catch {
        return false;
    }
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
    options: { retry?: boolean } = {},
): Promise<T> {
    if (!request.endpoint) {
        throw new Error("LeetCode endpoint is not configured.");
    }

    let response: AxiosResponse<IGraphQLResponse<T>>;
    try {
        // Mutations opt in individually only when their operation is idempotent.
        const readOnly = /^\s*(?:#[^\n]*\n\s*)*(?:query\b|\{)/.test(query);
        response = await send<IGraphQLResponse<T>>(request, { method: "POST", url: request.endpoint, data: { query, variables } }, { retry: options.retry ?? readOnly });
    } catch (error) {
        const response = (error as LeetCodeApiError)?.response;
        if (graphQLErrors(response?.data).length) {
            throw describeGraphQLFailure(request, response!.data, response);
        }
        throw error;
    }
    const body = response.data;
    if (graphQLErrors(body).length) {
        throw describeGraphQLFailure(request, body, { status: response.status, data: body });
    }
    if (!body?.data) {
        throw new LeetCodeApiError("response", "LeetCode returned an empty GraphQL response.");
    }
    return body.data;
}

/**
 * LeetCode answers a query that does not match its schema with a 400 whose body
 * says what is wrong; keep that, and the response for callers that check the status.
 */
function describeGraphQLFailure(request: IGraphQLRequest, body: unknown, response: LeetCodeApiError["response"]): LeetCodeApiError {
    const errors = graphQLErrors(body);
    const authentication = isAuthenticationError(errors);
    if (authentication && response?.status !== 401 && response?.status !== 403) {
        reportAuthenticationFailure(request);
    }
    const messages = errors.map((error) => error?.message || "Unknown error").join("; ");
    return new LeetCodeApiError(authentication ? "authentication" : "graphql",
        `LeetCode rejected the GraphQL request (HTTP ${response?.status}): ${messages}`, response);
}
