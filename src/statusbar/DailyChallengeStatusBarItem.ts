// Licensed under the MIT license.

import * as vscode from "vscode";
import type { IDailyChallenge } from "../api/dailyChallenge";
import { getDailyChallenge } from "../api/problems";
import { leetCodeChannel } from "../leetCodeChannel";
import { Endpoint, getEffectiveEndpoint } from "../shared";

const HOUR: number = 60 * 60 * 1000;

/** When the next daily challenge starts: at midnight UTC on leetcode.com, and at midnight in Beijing on leetcode.cn. */
export function getNextDailyReset(now: number, endpoint: Endpoint): number {
    const offset: number = endpoint === Endpoint.LeetCodeCN ? 8 * HOUR : 0;
    return (Math.floor((now + offset) / (24 * HOUR)) + 1) * 24 * HOUR - offset;
}

/** Today's problem, and whether it was solved today, beside the account. Users can hide it from the status bar's menu. */
export class DailyChallengeStatusBarItem implements vscode.Disposable {
    private readonly item: vscode.StatusBarItem;
    private challenge: IDailyChallenge | undefined;
    private signedIn: boolean = false;
    private visible: boolean = true;
    /** Counts refreshes, so an older one that answers late is ignored. */
    private generation: number = 0;
    private timer: ReturnType<typeof setTimeout> | undefined;

    constructor() {
        this.item = vscode.window.createStatusBarItem("leetcode.dailyChallenge", vscode.StatusBarAlignment.Left);
        this.item.name = vscode.l10n.t("LeetCode Daily Challenge");
        this.item.command = "leetcode.openDailyChallenge";
    }

    public setVisible(visible: boolean): void {
        this.visible = visible;
        if (visible && this.signedIn && !this.challenge) {
            void this.refresh();
        } else {
            this.update();
        }
    }

    /** Asks again for the account signed in now, or hides the item once signed out. */
    public setSignedIn(signedIn: boolean): void {
        this.signedIn = signedIn;
        void this.refresh();
    }

    /** An accepted submission of today's problem completes the challenge, without asking LeetCode. */
    public recordAccepted(slug: string): void {
        if (this.challenge && this.challenge.problem.slug === slug && !this.challenge.completed) {
            this.challenge = { ...this.challenge, completed: true };
            this.update();
        }
    }

    public async refresh(): Promise<void> {
        const generation: number = ++this.generation;
        clearTimeout(this.timer);
        this.timer = undefined;
        if (!this.signedIn || !this.visible) {
            // Hidden, it asks LeetCode nothing; showing it again asks.
            this.challenge = undefined;
            this.update();
            return;
        }
        try {
            const challenge: IDailyChallenge | undefined = await getDailyChallenge();
            if (generation !== this.generation) {
                return;
            }
            this.challenge = challenge;
        } catch (error) {
            if (generation !== this.generation) {
                return;
            }
            // What was known stays shown until the next refresh.
            leetCodeChannel.warn(`Failed to check the daily challenge: ${error}`);
        }
        this.update();
        // A few seconds late, so the new problem is surely out.
        const delay: number = getNextDailyReset(Date.now(), getEffectiveEndpoint()) - Date.now() + 5000;
        this.timer = setTimeout(() => void this.refresh(), delay);
        this.timer.unref?.();
    }

    public dispose(): void {
        ++this.generation;
        clearTimeout(this.timer);
        this.item.dispose();
    }

    private update(): void {
        if (!this.visible || !this.signedIn || !this.challenge) {
            this.item.hide();
            return;
        }
        const { problem, completed } = this.challenge;
        const label: string = vscode.l10n.t("Daily Challenge");
        const state: string = completed ? vscode.l10n.t("Solved today.") : vscode.l10n.t("Not solved today. Click to open it.");
        this.item.text = `${completed ? "$(check)" : "$(flame)"} ${label}`;
        this.item.tooltip = `${problem.id}. ${problem.name}${problem.difficulty ? ` · ${vscode.l10n.t(problem.difficulty)}` : ""}\n${state}`;
        this.item.accessibilityInformation = { label: `${label}, ${problem.id}. ${problem.name}. ${state}` };
        this.item.show();
    }
}
