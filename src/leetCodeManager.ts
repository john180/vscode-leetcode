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
import { sessionScope } from "./auth/sessionScope";

/** How long a session that survived a 401/403 check is trusted before checking again. */
const SESSION_RECHECK_INTERVAL_MS = 60 * 1000;

class LeetCodeManager extends EventEmitter {
    private currentUser: string | undefined;
    private userStatus: UserStatus;
    private handlingUriSignIn: boolean = false;
    private handlingSessionExpired: boolean = false;
    private sessionKept: { cookie: string; at: number } | undefined;
    private authenticating: number = 0;
    private authController = new AbortController();
    private endpointChange: { endpoint: Endpoint; task: Promise<void> } | undefined;
    private authRevision: number = 0;
    private signingInRevision: number | undefined;
    private pendingWebLogin: { expiresAt: number; endpoint: string } | undefined;
    private authWrites: Promise<void> = Promise.resolve();

    /** Starts an auth operation that supersedes any in-flight restoration. */
    private beginAuth(): number {
        this.authController.abort();
        this.authController = new AbortController();
        this.pendingWebLogin = undefined;
        if (this.userStatus === UserStatus.SigningIn) {
            // The restoration will be discarded, so it no longer owns "Signing in...".
            this.currentUser = undefined;
            this.userStatus = UserStatus.SignedOut;
            this.emit("statusChanged");
        }
        return ++this.authRevision;
    }

    private commitAuth(revision: number, write: () => Promise<void>): Promise<void> {
        const result = this.authWrites.then(async () => {
            if (revision === this.authRevision) {
                await write();
            }
        });
        this.authWrites = result.catch(() => undefined);
        return result;
    }

    private async publishUser(revision: number, data: UserDataType): Promise<boolean> {
        if (revision !== this.authRevision) { return false; }
        await globalState.setUserStatus(data);
        if (revision !== this.authRevision) { return false; }
        this.currentUser = data.username;
        this.userStatus = UserStatus.SignedIn;
        return true;
    }

    private clearAuth(): Promise<void> {
        // Cleanup must run even if a later, unsuccessful login advances the revision.
        // Successful later logins queue their writes after this cleanup.
        const endpoint = globalState.getEndpoint();
        globalState.detach();
        const result = this.authWrites.then(() => globalState.clearStoredSession(endpoint));
        this.authWrites = result.catch(() => undefined);
        return result;
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
        const revision = this.beginAuth();
        this.pendingWebLogin = pendingWebLogin;
        const site = currentSite();
        invalidateProblemCache();
        const storedCookie: string | undefined = globalState.getCookie(getLeetCodeEndpoint());
        if (storedCookie) {
            this.userStatus = UserStatus.SigningIn;
            this.signingInRevision = revision;
            this.emit("statusChanged");
        }
        try {
            if (storedCookie) {
                const check = await verifyCredential(storedCookie, this.authController.signal);
                if (revision !== this.authRevision || site !== currentSite()) {
                    return;
                }
                if (check.state === "signedIn") {
                    const { user } = check;
                    await this.commitAuth(revision, async () => {
                        await globalState.saveProfile(globalState.getActiveProfile() || user.username, user.username, storedCookie, () => revision === this.authRevision);
                        await this.publishUser(revision, user);
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

            await this.commitAuth(revision, async () => {
                this.currentUser = undefined;
                this.userStatus = UserStatus.SignedOut;
                await globalState.removeAll();
            });
        } finally {
            // A superseded restoration must not leave its own "Signing in..." behind,
            // e.g. when the operation that replaced it failed.
            if (this.userStatus === UserStatus.SigningIn && this.signingInRevision === revision) {
                this.currentUser = undefined;
                this.userStatus = UserStatus.SignedOut;
            }
            this.emit("statusChanged");
        }
    }

    private async updateUserStatusWithCookie(cookie: string, confirmAccount: boolean = false): Promise<void> {
        if (globalState.getEndpoint() !== getLeetCodeEndpoint()) { return; }
        const revision = this.beginAuth();
        const validationError: string | undefined = validateCookie(cookie);
        if (validationError) {
            throw new Error(validationError);
        }
        const normalizedCookie: string = normalizeCookie(cookie);
        const site = currentSite();
        leetCodeChannel.info(`Validating cookie against ${site.graphql}`);

        this.authenticating++;
        try {
            const data = await queryUserData(normalizedCookie, this.authController.signal);
            leetCodeChannel.info(`Sign-in result: signedIn=${data.isSignedIn}, username=${data.username ? "present" : "missing"}`);
            if (!data.isSignedIn || !data.username) {
                throw new Error(vscode.l10n.t("The cookie is not signed in for {0}. Check that leetcode.endpoint matches the cookie's site, then copy a fresh cookie.", site.host));
            }

            if (revision !== this.authRevision || site !== currentSite()) {
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
                if (choice !== accept || revision !== this.authRevision || site !== currentSite()) {
                    return;
                }
            }

            await this.commitAuth(revision, async () => {
                invalidateProblemCache();
                await globalState.saveProfile(data.username, data.username, normalizedCookie, () => revision === this.authRevision);
                if (await this.publishUser(revision, data)) {
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
        const revision = this.authRevision;
        const cookie: string | undefined = await vscode.window.showInputBox({
            prompt: vscode.l10n.t("Paste the Cookie header copied from {0}", currentSite().host),
            placeHolder: "LEETCODE_SESSION=...; csrftoken=...",
            password: true,
            ignoreFocusOut: true,
            validateInput: (value: string): string | undefined => validateCookie(value),
        });
        if (!cookie || endpoint !== getLeetCodeEndpoint() || revision !== this.authRevision) {
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
        this.beginAuth();
        this.sessionKept = undefined;
        this.pendingWebLogin = undefined;
        this.currentUser = undefined;
        this.userStatus = UserStatus.SignedOut;
        await this.clearAuth();
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
        if (request && (request.isCurrent?.() === false || request.sessionSignal?.aborted
            || request.cookie !== globalState.getCookie() || request.endpoint !== currentSite().graphql)) { return; }
        if (this.userStatus !== UserStatus.SignedIn || this.handlingSessionExpired || this.authenticating) {
            return;
        }
        const cookie: string | undefined = globalState.getCookie();
        if (cookie && this.sessionKept?.cookie === cookie && Date.now() - this.sessionKept.at < SESSION_RECHECK_INTERVAL_MS) {
            return;
        }
        this.handlingSessionExpired = true;
        const revision = this.authRevision;
        try {
            if (cookie && !await this.isSignedOut(cookie)) {
                if (revision !== this.authRevision) { return; }
                leetCodeChannel.warn("LeetCode rejected a request, but the session is not signed out; keeping it.");
                this.sessionKept = { cookie, at: Date.now() };
                return;
            }
            if (revision !== this.authRevision || this.userStatus !== UserStatus.SignedIn) {
                return;
            }
            this.beginAuth();
            this.sessionKept = undefined;
            this.pendingWebLogin = undefined;
            leetCodeChannel.warn("LeetCode session expired; signing out.");
            this.currentUser = undefined;
            this.userStatus = UserStatus.SignedOut;
            await this.clearAuth();
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

    private async isSignedOut(cookie: string): Promise<boolean> {
        const check = await verifyCredential(cookie, this.authController.signal);
        if ("error" in check) {
            leetCodeChannel.warn(`Failed to verify the LeetCode session: ${check.error}`);
        }
        return check.state === "signedOut";
    }

    public async switchProfile(name: string): Promise<void> {
        if (globalState.getEndpoint() !== getLeetCodeEndpoint()) { return; }
        const revision = this.beginAuth();
        const site = currentSite();
        const cookie: string = await globalState.getProfileCookie(name);
        if (revision !== this.authRevision || site !== currentSite()) { return; }
        const data = await queryUserData(cookie, this.authController.signal);
        if (revision !== this.authRevision || site !== currentSite()) { return; }
        if (!data.isSignedIn || !data.username) {
            throw new Error(vscode.l10n.t("The selected session \"{0}\" is no longer signed in for {1}.", name, site.host));
        }
        await this.commitAuth(revision, async () => {
            invalidateProblemCache();
            await globalState.activateProfile(name, () => revision === this.authRevision);
            if (await this.publishUser(revision, data)) {
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
        const revision = this.beginAuth();
        const site = currentSite();
        const normalizedCookie: string = normalizeCookie(cookie);
        const data = await queryUserData(normalizedCookie, this.authController.signal);
        if (revision !== this.authRevision || site !== currentSite()) { return; }
        if (!data.isSignedIn || !data.username) {
            throw new Error(vscode.l10n.t("The cookie is not signed in for {0}. Check that leetcode.endpoint matches the cookie's site, then copy a fresh cookie.", site.host));
        }
        await this.commitAuth(revision, async () => {
            invalidateProblemCache();
            await globalState.saveProfile(name, data.username, normalizedCookie, () => revision === this.authRevision);
            if (await this.publishUser(revision, data)) {
                this.emit("statusChanged");
                vscode.window.showInformationMessage(vscode.l10n.t("Session \"{0}\" is ready.", name));
            }
        });
    }

    public async deleteProfile(name: string): Promise<void> {
        const restoring = this.userStatus === UserStatus.SigningIn;
        const revision = this.beginAuth();
        await this.commitAuth(revision, () => globalState.deleteProfile(name));
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
        const revision = this.beginAuth();
        this.sessionKept = undefined;
        globalState.selectEndpoint(endpoint);
        this.currentUser = undefined;
        this.userStatus = UserStatus.SignedOut;
        invalidateProblemCache();
        this.emit("statusChanged");
        const transition = this.authWrites.then(async () => {
            if (revision !== this.authRevision) { return; }
            await globalState.useEndpoint(endpoint, () => revision === this.authRevision);
        });
        this.authWrites = transition.catch(() => undefined);
        const task = transition.then(async () => {
            if (revision === this.authRevision) { await this.restoreLoginStatus(); }
        }).finally(() => {
            if (this.endpointChange?.task === task) { this.endpointChange = undefined; }
        });
        this.endpointChange = { endpoint, task };
        return task;
    }

    public dispose(): void {
        ++this.authRevision;
        this.authController.abort();
        this.pendingWebLogin = undefined;
        sessionScope.invalidate();
        this.removeAllListeners();
    }
}

export const leetCodeManager: LeetCodeManager = new LeetCodeManager();
