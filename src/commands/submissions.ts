// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { l10n, window } from "vscode";
import {
    fetchSubmissionHistory,
    formatSubmissionDate,
    formatSubmissionLabel,
    ISubmissionHistoryItem,
} from "../api/submissionHistory";
import { getLeetCodeRequest } from "../api/request";
import { LeetCodeNode } from "../explorer/LeetCodeNode";
import { explorerNodeManager } from "../explorer/explorerNodeManager";
import { leetCodeManager } from "../leetCodeManager";
import { IQuickItemEx } from "../shared";
import { getNodeIdFromFile } from "../utils/problemUtils";
import { DialogType, openUrl, promptForOpenOutputChannel, promptForSignIn } from "../utils/uiUtils";
import { getActiveFilePath } from "../utils/workspaceUtils";
import * as list from "./list";

async function resolveNode(node?: LeetCodeNode): Promise<LeetCodeNode | undefined> {
    if (node) {
        return node;
    }
    const filePath: string | undefined = await getActiveFilePath();
    if (!filePath) {
        return undefined;
    }
    const id: string = await getNodeIdFromFile(filePath);
    if (!id) {
        return undefined;
    }
    const cached: LeetCodeNode | undefined = explorerNodeManager.getNodeById(id);
    if (cached) {
        return cached;
    }
    const problem = (await list.listProblems()).find((item) => item.id === id);
    return problem ? new LeetCodeNode(problem) : undefined;
}

function formatDetail(item: ISubmissionHistoryItem): string {
    const parts: string[] = [formatSubmissionDate(item.timestamp)];
    if (item.runtime) {
        parts.push(`${l10n.t("Runtime")}: ${item.runtime}`);
    }
    if (item.memory) {
        parts.push(`${l10n.t("Memory")}: ${item.memory}`);
    }
    return parts.filter((part: string) => Boolean(part)).join(" · ");
}

export async function showSubmissionHistory(node?: LeetCodeNode): Promise<void> {
    if (!leetCodeManager.getUser()) {
        await promptForSignIn();
        return;
    }

    const target: LeetCodeNode | undefined = await resolveNode(node);
    if (!target) {
        await promptForOpenOutputChannel(l10n.t("Failed to resolve the problem for submissions."), DialogType.error);
        return;
    }

    try {
        const history: ISubmissionHistoryItem[] = await fetchSubmissionHistory(getLeetCodeRequest(), target.slug);
        if (history.length === 0) {
            window.showInformationMessage(l10n.t("No submissions found for this problem."));
            return;
        }

        const picks: Array<IQuickItemEx<ISubmissionHistoryItem>> = history.map((item: ISubmissionHistoryItem) => ({
            label: formatSubmissionLabel(item),
            description: item.status,
            detail: formatDetail(item),
            value: item,
        }));
        const choice: IQuickItemEx<ISubmissionHistoryItem> | undefined = await window.showQuickPick(picks, {
            matchOnDetail: true,
            placeHolder: l10n.t("Select a submission to open on LeetCode"),
        });
        if (!choice) {
            return;
        }
        const request = getLeetCodeRequest();
        await openUrl(`${request.origin}/submissions/detail/${choice.value.id}/`);
    } catch (error) {
        await promptForOpenOutputChannel(
            l10n.t("Failed to load submissions. Please open the output channel for details."),
            DialogType.error,
        );
    }
}
