// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { EventEmitter } from "events";
import * as vscode from "vscode";
import { invalidateProblemCache } from "./api/problems";
import { normalizeCookie, validateCookie } from "./auth/cookie";
import { parseAuthCallback } from "./auth/login";
import { leetCodeChannel } from "./leetCodeChannel";
import { buildAuthLoginUrl, Endpoint, getUrl, IQuickItemEx, UserStatus } from "./shared";
import { DialogType, openUrl, promptForOpenOutputChannel } from "./utils/uiUtils";
import { getLeetCodeEndpoint } from "./commands/plugin";
import { globalState } from "./globalState";
import { queryUserData } from "./request/query-user-data";

class LeetCodeManager extends EventEmitter {
    private currentUser: string | undefined;
    private userStatus: UserStatus;
    private handlingUriSignIn: boolean = false;
    private handlingSessionExpired: boolean = false;
    private authenticating: boolean = false;
    private authRevision: number = 0;
    private signingInRevision: number | undefined;
    private pendingWebLogin: { expiresAt: number; endpoint: string } | undefined;
    private authWrites: Promise<void> = Promise.resolve();

    /** Starts an auth operation that supersedes any in-flight restoration. */
    private beginAuth(): number {
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

    private clearAuth(): Promise<void> {
        // Cleanup must run even if a later, unsuccessful login advances the revision.
        // Successful later logins queue their writes after this cleanup.
        const result = this.authWrites.then(() => globalState.removeAll());
        this.authWrites = result.catch(() => undefined);
        return result;
    }

    constructor() {
        super();
        this.currentUser = undefined;
        this.userStatus = UserStatus.SignedOut;
        this.handleUriSignIn = this.handleUriSignIn.bind(this);
    }

    public async getLoginStatus(): Promise<void> {
        const revision = ++this.authRevision;
        invalidateProblemCache();
        const storedCookie: string | undefined = globalState.getCookie();
        if (storedCookie) {
            this.userStatus = UserStatus.SigningIn;
            this.signingInRevision = revision;
            this.emit("statusChanged");
        }
        try {
            if (storedCookie) {
                try {
                    const data = await queryUserData(storedCookie);
                    if (revision !== this.authRevision) {
                        return;
                    }
                    if (data.isSignedIn && data.username) {
                        await this.commitAuth(revision, async () => {
                            await globalState.setUserStatus(data);
                            await globalState.saveProfile(globalState.getActiveProfile() || data.username, data.username, storedCookie);
                            if (revision === this.authRevision) {
                                this.currentUser = data.username;
                                this.userStatus = UserStatus.SignedIn;
                            }
                        });
                        return;
                    }
                } catch (error) {
                    if (revision !== this.authRevision) {
                        return;
                    }
                    leetCodeChannel.appendLine(`[WARN] Failed to validate the stored cookie: ${error}`);
                    // A transport failure is not evidence that the credential expired.
                    const status = (error as { response?: { status?: number } }).response?.status;
                    if (status !== 401) {
                        this.currentUser = undefined;
                        this.userStatus = UserStatus.SignedOut;
                        return;
                    }
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
        const revision = this.beginAuth();
        const validationError: string | undefined = validateCookie(cookie);
        if (validationError) {
            throw new Error(validationError);
        }
        const normalizedCookie: string = normalizeCookie(cookie);
        const endpoint: string = getUrl("userGraphql");
        leetCodeChannel.appendLine(`[INFO] Validating cookie against ${endpoint}`);

        this.authenticating = true;
        try {
            const data = await queryUserData(normalizedCookie);
            leetCodeChannel.appendLine(`[INFO] Sign-in result: signedIn=${data.isSignedIn}, username=${data.username ? "present" : "missing"}`);
            if (!data.isSignedIn || !data.username) {
                throw new Error(vscode.l10n.t("The cookie is not signed in for {0}. Check that leetcode.endpoint matches the cookie's site, then copy a fresh cookie.", endpoint));
            }

            if (revision !== this.authRevision || endpoint !== getUrl("userGraphql")) {
                return;
            }
            // LeetCode's callback does not return an OAuth state value. Require
            // explicit account confirmation rather than trusting a deep link.
            if (confirmAccount) {
                const accept = vscode.l10n.t("Sign In");
                const choice = await vscode.window.showInformationMessage(
                    vscode.l10n.t("Sign in as {0} on {1}?", data.username, this.getEndpointLabel()),
                    { modal: true, detail: vscode.l10n.t("Continue only if this is the account you just authorized in your browser.") },
                    accept,
                );
                if (choice !== accept || revision !== this.authRevision || endpoint !== getUrl("userGraphql")) {
                    return;
                }
            }

            await this.commitAuth(revision, async () => {
                invalidateProblemCache();
                await globalState.saveProfile(data.username, data.username, normalizedCookie);
                await globalState.setUserStatus(data);
                if (revision === this.authRevision) {
                    this.currentUser = data.username;
                    this.userStatus = UserStatus.SignedIn;
                    this.emit("statusChanged");
                    vscode.window.showInformationMessage(vscode.l10n.t("Successfully signed in as {0}.", data.username));
                }
            });
        } finally {
            this.authenticating = false;
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
                leetCodeChannel.appendLine(`[ERROR] Web authorization failed: ${callback.error}`);
                await promptForOpenOutputChannel(
                    vscode.l10n.t("Login was not completed: {0}", callback.error),
                    DialogType.error,
                );
                return;
            }
            if (!callback.cookie) {
                leetCodeChannel.appendLine("[ERROR] The sign-in callback did not include a cookie.");
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
            leetCodeChannel.appendLine(`[ERROR] URI sign-in failed: ${error}`);
            const detail: string = error instanceof Error ? error.message : String(error);
            await promptForOpenOutputChannel(vscode.l10n.t("Failed to log in: {0}", detail), DialogType.error);
        } finally {
            this.handlingUriSignIn = false;
        }
    }

    public async handleInputCookieSignIn(): Promise<void> {
        const cookie: string | undefined = await vscode.window.showInputBox({
            prompt: vscode.l10n.t("Paste the Cookie header copied from {0}", this.getEndpointLabel()),
            placeHolder: "LEETCODE_SESSION=...; csrftoken=...",
            password: true,
            ignoreFocusOut: true,
            validateInput: (value: string): string | undefined => validateCookie(value),
        });
        if (!cookie) {
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
                detail: vscode.l10n.t("Open {0} in the browser", this.getEndpointLabel()),
                value: "OpenLogin",
            },
        ];

        const choice: IQuickItemEx<string> | undefined = await vscode.window.showQuickPick(picks, {
            title: vscode.l10n.t("Sign in to {0}", this.getEndpointLabel()),
            ignoreFocusOut: true,
        });
        if (!choice) {
            return;
        }

        if (choice.value === "OpenLogin") {
            await openUrl(getUrl("login"));
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
            leetCodeChannel.appendLine(`[ERROR] Cookie sign-in failed: ${error}`);
            const detail: string = error instanceof Error ? error.message : String(error);
            await promptForOpenOutputChannel(vscode.l10n.t("Failed to log in: {0}", detail), DialogType.error);
        }
    }

    public async signOut(): Promise<void> {
        ++this.authRevision;
        this.pendingWebLogin = undefined;
        this.currentUser = undefined;
        this.userStatus = UserStatus.SignedOut;
        await this.clearAuth();
        invalidateProblemCache();
        this.emit("statusChanged");
        vscode.window.showInformationMessage(vscode.l10n.t("Successfully signed out."));
    }

    public async handleSessionExpired(): Promise<void> {
        if (this.userStatus !== UserStatus.SignedIn || this.handlingSessionExpired || this.authenticating) {
            return;
        }
        this.handlingSessionExpired = true;
        ++this.authRevision;
        this.pendingWebLogin = undefined;
        try {
            leetCodeChannel.appendLine("[WARN] LeetCode session expired; signing out.");
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

    public async switchProfile(name: string): Promise<void> {
        const revision = this.beginAuth();
        const cookie: string = await globalState.getProfileCookie(name);
        const data = await queryUserData(cookie);
        if (!data.isSignedIn || !data.username) {
            throw new Error(vscode.l10n.t("The selected session \"{0}\" is no longer signed in for {1}.", name, getUrl("userGraphql")));
        }
        await this.commitAuth(revision, async () => {
            invalidateProblemCache();
            await globalState.activateProfile(name);
            await globalState.setUserStatus(data);
            if (revision === this.authRevision) {
                this.currentUser = data.username;
                this.userStatus = UserStatus.SignedIn;
                this.emit("statusChanged");
                vscode.window.showInformationMessage(vscode.l10n.t("Switched to session \"{0}\".", name));
            }
        });
    }

    public async createProfile(name: string, cookie: string): Promise<void> {
        const validationError: string | undefined = validateCookie(cookie);
        if (validationError) {
            throw new Error(validationError);
        }
        const revision = this.beginAuth();
        const normalizedCookie: string = normalizeCookie(cookie);
        const data = await queryUserData(normalizedCookie);
        if (!data.isSignedIn || !data.username) {
            throw new Error(vscode.l10n.t("The cookie is not signed in for {0}. Check that leetcode.endpoint matches the cookie's site, then copy a fresh cookie.", getUrl("userGraphql")));
        }
        await this.commitAuth(revision, async () => {
            invalidateProblemCache();
            await globalState.saveProfile(name, data.username, normalizedCookie);
            await globalState.setUserStatus(data);
            if (revision === this.authRevision) {
                this.currentUser = data.username;
                this.userStatus = UserStatus.SignedIn;
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
                leetCodeChannel.appendLine(`[WARN] Session restoration failed: ${error}`);
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

    private getEndpointLabel(): string {
        return getLeetCodeEndpoint() === Endpoint.LeetCodeCN ? "leetcode.cn" : "leetcode.com";
    }
}

export const leetCodeManager: LeetCodeManager = new LeetCodeManager();
