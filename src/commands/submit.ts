// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import * as vscode from "vscode";
import { fetchJudgeInfo, getParamNames } from "../api/question";
import { getLeetCodeRequest } from "../api/request";
import { submitSolution as submitToLeetCode } from "../api/submission";
import { leetCodeTreeDataProvider } from "../explorer/LeetCodeTreeDataProvider";
import { leetCodeManager } from "../leetCodeManager";
import { IProblem } from "../shared";
import { getLanguageFromText, getNodeIdFromText } from "../utils/problemUtils";
import { DialogType, promptForOpenOutputChannel, promptForSignIn } from "../utils/uiUtils";
import { getActiveDocument } from "../utils/workspaceUtils";
import { leetCodeSubmissionProvider } from "../webview/leetCodeSubmissionProvider";
import { getProblemById, getProblemCacheScope, recordSubmission } from "../api/problems";

export async function submitSolution(uri?: vscode.Uri): Promise<void> {
    if (!leetCodeManager.getUser()) {
        promptForSignIn();
        return;
    }

    const document: vscode.TextDocument | undefined = await getActiveDocument(uri);
    if (!document) {
        return;
    }

    const code: string = document.getText();
    const language: string | undefined = getLanguageFromText(code);
    const id: string = getNodeIdFromText(code) || path.basename(document.uri.fsPath).split(".")[0];
    if (!language) {
        vscode.window.showErrorMessage(vscode.l10n.t("Failed to read the language from the @lc header."));
        return;
    }

    try {
        const scope = getProblemCacheScope();
        const problem: IProblem | undefined = await getProblemById(id);
        if (!problem) {
            vscode.window.showErrorMessage(vscode.l10n.t("Failed to resolve the problem with id: {0}.", id));
            return;
        }
        if (scope !== getProblemCacheScope()) { return; }

        const request = getLeetCodeRequest();
        // Not aborted by a newer run: the verdict still updates the problem's state.
        const result = await leetCodeSubmissionProvider.judge(problem, document, async () => {
            const judgeInfo = await fetchJudgeInfo(request, problem.slug);
            return {
                ...await submitToLeetCode(
                    request,
                    { slug: problem.slug, questionId: judgeInfo.questionId },
                    language,
                    code,
                ),
                paramNames: getParamNames(judgeInfo),
            };
        });
        if (result.state === "SUCCESS" && scope === getProblemCacheScope()) {
            await recordSubmission(problem, result.statusMessage === "Accepted");
        }
    } catch (error) {
        await promptForOpenOutputChannel(vscode.l10n.t("Failed to submit the solution. Please open the output channel for details."), DialogType.error, error);
        return;
    }

    await leetCodeTreeDataProvider.refresh();
}
