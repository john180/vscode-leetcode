// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { Disposable, l10n } from "vscode";
import { getSortingStrategy } from "../commands/plugin";
import { getLeetCodeRequest } from "../api/request";
import { fetchDailyChallenge } from "../api/dailyChallenge";
import { fetchFavoriteData, IFavoriteList } from "../api/favoriteLists";
import { getProblemBySlug, getProblemCacheScope, getProblemPage, getProblemTags, IProblemPage, IProblemQuery } from "../api/problems";
import { problemCache } from "../api/problemCache";
import { Category, defaultProblem, IProblem, ProblemState, SortingStrategy } from "../shared";
import { shouldHideSolvedProblem } from "../utils/settingUtils";
import { leetCodeChannel } from "../leetCodeChannel";
import { LeetCodeNode } from "./LeetCodeNode";

interface IView {
    pages: Map<number, IProblemPage>;
    next: number;
    hasMore: boolean;
    force: boolean;
    pending?: Promise<void>;
    failed?: boolean;
    failedSkip?: number;
}

class ExplorerNodeManager implements Disposable {
    private nodes = new Map<string, LeetCodeNode>();
    private views = new Map<string, IView>();
    private children = new Map<string, LeetCodeNode[]>();
    private scope = "";
    private generation = 0;
    private force = false;
    private refreshed = new Set<string>();

    private ensureScope(): void {
        const scope = `${getProblemCacheScope()}:${shouldHideSolvedProblem()}:${getSortingStrategy()}`;
        if (scope !== this.scope) {
            this.dispose();
            this.scope = scope;
        }
    }

    private isCurrent(generation: number): boolean {
        this.ensureScope();
        return generation === this.generation;
    }

    public async refreshCache(force: boolean = false): Promise<void> {
        this.ensureScope();
        this.generation++;
        this.force = force;
        this.refreshed.clear();
        for (const view of this.views.values()) {
            view.force = force;
            view.pending = undefined;
        }
    }

    public getRootNodes(): LeetCodeNode[] {
        this.ensureScope();
        return [
            [Category.Daily, l10n.t("Daily Challenge")], [Category.Hot100, l10n.t("Hot 100")],
            [Category.All, l10n.t("All")], [Category.Difficulty, l10n.t("Difficulty")],
            [Category.Tag, l10n.t("Tag")], [Category.Company, l10n.t("Company")], [Category.Favorite, l10n.t("Favorite")],
        ].map(([id, name]) => this.category(id, name));
    }

    public getNodeById(id: string): LeetCodeNode | undefined {
        this.ensureScope();
        return this.nodes.get(id);
    }

    public async getChildren(id: string): Promise<LeetCodeNode[]> {
        this.ensureScope();
        const generation = this.generation;
        try {
            if (id === Category.Difficulty) {
                return ["Easy", "Medium", "Hard"].map((difficulty) => this.category(`${id}.${difficulty}`, l10n.t(difficulty)));
            }
            if (id === Category.Tag || id === Category.Company) {
                const tags = await getProblemTags(id === Category.Tag ? "tag" : "company", this.needsRefresh(id));
                if (!this.isCurrent(generation)) { return []; }
                this.refreshed.add(id);
                return this.remember(id, tags.sort((a, b) => a.name.localeCompare(b.name)).map((tag) => this.category(`${id}.${tag.slug}`, tag.name)));
            }
            if (id === Category.Favorite) {
                const data = await this.favorites(this.needsRefresh(id));
                if (!this.isCurrent(generation)) { return []; }
                this.refreshed.add(id);
                return this.remember(id, data.lists.map((list) => this.category(`${id}.${list.idHash}`, list.name === "Favorite" ? l10n.t("Favorite") : list.name)));
            }
            if (id === Category.Daily) {
                const request = getLeetCodeRequest();
                const daily = await problemCache.get(`${getProblemCacheScope()}daily`, () => fetchDailyChallenge(request, true).then((value) => value || null), this.needsRefresh(id));
                if (!this.isCurrent(generation)) { return []; }
                const problem = daily ? await getProblemBySlug(daily.slug, this.needsRefresh(id)) : undefined;
                if (!this.isCurrent(generation)) { return []; }
                this.refreshed.add(id);
                return this.remember(id, problem ? this.toNodes([problem]) : []);
            }
            const view = this.view(id);
            if (!view.pages.size || view.force) {
                await this.load(id, view, 0, view.force);
            } else {
                // Reuse disk pages immediately; stale pages revalidate in the cache.
                for (const skip of view.pages.keys()) {
                    const page = await this.fetchPage(id, skip);
                    if (!this.isCurrent(generation)) { return []; }
                    view.pages.set(skip, page);
                }
                this.updateTail(view);
            }
            if (!this.isCurrent(generation)) { return []; }
            return this.render(id, view);
        } catch (error) {
            if (!this.isCurrent(generation)) { return []; }
            leetCodeChannel.appendLine(`[WARN] Loading ${id}: ${String(error)}`);
            const view = this.views.get(id);
            if (view) { view.failed = true; return this.render(id, view); }
            return [...(this.children.get(id) || []), this.action(id, "retry")];
        }
    }

    public async loadMore(id: string): Promise<void> {
        this.ensureScope();
        const view = this.view(id);
        if (!view.hasMore || view.pending) { return; }
        try { await this.load(id, view, view.next, false); }
        catch (error) {
            view.failed = true;
            leetCodeChannel.appendLine(`[WARN] Loading ${id}: ${String(error)}`);
        }
    }

    public async retry(id: string): Promise<void> {
        this.refreshed.delete(id);
        const view = this.views.get(id);
        if (view) {
            try { await this.load(id, view, view.failedSkip ?? 0, true); }
            catch (error) { leetCodeChannel.appendLine(`[WARN] Retrying ${id}: ${String(error)}`); }
        }
    }

    private needsRefresh(id: string): boolean { return this.force && !this.refreshed.has(id); }

    private view(id: string): IView {
        let view = this.views.get(id);
        if (!view) {
            view = { pages: new Map(), next: 0, hasMore: true, force: this.needsRefresh(id) };
            this.views.set(id, view);
        }
        return view;
    }

    private async load(id: string, view: IView, skip: number, force: boolean): Promise<void> {
        if (view.pending) { return view.pending; }
        const generation = this.generation;
        const task = this.fetchPage(id, skip, force).then((page) => {
            if (!this.isCurrent(generation)) { return; }
            if (skip === 0) { view.pages.clear(); }
            view.pages.set(skip, page);
            view.force = false;
            view.failed = false;
            view.failedSkip = undefined;
            this.refreshed.add(id);
            this.updateTail(view);
        }).catch((error) => {
            if (this.isCurrent(generation)) { view.failed = true; view.failedSkip = skip; }
            throw error;
        }).finally(() => { if (view.pending === task) { view.pending = undefined; } });
        view.pending = task;
        return task;
    }

    private updateTail(view: IView): void {
        const last = [...view.pages.values()].at(-1);
        if (last) { view.next = last.next; view.hasMore = last.hasMore; }
    }

    private async fetchPage(id: string, skip: number, force: boolean = false): Promise<IProblemPage> {
        const scope = getProblemCacheScope();
        if (id === Category.Hot100 || id.startsWith(`${Category.Favorite}.`)) {
            const data = await this.favorites(force);
            if (scope !== getProblemCacheScope()) { throw new Error("Account changed while loading problems."); }
            const list: IFavoriteList | undefined = id === Category.Hot100 ? data.hot100 : data.lists.find((item) => item.idHash === id.slice(Category.Favorite.length + 1));
            const questions = list?.questions || [];
            const problems: IProblem[] = [];
            const slice = questions.slice(skip, skip + 20);
            // Bound requests for list entries that have never been visited before.
            for (let i = 0; i < slice.length; i += 4) {
                if (scope !== getProblemCacheScope()) { throw new Error("Account changed while loading problems."); }
                const batch = await Promise.all(slice.slice(i, i + 4).map((question) => getProblemBySlug(question.titleSlug, force)));
                problems.push(...batch.filter((problem): problem is IProblem => Boolean(problem)));
            }
            const next = skip + slice.length;
            return { problems, next, total: questions.length, hasMore: next < questions.length };
        }
        const query: IProblemQuery = { skip, sort: getSortingStrategy(), hideSolved: shouldHideSolvedProblem() };
        if (id.startsWith(`${Category.Difficulty}.`)) { query.difficulty = id.slice(Category.Difficulty.length + 1); }
        if (id.startsWith(`${Category.Tag}.`)) { query.tag = id.slice(Category.Tag.length + 1); }
        if (id.startsWith(`${Category.Company}.`)) { query.company = id.slice(Category.Company.length + 1); }
        return getProblemPage(query, force);
    }

    private favorites(force: boolean = false): ReturnType<typeof fetchFavoriteData> {
        const request = getLeetCodeRequest();
        return problemCache.get(`${getProblemCacheScope()}favorites`, () => fetchFavoriteData(request, true), force);
    }

    private render(id: string, view: IView): LeetCodeNode[] {
        const unique = new Map<string, IProblem>();
        for (const page of view.pages.values()) {
            for (const problem of page.problems) { unique.set(problem.id, problem); }
        }
        const nodes = this.toNodes([...unique.values()]);
        if (view.failed) { nodes.push(this.action(id, "retry")); }
        else if (view.hasMore) { nodes.push(this.action(id, "more")); }
        return nodes;
    }

    private toNodes(problems: IProblem[]): LeetCodeNode[] {
        const nodes = problems.filter((problem) => !shouldHideSolvedProblem() || problem.state !== ProblemState.AC).map((problem) => {
            const node = new LeetCodeNode(problem);
            this.nodes.set(problem.id, node);
            return node;
        });
        const strategy = getSortingStrategy();
        if (strategy === SortingStrategy.AcceptanceRateAsc) { nodes.sort((a, b) => a.acceptanceRate - b.acceptanceRate); }
        if (strategy === SortingStrategy.AcceptanceRateDesc) { nodes.sort((a, b) => b.acceptanceRate - a.acceptanceRate); }
        return nodes;
    }

    private category(id: string, name: string): LeetCodeNode { return new LeetCodeNode({ ...defaultProblem, id, name }, false); }
    private remember(id: string, nodes: LeetCodeNode[]): LeetCodeNode[] {
        this.children.set(id, nodes);
        return nodes;
    }
    private action(id: string, kind: "more" | "retry"): LeetCodeNode {
        return new LeetCodeNode({ ...defaultProblem, id: `${id}.${kind}`, name: kind === "more" ? l10n.t("Load more...") : l10n.t("Loading failed. Click to retry.") }, false, { parentId: id, kind });
    }

    public dispose(): void {
        this.generation++;
        this.nodes.clear();
        this.views.clear();
        this.children.clear();
        this.refreshed.clear();
        this.force = false;
    }
}

export const explorerNodeManager = new ExplorerNodeManager();
