// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { EventEmitter } from "events";
import * as vscode from "vscode";
import { invalidateProblemCache } from "./api/problems";
import { normalizeCookie, validateCookie } from "./auth/cookie";
import { leetCodeChannel } from "./leetCodeChannel";
import { buildAuthLoginUrl, currentSite, Endpoint, getEffectiveEndpoint as getLeetCodeEndpoint, UserStatus } from "./shared";
import { globalState, UserDataType } from "./globalState";
import { queryUserData } from "./request/query-user-data";
import { IGraphQLRequest } from "./api/client";
import { verifyCredential } from "./auth/credential";
import { IOperation, sessionController } from "./auth/sessionController";
import { ISite } from "./site";

/** How long a session that survived a 401/403 check is trusted before checking again. */
const SESSION_RECHECK_INTERVAL_MS = 60 * 1000;
/** How long the browser has to call back after a web login starts. */
const WEB_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

/** Whether a later operation began, or the site changed in the settings before the change event arrived. */
function superseded(operation: IOperation, site: ISite): boolean {
    return !operation.isCurrent() || site !== currentSite();
}

export interface ISignInOptions {
    /** The saved account to keep the cookie under; the user's name by default. */
    name?: string;
    /** Asked once LeetCode names the cookie's user, before the session changes. */
    confirm?: (username: string, site: ISite) => Promise<boolean>;
}

/** What signing in and switching accounts differ in. */
interface IActivation {
    readonly cookie: () => Promise<string>;
    readonly notSignedIn: (site: ISite) => string;
    readonly confirm?: ISignInOptions["confirm"];
    readonly save: (user: UserDataType, operation: IOperation) => Promise<unknown>;
}

/** The sign-in state, and the operations that change the session. Prompts and messages belong to the commands. */
class LeetCodeManager extends EventEmitter {
    private currentUser: string | undefined;
    private userStatus: UserStatus;
    private handlingSessionExpired: boolean = false;
    private sessionKept: { cookie: string; at: number } | undefined;
    /** Sign-ins and switches in flight; a rejected request meanwhile says nothing about the session they replace. */
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

    /** Signs in with a cookie. Resolves with the user's name, or undefined if another operation superseded it or it was not confirmed. */
    public async signInWithCookie(cookie: string, options: ISignInOptions = {}): Promise<string | undefined> {
        const validationError: string | undefined = validateCookie(cookie);
        if (validationError) {
            throw new Error(validationError);
        }
        const normalizedCookie: string = normalizeCookie(cookie);
        const user = await this.activate({
            cookie: async () => normalizedCookie,
            notSignedIn: (site) => vscode.l10n.t("The cookie is not signed in for {0}. Check that leetcode.endpoint matches the cookie's site, then copy a fresh cookie.", site.host),
            confirm: options.confirm,
            save: (data, operation) => globalState.saveProfile(options.name ?? data.username, data.username, normalizedCookie, operation),
        });
        return user?.username;
    }

    /** Switches to a saved account if LeetCode still signs its cookie in. Resolves with whether it switched. */
    public async switchProfile(name: string): Promise<boolean> {
        const user = await this.activate({
            cookie: () => globalState.getProfileCookie(name),
            notSignedIn: (site) => vscode.l10n.t("The selected session \"{0}\" is no longer signed in for {1}.", name, site.host),
            save: (_data, operation) => globalState.activateProfile(name, operation),
        });
        return user !== undefined;
    }

    /** Makes a cookie the session's credential once LeetCode names its user, unless a later operation begins meanwhile. */
    private async activate(activation: IActivation): Promise<UserDataType | undefined> {
        if (globalState.getEndpoint() !== getLeetCodeEndpoint()) { return undefined; }
        const operation = this.beginAuth();
        const site = currentSite();
        this.authenticating++;
        try {
            const cookie: string = await activation.cookie();
            if (superseded(operation, site)) { return undefined; }
            leetCodeChannel.info(`Validating cookie against ${site.graphql}`);
            const data = await queryUserData(cookie, operation.signal);
            leetCodeChannel.info(`Sign-in result: signedIn=${data.isSignedIn}, username=${data.username ? "present" : "missing"}`);
            if (superseded(operation, site)) { return undefined; }
            if (!data.isSignedIn || !data.username) {
                throw new Error(activation.notSignedIn(site));
            }
            if (activation.confirm && (!await activation.confirm(data.username, site) || superseded(operation, site))) {
                return undefined;
            }
            let signedIn = false;
            await sessionController.commit(operation, async () => {
                invalidateProblemCache();
                await activation.save(data, operation);
                if (await this.publishUser(operation, data)) {
                    signedIn = true;
                    this.emit("statusChanged");
                }
            });
            return signedIn ? data : undefined;
        } finally {
            this.authenticating--;
        }
    }

    /** Starts a web login and returns the page that authorizes it. Only its callback, for this site and within five minutes, may sign in. */
    public beginWebLogin(): string {
        this.beginAuth();
        this.pendingWebLogin = { expiresAt: Date.now() + WEB_LOGIN_TIMEOUT_MS, endpoint: getLeetCodeEndpoint() };
        return buildAuthLoginUrl(getLeetCodeEndpoint());
    }

    /** Takes the web login a callback answers: whether one is waiting for this site and has not expired. Each is taken once. */
    public takeWebLogin(): boolean {
        const pending = this.pendingWebLogin;
        this.pendingWebLogin = undefined;
        return pending !== undefined && pending.expiresAt >= Date.now() && pending.endpoint === getLeetCodeEndpoint();
    }

    public async signOut(): Promise<void> {
        const operation = this.beginAuth();
        this.sessionKept = undefined;
        this.currentUser = undefined;
        this.userStatus = UserStatus.SignedOut;
        await this.clearAuth(operation);
        invalidateProblemCache();
        this.emit("statusChanged");
    }

    /**
     * A 401/403 only suggests that the session expired: LeetCode also answers
     * 403 to CSRF failures and bot challenges. The stored cookie is cleared only
     * once userStatus confirms that it is signed out. Resolves with whether it signed out.
     */
    public async handleSessionExpired(request?: IGraphQLRequest): Promise<boolean> {
        // A request of an ended session, of another site, or signed in with a cookie being checked says nothing about this session.
        if (request && (request.isCurrent?.() === false || request.sessionSignal?.aborted || request.cookie !== globalState.getCookie())) { return false; }
        if (this.userStatus !== UserStatus.SignedIn || this.handlingSessionExpired || this.authenticating) {
            return false;
        }
        const cookie: string | undefined = globalState.getCookie();
        if (cookie && this.sessionKept?.cookie === cookie && Date.now() - this.sessionKept.at < SESSION_RECHECK_INTERVAL_MS) {
            return false;
        }
        this.handlingSessionExpired = true;
        const operation = sessionController.latest();
        try {
            if (cookie && !await this.isSignedOut(cookie, operation.signal)) {
                if (!operation.isCurrent()) { return false; }
                leetCodeChannel.warn("LeetCode rejected a request, but the session is not signed out; keeping it.");
                this.sessionKept = { cookie, at: Date.now() };
                return false;
            }
            if (!operation.isCurrent() || this.userStatus !== UserStatus.SignedIn) {
                return false;
            }
            const signOut = this.beginAuth();
            this.sessionKept = undefined;
            leetCodeChannel.warn("LeetCode session expired; signing out.");
            this.currentUser = undefined;
            this.userStatus = UserStatus.SignedOut;
            await this.clearAuth(signOut);
            invalidateProblemCache();
            this.emit("statusChanged");
            return true;
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
