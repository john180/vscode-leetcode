import { strict as assert } from "node:assert";
import { beforeEach, test } from "node:test";
import Module = require("node:module");

let premium = false;

class ThemeColor { constructor(public readonly id: string) { } }
class ThemeIcon { constructor(public readonly id: string, public readonly color?: ThemeColor) { } }

const dependencies: Record<string, unknown> = {
    "vscode": {
        EventEmitter: class { public event = (): void => undefined; public fire(): void { /* nothing listens */ } },
        ThemeColor,
        ThemeIcon,
        TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
    },
    "../api/problemCache": { problemCache: { events: { on: () => undefined, off: () => undefined } } },
    "../api/problems": { getProblemCacheScope: () => "scope" },
    "../globalState": { globalState: { getUserStatus: () => ({ isPremium: premium }) } },
    "../leetCodeManager": { leetCodeManager: {} },
    "../shared": { ProblemState: { AC: 1, NotAC: 2, Unknown: 3 }, UserStatus: {} },
    "./explorerNodeManager": { explorerNodeManager: { getSearch: () => undefined } },
    "./LeetCodeNode": { LeetCodeNode: class { } },
    "./problemSearch": { highlightRanges: () => [] },
};
const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: { filename?: string }, isMain: boolean): unknown {
    if (parent?.filename?.endsWith("LeetCodeTreeDataProvider.js") && request in dependencies) {
        return dependencies[request];
    }
    return originalLoad.call(this, request, parent, isMain);
};
const { leetCodeTreeDataProvider } = require("../../src/explorer/LeetCodeTreeDataProvider");
moduleLoader._load = originalLoad;

function problem(state: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { isProblem: true, id: "1", name: "Two Sum", treeId: "all.1", state, locked: false, isFavorite: false, ...extra };
}

function icon(item: { iconPath?: ThemeIcon }): string | undefined {
    return item.iconPath && [item.iconPath.id, item.iconPath.color?.id].filter(Boolean).join(" ");
}

beforeEach(() => { premium = false; });

test("problems are labelled like LeetCode and show their state with theme icons", () => {
    const solved = leetCodeTreeDataProvider.getTreeItem(problem(1));
    assert.equal(solved.label, "1. Two Sum");
    assert.equal(icon(solved), "pass-filled testing.iconPassed");
    assert.equal(icon(leetCodeTreeDataProvider.getTreeItem(problem(2))), "circle-large-outline charts.yellow");
    assert.equal(icon(leetCodeTreeDataProvider.getTreeItem(problem(3))), "blank", "unsolved problems stay aligned");
});

test("locked problems show a lock unless the user has Premium", () => {
    assert.equal(icon(leetCodeTreeDataProvider.getTreeItem(problem(3, { locked: true }))), "lock");
    premium = true;
    const unlocked = leetCodeTreeDataProvider.getTreeItem(problem(3, { locked: true }));
    assert.equal(icon(unlocked), "blank");
    assert.equal(unlocked.label, "1. Two Sum  🔓");
});

test("categories have no icon", () => {
    const category = leetCodeTreeDataProvider.getTreeItem({ isProblem: false, id: "All", name: "All", treeId: "All" });
    assert.equal(category.label, "All");
    assert.equal(category.iconPath, undefined);
});
