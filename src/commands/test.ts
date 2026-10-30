// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import * as vscode from "vscode";
import { fetchJudgeInfo, getParamNames } from "../api/question";
import { isCanceled } from "../api/http";
import { getLeetCodeRequest } from "../api/request";
import { testSolution as testWithLeetCode } from "../api/submission";
import { leetCodeManager } from "../leetCodeManager";
import { getSavedTestCases, ITestCaseTarget, openTestCases, parseTestCaseUri, rememberJudgeInfo } from "../testCaseDocument";
import { IProblem, IQuickItemEx, UserStatus } from "../shared";
import { getProblemFile } from "../utils/problemDocumentContext";
import { getLanguageFromText, getNodeIdFromText } from "../utils/problemUtils";
import { normalizeTestInput } from "../utils/testCaseUtils";
import { DialogType, promptForOpenOutputChannel, promptForSignIn, showFileSelectDialog } from "../utils/uiUtils";
import { getActiveDocument } from "../utils/workspaceUtils";
import { leetCodeSubmissionProvider } from "../webview/leetCodeSubmissionProvider";
import { getProblemById } from "../api/problems";
import { assertRequestActive } from "../api/cancellation";

/** The input to test `problem` with, or undefined when there is nothing to test yet. */
type InputChooser = (document: vscode.TextDocument, problem: IProblem, examples: string) => Promise<string | undefined>;

/** Test the solution file, with `input` when given and otherwise with the test case the user picks. */
export async function testSolution(uri?: vscode.Uri, input?: string): Promise<void> {
    await runTest(uri, input === undefined ? pickTestInput : async () => input);
}

/** Test without asking, as LeetCode's Run does: with the user's test cases, or the examples until there are any. */
export async function rerunTest(uri?: vscode.Uri): Promise<void> {
    await runTest(uri, useSavedTestCases);
}

async function useSavedTestCases(_document: vscode.TextDocument, problem: IProblem, examples: string): Promise<string> {
    return await getSavedTestCases(problem) ?? examples;
}

async function runTest(uri: vscode.Uri | undefined, chooseInput: InputChooser): Promise<void> {
    try {
        if (leetCodeManager.getStatus() === UserStatus.SignedOut) {
            await promptForSignIn();
            return;
        }

        // A test case editor tests the solution file of its problem with its own cases.
        const testCases: ITestCaseTarget | undefined = parseTestCaseUri(uri ?? vscode.window.activeTextEditor?.document.uri);
        if (testCases) {
            uri = getProblemFile(testCases.id);
            if (!uri) {
                vscode.window.showErrorMessage(vscode.l10n.t("Open the solution file of problem {0} to test these cases.", testCases.id));
                return;
            }
            chooseInput = useSavedTestCases;
        }

        const request = getLeetCodeRequest();
        const document: vscode.TextDocument | undefined = await getActiveDocument(uri);
        assertRequestActive(request);
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
        assertRequestActive(request);
        if (!problem) {
            vscode.window.showErrorMessage(vscode.l10n.t("Failed to resolve the problem with id: {0}.", id));
            return;
        }

        const judgeInfo = await fetchJudgeInfo(request, problem.slug);
        rememberJudgeInfo(problem.slug, judgeInfo);
        const choice: string | undefined = await chooseInput(document, problem, judgeInfo.exampleTestcases || judgeInfo.sampleTestCase || "");
        if (choice === undefined) {
            return;
        }
        const testInput: string = normalizeTestInput(choice);
        if (!testInput) {
            vscode.window.showErrorMessage(vscode.l10n.t("The test input must not be empty."));
            return;
        }
        assertRequestActive(request);

        // A newer run aborts this one: a test's result only matters while the panel shows it.
        await leetCodeSubmissionProvider.judge(problem, document, async (signal: AbortSignal) => ({
            ...await testWithLeetCode(
                { ...request, signal },
                { slug: problem.slug, questionId: judgeInfo.questionId },
                language,
                code,
                testInput,
            ),
            paramNames: getParamNames(judgeInfo),
        }));
    } catch (error) {
        if (isCanceled(error)) {
            return;
        }
        await promptForOpenOutputChannel(vscode.l10n.t("Failed to test the solution. Please open the output channel for details."), DialogType.error, error);
    }
}

async function pickTestInput(document: vscode.TextDocument, problem: IProblem, examples: string): Promise<string | undefined> {
    const savedInput: string | undefined = await getSavedTestCases(problem);
    // The user's own cases come first, so that Enter tests them again.
    const picks: Array<IQuickItemEx<string>> = [
        ...(savedInput ? [{
            label: `$(history) ${vscode.l10n.t("My test cases")}`,
            description: "",
            detail: savedInput.replace(/\r?\n/g, " ").slice(0, 80),
            value: ":saved",
        }] : []),
        {
            label: `$(three-bars) ${vscode.l10n.t("Default test cases")}`,
            description: "",
            detail: vscode.l10n.t("Test with the problem's examples"),
            value: ":default",
        },
        {
            label: `$(edit) ${vscode.l10n.t("Edit test cases...")}`,
            description: "",
            detail: vscode.l10n.t("Write test cases in an editor, one argument per line"),
            value: ":edit",
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
        return examples;
    }

    if (choice.value === ":saved") {
        return savedInput;
    }

    if (choice.value === ":edit") {
        // The editor tests its cases itself once they are written.
        await openTestCases(problem);
        return undefined;
    }

    const files: vscode.Uri[] | undefined = await showFileSelectDialog(document.uri.fsPath);
    if (!files || files.length === 0) {
        return undefined;
    }
    const bytes: Uint8Array = await vscode.workspace.fs.readFile(files[0]);
    return Buffer.from(bytes).toString("utf8");
}
