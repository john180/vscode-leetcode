// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import { Disposable, l10n } from "vscode";
import * as list from "../commands/list";
import { getSortingStrategy } from "../commands/plugin";
import { getLeetCodeRequest } from "../api/request";
import { fetchDailyChallenge } from "../api/dailyChallenge";
import { fetchFavoriteData, IFavoriteList } from "../api/favoriteLists";
import { Category, defaultProblem, IProblem, ProblemState, SortingStrategy } from "../shared";
import { shouldHideSolvedProblem } from "../utils/settingUtils";
import { LeetCodeNode } from "./LeetCodeNode";

class ExplorerNodeManager implements Disposable {
    private explorerNodeMap: Map<string, LeetCodeNode> = new Map<string, LeetCodeNode>();
    private companySet: Set<string> = new Set<string>();
    private tagSet: Set<string> = new Set<string>();
    private dailyProblem: IProblem | undefined;
    private favoriteLists: IFavoriteList[] = [];
    private hot100List: IFavoriteList | undefined;

    public async refreshCache(forceRefresh: boolean = false): Promise<void> {
        this.dispose();
        const dailyPromise: Promise<IProblem | undefined> = fetchDailyChallenge(getLeetCodeRequest(), forceRefresh)
            .catch((): IProblem | undefined => undefined);
        const favoritePromise = fetchFavoriteData(getLeetCodeRequest(), forceRefresh)
            .catch(() => ({ lists: [] as IFavoriteList[], hot100: undefined }));
        const shouldHideSolved: boolean = shouldHideSolvedProblem();
        for (const problem of await list.listProblems(forceRefresh)) {
            if (shouldHideSolved && problem.state === ProblemState.AC) {
                continue;
            }
            this.explorerNodeMap.set(problem.id, new LeetCodeNode(problem));
            for (const company of problem.companies) {
                this.companySet.add(company);
            }
            for (const tag of problem.tags) {
                this.tagSet.add(tag);
            }
        }
        this.dailyProblem = await dailyPromise;
        const favoriteData = await favoritePromise;
        this.favoriteLists = favoriteData.lists;
        this.hot100List = favoriteData.hot100;
    }

    public getRootNodes(): LeetCodeNode[] {
        const roots: LeetCodeNode[] = [];
        if (this.dailyProblem) {
            roots.push(new LeetCodeNode(Object.assign({}, defaultProblem, {
                id: Category.Daily,
                name: l10n.t("Daily Challenge"),
            }), false));
        }
        if (this.hot100List) {
            roots.push(new LeetCodeNode(Object.assign({}, defaultProblem, {
                id: Category.Hot100,
                name: l10n.t("Hot 100"),
            }), false));
        }
        roots.push(
            new LeetCodeNode(Object.assign({}, defaultProblem, {
                id: Category.All,
                name: l10n.t("All"),
            }), false),
            new LeetCodeNode(Object.assign({}, defaultProblem, {
                id: Category.Difficulty,
                name: l10n.t("Difficulty"),
            }), false),
            new LeetCodeNode(Object.assign({}, defaultProblem, {
                id: Category.Tag,
                name: l10n.t("Tag"),
            }), false),
            new LeetCodeNode(Object.assign({}, defaultProblem, {
                id: Category.Company,
                name: l10n.t("Company"),
            }), false),
            new LeetCodeNode(Object.assign({}, defaultProblem, {
                id: Category.Favorite,
                name: l10n.t("Favorite"),
            }), false),
        );
        return roots;
    }

    public getAllNodes(): LeetCodeNode[] {
        return this.applySortingStrategy(
            Array.from(this.explorerNodeMap.values()),
        );
    }

    public getAllDifficultyNodes(): LeetCodeNode[] {
        const res: LeetCodeNode[] = [];
        res.push(
            new LeetCodeNode(Object.assign({}, defaultProblem, {
                id: `${Category.Difficulty}.Easy`,
                name: l10n.t("Easy"),
            }), false),
            new LeetCodeNode(Object.assign({}, defaultProblem, {
                id: `${Category.Difficulty}.Medium`,
                name: l10n.t("Medium"),
            }), false),
            new LeetCodeNode(Object.assign({}, defaultProblem, {
                id: `${Category.Difficulty}.Hard`,
                name: l10n.t("Hard"),
            }), false),
        );
        this.sortSubCategoryNodes(res, Category.Difficulty);
        return res;
    }

    public getAllCompanyNodes(): LeetCodeNode[] {
        const res: LeetCodeNode[] = [];
        for (const company of this.companySet.values()) {
            res.push(new LeetCodeNode(Object.assign({}, defaultProblem, {
                id: `${Category.Company}.${company}`,
                name: /^[a-z0-9-]+$/i.test(company) ? _.startCase(company) : company,
            }), false));
        }
        this.sortSubCategoryNodes(res, Category.Company);
        return res;
    }

    public getAllTagNodes(): LeetCodeNode[] {
        const res: LeetCodeNode[] = [];
        for (const tag of this.tagSet.values()) {
            res.push(new LeetCodeNode(Object.assign({}, defaultProblem, {
                id: `${Category.Tag}.${tag}`,
                name: _.startCase(tag),
            }), false));
        }
        this.sortSubCategoryNodes(res, Category.Tag);
        return res;
    }

    public getNodeById(id: string): LeetCodeNode | undefined {
        return this.explorerNodeMap.get(id);
    }

    public getFavoriteNodes(): LeetCodeNode[] {
        const res: LeetCodeNode[] = [];
        for (const node of this.explorerNodeMap.values()) {
            if (node.isFavorite) {
                res.push(node);
            }
        }
        return this.applySortingStrategy(res);
    }

    public getFavoriteListNodes(): LeetCodeNode[] {
        if (this.favoriteLists.length === 0) {
            return this.getFavoriteNodes();
        }
        return this.favoriteLists.map((list: IFavoriteList) => new LeetCodeNode(Object.assign({}, defaultProblem, {
            id: `${Category.Favorite}.${list.idHash}`,
            name: list.name === "Favorite" ? l10n.t("Favorite") : list.name,
        }), false));
    }

    public getFavoriteQuestionNodes(listId: string): LeetCodeNode[] {
        const list: IFavoriteList | undefined = this.favoriteLists.find(
            (item: IFavoriteList) => item.idHash === listId,
        );
        return list ? this.toQuestionNodes(list) : [];
    }

    public getHot100Nodes(): LeetCodeNode[] {
        return this.hot100List ? this.toQuestionNodes(this.hot100List) : [];
    }

    private toQuestionNodes(list: IFavoriteList): LeetCodeNode[] {
        return list.questions.map((question) => new LeetCodeNode(Object.assign({}, defaultProblem, {
            id: question.id || question.titleSlug,
            name: question.title || question.titleSlug,
            slug: question.titleSlug,
            state: ProblemState.Unknown,
        }), true));
    }

    public getChildrenNodesById(id: string): LeetCodeNode[] {
        if (id === Category.Daily) {
            return this.dailyProblem ? [new LeetCodeNode(this.dailyProblem)] : [];
        }
        if (id === Category.Hot100) {
            return this.getHot100Nodes();
        }
        if (id.startsWith(`${Category.Favorite}.`)) {
            return this.getFavoriteQuestionNodes(id.slice(`${Category.Favorite}.`.length));
        }
        // The sub-category node's id is named as {Category.SubName}
        const metaInfo: string[] = id.split(".");
        const res: LeetCodeNode[] = [];
        for (const node of this.explorerNodeMap.values()) {
            switch (metaInfo[0]) {
                case Category.Company:
                    if (node.companies.indexOf(metaInfo[1]) >= 0) {
                        res.push(node);
                    }
                    break;
                case Category.Difficulty:
                    if (node.difficulty === metaInfo[1]) {
                        res.push(node);
                    }
                    break;
                case Category.Tag:
                    if (node.tags.indexOf(metaInfo[1]) >= 0) {
                        res.push(node);
                    }
                    break;
                default:
                    break;
            }
        }
        return this.applySortingStrategy(res);
    }

    public dispose(): void {
        this.explorerNodeMap.clear();
        this.companySet.clear();
        this.tagSet.clear();
        this.dailyProblem = undefined;
        this.favoriteLists = [];
        this.hot100List = undefined;
    }

    private sortSubCategoryNodes(subCategoryNodes: LeetCodeNode[], category: Category): void {
        switch (category) {
            case Category.Difficulty:
                subCategoryNodes.sort((a: LeetCodeNode, b: LeetCodeNode): number => {
                    function getValue(input: LeetCodeNode): number {
                        const difficulty: string = input.id.split(".")[1] || "";
                        switch (difficulty.toLowerCase()) {
                            case "easy":
                                return 1;
                            case "medium":
                                return 2;
                            case "hard":
                                return 3;
                            default:
                                return Number.MAX_SAFE_INTEGER;
                        }
                    }
                    return getValue(a) - getValue(b);
                });
                break;
            case Category.Tag:
            case Category.Company:
                subCategoryNodes.sort((a: LeetCodeNode, b: LeetCodeNode): number => {
                    if (a.name === "Unknown") {
                        return 1;
                    } else if (b.name === "Unknown") {
                        return -1;
                    } else {
                        return Number(a.name > b.name) - Number(a.name < b.name);
                    }
                });
                break;
            default:
                break;
        }
    }

    private applySortingStrategy(nodes: LeetCodeNode[]): LeetCodeNode[] {
        const strategy: SortingStrategy = getSortingStrategy();
        switch (strategy) {
            case SortingStrategy.AcceptanceRateAsc: return nodes.sort((x: LeetCodeNode, y: LeetCodeNode) => Number(x.acceptanceRate) - Number(y.acceptanceRate));
            case SortingStrategy.AcceptanceRateDesc: return nodes.sort((x: LeetCodeNode, y: LeetCodeNode) => Number(y.acceptanceRate) - Number(x.acceptanceRate));
            default: return nodes;
        }
    }
}

export const explorerNodeManager: ExplorerNodeManager = new ExplorerNodeManager();
