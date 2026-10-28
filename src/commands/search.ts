// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { explorerNodeManager } from "../explorer/explorerNodeManager";
import { LeetCodeNode } from "../explorer/LeetCodeNode";
import { leetCodeTreeDataProvider } from "../explorer/LeetCodeTreeDataProvider";
import { leetCodeChannel } from "../leetCodeChannel";
import { leetCodeManager } from "../leetCodeManager";
import { Category } from "../shared";
import { promptForSignIn } from "../utils/uiUtils";

// Selecting a result must not open it; the user clicks the problem to see its description.
const revealOptions = { select: true, focus: false };

/** Type to filter and highlight the problem list; Enter moves to the next match, Escape keeps the results. */
export async function searchProblem(): Promise<void> {
    if (!leetCodeManager.getUser()) {
        await promptForSignIn();
        return;
    }
    const input = vscode.window.createInputBox();
    const hint: string = vscode.l10n.t("Matches are highlighted in the problem list. Press Enter for the next match.");
    input.placeholder = vscode.l10n.t("Search by id, title or slug; use tag:array or company:google to filter");
    input.value = explorerNodeManager.getSearch()?.text ?? "";
    input.valueSelection = [0, input.value.length];
    input.prompt = hint;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hidden = false;
    let version = 0;
    /** Returns false when the typed text was already applied. */
    const apply = async (): Promise<boolean> => {
        clearTimeout(timer);
        timer = undefined;
        const current = ++version;
        if (!input.value.trim()) {
            input.prompt = hint;
            return clearSearch();
        }
        if (!leetCodeTreeDataProvider.search(input.value)) {
            return false;
        }
        input.busy = true;
        const summary: string = await locateSearchResult();
        if (!hidden && current === version) {
            input.busy = false;
            input.prompt = `${summary} ${hint}`;
        }
        return true;
    };
    const subscriptions: vscode.Disposable[] = [
        input.onDidChangeValue(() => {
            clearTimeout(timer);
            timer = setTimeout(() => void apply(), 300);
        }),
        input.onDidAccept(async () => {
            if (!await apply()) {
                await revealNextSearchResult();
            }
        }),
        input.onDidHide(() => {
            hidden = true;
            // Keep what was typed, even when Escape beat the debounce.
            if (timer) {
                void apply();
            }
            subscriptions.forEach((subscription: vscode.Disposable) => subscription.dispose());
            input.dispose();
        }),
    ];
    input.show();
}

/** Reveals the best match of the current search without opening it, and returns where it was found. */
export async function locateSearchResult(): Promise<string> {
    const search = explorerNodeManager.getSearch();
    if (!search) {
        return "";
    }
    // `tag:`/`company:` search inside that category only; otherwise start where the user browsed last.
    const pinned: string | undefined = search.tag ? `${Category.Tag}.${search.tag}` : search.company ? `${Category.Company}.${search.company}` : undefined;
    const candidates: string[] = pinned
        ? [pinned]
        : [...new Set([leetCodeTreeDataProvider.lastProblemParentId, Category.All])].filter((id): id is string => Boolean(id));
    for (const id of candidates) {
        try {
            // Without a keyword the category itself is the result.
            const nodes: LeetCodeNode[] = await explorerNodeManager.getChildren(search.keyword ? id : id.slice(0, id.indexOf(".")));
            if (explorerNodeManager.getSearch() !== search) {
                return "";
            }
            const target: LeetCodeNode | undefined = search.keyword ? bestMatch(nodes, search.keyword) : nodes.find((node: LeetCodeNode) => node.id === id);
            if (!target) {
                continue;
            }
            await leetCodeTreeDataProvider.reveal(target, { ...revealOptions, expand: !search.keyword });
            if (!search.keyword) {
                leetCodeTreeDataProvider.showSearchResult();
                return "";
            }
            const category: string = explorerNodeManager.getCategory(id).name;
            const total: number = explorerNodeManager.getTotal(id) ?? nodes.filter((node: LeetCodeNode) => node.isProblem).length;
            leetCodeTreeDataProvider.showSearchResult(vscode.l10n.t('"{0}" · {1} in {2}', search.text, total, category));
            return vscode.l10n.t("{0} matches in {1}.", total, category);
        } catch (error) {
            leetCodeChannel.appendLine(`[WARN] Failed to locate "${search.text}" in ${id}: ${error}`);
        }
    }
    if (explorerNodeManager.getSearch() !== search) {
        return "";
    }
    const summary: string = vscode.l10n.t('No problems match "{0}".', search.text);
    leetCodeTreeDataProvider.showSearchResult(undefined, summary);
    return summary;
}

/** Moves the selection to the next match in the expanded categories, wrapping around. */
export async function revealNextSearchResult(): Promise<void> {
    const matches: LeetCodeNode[] = explorerNodeManager.getMatches();
    if (matches.length === 0) {
        await locateSearchResult();
        return;
    }
    const selected: LeetCodeNode | undefined = leetCodeTreeDataProvider.selection[0];
    const index: number = selected ? matches.findIndex((node: LeetCodeNode) => node.treeId === selected.treeId) : -1;
    await leetCodeTreeDataProvider.reveal(matches[(index + 1) % matches.length], revealOptions);
}

/** Restores the full list, keeping the selected problem in view when it was already loaded there. */
export async function clearSearch(): Promise<boolean> {
    const selected: LeetCodeNode | undefined = leetCodeTreeDataProvider.selection[0];
    if (!leetCodeTreeDataProvider.search("")) {
        return false;
    }
    const loaded: LeetCodeNode | undefined = selected?.isProblem && selected.parentId
        ? explorerNodeManager.getLoadedProblem(selected.parentId, selected.id)
        : undefined;
    if (loaded) {
        try {
            await leetCodeTreeDataProvider.reveal(loaded, revealOptions);
        } catch (error) {
            leetCodeChannel.appendLine(`[WARN] Failed to reveal problem ${loaded.id}: ${error}`);
        }
    }
    return true;
}

function bestMatch(nodes: LeetCodeNode[], keyword: string): LeetCodeNode | undefined {
    const problems: LeetCodeNode[] = nodes.filter((node: LeetCodeNode) => node.isProblem);
    const exact: string = keyword.toLowerCase();
    return problems.find((node: LeetCodeNode) => node.id.toLowerCase() === exact)
        ?? problems.find((node: LeetCodeNode) => node.name.toLowerCase() === exact || node.slug === exact)
        ?? problems[0];
}
