// Licensed under the MIT license.

import * as vscode from "vscode";
import type { IGraphQLRequest } from "../api/client";
import { isCanceled } from "../api/http";
import { getLeetCodeRequest } from "../api/request";
import { validateCookie } from "../auth/cookie";
import { parseAuthCallback } from "../auth/login";
import { leetCodeChannel } from "../leetCodeChannel";
import { leetCodeManager } from "../leetCodeManager";
import { currentSite, IQuickItemEx } from "../shared";
import { ISite } from "../site";
import { DialogType, openUrl, promptForOpenOutputChannel } from "../utils/uiUtils";

let handlingCallback: boolean = false;

export async function signIn(): Promise<void> {
    const site = currentSite();
    const picks: Array<IQuickItemEx<string>> = [
        {
            label: vscode.l10n.t("LeetCode Cookie"),
            detail: vscode.l10n.t("Paste the Cookie header copied from browser DevTools"),
            value: "Cookie",
            description: "[Recommended]",
        },
        {
            label: vscode.l10n.t("Web Authorization"),
            detail: vscode.l10n.t("Open the browser to authorize login on the website"),
            value: "WebAuth",
        },
        {
            label: vscode.l10n.t("Open Login Page"),
            detail: vscode.l10n.t("Open {0} in the browser", site.host),
            value: "OpenLogin",
        },
    ];

    const choice: IQuickItemEx<string> | undefined = await vscode.window.showQuickPick(picks, {
        title: vscode.l10n.t("Sign in to {0}", site.host),
        ignoreFocusOut: true,
    });
    if (!choice) {
        return;
    }

    if (choice.value === "OpenLogin") {
        await openUrl(site.login);
        vscode.window.showInformationMessage(
            vscode.l10n.t("Sign in on the website, then copy the Cookie header and use LeetCode Cookie."),
        );
        return;
    }

    if (choice.value === "WebAuth") {
        await openUrl(leetCodeManager.beginWebLogin());
        vscode.window.showInformationMessage(
            vscode.l10n.t("Complete the login in your browser; this window will update automatically."),
        );
        return;
    }

    try {
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Signing in to LeetCode...") },
            () => signInWithPastedCookie(),
        );
    } catch (error) {
        if (isCanceled(error)) { return; }
        leetCodeChannel.error(`Cookie sign-in failed: ${error}`);
        const detail: string = error instanceof Error ? error.message : String(error);
        await promptForOpenOutputChannel(vscode.l10n.t("Failed to log in: {0}", detail), DialogType.error);
    }
}

async function signInWithPastedCookie(): Promise<void> {
    const request = getLeetCodeRequest();
    const cookie: string | undefined = await vscode.window.showInputBox({
        prompt: vscode.l10n.t("Paste the Cookie header copied from {0}", currentSite().host),
        placeHolder: "LEETCODE_SESSION=...; csrftoken=...",
        password: true,
        ignoreFocusOut: true,
        validateInput: (value: string): string | undefined => validateCookie(value),
    });
    // The site or the session may have changed while the box was open.
    if (!cookie || request.isCurrent?.() === false) {
        return;
    }
    reportSignIn(await leetCodeManager.signInWithCookie(cookie));
}

function reportSignIn(username: string | undefined): void {
    if (username) {
        vscode.window.showInformationMessage(vscode.l10n.t("Successfully signed in as {0}.", username));
    }
}

export async function signOut(): Promise<void> {
    await leetCodeManager.signOut();
    vscode.window.showInformationMessage(vscode.l10n.t("Successfully signed out."));
}

/** Completes a web login with the browser's callback. Only a login started by signIn, and only its first callback, is accepted. */
export async function handleUri(uri: vscode.Uri): Promise<void> {
    if (handlingCallback || !leetCodeManager.takeWebLogin()) {
        return;
    }
    handlingCallback = true;
    try {
        const callback = parseAuthCallback(uri.query);
        if (callback.error) {
            leetCodeChannel.error(`Web authorization failed: ${callback.error}`);
            await promptForOpenOutputChannel(
                vscode.l10n.t("Login was not completed: {0}", callback.error),
                DialogType.error,
            );
            return;
        }
        if (!callback.cookie) {
            leetCodeChannel.error("The sign-in callback did not include a cookie.");
            await promptForOpenOutputChannel(vscode.l10n.t("Failed to get the cookie. Please sign in again."), DialogType.error);
            return;
        }

        const cookie: string = callback.cookie;
        const username: string | undefined = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Signing in to LeetCode...") },
            (progress) => {
                progress.report({ message: vscode.l10n.t("Validating cookie...") });
                return leetCodeManager.signInWithCookie(cookie, { confirm: confirmAccount });
            },
        );
        reportSignIn(username);
    } catch (error) {
        if (isCanceled(error)) { return; }
        leetCodeChannel.error(`URI sign-in failed: ${error}`);
        const detail: string = error instanceof Error ? error.message : String(error);
        await promptForOpenOutputChannel(vscode.l10n.t("Failed to log in: {0}", detail), DialogType.error);
    } finally {
        handlingCallback = false;
    }
}

/** LeetCode's callback carries no OAuth state value, so the user confirms the account rather than trusting a deep link. */
async function confirmAccount(username: string, site: ISite): Promise<boolean> {
    const accept = vscode.l10n.t("Sign In");
    const choice = await vscode.window.showInformationMessage(
        vscode.l10n.t("Sign in as {0} on {1}?", username, site.host),
        { modal: true, detail: vscode.l10n.t("Continue only if this is the account you just authorized in your browser.") },
        accept,
    );
    return choice === accept;
}

/** Checks the session a request was rejected for and, if LeetCode signed it out, offers to sign in again. */
export async function handleSessionExpired(request: IGraphQLRequest): Promise<void> {
    if (!await leetCodeManager.handleSessionExpired(request)) {
        return;
    }
    const choice: string | undefined = await vscode.window.showWarningMessage(
        vscode.l10n.t("Your LeetCode session has expired. Please sign in again."),
        vscode.l10n.t("Sign In"),
    );
    if (choice) {
        await signIn();
    }
}
