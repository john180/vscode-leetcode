// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { Disposable, l10n } from "vscode";
import { getSortingStrategy } from "../commands/plugin";
import { getLeetCodeRequest } from "../api/request";
import { fetchDailyChallenge } from "../api/dailyChallenge";
import { fetchFavoriteData, IFavoriteList, IFavoriteQuestion } from "../api/favoriteLists";
import { getProblemBySlug, getProblemCacheScope, getProblemPage, getProblemTags, IProblemPage, IProblemQuery } from "../api/problems";
import { problemCache } from "../api/problemCache";
import { Category, defaultProblem, IProblem, ProblemState, SortingStrategy } from "../shared";
import { shouldHideSolvedProblem } from "../utils/settingUtils";
import { leetCodeChannel } from "../leetCodeChannel";
import { LeetCodeNode } from "./LeetCodeNode";
import { IProblemSearch, matchesTerms, parseProblemSearch } from "./problemSearch";

interface IView {
    pages: Map<number, IProblemPage>;
    next: number;
    hasMore: boolean;
    force: boolean;
    pending?: Promise<void>;
    failed?: boolean;
    failedSkip?: number;
}

const ROOTS: string[] = [Category.Daily, Category.Hot100, Category.All, Category.Difficulty, Category.Tag, Category.Company, Category.Favorite];

class ExplorerNodeManager implements Disposable {
    private nodes = new Map<string, LeetCodeNode>();
    private categories = new Map<string, LeetCodeNode>();
    private views = new Map<string, IView>();
    private children = new Map<string, LeetCodeNode[]>();
    private expanded = new Set<string>();
    private search: IProblemSearch | undefined;
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

    public getSearch(): IProblemSearch | undefined {
        return this.search;
    }

    /** Filters problem lists by the keyword; returns false when the search did not change. */
    public setSearch(text: string): boolean {
        const search = parseProblemSearch(text);
        if (search?.text === this.search?.text) {
            return false;
        }
        const filterChanged = search?.keyword !== this.search?.keyword;
        this.search = search;
        if (filterChanged) {
            this.generation++;
            // Results for older keywords are dropped; browsing pages wait under their plain ids.
            for (const [key, view] of this.views) {
                if (key.includes("?")) { this.views.delete(key); } else { view.pending = undefined; }
            }
            for (const key of this.children.keys()) {
                if (key.includes("?")) { this.children.delete(key); }
            }
        }
        return true;
    }

    public getRootNodes(): LeetCodeNode[] {
        this.ensureScope();
        const names: Record<string, string> = {
            [Category.Daily]: l10n.t("Daily Challenge"), [Category.Hot100]: l10n.t("Hot 100"),
            [Category.All]: l10n.t("All"), [Category.Difficulty]: l10n.t("Difficulty"),
            [Category.Tag]: l10n.t("Tag"), [Category.Company]: l10n.t("Company"), [Category.Favorite]: l10n.t("Favorite"),
        };
        return ROOTS.map((id) => this.category(id, names[id]));
    }

    public getNodeById(id: string): LeetCodeNode | undefined {
        this.ensureScope();
        return this.nodes.get(id);
    }

    public getCategory(id: string): LeetCodeNode {
        this.ensureScope();
        if (ROOTS.includes(id)) {
            return this.getRootNodes().find((node) => node.id === id)!;
        }
        // Categories are named "<root>.<slug>"; the name only matters until the tree lists the real node.
        const separator = id.indexOf(".");
        return this.categories.get(id) ?? this.category(id, id.slice(separator + 1), separator > 0 ? id.slice(0, separator) : undefined);
    }

    public getParent(node: LeetCodeNode): LeetCodeNode | undefined {
        return node.parentId ? this.getCategory(node.parentId) : undefined;
    }

    public expand(id: string): void { this.expanded.add(id); }
    public collapse(id: string): void { this.expanded.delete(id); }

    /** Search results in expanded categories, in tree order. */
    public getMatches(): LeetCodeNode[] {
        const matches: LeetCodeNode[] = [];
        if (!this.search?.keyword) { return matches; }
        const visit = (id: string): void => {
            if (!this.expanded.has(id)) { return; }
            for (const child of this.children.get(this.key(id)) ?? []) {
                if (child.isProblem) { matches.push(child); } else if (!child.action) { visit(child.id); }
            }
        };
        ROOTS.forEach(visit);
        return matches;
    }

    /** How many problems the category lists for the current search, when known. */
    public getTotal(id: string): number | undefined {
        return [...this.views.get(this.key(id))?.pages.values() ?? []].at(-1)?.total;
    }

    /** A problem already listed under the category, found without loading anything. */
    public getLoadedProblem(parentId: string, id: string): LeetCodeNode | undefined {
        return this.children.get(this.key(parentId))?.find((node) => node.isProblem && node.id === id);
    }

    public async getChildren(id: string): Promise<LeetCodeNode[]> {
        this.ensureScope();
        this.expanded.add(id);
        const generation = this.generation;
        const key = this.key(id);
        try {
            if (id === Category.Difficulty) {
                return this.remember(key, ["Easy", "Medium", "Hard"].map((difficulty) => this.category(`${id}.${difficulty}`, l10n.t(difficulty), id)));
            }
            if (id === Category.Tag || id === Category.Company) {
                const tags = await getProblemTags(id === Category.Tag ? "tag" : "company", this.needsRefresh(id));
                if (!this.isCurrent(generation)) { return []; }
                this.refreshed.add(id);
                return this.remember(key, tags.sort((a, b) => a.name.localeCompare(b.name)).map((tag) => this.category(`${id}.${tag.slug}`, tag.name, id)));
            }
            if (id === Category.Favorite) {
                const data = await this.favorites(this.needsRefresh(id));
                if (!this.isCurrent(generation)) { return []; }
                this.refreshed.add(id);
                return this.remember(key, data.lists.map((list) => this.category(`${id}.${list.idHash}`, list.name === "Favorite" ? l10n.t("Favorite") : list.name, id)));
            }
            if (id === Category.Daily) {
                const request = getLeetCodeRequest();
                const daily = await problemCache.get(`${getProblemCacheScope()}daily`, () => fetchDailyChallenge(request, true).then((value) => value || null), this.needsRefresh(id));
                if (!this.isCurrent(generation)) { return []; }
                const problem = daily ? await getProblemBySlug(daily.slug, this.needsRefresh(id)) : undefined;
                if (!this.isCurrent(generation)) { return []; }
                this.refreshed.add(id);
                const matched = problem && (!this.search?.keyword || matchesTerms(`${problem.id} ${problem.name} ${problem.slug}`, this.search.terms));
                const nodes = matched ? this.toNodes(id, [problem]) : [];
                return this.remember(key, nodes.length || !this.search?.keyword ? nodes : [this.action(id, "empty")]);
            }
            const view = this.view(key, id);
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
            return this.remember(key, this.render(id, view));
        } catch (error) {
            if (!this.isCurrent(generation)) { return []; }
            leetCodeChannel.warn(`Loading ${id}: ${String(error)}`);
            const view = this.views.get(key);
            if (view) { view.failed = true; return this.remember(key, this.render(id, view)); }
            return [...(this.children.get(key) || []).filter((node) => !node.action), this.action(id, "retry")];
        }
    }

    public async loadMore(id: string): Promise<void> {
        this.ensureScope();
        const view = this.view(this.key(id), id);
        if (!view.hasMore || view.pending) { return; }
        try { await this.load(id, view, view.next, false); }
        catch (error) {
            view.failed = true;
            leetCodeChannel.warn(`Loading ${id}: ${String(error)}`);
        }
    }

    public async retry(id: string): Promise<void> {
        this.refreshed.delete(id);
        const view = this.views.get(this.key(id));
        if (view) {
            try { await this.load(id, view, view.failedSkip ?? 0, true); }
            catch (error) { leetCodeChannel.warn(`Retrying ${id}: ${String(error)}`); }
        }
    }

    /** Lists depend on the search keyword; browsing state stays under the plain id. */
    private key(id: string): string {
        return this.search?.keyword ? `${id}?${this.search.keyword}` : id;
    }

    private needsRefresh(id: string): boolean { return this.force && !this.refreshed.has(id); }

    private view(key: string, id: string): IView {
        let view = this.views.get(key);
        if (!view) {
            view = { pages: new Map(), next: 0, hasMore: true, force: this.needsRefresh(id) };
            this.views.set(key, view);
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
        const search = this.search?.keyword ? this.search : undefined;
        if (id === Category.Hot100 || id.startsWith(`${Category.Favorite}.`)) {
            const data = await this.favorites(force);
            if (scope !== getProblemCacheScope()) { throw new Error("Account changed while loading problems."); }
            const list: IFavoriteList | undefined = id === Category.Hot100 ? data.hot100 : data.lists.find((item) => item.idHash === id.slice(Category.Favorite.length + 1));
            const questions = search ? this.filterQuestions(list?.questions || [], search) : list?.questions || [];
            const slice = questions.slice(skip, skip + 20);
            // Looked up together, the entries not cached yet share one request.
            const found = await Promise.all(slice.map((question) => getProblemBySlug(question.titleSlug, force)));
            if (scope !== getProblemCacheScope()) { throw new Error("Account changed while loading problems."); }
            const problems = found.filter((problem): problem is IProblem => Boolean(problem));
            const next = skip + slice.length;
            return { problems, next, total: questions.length, hasMore: next < questions.length };
        }
        const query: IProblemQuery = { skip, sort: getSortingStrategy(), hideSolved: shouldHideSolvedProblem(), search: search?.keyword };
        if (id.startsWith(`${Category.Difficulty}.`)) { query.difficulty = id.slice(Category.Difficulty.length + 1); }
        if (id.startsWith(`${Category.Tag}.`)) { query.tag = id.slice(Category.Tag.length + 1); }
        if (id.startsWith(`${Category.Company}.`)) { query.company = id.slice(Category.Company.length + 1); }
        // Search results stay in memory like every other one-off search.
        return getProblemPage(query, force, !search);
    }

    /** Favorite lists are filtered locally: by their titles, and by the ids and names of problems seen before. */
    private filterQuestions(questions: IFavoriteQuestion[], search: IProblemSearch): IFavoriteQuestion[] {
        const known = new Map(problemCache.values<IProblem | null>(`${getProblemCacheScope()}single:`)
            .filter((problem): problem is IProblem => Boolean(problem)).map((problem) => [problem.slug, problem]));
        return questions.filter((question) => {
            const problem = known.get(question.titleSlug);
            return matchesTerms(`${question.title} ${question.titleSlug} ${problem ? `${problem.id} ${problem.name}` : ""}`, search.terms);
        });
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
        const nodes = this.toNodes(id, [...unique.values()]);
        if (view.failed) { nodes.push(this.action(id, "retry")); }
        else if (view.hasMore) { nodes.push(this.action(id, "more")); }
        else if (!nodes.length && this.search?.keyword) { nodes.push(this.action(id, "empty")); }
        return nodes;
    }

    private toNodes(parentId: string, problems: IProblem[]): LeetCodeNode[] {
        const nodes = problems.filter((problem) => !shouldHideSolvedProblem() || problem.state !== ProblemState.AC).map((problem) => {
            const node = new LeetCodeNode(problem, true, undefined, parentId);
            this.nodes.set(problem.id, node);
            return node;
        });
        const strategy = getSortingStrategy();
        if (strategy === SortingStrategy.AcceptanceRateAsc) { nodes.sort((a, b) => a.acceptanceRate - b.acceptanceRate); }
        if (strategy === SortingStrategy.AcceptanceRateDesc) { nodes.sort((a, b) => b.acceptanceRate - a.acceptanceRate); }
        return nodes;
    }

    private category(id: string, name: string, parentId?: string): LeetCodeNode {
        const node = new LeetCodeNode({ ...defaultProblem, id, name }, false, undefined, parentId);
        this.categories.set(id, node);
        return node;
    }
    private remember(key: string, nodes: LeetCodeNode[]): LeetCodeNode[] {
        this.children.set(key, nodes);
        return nodes;
    }
    private action(id: string, kind: "more" | "retry" | "empty"): LeetCodeNode {
        const names = { more: l10n.t("Load more..."), retry: l10n.t("Loading failed. Click to retry."), empty: l10n.t("No matching problems") };
        return new LeetCodeNode({ ...defaultProblem, id: `${id}.${kind}`, name: names[kind] }, false, { parentId: id, kind }, id);
    }

    public dispose(): void {
        this.generation++;
        this.nodes.clear();
        this.categories.clear();
        this.views.clear();
        this.children.clear();
        this.expanded.clear();
        this.refreshed.clear();
        this.force = false;
    }
}

export const explorerNodeManager = new ExplorerNodeManager();
