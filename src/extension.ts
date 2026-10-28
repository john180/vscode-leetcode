// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { codeLensController } from "./codelens/CodeLensController";
import * as cache from "./commands/cache";
import { switchDefaultLanguage } from "./commands/language";
import * as plugin from "./commands/plugin";
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
import { leetCodeSolutionProvider } from "./webview/leetCodeSolutionProvider";
import { leetCodeSubmissionProvider } from "./webview/leetCodeSubmissionProvider";
import { markdownEngine } from "./webview/markdownEngine";
import { globalState } from "./globalState";
import { problemCache } from "./api/problemCache";
import { registerProblemDocumentContext } from "./utils/problemDocumentContext";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    try {
        setExtensionId(context.extension.id);
        markdownEngine.initialize(context.extensionUri);
        registerProblemDocumentContext(context);
        sessionEvents.on("expired", () => {
            void leetCodeManager.handleSessionExpired();
        });
        leetCodeManager.on("statusChanged", () => {
            const status: UserStatus = leetCodeManager.getStatus();
            const signedIn: boolean = status === UserStatus.SignedIn;
            const signingIn: boolean = status === UserStatus.SigningIn;
            const showSignIn: boolean = status === UserStatus.SignedOut;
            vscode.commands.executeCommand("setContext", "leetcode.signedIn", signedIn);
            vscode.commands.executeCommand("setContext", "leetcode.signingIn", signingIn);
            vscode.commands.executeCommand("setContext", "leetcode.showSignIn", showSignIn);
            leetCodeStatusBarController.updateStatusBar(status, leetCodeManager.getUser());
            if (signingIn) {
                leetCodeTreeDataProvider.setMessage(vscode.l10n.t("Signing in..."));
            } else {
                leetCodeTreeDataProvider.refresh();
            }
            if (signedIn) {
                void show.followActiveEditor(vscode.window.activeTextEditor);
            }
        });

        leetCodeTreeDataProvider.initialize(context);
        await globalState.initialize(context);
        problemCache.initialize(context.globalState);
        await resolveEndpoint();
        const hasStoredCookie: boolean = Boolean(globalState.getCookie());
        await vscode.commands.executeCommand("setContext", "leetcode.signedIn", false);
        await vscode.commands.executeCommand("setContext", "leetcode.signingIn", hasStoredCookie);
        await vscode.commands.executeCommand("setContext", "leetcode.showSignIn", false);

        const treeView = vscode.window.createTreeView("leetCodeExplorer", {
            treeDataProvider: leetCodeTreeDataProvider,
            showCollapseAll: true,
        });
        leetCodeTreeDataProvider.setTreeView(treeView);
        if (hasStoredCookie) {
            leetCodeTreeDataProvider.setMessage(vscode.l10n.t("Signing in..."));
        }

        context.subscriptions.push(
            leetCodeStatusBarController,
            leetCodeChannel,
            leetCodePreviewProvider,
            leetCodeSubmissionProvider,
            leetCodeSolutionProvider,
            markdownEngine,
            codeLensController,
            explorerNodeManager,
            vscode.window.registerFileDecorationProvider(leetCodeTreeItemDecorationProvider),
            treeView,
            vscode.window.registerWebviewViewProvider("leetCodeDetail", leetCodePreviewProvider, {
                webviewOptions: { retainContextWhenHidden: true },
            }),
            vscode.window.onDidChangeActiveTextEditor((editor) => show.followActiveEditor(editor)),
            vscode.commands.registerCommand("leetcode.loadMoreProblems", (node: LeetCodeNode) => leetCodeTreeDataProvider.loadMore(node)),
            vscode.commands.registerCommand("leetcode.deleteCache", () => cache.deleteCache()),
            vscode.commands.registerCommand("leetcode.toggleLeetCodeCn", () => plugin.switchEndpoint()),
            vscode.commands.registerCommand("leetcode.signin", () => leetCodeManager.signIn()),
            vscode.commands.registerCommand("leetcode.signout", () => leetCodeManager.signOut()),
            vscode.commands.registerCommand("leetcode.manageSessions", () => session.manageSessions()),
            vscode.commands.registerCommand("leetcode.previewProblem", (input?: LeetCodeNode | vscode.Uri) => show.previewProblem(input)),
            vscode.commands.registerCommand("leetcode.showProblem", (node: LeetCodeNode) => show.showProblem(node)),
            vscode.commands.registerCommand("leetcode.pickOne", () => show.pickOne()),
            vscode.commands.registerCommand("leetcode.searchProblem", () => show.searchProblem()),
            vscode.commands.registerCommand("leetcode.showSolution", (input: LeetCodeNode | vscode.Uri) => show.showSolution(input)),
            vscode.commands.registerCommand("leetcode.showSubmissions", (node: LeetCodeNode) => submissions.showSubmissionHistory(node)),
            vscode.commands.registerCommand("leetcode.refreshExplorer", async () => {
                if (globalState.getCookie() && leetCodeManager.getStatus() === UserStatus.SignedOut) {
                    await leetCodeManager.getLoginStatus();
                }
                await leetCodeTreeDataProvider.refresh(true);
            }),
            vscode.commands.registerCommand("leetcode.testSolution", (uri?: vscode.Uri) => {
                return test.testSolution(uri);
            }),
            vscode.commands.registerCommand("leetcode.submitSolution", (uri?: vscode.Uri) => {
                return submit.submitSolution(uri);
            }),
            vscode.commands.registerCommand("leetcode.switchDefaultLanguage", () => switchDefaultLanguage()),
            vscode.commands.registerCommand("leetcode.addFavorite", (node: LeetCodeNode) => star.addFavorite(node)),
            vscode.commands.registerCommand("leetcode.addToFavoriteList", (node: LeetCodeNode) => star.addToFavoriteList(node)),
            vscode.commands.registerCommand("leetcode.removeFavorite", (node: LeetCodeNode) => star.removeFavorite(node)),
            vscode.commands.registerCommand("leetcode.problems.sort", () => plugin.switchSortingStrategy()),
            vscode.window.registerUriHandler({ handleUri: leetCodeManager.handleUriSignIn })
        );

        void leetCodeManager.getLoginStatus().catch((error: unknown) => {
            leetCodeChannel.appendLine(`[WARN] Session restoration failed: ${error}`);
        });
    } catch (error) {
        leetCodeChannel.appendLine(error.toString());
        promptForOpenOutputChannel("Extension initialization failed. Please open output channel for details.", DialogType.error);
    }
}

export function deactivate(): Promise<void> {
    // Problem pages are written to disk lazily; keep the latest ones.
    return problemCache.flush();
}
