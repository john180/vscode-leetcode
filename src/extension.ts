// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { codeLensController } from "./codelens/CodeLensController";
import * as auth from "./commands/auth";
import * as cache from "./commands/cache";
import { switchDefaultLanguage } from "./commands/language";
import * as plugin from "./commands/plugin";
import * as search from "./commands/search";
import * as session from "./commands/session";
import * as show from "./commands/show";
import * as star from "./commands/star";
import * as submissions from "./commands/submissions";
import * as submit from "./commands/submit";
import * as test from "./commands/test";
import { explorerNodeManager } from "./explorer/explorerNodeManager";
import { LeetCodeNode } from "./explorer/LeetCodeNode";
import { leetCodeTreeDataProvider } from "./explorer/LeetCodeTreeDataProvider";
import { leetCodeTreeItemDecorationProvider } from "./explorer/LeetCodeTreeItemDecorationProvider";
import { leetCodeChannel } from "./leetCodeChannel";
import { leetCodeManager } from "./leetCodeManager";
import { leetCodeStatusBarController } from "./statusbar/leetCodeStatusBarController";
import { setExtensionId, UserStatus } from "./shared";
import { resolveEndpoint } from "./auth/endpointResolver";
import { sessionEvents } from "./auth/session";
import { DialogType, promptForOpenOutputChannel } from "./utils/uiUtils";
import { leetCodePreviewProvider } from "./webview/leetCodePreviewProvider";
import { leetCodeSubmissionProvider, RESULT_ACTION_COMMAND } from "./webview/leetCodeSubmissionProvider";
import { compileDiagnostics } from "./utils/compileDiagnostics";
import { markdownEngine } from "./webview/markdownEngine";
import { globalState } from "./globalState";
import { problemCache } from "./api/problemCache";
import { testCaseStore } from "./testCaseStore";
import { addTestCase, ITestCaseTarget, registerTestCaseDocuments } from "./testCaseDocument";
import { setClientVersion } from "./api/http";
import { registerProblemDocumentContext } from "./utils/problemDocumentContext";
import type { IGraphQLRequest } from "./api/client";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    try {
        setExtensionId(context.extension.id);
        setClientVersion(context.extension.packageJSON?.version);
        markdownEngine.initialize(context.extensionUri);
        testCaseStore.initialize(context.globalState);
        registerTestCaseDocuments(context);
        registerProblemDocumentContext(context);
        const expired = (request: IGraphQLRequest): void => {
            void auth.handleSessionExpired(request).catch((error: unknown) => leetCodeChannel.warn(`Session verification failed: ${error}`));
        };
        sessionEvents.on("expired", expired);
        const statusChanged = (): void => {
            const status: UserStatus = leetCodeManager.getStatus();
            const signedIn: boolean = status === UserStatus.SignedIn;
            const signingIn: boolean = status === UserStatus.SigningIn;
            const showSignIn: boolean = status === UserStatus.SignedOut;
            void vscode.commands.executeCommand("setContext", "leetcode.signedIn", signedIn);
            void vscode.commands.executeCommand("setContext", "leetcode.showSignIn", showSignIn);
            leetCodeStatusBarController.updateStatusBar(status, leetCodeManager.getUser());
            leetCodePreviewProvider.clear();
            if (signingIn) {
                leetCodeTreeDataProvider.setMessage(vscode.l10n.t("Signing in..."));
            } else {
                leetCodeTreeDataProvider.refresh();
            }
            if (signedIn) {
                void show.followActiveEditor(vscode.window.activeTextEditor);
            }
        };
        leetCodeManager.on("statusChanged", statusChanged);
        context.subscriptions.push({ dispose: () => {
            sessionEvents.off("expired", expired);
            leetCodeManager.off("statusChanged", statusChanged);
        } });

        // Register views and commands before restoring state, so a failure there never leaves the commands missing.
        leetCodeTreeDataProvider.initialize(context);
        const treeView = vscode.window.createTreeView("leetCodeExplorer", {
            treeDataProvider: leetCodeTreeDataProvider,
            showCollapseAll: true,
        });
        leetCodeTreeDataProvider.setTreeView(treeView);

        context.subscriptions.push(
            leetCodeStatusBarController,
            leetCodeChannel,
            leetCodePreviewProvider,
            leetCodeSubmissionProvider,
            compileDiagnostics,
            markdownEngine,
            codeLensController,
            explorerNodeManager,
            vscode.window.registerFileDecorationProvider(leetCodeTreeItemDecorationProvider),
            treeView,
            // Not retained while hidden: the page asks for the latest content when it loads again.
            vscode.window.registerWebviewViewProvider("leetCodeDetail", leetCodePreviewProvider),
            vscode.window.registerWebviewViewProvider("leetCodeResult", leetCodeSubmissionProvider),
            vscode.window.onDidChangeActiveTextEditor((editor) => show.followActiveEditor(editor)),
            vscode.commands.registerCommand("leetcode.loadMoreProblems", (node: LeetCodeNode) => leetCodeTreeDataProvider.loadMore(node)),
            vscode.commands.registerCommand("leetcode.deleteCache", () => cache.deleteCache()),
            vscode.commands.registerCommand("leetcode.toggleLeetCodeCn", () => plugin.switchEndpoint()),
            vscode.commands.registerCommand("leetcode.signin", () => auth.signIn()),
            vscode.commands.registerCommand("leetcode.signout", () => auth.signOut()),
            vscode.commands.registerCommand("leetcode.manageSessions", () => session.manageSessions()),
            vscode.commands.registerCommand("leetcode.previewProblem", (input?: LeetCodeNode | vscode.Uri) => show.previewProblem(input)),
            vscode.commands.registerCommand("leetcode.showProblem", (node: LeetCodeNode) => show.showProblem(node)),
            vscode.commands.registerCommand("leetcode.pickOne", () => show.pickOne()),
            vscode.commands.registerCommand("leetcode.searchProblem", () => search.searchProblem()),
            vscode.commands.registerCommand("leetcode.clearSearch", () => search.clearSearch()),
            vscode.commands.registerCommand("leetcode.showSolution", (input: LeetCodeNode | vscode.Uri) => show.showSolution(input)),
            vscode.commands.registerCommand("leetcode.showSubmissions", (node: LeetCodeNode) => submissions.showSubmissionHistory(node)),
            vscode.commands.registerCommand("leetcode.refreshExplorer", async () => {
                if (globalState.getCookie() && leetCodeManager.getStatus() === UserStatus.SignedOut) {
                    await leetCodeManager.getLoginStatus();
                }
                await leetCodeTreeDataProvider.refresh(true);
            }),
            vscode.commands.registerCommand("leetcode.testSolution", (uri?: vscode.Uri, input?: unknown) => {
                // Menus pass their context as the second argument; only the result view passes an input.
                return test.testSolution(uri, typeof input === "string" ? input : undefined);
            }),
            vscode.commands.registerCommand("leetcode.rerunTest", (uri?: vscode.Uri) => test.rerunTest(uri)),
            // Only the result view adds test cases, with the input of a failed submission.
            vscode.commands.registerCommand("leetcode.addTestCase", (problem: ITestCaseTarget, input: string) => addTestCase(problem, input)),
            vscode.commands.registerCommand(RESULT_ACTION_COMMAND, (run: unknown, action: unknown, index?: unknown) => leetCodeSubmissionProvider.runAction(run, action, index)),
            vscode.commands.registerCommand("leetcode.submitSolution", (uri?: vscode.Uri) => {
                return submit.submitSolution(uri);
            }),
            vscode.commands.registerCommand("leetcode.switchDefaultLanguage", () => switchDefaultLanguage()),
            vscode.commands.registerCommand("leetcode.addFavorite", (node: LeetCodeNode) => star.addFavorite(node)),
            vscode.commands.registerCommand("leetcode.addToFavoriteList", (node: LeetCodeNode) => star.addToFavoriteList(node)),
            vscode.commands.registerCommand("leetcode.removeFavorite", (node: LeetCodeNode) => star.removeFavorite(node)),
            vscode.commands.registerCommand("leetcode.problems.sort", () => plugin.switchSortingStrategy()),
            vscode.window.registerUriHandler({ handleUri: (uri: vscode.Uri) => auth.handleUri(uri) })
        );
    } catch (error) {
        void promptForOpenOutputChannel(vscode.l10n.t("Extension initialization failed. Please open the output channel for details."), DialogType.error, error);
        return;
    }

    try {
        const endpoint = await resolveEndpoint();
        await globalState.initialize(context, endpoint);
        problemCache.initialize(context.globalState);
        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("leetcode.endpoint")) {
                void resolveEndpoint().then((site) => leetCodeManager.handleEndpointChange(site)).catch((error: unknown) => {
                    leetCodeChannel.warn(`Endpoint transition failed: ${error}`);
                });
            }
        }));
        const hasStoredCookie: boolean = Boolean(globalState.getCookie());
        await vscode.commands.executeCommand("setContext", "leetcode.signedIn", false);
        await vscode.commands.executeCommand("setContext", "leetcode.showSignIn", false);
        if (hasStoredCookie) {
            leetCodeTreeDataProvider.setMessage(vscode.l10n.t("Signing in..."));
        }
    } catch (error) {
        void promptForOpenOutputChannel(vscode.l10n.t("Extension initialization failed. Please open the output channel for details."), DialogType.error, error);
        return;
    }

    void leetCodeManager.getLoginStatus().catch((error: unknown) => {
        leetCodeChannel.warn(`Session restoration failed: ${error}`);
    });
}

export function deactivate(): Promise<void> {
    leetCodeManager.dispose();
    // Problem pages are written to disk lazily; keep the latest ones.
    return problemCache.flush();
}
