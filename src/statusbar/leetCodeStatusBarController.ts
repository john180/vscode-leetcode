// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { ConfigurationChangeEvent, Disposable, workspace, WorkspaceConfiguration } from "vscode";
import { UserStatus } from "../shared";
import { DailyChallengeStatusBarItem } from "./DailyChallengeStatusBarItem";
import { LeetCodeStatusBarItem } from "./LeetCodeStatusBarItem";

class LeetCodeStatusBarController implements Disposable {
    private statusBar: LeetCodeStatusBarItem;
    private dailyChallenge: DailyChallengeStatusBarItem;
    private configurationChangeListener: Disposable;

    constructor() {
        this.statusBar = new LeetCodeStatusBarItem();
        this.dailyChallenge = new DailyChallengeStatusBarItem();
        this.setStatusBarVisibility();

        this.configurationChangeListener = workspace.onDidChangeConfiguration((event: ConfigurationChangeEvent) => {
            if (event.affectsConfiguration("leetcode.enableStatusBar")) {
                this.setStatusBarVisibility();
            }
        }, this);
    }

    public updateStatusBar(status: UserStatus, user?: string): void {
        this.statusBar.updateStatusBar(status, user);
        // Signing in, again or as another account, is when the daily challenge may change besides midnight.
        if (status !== UserStatus.SigningIn) {
            this.dailyChallenge.setSignedIn(status === UserStatus.SignedIn);
        }
    }

    /** After an accepted submission, which completes today's challenge when it is today's problem. */
    public recordAccepted(slug: string): void {
        this.dailyChallenge.recordAccepted(slug);
    }

    public dispose(): void {
        this.statusBar.dispose();
        this.dailyChallenge.dispose();
        this.configurationChangeListener.dispose();
    }

    private setStatusBarVisibility(): void {
        if (this.isStatusBarEnabled()) {
            this.statusBar.show();
        } else {
            this.statusBar.hide();
        }
        this.dailyChallenge.setVisible(this.isStatusBarEnabled());
    }

    private isStatusBarEnabled(): boolean {
        const configuration: WorkspaceConfiguration = workspace.getConfiguration();
        return configuration.get<boolean>("leetcode.enableStatusBar", true);
    }
}

export const leetCodeStatusBarController: LeetCodeStatusBarController = new LeetCodeStatusBarController();
