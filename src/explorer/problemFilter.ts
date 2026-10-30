// Licensed under the MIT license.

import { l10n } from "vscode";
import type { Memento } from "vscode";
import { IProblem, ProblemState } from "../shared";

const FilterKey = "leetcode-problem-filter";

export const DIFFICULTIES: string[] = ["Easy", "Medium", "Hard"];
/** The statuses problemsetQuestionListV2 filters by. */
export const STATUSES: string[] = ["TO_DO", "ATTEMPTED", "SOLVED"];

/** What the problem list is narrowed to. An empty list, like one with every choice, allows any. */
export interface IProblemFilter {
    difficulties: string[];
    statuses: string[];
    /** Only free or only premium problems. */
    premium?: "free" | "premium";
}

/** Drops unknown values, and lists that allow everything, so equal filters compare equal. */
export function normalizeFilter(filter: Partial<IProblemFilter> | undefined): IProblemFilter {
    const pick = (values: unknown, known: string[]): string[] => {
        const picked: string[] = known.filter((value: string) => Array.isArray(values) && values.includes(value));
        return picked.length === known.length ? [] : picked;
    };
    const premium = filter?.premium === "free" || filter?.premium === "premium" ? filter.premium : undefined;
    return { difficulties: pick(filter?.difficulties, DIFFICULTIES), statuses: pick(filter?.statuses, STATUSES), ...(premium && { premium }) };
}

export function isFiltering(filter: IProblemFilter): boolean {
    return filter.difficulties.length > 0 || filter.statuses.length > 0 || filter.premium !== undefined;
}

export function getProblemStatus(problem: IProblem): string {
    return problem.state === ProblemState.AC ? "SOLVED" : problem.state === ProblemState.NotAC ? "ATTEMPTED" : "TO_DO";
}

/** Lists that are not filtered by LeetCode, such as favorites, and states changed since a page loaded, are filtered with this. */
export function matchesFilter(problem: IProblem, filter: IProblemFilter): boolean {
    return (filter.difficulties.length === 0 || filter.difficulties.includes(problem.difficulty))
        && (filter.statuses.length === 0 || filter.statuses.includes(getProblemStatus(problem)))
        && (filter.premium === undefined || problem.locked === (filter.premium === "premium"));
}

export function getStatusLabel(status: string): string {
    switch (status) {
        case "SOLVED":
            return l10n.t("Solved");
        case "ATTEMPTED":
            return l10n.t("Attempted");
        default:
            return l10n.t("To Do");
    }
}

export function getPremiumLabel(premium: "free" | "premium"): string {
    return premium === "free" ? l10n.t("Free") : l10n.t("Premium");
}

/** Like "Medium, Hard, To Do", or undefined without a filter. */
export function describeFilter(filter: IProblemFilter): string | undefined {
    const parts: string[] = [
        ...filter.difficulties.map((difficulty: string) => l10n.t(difficulty)),
        ...filter.statuses.map(getStatusLabel),
        ...(filter.premium ? [getPremiumLabel(filter.premium)] : []),
    ];
    return parts.length > 0 ? parts.join(", ") : undefined;
}

/** The filter of the problem list. Like the sort order, it belongs to no account. */
class ProblemFilterStore {
    private storage: Memento | undefined;

    public initialize(storage: Memento): void {
        this.storage = storage;
    }

    public get(): IProblemFilter {
        return normalizeFilter(this.storage?.get<Partial<IProblemFilter>>(FilterKey));
    }

    public async save(filter: IProblemFilter): Promise<void> {
        const normalized: IProblemFilter = normalizeFilter(filter);
        await this.storage?.update(FilterKey, isFiltering(normalized) ? normalized : undefined);
    }
}

export const problemFilterStore: ProblemFilterStore = new ProblemFilterStore();
