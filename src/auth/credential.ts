// Licensed under the MIT license.

import { LeetCodeApiError } from "../api/errors";
import type { UserDataType } from "../globalState";
import { queryUserData } from "../request/query-user-data";

/** What LeetCode's userStatus says about a credential. */
export type CredentialStatus =
    | { readonly state: "signedIn"; readonly user: UserDataType }
    /** `error` is LeetCode's refusal of the check itself, when that is what showed it. */
    | { readonly state: "signedOut"; readonly error?: unknown }
    /** The check failed in a way that proves nothing, e.g. offline, blocked or canceled. */
    | { readonly state: "unknown"; readonly error: unknown };

/** Asks LeetCode whether `cookie` is signed in on the current site. A failed check is a status too, never an exception. */
export async function verifyCredential(cookie: string, signal?: AbortSignal): Promise<CredentialStatus> {
    try {
        const user = await queryUserData(cookie, signal);
        return user.isSignedIn && user.username ? { state: "signedIn", user } : { state: "signedOut" };
    } catch (error) {
        return provesSignedOut(error) ? { state: "signedOut", error } : { state: "unknown", error };
    }
}

/**
 * Only a 401, or a 200 whose GraphQL errors ask to sign in, shows that the credential is signed out:
 * LeetCode also answers 403 to CSRF failures and bot challenges.
 */
function provesSignedOut(error: unknown): boolean {
    const status = (error as { response?: { status?: number } } | undefined)?.response?.status;
    return status === 401 || (status === 200 && error instanceof LeetCodeApiError && error.kind === "authentication");
}
