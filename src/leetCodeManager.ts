// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { EventEmitter } from "events";
import * as vscode from "vscode";
import { loginCliWithCookie } from "./auth/cliSession";
import { normalizeCookie, validateCookie } from "./auth/cookie";
import { leetCodeChannel } from "./leetCodeChannel";
import { leetCodeExecutor } from "./leetCodeExecutor";
import { Endpoint, IQuickItemEx, urls, urlsCn, UserStatus } from "./shared";
import { createEnvOption } from "./utils/cpUtils";
import { DialogType, openUrl, promptForOpenOutputChannel } from "./utils/uiUtils";
import * as wsl from "./utils/wslUtils";
import { getLeetCodeEndpoint } from "./commands/plugin";
import { globalState } from "./globalState";
import { queryUserData } from "./request/query-user-data";
import { parseQuery } from "./utils/toolUtils";

const COOKIE_LOGIN_TIMEOUT_MS = 15000;

class LeetCodeManager extends EventEmitter {
    private currentUser: string | undefined;
    private userStatus: UserStatus;

    constructor() {
        super();
        this.currentUser = undefined;
        this.userStatus = UserStatus.SignedOut;
        this.handleUriSignIn = this.handleUriSignIn.bind(this);
    }

    public async getLoginStatus(): Promise<void> {
        try {
            const storedCookie: string | undefined = globalState.getCookie();
            if (storedCookie) {
                try {
                    const data = await queryUserData(storedCookie);
                    if (data.isSignedIn && data.username) {
                        this.currentUser = data.username;
                        this.userStatus = UserStatus.SignedIn;
                        await globalState.setUserStatus(data);
                        return;
                    }
                } catch (error) {
                    leetCodeChannel.appendLine(`[WARN] Failed to validate the stored cookie: ${error}`);
                }
                await globalState.removeAll();
            }

            try {
                const result: string = await leetCodeExecutor.getUserInfo();
                this.currentUser = this.tryParseUserName(result);
                this.userStatus = UserStatus.SignedIn;
            } catch (error) {
                this.currentUser = undefined;
                this.userStatus = UserStatus.SignedOut;
                await globalState.removeAll();
            }
        } finally {
            this.emit("statusChanged");
        }
    }

    private async updateUserStatusWithCookie(cookie: string): Promise<void> {
        const validationError: string | undefined = validateCookie(cookie);
        if (validationError) {
            throw new Error(validationError);
        }
        const normalizedCookie: string = normalizeCookie(cookie);

        const data = await queryUserData(normalizedCookie);
        if (!data.isSignedIn || !data.username) {
            throw new Error("The cookie is not signed in. Please sign in on leetcode.cn and copy a fresh cookie.");
        }

        await globalState.setCookie(normalizedCookie);
        await globalState.setUserStatus(data);
        this.currentUser = data.username;
        this.userStatus = UserStatus.SignedIn;

        let cliError: Error | undefined;
        try {
            await this.setCookieToCli(normalizedCookie, data.username);
        } catch (error) {
            cliError = error instanceof Error ? error : new Error(String(error));
            leetCodeChannel.appendLine(`[WARN] ${cliError.message}`);
        }

        this.emit("statusChanged");
        if (cliError) {
            vscode.window.showWarningMessage(
                `Signed in as ${data.username}, but the bundled CLI session could not be updated. Problem lists may be empty until the API migration lands.`,
            );
        } else {
            vscode.window.showInformationMessage(`Successfully signed in as ${data.username}.`);
        }
    }

    public async handleUriSignIn(uri: vscode.Uri): Promise<void> {
        let queryParams: { [key: string]: string };
        try {
            queryParams = parseQuery(uri.query);
        } catch (error) {
            leetCodeChannel.appendLine(`[ERROR] Invalid sign-in callback: ${error}`);
            await promptForOpenOutputChannel("Failed to parse the sign-in callback. Please sign in again.", DialogType.error);
            return;
        }

        const cookie: string | undefined = queryParams["cookie"];
        if (!cookie) {
            leetCodeChannel.appendLine("[ERROR] The sign-in callback did not include a cookie.");
            await promptForOpenOutputChannel("Failed to get the cookie. Please sign in again.", DialogType.error);
            return;
        }

        try {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: "Signing in to LeetCode..." },
                async (progress: vscode.Progress<{}>) => {
                    progress.report({ message: "Validating cookie..." });
                    await this.updateUserStatusWithCookie(cookie);
                },
            );
        } catch (error) {
            leetCodeChannel.appendLine(`[ERROR] URI sign-in failed: ${error}`);
            await promptForOpenOutputChannel("Failed to log in. Please open the output channel for details.", DialogType.error);
        }
    }

    public async handleInputCookieSignIn(): Promise<void> {
        const cookie: string | undefined = await vscode.window.showInputBox({
            prompt: "Paste the Cookie header copied from leetcode.cn",
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
                label: "LeetCode Cookie",
                detail: "Paste the Cookie header copied from browser DevTools",
                value: "Cookie",
                description: "[Recommended]",
            },
            {
                label: "Web Authorization",
                detail: "Open the browser to authorize login on the website",
                value: "WebAuth",
            },
        ];

        const choice: IQuickItemEx<string> | undefined = await vscode.window.showQuickPick(picks);
        if (!choice) {
            return;
        }

        if (choice.value === "WebAuth") {
            openUrl(this.getAuthLoginUrl());
            return;
        }

        try {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: "Signing in to LeetCode..." },
                async () => {
                    await this.handleInputCookieSignIn();
                },
            );
        } catch (error) {
            leetCodeChannel.appendLine(`[ERROR] Cookie sign-in failed: ${error}`);
            await promptForOpenOutputChannel("Failed to log in. Please open the output channel for details.", DialogType.error);
        }
    }

    public async signOut(): Promise<void> {
        try {
            await leetCodeExecutor.signOut();
        } catch (error) {
            leetCodeChannel.appendLine(`[WARN] Failed to sign out from the bundled CLI: ${error}`);
        }

        this.currentUser = undefined;
        this.userStatus = UserStatus.SignedOut;
        await globalState.removeAll();
        this.emit("statusChanged");
        vscode.window.showInformationMessage("Successfully signed out.");
    }

    public getStatus(): UserStatus {
        return this.userStatus;
    }

    public getUser(): string | undefined {
        return this.currentUser;
    }

    private tryParseUserName(output: string): string {
        const reg: RegExp = /^\s*.\s*(.+?)\s*https:\/\/leetcode/m;
        const match: RegExpMatchArray | null = output.match(reg);
        if (match && match.length === 2) {
            return match[1].trim();
        }

        return "Unknown";
    }

    public getAuthLoginUrl(): string {
        switch (getLeetCodeEndpoint()) {
            case Endpoint.LeetCodeCN:
                return urlsCn.authLoginUrl;
            case Endpoint.LeetCode:
            default:
                return urls.authLoginUrl;
        }
    }

    public async setCookieToCli(cookie: string, name: string): Promise<void> {
        await loginCliWithCookie({
            nodePath: leetCodeExecutor.node,
            binaryPath: await leetCodeExecutor.getLeetCodeBinaryPath(),
            cookie,
            name,
            useWsl: wsl.useWsl(),
            env: createEnvOption() as NodeJS.ProcessEnv,
            timeoutMs: COOKIE_LOGIN_TIMEOUT_MS,
            appendOutput: (text: string): void => leetCodeChannel.append(text),
        });
    }
}

export const leetCodeManager: LeetCodeManager = new LeetCodeManager();
