// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import * as vscode from "vscode";
import { leetCodeManager } from "../leetCodeManager";
import { ProblemState, UserStatus } from "../shared";
import { explorerNodeManager } from "./explorerNodeManager";
import { LeetCodeNode } from "./LeetCodeNode";
import { globalState } from "../globalState";
import { problemCache } from "../api/problemCache";
import { getProblemCacheScope } from "../api/problems";

export class LeetCodeTreeDataProvider implements vscode.TreeDataProvider<LeetCodeNode> {
    private context: vscode.ExtensionContext;
    private treeView: vscode.TreeView<LeetCodeNode> | undefined;

    private onDidChangeTreeDataEvent: vscode.EventEmitter<LeetCodeNode | undefined | null> = new vscode.EventEmitter<
        LeetCodeNode | undefined | null
    >();
    public readonly onDidChangeTreeData: vscode.Event<any> = this.onDidChangeTreeDataEvent.event;

    public initialize(context: vscode.ExtensionContext): void {
        this.context = context;
        const updated = (key: string) => {
            if (key.startsWith(getProblemCacheScope())) { this.onDidChangeTreeDataEvent.fire(null); }
        };
        const cleared = () => { explorerNodeManager.dispose(); this.onDidChangeTreeDataEvent.fire(null); };
        problemCache.events.on("updated", updated);
        problemCache.events.on("cleared", cleared);
        context.subscriptions.push({ dispose: () => {
            problemCache.events.off("updated", updated);
            problemCache.events.off("cleared", cleared);
        } });
    }

    public setTreeView(treeView: vscode.TreeView<LeetCodeNode>): void {
        this.treeView = treeView;
    }

    public setMessage(message: string | undefined): void {
        if (this.treeView) {
            this.treeView.message = message;
        }
    }

    public async refresh(forceRefresh: boolean = false): Promise<void> {
        if (leetCodeManager.getStatus() === UserStatus.SigningIn) {
            this.setMessage(vscode.l10n.t("Signing in..."));
            this.onDidChangeTreeDataEvent.fire(null);
            return;
        }
        if (leetCodeManager.getStatus() === UserStatus.SignedOut) {
            explorerNodeManager.dispose();
            this.setMessage(undefined);
            this.onDidChangeTreeDataEvent.fire(null);
            return;
        }
        const loadingMessage: string = vscode.l10n.t("Loading problems...");
        if (this.treeView) {
            this.treeView.message = loadingMessage;
        }
        try {
            await vscode.window.withProgress(
                {
                    location: { viewId: "leetCodeExplorer" },
                    title: loadingMessage,
                },
                async () => {
                    await explorerNodeManager.refreshCache(forceRefresh);
                },
            );
        } finally {
            if (this.treeView) {
                this.treeView.message = undefined;
            }
        }
        this.onDidChangeTreeDataEvent.fire(null);
    }

    public async loadMore(node: LeetCodeNode): Promise<void> {
        if (!node.action) { return; }
        if (node.action.kind === "retry") { await explorerNodeManager.retry(node.action.parentId); }
        else { await explorerNodeManager.loadMore(node.action.parentId); }
        this.onDidChangeTreeDataEvent.fire(null);
    }

    public getTreeItem(element: LeetCodeNode): vscode.TreeItem | Thenable<vscode.TreeItem> {
        let contextValue: string;
        if (element.isProblem) {
            contextValue = element.isFavorite ? "problem-favorite" : "problem";
        } else {
            contextValue = element.id.toLowerCase();
        }

        return {
            id: element.isProblem ? undefined : element.id,
            label: element.isProblem ? `[${element.id}] ${element.name}` + this.parsePremiumUnLockIconPath(element) : element.name,
            tooltip: element.isProblem ? element.name : undefined,
            collapsibleState: element.isProblem || element.action ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed,
            iconPath: this.parseIconPathFromProblemState(element),
            command: element.action ? { title: element.name, command: "leetcode.loadMoreProblems", arguments: [element] }
                : element.isProblem ? element.previewCommand : undefined,
            resourceUri: element.uri,
            contextValue,
        };
    }

    public getChildren(element?: LeetCodeNode | undefined): vscode.ProviderResult<LeetCodeNode[]> {
        if (!leetCodeManager.getUser()) {
            return [];
        }
        return element ? (element.isProblem || element.action ? [] : explorerNodeManager.getChildren(element.id))
            : explorerNodeManager.getRootNodes();
    }

    private parseIconPathFromProblemState(element: LeetCodeNode): string {
        if (!element.isProblem) {
            return "";
        }
        const { isPremium } = globalState.getUserStatus() ?? {};
        switch (element.state) {
            case ProblemState.AC:
                return this.context.asAbsolutePath(path.join("resources", "check.png"));
            case ProblemState.NotAC:
                return this.context.asAbsolutePath(path.join("resources", "x.png"));
            case ProblemState.Unknown:
                if (element.locked && !isPremium) {
                    return this.context.asAbsolutePath(path.join("resources", "lock.png"));
                }
                return this.context.asAbsolutePath(path.join("resources", "blank.png"));
            default:
                return "";
        }
    }

    private parsePremiumUnLockIconPath(element: LeetCodeNode): string {
        const { isPremium } = globalState.getUserStatus() ?? {};
        if (isPremium && element.locked) {
            return "  🔓";
        }
        return "";
    }

}

export const leetCodeTreeDataProvider: LeetCodeTreeDataProvider = new LeetCodeTreeDataProvider();
