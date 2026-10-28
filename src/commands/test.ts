// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import * as vscode from "vscode";
import { fetchJudgeInfo, getParamNames } from "../api/question";
import { getLeetCodeRequest } from "../api/request";
import { testSolution as testWithLeetCode } from "../api/submission";
import { leetCodeManager } from "../leetCodeManager";
import { globalState } from "../globalState";
import { IProblem, IQuickItemEx, UserStatus } from "../shared";
import { getLanguageFromText, getNodeIdFromText } from "../utils/problemUtils";
import { DialogType, promptForOpenOutputChannel, promptForSignIn, showFileSelectDialog } from "../utils/uiUtils";
import { getActiveDocument } from "../utils/workspaceUtils";
import { leetCodeSubmissionProvider } from "../webview/leetCodeSubmissionProvider";
import { getProblemById } from "../api/problems";

/** Test the solution file, with `input` when given and otherwise with the test case the user picks. */
export async function testSolution(uri?: vscode.Uri, input?: string): Promise<void> {
    try {
        if (leetCodeManager.getStatus() === UserStatus.SignedOut) {
            await promptForSignIn();
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

        const problem: IProblem | undefined = await getProblemById(id);
        if (!problem) {
            vscode.window.showErrorMessage(vscode.l10n.t("Failed to resolve the problem with id: {0}.", id));
            return;
        }

        const judgeInfo = await fetchJudgeInfo(getLeetCodeRequest(), problem.slug);
        const testInput: string | undefined = input
            ?? await pickTestInput(document, judgeInfo.exampleTestcases || judgeInfo.sampleTestCase, problem.slug);
        if (testInput === undefined) {
            return;
        }
        if (!testInput.trim()) {
            vscode.window.showErrorMessage(vscode.l10n.t("The test input must not be empty."));
            return;
        }
        await globalState.saveTestCase(problem.slug, testInput);

        await leetCodeSubmissionProvider.judge(problem, document, async () => ({
            ...await testWithLeetCode(
                getLeetCodeRequest(),
                { slug: problem.slug, questionId: judgeInfo.questionId },
                language,
                code,
                testInput,
            ),
            paramNames: getParamNames(judgeInfo),
        }));
    } catch (error) {
        await promptForOpenOutputChannel(vscode.l10n.t("Failed to test the solution. Please open the output channel for details."), DialogType.error, error);
    }
}

async function pickTestInput(
    document: vscode.TextDocument,
    examples: string | undefined,
    slug: string,
): Promise<string | undefined> {
    const savedInput: string | undefined = globalState.getTestCase(slug);
    const picks: Array<IQuickItemEx<string>> = [
        {
            label: `$(three-bars) ${vscode.l10n.t("Default test cases")}`,
            description: "",
            detail: vscode.l10n.t("Test with the problem's examples"),
            value: ":default",
        },
        ...(savedInput ? [{
            label: `$(history) ${vscode.l10n.t("Saved test case")}`,
            description: "",
            detail: savedInput.replace(/\n/g, " ").slice(0, 80),
            value: ":saved",
        }] : []),
        {
            label: `$(pencil) ${vscode.l10n.t("Write directly...")}`,
            description: "",
            detail: vscode.l10n.t("Write test cases in an input box"),
            value: ":direct",
        },
        {
            label: `$(file-text) ${vscode.l10n.t("Browse...")}`,
            description: "",
            detail: vscode.l10n.t("Test with test cases in a file"),
            value: ":file",
        },
    ];

    const choice: IQuickItemEx<string> | undefined = await vscode.window.showQuickPick(picks);
    if (!choice) {
        return undefined;
    }

    if (choice.value === ":default") {
        return examples || "";
    }

    if (choice.value === ":saved") {
        return savedInput;
    }

    if (choice.value === ":direct") {
        const value: string | undefined = await vscode.window.showInputBox({
            prompt: vscode.l10n.t("Enter the test cases."),
            validateInput: (input: string): string | undefined => input && input.trim() ? undefined : vscode.l10n.t("Test case must not be empty."),
            placeHolder: "Example: [1,2,3]\\n4",
            ignoreFocusOut: true,
        });
        return value === undefined ? undefined : normalizeTestInput(value);
    }

    const files: vscode.Uri[] | undefined = await showFileSelectDialog(document.uri.fsPath);
    if (!files || files.length === 0) {
        return undefined;
    }
    const bytes: Uint8Array = await vscode.workspace.fs.readFile(files[0]);
    return Buffer.from(bytes).toString("utf8").trim();
}

function normalizeTestInput(input: string): string {
    return input.replace(/\\n/g, "\n");
}
