// Copyright (c) leo.zhao. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { Endpoint } from "./shared";
import { sessionScope } from "./auth/sessionScope";

const CookieKey = "leetcode-cookie";
const ScopedCookieKey = "leetcode-cookie.v2";
const UserStatusKey = "leetcode-user-status";
const ProfilesKey = "leetcode-profiles.v2";
const ActiveProfileKey = "leetcode-active-profile";
const TestCaseKey = "leetcode-test-case";

export interface IProfileInfo {
    name: string;
    username: string;
    updatedAt: number;
    endpoint: Endpoint;
}

function profileCookieKey(name: string, endpoint: Endpoint): string {
    return `${ScopedCookieKey}:${endpoint}:${encodeURIComponent(name)}`;
}

export type UserDataType = {
    isSignedIn: boolean;
    isPremium: boolean;
    username: string;
    avatar: string;
    isVerified?: boolean;
};

class GlobalState {
    private context: vscode.ExtensionContext | undefined;
    private _state: vscode.Memento | undefined;
    private _cookie: string | undefined;
    private _userStatus: UserDataType | undefined;
    private _profiles: IProfileInfo[] = [];
    private _activeProfile: string | undefined;
    private endpoint: Endpoint = Endpoint.LeetCode;
    private memoryRevision = 0;

    /**
     * Loads the current account cookie from SecretStorage.
     */
    public async initialize(context: vscode.ExtensionContext, endpoint: Endpoint = Endpoint.LeetCode): Promise<void> {
        this.context = context;
        this._state = context.globalState;
        this.detach();
        await this.migrateCredentials(endpoint);
        this._profiles = this._state.get<IProfileInfo[]>(ProfilesKey) || [];
        await this.useEndpoint(endpoint);
    }

    /** Legacy storage had no site information. Bind it once to the configured site at upgrade. */
    private async migrateCredentials(endpoint: Endpoint): Promise<void> {
        const migrationKey = "leetcode-credential-migration-site";
        const copied = this._state!.get(ProfilesKey) !== undefined;
        if (copied && !this._state!.get(migrationKey)) { return; }
        const site = this._state!.get<Endpoint>(migrationKey) || endpoint;
        await this._state!.update(migrationKey, site);
        const profiles = this._state!.get<Array<Omit<IProfileInfo, "endpoint">>>("leetcode-profiles") || [];
        if (!copied) {
            for (const profile of profiles) {
                const cookie = await this.context!.secrets.get(`${CookieKey}:${profile.name}`);
                if (cookie) { await this.context!.secrets.store(profileCookieKey(profile.name, site), cookie); }
            }
            const cookie = await this.context!.secrets.get(CookieKey);
            if (cookie) { await this.context!.secrets.store(`${ScopedCookieKey}:${site}`, cookie); }
            await this._state!.update(`${ActiveProfileKey}:${site}`, this._state!.get<string>(ActiveProfileKey));
            // Mark copied before deleting legacy entries. Interrupted cleanup resumes on activation.
            await this._state!.update(ProfilesKey, profiles.map((profile) => ({ ...profile, endpoint: site })));
        }
        await this.context!.secrets.delete(CookieKey);
        for (const profile of profiles) { await this.context!.secrets.delete(`${CookieKey}:${profile.name}`); }
        await this._state!.update("leetcode-profiles", undefined);
        await this._state!.update(ActiveProfileKey, undefined);
        await this._state!.update(UserStatusKey, undefined);
        await this._state!.update(CookieKey, undefined);
        await this._state!.update(migrationKey, undefined);
    }

    public getEndpoint(): Endpoint { return this.endpoint; }

    public selectEndpoint(endpoint: Endpoint): void {
        this.detach();
        this.endpoint = endpoint;
    }

    public async useEndpoint(endpoint: Endpoint, canActivate: () => boolean = () => true): Promise<void> {
        this.selectEndpoint(endpoint);
        const revision = this.memoryRevision;
        const active = this._state?.get<string>(`${ActiveProfileKey}:${endpoint}`);
        const cookie = (active ? await this.context?.secrets.get(profileCookieKey(active, endpoint)) : undefined)
            || await this.context?.secrets.get(`${ScopedCookieKey}:${endpoint}`);
        if (this.endpoint === endpoint && revision === this.memoryRevision && canActivate()) {
            this.publish(cookie, active);
        }
    }

    /** Synchronous revocation precedes any queued keyring writes or deletions. */
    public detach(): void {
        this.memoryRevision++;
        sessionScope.invalidate();
        this._cookie = undefined;
        this._activeProfile = undefined;
        this._userStatus = undefined;
    }

    private publish(cookie: string | undefined, profile?: string): void {
        if (cookie !== this._cookie) {
            // Only a new credential revokes requests; naming the same cookie's session does not.
            sessionScope.invalidate();
            this._userStatus = undefined;
        }
        if (cookie !== this._cookie || profile !== this._activeProfile) { this.memoryRevision++; }
        this._cookie = cookie;
        this._activeProfile = profile;
    }

    public async setCookie(cookie: string): Promise<void> {
        if (!this.context) { throw new Error("GlobalState is not initialized."); }
        const endpoint = this.endpoint;
        const revision = this.memoryRevision;
        await this.context.secrets.store(`${ScopedCookieKey}:${endpoint}`, cookie);
        if (endpoint === this.endpoint && revision === this.memoryRevision) { this.publish(cookie); }
    }

    public getCookie(endpoint: Endpoint = this.endpoint): string | undefined {
        return endpoint === this.endpoint ? this._cookie : undefined;
    }

    public getProfiles(): IProfileInfo[] {
        return this._profiles.filter((profile) => profile.endpoint === this.endpoint).map((profile) => ({ ...profile }));
    }

    public getActiveProfile(): string | undefined {
        return this._activeProfile;
    }

    public async saveProfile(name: string, username: string, cookie: string, canActivate: () => boolean = () => true): Promise<void> {
        if (!this.context || !this._state) {
            throw new Error("GlobalState is not initialized.");
        }
        const endpoint = this.endpoint;
        const revision = this.memoryRevision;
        const info: IProfileInfo = { name, username, updatedAt: Date.now(), endpoint };
        const index: number = this._profiles.findIndex((profile: IProfileInfo) => profile.name === name && profile.endpoint === endpoint);
        if (index >= 0) {
            this._profiles[index] = info;
        } else {
            this._profiles.push(info);
        }
        await this.context.secrets.store(profileCookieKey(name, endpoint), cookie);
        await this.context.secrets.store(`${ScopedCookieKey}:${endpoint}`, cookie);
        await this._state.update(ProfilesKey, this._profiles);
        await this._state.update(`${ActiveProfileKey}:${endpoint}`, name);
        if (endpoint === this.endpoint && revision === this.memoryRevision && canActivate()) { this.publish(cookie, name); }
    }

    public async getProfileCookie(name: string): Promise<string> {
        if (!this.context || !this._state) {
            throw new Error("GlobalState is not initialized.");
        }
        const endpoint = this.endpoint;
        if (!this._profiles.some((profile: IProfileInfo) => profile.name === name && profile.endpoint === endpoint)) {
            throw new Error(`Profile not found: ${name}`);
        }
        const cookie: string | undefined = await this.context.secrets.get(profileCookieKey(name, endpoint));
        if (!cookie) {
            throw new Error(`The cookie for profile "${name}" is missing.`);
        }
        return cookie;
    }

    public async activateProfile(name: string, canActivate: () => boolean = () => true): Promise<string> {
        const endpoint = this.endpoint;
        const revision = this.memoryRevision;
        const cookie = await this.getProfileCookie(name);
        await this.context!.secrets.store(`${ScopedCookieKey}:${endpoint}`, cookie);
        await this._state!.update(`${ActiveProfileKey}:${endpoint}`, name);
        if (endpoint === this.endpoint && revision === this.memoryRevision && canActivate()) { this.publish(cookie, name); }
        return cookie;
    }

    public async deleteProfile(name: string): Promise<void> {
        if (!this.context || !this._state) {
            throw new Error("GlobalState is not initialized.");
        }
        const endpoint = this.endpoint;
        const activeKey = `${ActiveProfileKey}:${endpoint}`;
        this._profiles = this._profiles.filter((profile: IProfileInfo) => profile.name !== name || profile.endpoint !== endpoint);
        const current = this._activeProfile === name;
        // Storage can still name the profile after memory was detached, e.g. by a superseded site switch.
        if (current || this._state.get<string>(activeKey) === name) {
            if (current) { this.detach(); }
            await this.context.secrets.delete(`${ScopedCookieKey}:${endpoint}`);
            await this._state.update(activeKey, undefined);
        }
        await this.context.secrets.delete(profileCookieKey(name, endpoint));
        await this._state.update(ProfilesKey, this._profiles);
    }

    public async setUserStatus(userStatus: UserDataType): Promise<void> {
        this._userStatus = userStatus;
        await this._state?.update(`${UserStatusKey}:${this.endpoint}`, userStatus);
    }

    public getUserStatus(): UserDataType | undefined {
        if (this._userStatus || !this._cookie) {
            return this._userStatus;
        }
        // Until the session is checked again, trust the last status only for the same account.
        const stored = this._state?.get<UserDataType>(`${UserStatusKey}:${this.endpoint}`);
        const account = this._profiles.find((profile) => profile.name === this._activeProfile && profile.endpoint === this.endpoint);
        return stored && account && stored.username === account.username ? stored : undefined;
    }

    public async saveTestCase(slug: string, input: string): Promise<void> {
        await this._state?.update(`${TestCaseKey}:${slug}`, input);
    }

    public getTestCase(slug: string): string | undefined {
        return this._state?.get<string>(`${TestCaseKey}:${slug}`);
    }

    public async removeCookie(): Promise<void> {
        this.detach();
        await this.context?.secrets.delete(`${ScopedCookieKey}:${this.endpoint}`);
    }

    public async removeAll(endpoint: Endpoint = this.endpoint): Promise<void> {
        if (endpoint === this.endpoint) { this.detach(); }
        await this.clearStoredSession(endpoint);
    }

    /** Storage cleanup for an already revoked session; serialize with credential writes. */
    public async clearStoredSession(endpoint: Endpoint): Promise<void> {
        await this.context?.secrets.delete(`${ScopedCookieKey}:${endpoint}`);
        await this._state?.update(`${UserStatusKey}:${endpoint}`, undefined);
        await this._state?.update(`${ActiveProfileKey}:${endpoint}`, undefined);
    }
}

export const globalState: GlobalState = new GlobalState();
