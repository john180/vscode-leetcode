// Licensed under the MIT license.

import * as vscode from "vscode";
import { getProblemPage } from "../api/problems";
import { LeetCodeNode } from "../explorer/LeetCodeNode";
import { globalState } from "../globalState";
import { leetCodeChannel } from "../leetCodeChannel";
import { leetCodeManager } from "../leetCodeManager";
import { IProblem, IQuickItemEx, ProblemState } from "../shared";
import { promptForSignIn } from "../utils/uiUtils";

/** How many results one search lists. */
const RESULT_LIMIT: number = 20;

/** An exact id comes first, then an exact title or slug, then LeetCode's order. */
export function rankProblems(problems: IProblem[], text: string): IProblem[] {
    const exact: string = text.trim().toLowerCase();
    const rank = (problem: IProblem): number => problem.id.toLowerCase() === exact ? 0
        : problem.name.toLowerCase() === exact || problem.slug === exact ? 1 : 2;
    return problems.map((problem: IProblem, index: number) => ({ problem, index }))
        .sort((a, b) => rank(a.problem) - rank(b.problem) || a.index - b.index)
        .map(({ problem }) => problem);
}

/**
 * Like Go to File: type an id, title or slug, and LeetCode lists the problems that match.
 * Enter shows the description; the item's button starts coding. The problem list is left as it is.
 */
export async function goToProblem(): Promise<void> {
    if (!leetCodeManager.getUser()) {
        await promptForSignIn();
        return;
    }
    const codeButton: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon("code"), tooltip: vscode.l10n.t("Code Now") };
    const toItem = (problem: IProblem): IQuickItemEx<IProblem | undefined> => {
        const locked: boolean = problem.locked && !globalState.getUserStatus()?.isPremium;
        const icon: string = problem.state === ProblemState.AC ? "$(pass-filled) "
            : problem.state === ProblemState.NotAC ? "$(circle-large-outline) " : locked ? "$(lock) " : "";
        return {
            label: `${icon}${problem.id}. ${problem.name}`,
            description: [problem.difficulty && vscode.l10n.t(problem.difficulty), problem.passRate].filter(Boolean).join(" · "),
            // LeetCode matched these already, and not always by the text the label shows.
            alwaysShow: true,
            buttons: locked ? [] : [codeButton],
            value: problem,
        };
    };
    const picker = vscode.window.createQuickPick<IQuickItemEx<IProblem | undefined>>();
    picker.title = vscode.l10n.t("Go to Problem");
    picker.placeholder = vscode.l10n.t("Type a problem id, title or slug");
    picker.matchOnDescription = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let version: number = 0;
    let hidden: boolean = false;
    /** Lists the matches of what is typed; false when newer typing or closing made them moot. */
    const load = async (): Promise<boolean> => {
        clearTimeout(timer);
        timer = undefined;
        const text: string = picker.value.trim();
        const current: number = ++version;
        if (!text) {
            picker.busy = false;
            picker.items = [];
            return true;
        }
        picker.busy = true;
        try {
            // One-off searches stay in memory, like the problem list's.
            const page = await getProblemPage({ search: text, limit: RESULT_LIMIT }, false, false);
            if (current === version) {
                picker.items = rankProblems(page.problems, text).map(toItem);
            }
        } catch (error) {
            if (current === version) {
                leetCodeChannel.warn(`Failed to search for problems matching "${text}": ${error}`);
                picker.items = [{ label: `$(error) ${vscode.l10n.t("Search failed. Please open the output channel for details.")}`, alwaysShow: true, value: undefined }];
            }
        } finally {
            if (current === version) {
                picker.busy = false;
            }
        }
        return current === version;
    };
    const open = (command: string, problem: IProblem | undefined): void => {
        if (problem && !hidden) {
            picker.hide();
            void vscode.commands.executeCommand(command, command === "leetcode.showProblem" ? new LeetCodeNode(problem) : problem);
        }
    };
    const subscriptions: vscode.Disposable[] = [
        picker.onDidChangeValue(() => {
            clearTimeout(timer);
            timer = setTimeout(() => void load(), 300);
        }),
        picker.onDidAccept(async () => {
            // Enter right after typing goes to the best match for what was typed, not to an item listed for the text before it.
            if (timer) {
                if (await load()) {
                    open("leetcode.previewProblem", picker.items[0]?.value);
                }
                return;
            }
            open("leetcode.previewProblem", picker.activeItems[0]?.value);
        }),
        picker.onDidTriggerItemButton(({ item }) => open("leetcode.showProblem", item.value)),
        picker.onDidHide(() => {
            hidden = true;
            clearTimeout(timer);
            ++version;
            subscriptions.forEach((subscription: vscode.Disposable) => subscription.dispose());
            picker.dispose();
        }),
    ];
    picker.show();
}
