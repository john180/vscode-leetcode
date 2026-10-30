// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { EventEmitter } from "events";
import * as vscode from "vscode";
import { invalidateProblemCache } from "./api/problems";
import { normalizeCookie, validateCookie } from "./auth/cookie";
import { parseAuthCallback } from "./auth/login";
import { leetCodeChannel } from "./leetCodeChannel";
import { buildAuthLoginUrl, currentSite, Endpoint, getEffectiveEndpoint as getLeetCodeEndpoint, IQuickItemEx, UserStatus } from "./shared";
import { DialogType, openUrl, promptForOpenOutputChannel } from "./utils/uiUtils";
import { globalState, UserDataType } from "./globalState";
import { queryUserData } from "./request/query-user-data";
import { IGraphQLRequest } from "./api/client";
import { isCanceled } from "./api/http";
import { verifyCredential } from "./auth/credential";
import { IOperation, sessionController } from "./auth/sessionController";
import { ISite } from "./site";

/** How long a session that survived a 401/403 check is trusted before checking again. */
const SESSION_RECHECK_INTERVAL_MS = 60 * 1000;

/** Whether a later operation began, or the site changed in the settings before the change event arrived. */
function superseded(operation: IOperation, site: ISite): boolean {
    return !operation.isCurrent() || site !== currentSite();
}

class LeetCodeManager extends EventEmitter {
    private currentUser: string | undefined;
    private userStatus: UserStatus;
    private handlingUriSignIn: boolean = false;
    private handlingSessionExpired: boolean = false;
    private sessionKept: { cookie: string; at: number } | undefined;
    private authenticating: number = 0;
    private endpointChange: { endpoint: Endpoint; task: Promise<void> } | undefined;
    /** The restoration that shows "Signing in...". */
    private restoring: IOperation | undefined;
    private pendingWebLogin: { expiresAt: number; endpoint: string } | undefined;

    /** Starts an auth operation that supersedes any in-flight restoration. */
    private beginAuth(): IOperation {
        const operation = sessionController.begin();
        this.pendingWebLogin = undefined;
        if (this.userStatus === UserStatus.SigningIn) {
            // The restoration will be discarded, so it no longer owns "Signing in...".
            this.currentUser = undefined;
            this.userStatus = UserStatus.SignedOut;
            this.emit("statusChanged");
        }
        return operation;
    }

    private async publishUser(operation: IOperation, data: UserDataType): Promise<boolean> {
        if (!operation.isCurrent()) { return false; }
        await globalState.setUserStatus(data, operation);
        if (!operation.isCurrent()) { return false; }
        this.currentUser = data.username;
        this.userStatus = UserStatus.SignedIn;
        return true;
    }

    private clearAuth(operation: IOperation): Promise<void> {
        // Cleanup must run even if a later, unsuccessful login supersedes this operation.
        // Successful later logins queue their writes after this cleanup.
        const endpoint = globalState.getEndpoint();
        sessionController.end(operation);
        return sessionController.enqueue(() => globalState.clearStoredSession(endpoint));
    }

    constructor() {
        super();
        this.currentUser = undefined;
        this.userStatus = UserStatus.SignedOut;
        this.handleUriSignIn = this.handleUriSignIn.bind(this);
    }

    public getLoginStatus(): Promise<void> {
        if (globalState.getEndpoint() !== getLeetCodeEndpoint()) {
            return this.handleEndpointChange(getLeetCodeEndpoint());
        }
        return this.endpointChange?.task || this.restoreLoginStatus();
    }

    private async restoreLoginStatus(): Promise<void> {
        // Restoring supersedes other auth work, but not a web login the user is finishing in the browser.
        const pendingWebLogin = this.pendingWebLogin;
        const operation = this.beginAuth();
        this.pendingWebLogin = pendingWebLogin;
        const site = currentSite();
        invalidateProblemCache();
        const storedCookie: string | undefined = globalState.getCookie(getLeetCodeEndpoint());
        if (storedCookie) {
            this.userStatus = UserStatus.SigningIn;
            this.restoring = operation;
            this.emit("statusChanged");
        }
        try {
            if (storedCookie) {
                const check = await verifyCredential(storedCookie, operation.signal);
                if (superseded(operation, site)) {
                    return;
                }
                if (check.state === "signedIn") {
                    const { user } = check;
                    await sessionController.commit(operation, async () => {
                        await globalState.saveProfile(globalState.getActiveProfile() || user.username, user.username, storedCookie, operation);
                        await this.publishUser(operation, user);
                    });
                    return;
                }
                if ("error" in check) {
                    leetCodeChannel.warn(`Failed to validate the stored cookie: ${check.error}`);
                }
                if (check.state === "unknown") {
                    // A transport failure is not evidence that the credential expired.
                    this.currentUser = undefined;
                    this.userStatus = UserStatus.SignedOut;
                    return;
                }
            }

            await sessionController.commit(operation, async () => {
                this.currentUser = undefined;
                this.userStatus = UserStatus.SignedOut;
                await globalState.removeAll(globalState.getEndpoint(), operation);
            });
        } finally {
            // A superseded restoration must not leave its own "Signing in..." behind,
            // e.g. when the operation that replaced it failed.
            if (this.userStatus === UserStatus.SigningIn && this.restoring === operation) {
                this.currentUser = undefined;
                this.userStatus = UserStatus.SignedOut;
            }
            this.emit("statusChanged");
        }
    }

    private async updateUserStatusWithCookie(cookie: string, confirmAccount: boolean = false): Promise<void> {
        if (globalState.getEndpoint() !== getLeetCodeEndpoint()) { return; }
        const operation = this.beginAuth();
        const validationError: string | undefined = validateCookie(cookie);
        if (validationError) {
            throw new Error(validationError);
        }
        const normalizedCookie: string = normalizeCookie(cookie);
        const site = currentSite();
        leetCodeChannel.info(`Validating cookie against ${site.graphql}`);

        this.authenticating++;
        try {
            const data = await queryUserData(normalizedCookie, operation.signal);
            leetCodeChannel.info(`Sign-in result: signedIn=${data.isSignedIn}, username=${data.username ? "present" : "missing"}`);
            if (!data.isSignedIn || !data.username) {
                throw new Error(vscode.l10n.t("The cookie is not signed in for {0}. Check that leetcode.endpoint matches the cookie's site, then copy a fresh cookie.", site.host));
            }

            if (superseded(operation, site)) {
                return;
            }
            // LeetCode's callback does not return an OAuth state value. Require
            // explicit account confirmation rather than trusting a deep link.
            if (confirmAccount) {
                const accept = vscode.l10n.t("Sign In");
                const choice = await vscode.window.showInformationMessage(
                    vscode.l10n.t("Sign in as {0} on {1}?", data.username, site.host),
                    { modal: true, detail: vscode.l10n.t("Continue only if this is the account you just authorized in your browser.") },
                    accept,
                );
                if (choice !== accept || superseded(operation, site)) {
                    return;
                }
            }

            await sessionController.commit(operation, async () => {
                invalidateProblemCache();
                await globalState.saveProfile(data.username, data.username, normalizedCookie, operation);
                if (await this.publishUser(operation, data)) {
                    this.emit("statusChanged");
                    vscode.window.showInformationMessage(vscode.l10n.t("Successfully signed in as {0}.", data.username));
                }
            });
        } finally {
            this.authenticating--;
        }
    }

    public async handleUriSignIn(uri: vscode.Uri): Promise<void> {
        if (this.handlingUriSignIn) {
            return;
        }
        const pending = this.pendingWebLogin;
        this.pendingWebLogin = undefined;
        if (!pending || pending.expiresAt < Date.now() || pending.endpoint !== getLeetCodeEndpoint()) {
            return;
        }
        this.handlingUriSignIn = true;
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
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Signing in to LeetCode...") },
                async (progress) => {
                    progress.report({ message: vscode.l10n.t("Validating cookie...") });
                    await this.updateUserStatusWithCookie(cookie, true);
                },
            );
        } catch (error) {
            if (isCanceled(error)) { return; }
            leetCodeChannel.error(`URI sign-in failed: ${error}`);
            const detail: string = error instanceof Error ? error.message : String(error);
            await promptForOpenOutputChannel(vscode.l10n.t("Failed to log in: {0}", detail), DialogType.error);
        } finally {
            this.handlingUriSignIn = false;
        }
    }

    public async handleInputCookieSignIn(): Promise<void> {
        const endpoint = getLeetCodeEndpoint();
        const operation = sessionController.latest();
        const cookie: string | undefined = await vscode.window.showInputBox({
            prompt: vscode.l10n.t("Paste the Cookie header copied from {0}", currentSite().host),
            placeHolder: "LEETCODE_SESSION=...; csrftoken=...",
            password: true,
            ignoreFocusOut: true,
            validateInput: (value: string): string | undefined => validateCookie(value),
        });
        if (!cookie || endpoint !== getLeetCodeEndpoint() || !operation.isCurrent()) {
            return;
        }

        await this.updateUserStatusWithCookie(cookie);
    }

    public async signIn(): Promise<void> {
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
                detail: vscode.l10n.t("Open {0} in the browser", currentSite().host),
                value: "OpenLogin",
            },
        ];

        const choice: IQuickItemEx<string> | undefined = await vscode.window.showQuickPick(picks, {
            title: vscode.l10n.t("Sign in to {0}", currentSite().host),
            ignoreFocusOut: true,
        });
        if (!choice) {
            return;
        }

        if (choice.value === "OpenLogin") {
            await openUrl(currentSite().login);
            vscode.window.showInformationMessage(
                vscode.l10n.t("Sign in on the website, then copy the Cookie header and use LeetCode Cookie."),
            );
            return;
        }

        if (choice.value === "WebAuth") {
            this.beginAuth();
            this.pendingWebLogin = { expiresAt: Date.now() + 5 * 60 * 1000, endpoint: getLeetCodeEndpoint() };
            await openUrl(this.getAuthLoginUrl());
            vscode.window.showInformationMessage(
                vscode.l10n.t("Complete the login in your browser; this window will update automatically."),
            );
            return;
        }

        try {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t("Signing in to LeetCode...") },
                async () => {
                    await this.handleInputCookieSignIn();
                },
            );
        } catch (error) {
            if (isCanceled(error)) { return; }
            leetCodeChannel.error(`Cookie sign-in failed: ${error}`);
            const detail: string = error instanceof Error ? error.message : String(error);
            await promptForOpenOutputChannel(vscode.l10n.t("Failed to log in: {0}", detail), DialogType.error);
        }
    }

    public async signOut(): Promise<void> {
        const operation = this.beginAuth();
        this.sessionKept = undefined;
        this.currentUser = undefined;
        this.userStatus = UserStatus.SignedOut;
        await this.clearAuth(operation);
        invalidateProblemCache();
        this.emit("statusChanged");
        vscode.window.showInformationMessage(vscode.l10n.t("Successfully signed out."));
    }

    /**
     * A 401/403 only suggests that the session expired: LeetCode also answers
     * 403 to CSRF failures and bot challenges. The stored cookie is cleared only
     * once userStatus confirms that it is signed out.
     */
    public async handleSessionExpired(request?: IGraphQLRequest): Promise<void> {
        // A request of an ended session, of another site, or signed in with a cookie being checked says nothing about this session.
        if (request && (request.isCurrent?.() === false || request.sessionSignal?.aborted || request.cookie !== globalState.getCookie())) { return; }
        if (this.userStatus !== UserStatus.SignedIn || this.handlingSessionExpired || this.authenticating) {
            return;
        }
        const cookie: string | undefined = globalState.getCookie();
        if (cookie && this.sessionKept?.cookie === cookie && Date.now() - this.sessionKept.at < SESSION_RECHECK_INTERVAL_MS) {
            return;
        }
        this.handlingSessionExpired = true;
        const operation = sessionController.latest();
        try {
            if (cookie && !await this.isSignedOut(cookie, operation.signal)) {
                if (!operation.isCurrent()) { return; }
                leetCodeChannel.warn("LeetCode rejected a request, but the session is not signed out; keeping it.");
                this.sessionKept = { cookie, at: Date.now() };
                return;
            }
            if (!operation.isCurrent() || this.userStatus !== UserStatus.SignedIn) {
                return;
            }
            const signOut = this.beginAuth();
            this.sessionKept = undefined;
            leetCodeChannel.warn("LeetCode session expired; signing out.");
            this.currentUser = undefined;
            this.userStatus = UserStatus.SignedOut;
            await this.clearAuth(signOut);
            invalidateProblemCache();
            this.emit("statusChanged");

            const choice: string | undefined = await vscode.window.showWarningMessage(
                vscode.l10n.t("Your LeetCode session has expired. Please sign in again."),
                vscode.l10n.t("Sign In"),
            );
            if (choice) {
                await this.signIn();
            }
        } finally {
            this.handlingSessionExpired = false;
        }
    }

    private async isSignedOut(cookie: string, signal: AbortSignal): Promise<boolean> {
        const check = await verifyCredential(cookie, signal);
        if ("error" in check) {
            leetCodeChannel.warn(`Failed to verify the LeetCode session: ${check.error}`);
        }
        return check.state === "signedOut";
    }

    public async switchProfile(name: string): Promise<void> {
        if (globalState.getEndpoint() !== getLeetCodeEndpoint()) { return; }
        const operation = this.beginAuth();
        const site = currentSite();
        const cookie: string = await globalState.getProfileCookie(name);
        if (superseded(operation, site)) { return; }
        const data = await queryUserData(cookie, operation.signal);
        if (superseded(operation, site)) { return; }
        if (!data.isSignedIn || !data.username) {
            throw new Error(vscode.l10n.t("The selected session \"{0}\" is no longer signed in for {1}.", name, site.host));
        }
        await sessionController.commit(operation, async () => {
            invalidateProblemCache();
            await globalState.activateProfile(name, operation);
            if (await this.publishUser(operation, data)) {
                this.emit("statusChanged");
                vscode.window.showInformationMessage(vscode.l10n.t("Switched to session \"{0}\".", name));
            }
        });
    }

    public async createProfile(name: string, cookie: string): Promise<void> {
        if (globalState.getEndpoint() !== getLeetCodeEndpoint()) { return; }
        const validationError: string | undefined = validateCookie(cookie);
        if (validationError) {
            throw new Error(validationError);
        }
        const operation = this.beginAuth();
        const site = currentSite();
        const normalizedCookie: string = normalizeCookie(cookie);
        const data = await queryUserData(normalizedCookie, operation.signal);
        if (superseded(operation, site)) { return; }
        if (!data.isSignedIn || !data.username) {
            throw new Error(vscode.l10n.t("The cookie is not signed in for {0}. Check that leetcode.endpoint matches the cookie's site, then copy a fresh cookie.", site.host));
        }
        await sessionController.commit(operation, async () => {
            invalidateProblemCache();
            await globalState.saveProfile(name, data.username, normalizedCookie, operation);
            if (await this.publishUser(operation, data)) {
                this.emit("statusChanged");
                vscode.window.showInformationMessage(vscode.l10n.t("Session \"{0}\" is ready.", name));
            }
        });
    }

    public async deleteProfile(name: string): Promise<void> {
        const restoring = this.userStatus === UserStatus.SigningIn;
        const operation = this.beginAuth();
        await sessionController.commit(operation, () => globalState.deleteProfile(name, operation));
        invalidateProblemCache();
        if (!globalState.getCookie()) {
            this.currentUser = undefined;
            this.userStatus = UserStatus.SignedOut;
        }
        this.emit("statusChanged");
        vscode.window.showInformationMessage(vscode.l10n.t("Session \"{0}\" deleted.", name));
        if (restoring && globalState.getCookie()) {
            // Deleting another session interrupted restoring the current one; resume it.
            void this.getLoginStatus().catch((error: unknown) => {
                leetCodeChannel.warn(`Session restoration failed: ${error}`);
            });
        }
    }

    public getStatus(): UserStatus {
        return this.userStatus;
    }

    public getUser(): string | undefined {
        return this.currentUser;
    }

    public getAuthLoginUrl(): string {
        return buildAuthLoginUrl(getLeetCodeEndpoint());
    }

    /** Both the settings editor and the site picker use this serialized transition. */
    public handleEndpointChange(endpoint: Endpoint): Promise<void> {
        if (this.endpointChange?.endpoint === endpoint) { return this.endpointChange.task; }
        if (!this.endpointChange && endpoint === globalState.getEndpoint()) { return Promise.resolve(); }
        const operation = this.beginAuth();
        this.sessionKept = undefined;
        sessionController.end(operation, endpoint);
        this.currentUser = undefined;
        this.userStatus = UserStatus.SignedOut;
        invalidateProblemCache();
        this.emit("statusChanged");
        const task = sessionController.commit(operation, () => globalState.useEndpoint(endpoint, operation)).then(async () => {
            if (operation.isCurrent()) { await this.restoreLoginStatus(); }
        }).finally(() => {
            if (this.endpointChange?.task === task) { this.endpointChange = undefined; }
        });
        this.endpointChange = { endpoint, task };
        return task;
    }

    public dispose(): void {
        sessionController.revoke();
        this.pendingWebLogin = undefined;
        this.removeAllListeners();
    }
}

export const leetCodeManager: LeetCodeManager = new LeetCodeManager();
