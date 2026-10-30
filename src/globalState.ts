// Copyright (c) leo.zhao. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { Endpoint } from "./shared";
import { IOperation, sessionController } from "./auth/sessionController";

/** Where account state is kept. Changing a key loses what users stored under it. */
const keys = {
    /** SecretStorage: the cookie in use on a site. */
    siteCookie: (endpoint: Endpoint) => `leetcode-cookie.v2:${endpoint}`,
    /** SecretStorage: a saved account's cookie. */
    profileCookie: (endpoint: Endpoint, name: string) => `leetcode-cookie.v2:${endpoint}:${encodeURIComponent(name)}`,
    /** Memento: the saved accounts of every site. */
    profiles: "leetcode-profiles.v2",
    /** Memento: the saved account in use on a site. */
    activeProfile: (endpoint: Endpoint) => `leetcode-active-profile:${endpoint}`,
    /** Memento: the user status last seen on a site. */
    userStatus: (endpoint: Endpoint) => `leetcode-user-status:${endpoint}`,
};

/** Keys from before accounts were kept per site. Only the migration reads them. */
const legacyKeys = {
    /** SecretStorage, and Memento in older versions still. */
    cookie: "leetcode-cookie",
    profileCookie: (name: string) => `leetcode-cookie:${name}`,
    profiles: "leetcode-profiles",
    activeProfile: "leetcode-active-profile",
    userStatus: "leetcode-user-status",
    /** Memento: the site legacy accounts are bound to while their migration is unfinished. */
    migrationSite: "leetcode-credential-migration-site",
};

export interface IProfileInfo {
    name: string;
    username: string;
    updatedAt: number;
    endpoint: Endpoint;
}

export type UserDataType = {
    isSignedIn: boolean;
    isPremium: boolean;
    username: string;
    avatar: string;
    isVerified?: boolean;
};

/**
 * Accounts and their cookies, kept per site. The account in use is the session, which sessionController holds:
 * each change takes an operation, and one made without an operation supersedes every operation in flight.
 */
class GlobalState {
    private context: vscode.ExtensionContext | undefined;
    private _state: vscode.Memento | undefined;
    private _profiles: IProfileInfo[] = [];

    /**
     * Loads the current account cookie from SecretStorage.
     */
    public async initialize(context: vscode.ExtensionContext, endpoint: Endpoint = Endpoint.LeetCode): Promise<void> {
        this.context = context;
        this._state = context.globalState;
        const operation = sessionController.begin();
        sessionController.end(operation);
        await this.migrateCredentials(endpoint);
        this._profiles = this._state.get<IProfileInfo[]>(keys.profiles) || [];
        await this.useEndpoint(endpoint, operation);
    }

    /** Legacy storage had no site information. Bind it once to the configured site at upgrade. */
    private async migrateCredentials(endpoint: Endpoint): Promise<void> {
        const copied = this._state!.get(keys.profiles) !== undefined;
        if (copied && !this._state!.get(legacyKeys.migrationSite)) { return; }
        const site = this._state!.get<Endpoint>(legacyKeys.migrationSite) || endpoint;
        await this._state!.update(legacyKeys.migrationSite, site);
        const profiles = this._state!.get<Array<Omit<IProfileInfo, "endpoint">>>(legacyKeys.profiles) || [];
        if (!copied) {
            for (const profile of profiles) {
                const cookie = await this.context!.secrets.get(legacyKeys.profileCookie(profile.name));
                if (cookie) { await this.context!.secrets.store(keys.profileCookie(site, profile.name), cookie); }
            }
            const cookie = await this.context!.secrets.get(legacyKeys.cookie);
            if (cookie) { await this.context!.secrets.store(keys.siteCookie(site), cookie); }
            await this._state!.update(keys.activeProfile(site), this._state!.get<string>(legacyKeys.activeProfile));
            // Mark copied before deleting legacy entries. Interrupted cleanup resumes on activation.
            await this._state!.update(keys.profiles, profiles.map((profile) => ({ ...profile, endpoint: site })));
        }
        await this.context!.secrets.delete(legacyKeys.cookie);
        for (const profile of profiles) { await this.context!.secrets.delete(legacyKeys.profileCookie(profile.name)); }
        await this._state!.update(legacyKeys.profiles, undefined);
        await this._state!.update(legacyKeys.activeProfile, undefined);
        await this._state!.update(legacyKeys.userStatus, undefined);
        await this._state!.update(legacyKeys.cookie, undefined);
        await this._state!.update(legacyKeys.migrationSite, undefined);
    }

    public getEndpoint(): Endpoint { return sessionController.current().site; }

    /** Selects `endpoint` and uses its last active account. */
    public async useEndpoint(endpoint: Endpoint, operation: IOperation = sessionController.begin()): Promise<void> {
        sessionController.end(operation, endpoint);
        const active = this._state?.get<string>(keys.activeProfile(endpoint));
        const cookie = (active ? await this.context?.secrets.get(keys.profileCookie(endpoint, active)) : undefined)
            || await this.context?.secrets.get(keys.siteCookie(endpoint));
        sessionController.publish(operation, cookie, active);
    }

    public getCookie(endpoint: Endpoint = this.getEndpoint()): string | undefined {
        const session = sessionController.current();
        return endpoint === session.site ? session.cookie : undefined;
    }

    public getProfiles(): IProfileInfo[] {
        const endpoint = this.getEndpoint();
        return this._profiles.filter((profile) => profile.endpoint === endpoint).map((profile) => ({ ...profile }));
    }

    public getActiveProfile(): string | undefined {
        return sessionController.current().profile;
    }

    public async saveProfile(name: string, username: string, cookie: string, operation: IOperation = sessionController.begin()): Promise<void> {
        if (!this.context || !this._state) {
            throw new Error("GlobalState is not initialized.");
        }
        const endpoint = this.getEndpoint();
        const info: IProfileInfo = { name, username, updatedAt: Date.now(), endpoint };
        const index: number = this._profiles.findIndex((profile: IProfileInfo) => profile.name === name && profile.endpoint === endpoint);
        if (index >= 0) {
            this._profiles[index] = info;
        } else {
            this._profiles.push(info);
        }
        await this.context.secrets.store(keys.profileCookie(endpoint, name), cookie);
        await this.context.secrets.store(keys.siteCookie(endpoint), cookie);
        await this._state.update(keys.profiles, this._profiles);
        await this._state.update(keys.activeProfile(endpoint), name);
        sessionController.publish(operation, cookie, name);
    }

    public async getProfileCookie(name: string): Promise<string> {
        if (!this.context || !this._state) {
            throw new Error("GlobalState is not initialized.");
        }
        const endpoint = this.getEndpoint();
        if (!this._profiles.some((profile: IProfileInfo) => profile.name === name && profile.endpoint === endpoint)) {
            throw new Error(`Profile not found: ${name}`);
        }
        const cookie: string | undefined = await this.context.secrets.get(keys.profileCookie(endpoint, name));
        if (!cookie) {
            throw new Error(`The cookie for profile "${name}" is missing.`);
        }
        return cookie;
    }

    public async activateProfile(name: string, operation: IOperation = sessionController.begin()): Promise<string> {
        const endpoint = this.getEndpoint();
        const cookie = await this.getProfileCookie(name);
        await this.context!.secrets.store(keys.siteCookie(endpoint), cookie);
        await this._state!.update(keys.activeProfile(endpoint), name);
        sessionController.publish(operation, cookie, name);
        return cookie;
    }

    public async deleteProfile(name: string, operation: IOperation = sessionController.begin()): Promise<void> {
        if (!this.context || !this._state) {
            throw new Error("GlobalState is not initialized.");
        }
        const endpoint = this.getEndpoint();
        this._profiles = this._profiles.filter((profile: IProfileInfo) => profile.name !== name || profile.endpoint !== endpoint);
        const current = this.getActiveProfile() === name;
        // Storage can still name the profile after the session ended, e.g. by a superseded site switch.
        if (current || this._state.get<string>(keys.activeProfile(endpoint)) === name) {
            if (current) { sessionController.end(operation); }
            await this.context.secrets.delete(keys.siteCookie(endpoint));
            await this._state.update(keys.activeProfile(endpoint), undefined);
        }
        await this.context.secrets.delete(keys.profileCookie(endpoint, name));
        await this._state.update(keys.profiles, this._profiles);
    }

    public async setUserStatus(userStatus: UserDataType, operation: IOperation = sessionController.begin()): Promise<void> {
        sessionController.setUser(operation, userStatus);
        await this._state?.update(keys.userStatus(this.getEndpoint()), userStatus);
    }

    public getUserStatus(): UserDataType | undefined {
        const session = sessionController.current();
        if (session.user || !session.cookie) {
            return session.user;
        }
        // Until the session is checked again, trust the last status only for the same account.
        const stored = this._state?.get<UserDataType>(keys.userStatus(session.site));
        const account = this._profiles.find((profile) => profile.name === session.profile && profile.endpoint === session.site);
        return stored && account && stored.username === account.username ? stored : undefined;
    }

    /** Signs out of `endpoint`, ending its session if it is the selected site. */
    public async removeAll(endpoint: Endpoint = this.getEndpoint(), operation: IOperation = sessionController.begin()): Promise<void> {
        if (endpoint === this.getEndpoint()) { sessionController.end(operation); }
        await this.clearStoredSession(endpoint);
    }

    /** Storage cleanup for an already ended session; serialize with credential writes. */
    public async clearStoredSession(endpoint: Endpoint): Promise<void> {
        await this.context?.secrets.delete(keys.siteCookie(endpoint));
        await this._state?.update(keys.userStatus(endpoint), undefined);
        await this._state?.update(keys.activeProfile(endpoint), undefined);
    }
}

export const globalState: GlobalState = new GlobalState();
