// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { l10n, ProgressLocation, QuickInputButton, ThemeIcon, Uri, window } from "vscode";
import {
    fetchSubmissionHistory,
    formatSubmissionDate,
    formatSubmissionLabel,
    getLanguageSlug,
    ISubmissionHistoryItem,
    ISubmissionHistoryPage,
} from "../api/submissionHistory";
import { getLeetCodeRequest } from "../api/request";
import { assertRequestActive } from "../api/cancellation";
import { isCanceled } from "../api/http";
import { LeetCodeNode } from "../explorer/LeetCodeNode";
import { explorerNodeManager } from "../explorer/explorerNodeManager";
import { leetCodeManager } from "../leetCodeManager";
import { currentSite, IQuickItemEx } from "../shared";
import { compareSubmission, ISubmissionTarget, parseSubmissionUri, showSubmission } from "../submissionDocument";
import { getProblemFile } from "../utils/problemDocumentContext";
import { genFileExt, getNodeIdFromFile } from "../utils/problemUtils";
import { DialogType, openUrl, promptForOpenOutputChannel, promptForSignIn } from "../utils/uiUtils";
import { getActiveFilePath } from "../utils/workspaceUtils";
import { getProblemById } from "../api/problems";

type SubmissionPick = ISubmissionHistoryItem | "load-more" | "filter";

/** What to do with the chosen submission: Enter shows its code, and the buttons of its row do the rest. */
type SubmissionAction = "code" | "compare" | "web";

interface ISubmissionChoice {
    pick: SubmissionPick;
    action: SubmissionAction;
}

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

function toTarget(problem: LeetCodeNode, item: ISubmissionHistoryItem): ISubmissionTarget {
    let ext: string = "txt";
    try {
        ext = genFileExt(getLanguageSlug(item.lang));
    } catch {
        // A language this extension cannot create files for, such as a database dialect, is shown as plain text.
    }
    return { host: currentSite().host, problemId: problem.id, slug: problem.slug, submissionId: item.id, ext };
}

/** Resolves to the item and how it was chosen, or undefined when the picker is dismissed. */
function pickSubmission(
    picks: Array<IQuickItemEx<SubmissionPick>>,
    buttons: Map<QuickInputButton, SubmissionAction>,
): Promise<ISubmissionChoice | undefined> {
    const quickPick = window.createQuickPick<IQuickItemEx<SubmissionPick>>();
    quickPick.items = picks;
    quickPick.matchOnDetail = true;
    quickPick.placeholder = l10n.t("Select a submission to view its code");
    return new Promise((resolve) => {
        let choice: ISubmissionChoice | undefined;
        quickPick.onDidAccept(() => {
            const item = quickPick.selectedItems[0];
            choice = item && { pick: item.value, action: "code" };
            quickPick.hide();
        });
        quickPick.onDidTriggerItemButton((event) => {
            choice = { pick: event.item.value, action: buttons.get(event.button) ?? "code" };
            quickPick.hide();
        });
        quickPick.onDidHide(() => {
            quickPick.dispose();
            resolve(choice);
        });
        quickPick.show();
    });
}

export async function showSubmissionHistory(node?: LeetCodeNode): Promise<void> {
    if (!leetCodeManager.getUser()) {
        await promptForSignIn();
        return;
    }

    try {
        const request = getLeetCodeRequest();
        const target: LeetCodeNode | undefined = await resolveNode(node);
        assertRequestActive(request);
        if (!target) {
            await promptForOpenOutputChannel(l10n.t("Failed to resolve the problem for submissions."), DialogType.error);
            return;
        }

        const items: ISubmissionHistoryItem[] = [];
        let hasNext: boolean = true;
        let loaded: boolean = false;
        let filterStatus: string | undefined;
        const compare: QuickInputButton = { iconPath: new ThemeIcon("diff"), tooltip: l10n.t("Compare with your solution") };
        const web: QuickInputButton = { iconPath: new ThemeIcon("link-external"), tooltip: l10n.t("View the submission on LeetCode") };
        const buttons = new Map<QuickInputButton, SubmissionAction>([[compare, "compare"], [web, "web"]]);

        while (true) {
            assertRequestActive(request);
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
            // Comparing needs the solution file, which may not have been opened yet.
            const itemButtons: QuickInputButton[] = getProblemFile(target.id) ? [compare, web] : [web];
            const picks: Array<IQuickItemEx<SubmissionPick>> = visible.map((item: ISubmissionHistoryItem) => ({
                label: formatSubmissionLabel(item),
                description: item.status,
                detail: formatDetail(item),
                value: item,
                buttons: itemButtons,
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

            const choice: ISubmissionChoice | undefined = await pickSubmission(picks, buttons);
            if (!choice) {
                return;
            }
            assertRequestActive(request);

            if (choice.pick === "load-more") {
                const page: ISubmissionHistoryPage = await fetchSubmissionHistory(request, target.slug, items.length, 10);
                items.push(...page.items);
                hasNext = page.hasNext && page.items.length > 0;
                continue;
            }

            if (choice.pick === "filter") {
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

            if (choice.action === "web") {
                await openUrl(`${request.origin}/submissions/detail/${choice.pick.id}/`);
                return;
            }
            const submission: ISubmissionTarget = toTarget(target, choice.pick);
            await loadSubmission(() => choice.action === "compare" ? compareSubmission(submission) : showSubmission(submission));
            return;
        }
    } catch (error) {
        if (isCanceled(error)) { return; }
        await promptForOpenOutputChannel(
            l10n.t("Failed to load submissions. Please open the output channel for details."),
            DialogType.error,
            error,
        );
    }
}

/** The title bar action of a submission's code. */
export async function compareWithSolution(uri?: Uri): Promise<void> {
    const submission: ISubmissionTarget | undefined = parseSubmissionUri(uri ?? window.activeTextEditor?.document.uri);
    if (!submission) {
        return;
    }
    try {
        await loadSubmission(() => compareSubmission(submission));
    } catch (error) {
        if (isCanceled(error)) { return; }
        await promptForOpenOutputChannel(l10n.t("Failed to load the submission. Please open the output channel for details."), DialogType.error, error);
    }
}

function loadSubmission(task: () => Promise<void>): Thenable<void> {
    return window.withProgress({ location: ProgressLocation.Window, title: l10n.t("Loading the submission...") }, task);
}
