// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import type { AxiosResponse } from "axios";
import { send } from "./http";

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
        // Queries are safe to retry, and so are LeetCode's favorite mutations.
        response = await send<IGraphQLResponse<T>>(request, { method: "POST", url: request.endpoint, data: { query, variables } }, { retry: true });
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
