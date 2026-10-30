// Licensed under the MIT license.

import * as vscode from "vscode";
import { leetCodeTreeDataProvider } from "../explorer/LeetCodeTreeDataProvider";
import {
    DIFFICULTIES, getPremiumLabel, getStatusLabel, IProblemFilter, normalizeFilter, problemFilterStore, STATUSES,
} from "../explorer/problemFilter";
import { shouldHideSolvedProblem } from "../utils/settingUtils";

interface IFilterItem extends vscode.QuickPickItem {
    group?: "difficulties" | "statuses" | "premium";
    value?: string;
}

/** One list of every choice, grouped; within a group, checking none or all of them allows any. */
export async function filterProblems(): Promise<void> {
    const filter: IProblemFilter = problemFilterStore.get();
    const separator = (label: string): IFilterItem => ({ label, kind: vscode.QuickPickItemKind.Separator });
    const items: IFilterItem[] = [
        separator(vscode.l10n.t("Difficulty")),
        ...DIFFICULTIES.map((value: string): IFilterItem => ({
            label: vscode.l10n.t(value), group: "difficulties", value, picked: filter.difficulties.includes(value),
        })),
        separator(vscode.l10n.t("Status")),
        ...STATUSES.map((value: string): IFilterItem => ({
            label: getStatusLabel(value), group: "statuses", value, picked: filter.statuses.includes(value),
            description: value === "SOLVED" && shouldHideSolvedProblem() ? vscode.l10n.t("Hidden by the leetcode.hideSolved setting") : undefined,
        })),
        separator(vscode.l10n.t("Access")),
        ...(["free", "premium"] as const).map((value): IFilterItem => ({
            label: getPremiumLabel(value), group: "premium", value, picked: filter.premium === value,
        })),
    ];
    const picks: IFilterItem[] | undefined = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        title: vscode.l10n.t("Filter Problems"),
        placeHolder: vscode.l10n.t("Show only the problems that match. Leave a group empty to allow any."),
    });
    if (!picks) {
        return;
    }
    const chosen = (group: IFilterItem["group"]): string[] => picks.filter((item: IFilterItem) => item.group === group).map((item: IFilterItem) => item.value!);
    const premium: string[] = chosen("premium");
    await leetCodeTreeDataProvider.setFilter(normalizeFilter({
        difficulties: chosen("difficulties"),
        statuses: chosen("statuses"),
        premium: premium.length === 1 ? premium[0] as IProblemFilter["premium"] : undefined,
    }));
}

export async function clearFilter(): Promise<void> {
    await leetCodeTreeDataProvider.setFilter(normalizeFilter(undefined));
}
