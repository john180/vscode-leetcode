// Licensed under the MIT license.

export type ApiErrorKind = "authentication" | "rate-limit" | "network" | "timeout" | "response" | "graphql" | "http";

export interface IErrorResponse {
    status?: number;
    data?: unknown;
    headers?: { [key: string]: string | undefined };
}

/** Keeps diagnostics without retaining a request's credential-bearing Axios config. */
export class LeetCodeApiError extends Error {
    constructor(
        public readonly kind: ApiErrorKind,
        message: string,
        public readonly response?: IErrorResponse,
    ) {
        super(message);
        this.name = "LeetCodeApiError";
    }
}

export interface IGraphQLError {
    message?: string;
    extensions?: { code?: string };
}

export function graphQLErrors(body: unknown): IGraphQLError[] {
    const errors = (body as { errors?: unknown } | undefined)?.errors;
    return Array.isArray(errors) ? errors : [];
}

export function isAuthenticationError(errors: IGraphQLError[]): boolean {
    return errors.some((error) => /^(UNAUTHENTICATED|AUTHENTICATION_REQUIRED)$/.test(error?.extensions?.code || "")
        || /please (?:register or sign in|log in|login)|请先(?:注册\/登录|登录)/i.test(error?.message || ""));
}

export function invalidResponse(message: string): LeetCodeApiError {
    return new LeetCodeApiError("response", message);
}

export function assertJsonObject(body: unknown, status?: number): asserts body is Record<string, unknown> {
    if (typeof body === "string" && body.trim()) {
        throw new LeetCodeApiError("response",
            `LeetCode answered HTTP ${status} with a web page instead of JSON; a CAPTCHA, proxy or firewall may be blocking the request.`);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw invalidResponse("LeetCode returned an invalid JSON response.");
    }
}
