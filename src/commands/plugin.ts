// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { leetCodeTreeDataProvider } from "../explorer/LeetCodeTreeDataProvider";
import { IQuickItemEx } from "../shared";
import { Endpoint, getEffectiveEndpoint, SortingStrategy } from "../shared";
import { resolveEndpoint } from "../auth/endpointResolver";
import { DialogType, promptForOpenOutputChannel, promptForSignIn } from "../utils/uiUtils";
import { invalidateProblemCache } from "../api/problems";

export async function switchEndpoint(): Promise<void> {
    const configured: string = vscode.workspace.getConfiguration("leetcode").get<string>("endpoint", Endpoint.Auto);
    const effective: string = getEffectiveEndpoint();
    const picks: Array<IQuickItemEx<string>> = [
        {
            label: `${configured === Endpoint.Auto ? "$(check) " : ""}Auto`,
            description: vscode.l10n.t("Mainland China uses 力扣, other regions use LeetCode"),
            detail: `${vscode.l10n.t("Current site")}: ${effective === Endpoint.LeetCodeCN ? "leetcode.cn" : "leetcode.com"}`,
            value: Endpoint.Auto,
        },
        {
            label: `${configured !== Endpoint.Auto && effective === Endpoint.LeetCode ? "$(check) " : ""}LeetCode`,
            description: "leetcode.com",
            detail: vscode.l10n.t("Enable LeetCode US"),
            value: Endpoint.LeetCode,
        },
        {
            label: `${configured !== Endpoint.Auto && effective === Endpoint.LeetCodeCN ? "$(check) " : ""}力扣`,
            description: "leetcode.cn",
            detail: vscode.l10n.t("Enable LeetCode China"),
            value: Endpoint.LeetCodeCN,
        },
    ];
    const choice: IQuickItemEx<string> | undefined = await vscode.window.showQuickPick(picks);
    if (!choice || choice.value === configured) {
        return;
    }
    const leetCodeConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("leetcode");
    try {
        const endpoint: string = choice.value;
        await leetCodeConfig.update("endpoint", endpoint, true /* UserSetting */);
        await resolveEndpoint();
        vscode.window.showInformationMessage(vscode.l10n.t("Switched the endpoint to {0}.", endpoint));
    } catch (error) {
        await promptForOpenOutputChannel(vscode.l10n.t("Failed to switch endpoint. Please open the output channel for details."), DialogType.error);
    }

    try {
        await vscode.commands.executeCommand("leetcode.signout");
        invalidateProblemCache();
        await promptForSignIn();
    } catch (error) {
        await promptForOpenOutputChannel(vscode.l10n.t("Failed to sign in. Please open the output channel for details."), DialogType.error);
    }
}

export function getLeetCodeEndpoint(): string {
    return getEffectiveEndpoint();
}

const SORT_ORDER: SortingStrategy[] = [
    SortingStrategy.None,
    SortingStrategy.AcceptanceRateAsc,
    SortingStrategy.AcceptanceRateDesc,
];

export async function switchSortingStrategy(): Promise<void> {
    const currentStrategy: SortingStrategy = getSortingStrategy();
    const picks: Array<IQuickItemEx<string>> = [];
    picks.push(
        ...SORT_ORDER.map((s: SortingStrategy) => {
            return {
                label: `${currentStrategy === s ? "$(check)" : "    "} ${getSortingLabel(s)}`,
                value: s,
            };
        }),
    );

    const choice: IQuickItemEx<string> | undefined = await vscode.window.showQuickPick(picks);
    if (!choice || choice.value === currentStrategy) {
        return;
    }

    const leetCodeConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("leetcode");
    await leetCodeConfig.update("problems.sortStrategy", choice.value, true);
    await leetCodeTreeDataProvider.refresh();
}

export function getSortingStrategy(): SortingStrategy {
    const leetCodeConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("leetcode");
    return leetCodeConfig.get<SortingStrategy>("problems.sortStrategy", SortingStrategy.None);
}

function getSortingLabel(strategy: SortingStrategy): string {
    switch (strategy) {
        case SortingStrategy.AcceptanceRateAsc:
            return vscode.l10n.t("Acceptance Rate (Ascending)");
        case SortingStrategy.AcceptanceRateDesc:
            return vscode.l10n.t("Acceptance Rate (Descending)");
        case SortingStrategy.FrequencyAsc:
            return vscode.l10n.t("Frequency (Ascending)");
        case SortingStrategy.FrequencyDesc:
            return vscode.l10n.t("Frequency (Descending)");
        case SortingStrategy.None:
        default:
            return vscode.l10n.t("None");
    }
}
