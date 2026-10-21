// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

/**
 * Builds the LeetCode browser-authorization URL. `path` must be the installed
 * extension id, otherwise VS Code hands the callback to the official extension.
 */
export function buildAuthLoginUrl(endpoint: string, uriScheme: string, extensionId: string): string {
    const base: string = endpoint === "leetcode-cn" ? "https://leetcode.cn" : "https://leetcode.com";
    return `${base}/authorize-login/${encodeURIComponent(uriScheme)}/?path=${encodeURIComponent(extensionId)}`;
}

export interface IAuthCallback {
    cookie?: string;
    error?: string;
}

/**
 * Reads the callback query string. LeetCode may append an OAuth error instead
 * of a cookie, and that error must be shown to the user.
 */
export function parseAuthCallback(query: string): IAuthCallback {
    const params: URLSearchParams = new URLSearchParams(query);
    const error: string = params.get("error_description") || params.get("error") || "";
    const cookie: string = params.get("cookie") || "";
    return {
        cookie: cookie.trim() || undefined,
        error: error.trim() || undefined,
    };
}
