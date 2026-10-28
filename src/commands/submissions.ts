// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { l10n, window } from "vscode";
import {
    fetchSubmissionHistory,
    formatSubmissionDate,
    formatSubmissionLabel,
    ISubmissionHistoryItem,
    ISubmissionHistoryPage,
} from "../api/submissionHistory";
import { getLeetCodeRequest } from "../api/request";
import { LeetCodeNode } from "../explorer/LeetCodeNode";
import { explorerNodeManager } from "../explorer/explorerNodeManager";
import { leetCodeManager } from "../leetCodeManager";
import { IQuickItemEx } from "../shared";
import { getNodeIdFromFile } from "../utils/problemUtils";
import { DialogType, openUrl, promptForOpenOutputChannel, promptForSignIn } from "../utils/uiUtils";
import { getActiveFilePath } from "../utils/workspaceUtils";
import { getProblemById } from "../api/problems";

type SubmissionPick = ISubmissionHistoryItem | "load-more" | "filter";

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
    const problem = await getProblemById(id);
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

    try {
        const target: LeetCodeNode | undefined = await resolveNode(node);
        if (!target) {
            await promptForOpenOutputChannel(l10n.t("Failed to resolve the problem for submissions."), DialogType.error);
            return;
        }

        const request = getLeetCodeRequest();
        const items: ISubmissionHistoryItem[] = [];
        let hasNext: boolean = true;
        let loaded: boolean = false;
        let filterStatus: string | undefined;

        while (true) {
            if (!loaded) {
                const page: ISubmissionHistoryPage = await fetchSubmissionHistory(request, target.slug, 0, 10);
                items.push(...page.items);
                hasNext = page.hasNext && page.items.length > 0;
                loaded = true;
                if (items.length === 0) {
                    window.showInformationMessage(l10n.t("No submissions found for this problem."));
                    return;
                }
            }

            const visible: ISubmissionHistoryItem[] = filterStatus
                ? items.filter((item: ISubmissionHistoryItem) => item.status === filterStatus)
                : items;
            const picks: Array<IQuickItemEx<SubmissionPick>> = visible.map((item: ISubmissionHistoryItem) => ({
                label: formatSubmissionLabel(item),
                description: item.status,
                detail: formatDetail(item),
                value: item,
            }));
            if (hasNext) {
                picks.push({
                    label: `$(cloud-download) ${l10n.t("Load more...")}`,
                    description: "",
                    detail: "",
                    value: "load-more",
                });
            }
            picks.push({
                label: `$(filter) ${l10n.t("Filter by status")}`,
                description: filterStatus || l10n.t("All statuses"),
                detail: "",
                value: "filter",
            });

            const choice: IQuickItemEx<SubmissionPick> | undefined = await window.showQuickPick(picks, {
                matchOnDetail: true,
                placeHolder: l10n.t("Select a submission to open on LeetCode"),
            });
            if (!choice) {
                return;
            }

            if (choice.value === "load-more") {
                const page: ISubmissionHistoryPage = await fetchSubmissionHistory(request, target.slug, items.length, 10);
                items.push(...page.items);
                hasNext = page.hasNext && page.items.length > 0;
                continue;
            }

            if (choice.value === "filter") {
                const statuses: string[] = [...new Set(items.map((item: ISubmissionHistoryItem) => item.status))];
                const statusChoice: string | undefined = await window.showQuickPick(
                    [l10n.t("All statuses"), ...statuses],
                    { placeHolder: l10n.t("Filter by status") },
                );
                if (statusChoice === l10n.t("All statuses")) {
                    filterStatus = undefined;
                } else if (statusChoice) {
                    filterStatus = statusChoice;
                }
                continue;
            }

            await openUrl(`${request.origin}/submissions/detail/${choice.value.id}/`);
            return;
        }
    } catch (error) {
        await promptForOpenOutputChannel(
            l10n.t("Failed to load submissions. Please open the output channel for details."),
            DialogType.error,
        );
    }
}
