// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { leetCodeManager } from "../leetCodeManager";
import { ProblemState, UserStatus } from "../shared";
import { explorerNodeManager } from "./explorerNodeManager";
import { LeetCodeNode } from "./LeetCodeNode";
import { describeFilter, IProblemFilter, problemFilterStore } from "./problemFilter";
import { highlightRanges } from "./problemSearch";
import { globalState } from "../globalState";
import { problemCache } from "../api/problemCache";
import { getProblemCacheScope } from "../api/problems";

export class LeetCodeTreeDataProvider implements vscode.TreeDataProvider<LeetCodeNode> {
    private context!: vscode.ExtensionContext;
    private treeView: vscode.TreeView<LeetCodeNode> | undefined;
    private lastProblemParent: string | undefined;

    private onDidChangeTreeDataEvent: vscode.EventEmitter<LeetCodeNode | undefined | null> = new vscode.EventEmitter<
        LeetCodeNode | undefined | null
    >();
    public readonly onDidChangeTreeData: vscode.Event<any> = this.onDidChangeTreeDataEvent.event;

    public initialize(context: vscode.ExtensionContext): void {
        this.context = context;
        // A category page can resolve many cache entries; redraw the tree once for the burst.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const updated = (key: string) => {
            if (!key.startsWith(getProblemCacheScope()) || timer) { return; }
            timer = setTimeout(() => {
                timer = undefined;
                this.onDidChangeTreeDataEvent.fire(null);
            }, 100);
        };
        const cleared = () => { explorerNodeManager.dispose(); this.onDidChangeTreeDataEvent.fire(null); };
        problemCache.events.on("updated", updated);
        problemCache.events.on("cleared", cleared);
        context.subscriptions.push({ dispose: () => {
            clearTimeout(timer);
            problemCache.events.off("updated", updated);
            problemCache.events.off("cleared", cleared);
        } });
    }

    public setTreeView(treeView: vscode.TreeView<LeetCodeNode>): void {
        this.treeView = treeView;
        this.context.subscriptions.push(
            // Re-expanding reuses VS Code's cached children, so getChildren alone cannot track expansion.
            treeView.onDidExpandElement(({ element }) => explorerNodeManager.expand(element.id)),
            treeView.onDidCollapseElement(({ element }) => explorerNodeManager.collapse(element.id)),
            treeView.onDidChangeSelection(({ selection }) => {
                if (selection[0]?.isProblem) {
                    this.lastProblemParent = selection[0].parentId;
                }
            }),
        );
        // A filter is kept across restarts.
        this.showSearchResult();
    }

    public get selection(): readonly LeetCodeNode[] {
        return this.treeView?.selection ?? [];
    }

    /** The category of the problem selected last, where a new search looks first. */
    public get lastProblemParentId(): string | undefined {
        return this.lastProblemParent;
    }

    public async reveal(node: LeetCodeNode, options: { select?: boolean; focus?: boolean; expand?: boolean }): Promise<void> {
        await this.treeView?.reveal(node, options);
    }

    /** Applies a search to the list; returns false when it did not change. */
    public search(text: string): boolean {
        if (!explorerNodeManager.setSearch(text)) {
            return false;
        }
        this.showSearchResult();
        this.onDidChangeTreeDataEvent.fire(null);
        return true;
    }

    /** Narrows the lists to `filter`, which stays until it is changed. */
    public async setFilter(filter: IProblemFilter): Promise<void> {
        await problemFilterStore.save(filter);
        this.showSearchResult();
        this.onDidChangeTreeDataEvent.fire(null);
    }

    /** Shows the filter and the search, or `description` of the search, above the list. */
    public showSearchResult(description?: string, message?: string): void {
        const search = explorerNodeManager.getSearch();
        const filter: string | undefined = describeFilter(problemFilterStore.get());
        void vscode.commands.executeCommand("setContext", "leetcode.searching", Boolean(search));
        void vscode.commands.executeCommand("setContext", "leetcode.filtered", Boolean(filter));
        if (this.treeView) {
            const searched: string | undefined = search ? description ?? vscode.l10n.t('Search: "{0}"', search.text) : undefined;
            const parts: string[] = [filter && vscode.l10n.t("Filter: {0}", filter), searched].filter((part): part is string => Boolean(part));
            this.treeView.description = parts.length > 0 ? parts.join(" · ") : undefined;
            this.treeView.message = search ? message : undefined;
        }
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
            explorerNodeManager.setSearch("");
            this.showSearchResult();
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

        const label: string = element.isProblem ? `${element.id}. ${element.name}` + this.parsePremiumUnLockIconPath(element) : element.name;
        const terms: string[] | undefined = element.isProblem ? explorerNodeManager.getSearch()?.terms : undefined;
        return {
            id: element.treeId,
            label: terms?.length ? { label, highlights: highlightRanges(label, terms) } : label,
            tooltip: element.isProblem ? element.name : undefined,
            collapsibleState: element.isProblem || element.action ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed,
            iconPath: this.parseIconPathFromProblemState(element),
            command: element.action ? (element.action.kind === "empty" ? undefined : { title: element.name, command: "leetcode.loadMoreProblems", arguments: [element] })
                : element.isProblem ? element.previewCommand : undefined,
            resourceUri: element.uri,
            contextValue,
        };
    }

    public getParent(element: LeetCodeNode): vscode.ProviderResult<LeetCodeNode> {
        return explorerNodeManager.getParent(element);
    }

    public getChildren(element?: LeetCodeNode | undefined): vscode.ProviderResult<LeetCodeNode[]> {
        if (!leetCodeManager.getUser()) {
            return [];
        }
        return element ? (element.isProblem || element.action ? [] : explorerNodeManager.getChildren(element.id))
            : explorerNodeManager.getRootNodes();
    }

    /** Theme icons follow the color theme; a blank one keeps unsolved problems aligned with the rest. */
    private parseIconPathFromProblemState(element: LeetCodeNode): vscode.ThemeIcon | undefined {
        if (!element.isProblem) {
            return undefined;
        }
        const { isPremium } = globalState.getUserStatus() ?? {};
        switch (element.state) {
            case ProblemState.AC:
                return new vscode.ThemeIcon("pass-filled", new vscode.ThemeColor("testing.iconPassed"));
            case ProblemState.NotAC:
                return new vscode.ThemeIcon("circle-large-outline", new vscode.ThemeColor("charts.yellow"));
            case ProblemState.Unknown:
                return element.locked && !isPremium ? new vscode.ThemeIcon("lock") : new vscode.ThemeIcon("blank");
            default:
                return undefined;
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
