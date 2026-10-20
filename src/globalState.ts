// Copyright (c) leo.zhao. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

const CookieKey = "leetcode-cookie";
const UserStatusKey = "leetcode-user-status";

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

    /**
     * Loads the cookie from SecretStorage and migrates a legacy cookie that was
     * previously stored in globalState.
     */
    public async initialize(context: vscode.ExtensionContext): Promise<void> {
        this.context = context;
        this._state = context.globalState;

        this._cookie = await context.secrets.get(CookieKey);
        if (this._cookie) {
            return;
        }

        const legacyCookie: string | undefined = this._state.get<string>(CookieKey);
        if (legacyCookie) {
            this._cookie = legacyCookie;
            await context.secrets.store(CookieKey, legacyCookie);
            await this._state.update(CookieKey, undefined);
        }
    }

    public async setCookie(cookie: string): Promise<void> {
        if (!this.context) {
            throw new Error("GlobalState is not initialized.");
        }
        this._cookie = cookie;
        await this.context.secrets.store(CookieKey, cookie);
    }

    public getCookie(): string | undefined {
        return this._cookie;
    }

    public async setUserStatus(userStatus: UserDataType): Promise<void> {
        this._userStatus = userStatus;
        await this._state?.update(UserStatusKey, userStatus);
    }

    public getUserStatus(): UserDataType | undefined {
        return this._userStatus ?? this._state?.get<UserDataType>(UserStatusKey);
    }

    public async removeCookie(): Promise<void> {
        this._cookie = undefined;
        await this.context?.secrets.delete(CookieKey);
    }

    public async removeAll(): Promise<void> {
        this._cookie = undefined;
        this._userStatus = undefined;
        await this.context?.secrets.delete(CookieKey);
        await this._state?.update(CookieKey, undefined);
        await this._state?.update(UserStatusKey, undefined);
    }
}

export const globalState: GlobalState = new GlobalState();
