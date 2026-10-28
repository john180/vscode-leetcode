import { strict as assert } from "node:assert";
import { beforeEach, test } from "node:test";
import Module = require("node:module");
import { parseProblemSearch } from "../../src/explorer/problemSearch";

interface IFakeNode { id: string; name: string; slug: string; isProblem: boolean; treeId: string; parentId?: string; }

const disposable = { dispose: () => undefined };
const requested: string[] = [];
const searches: string[] = [];
const revealed: Array<[string, unknown]> = [];
const status: Array<[string | undefined, string | undefined]> = [];
const children = new Map<string, IFakeNode[]>();
const totals: Record<string, number> = {};
let loaded: IFakeNode | undefined;
let input: any;

function problem(parentId: string, id: string, name: string): IFakeNode {
    return { id, name, slug: name.toLowerCase().replace(/ /g, "-"), isProblem: true, treeId: `${parentId}/${id}`, parentId };
}

function category(id: string): IFakeNode {
    return { id, name: id, slug: "", isProblem: false, treeId: id };
}

const manager = {
    search: undefined as ReturnType<typeof parseProblemSearch>,
    matches: [] as IFakeNode[],
    getSearch(): ReturnType<typeof parseProblemSearch> { return this.search; },
    async getChildren(id: string): Promise<IFakeNode[]> { requested.push(id); return children.get(id) ?? []; },
    getMatches(): IFakeNode[] { return this.matches; },
    getTotal(id: string): number | undefined { return totals[id]; },
    getCategory(id: string): { id: string; name: string } { return { id, name: id === "All" ? "All problems" : id }; },
    getLoadedProblem(parentId: string, id: string): IFakeNode | undefined {
        return loaded?.parentId === parentId && loaded.id === id ? loaded : undefined;
    },
};
const provider = {
    selection: [] as IFakeNode[],
    lastProblemParentId: undefined as string | undefined,
    search(text: string): boolean {
        const next = parseProblemSearch(text);
        if (next?.text === manager.search?.text) { return false; }
        manager.search = next;
        searches.push(text.trim());
        return true;
    },
    async reveal(node: IFakeNode, options: unknown): Promise<void> { revealed.push([node.treeId, options]); },
    showSearchResult(description?: string, message?: string): void { status.push([description, message]); },
};

function createInput(): any {
    const handlers: Record<string, () => unknown> = {};
    const box: any = {
        value: "", prompt: "", busy: false, disposed: false,
        onDidChangeValue: (handler: () => unknown) => { handlers.change = handler; return disposable; },
        onDidAccept: (handler: () => unknown) => { handlers.accept = handler; return disposable; },
        onDidHide: (handler: () => unknown) => { handlers.hide = handler; return disposable; },
        show: () => undefined,
        dispose: () => { box.disposed = true; },
        type: (value: string) => { box.value = value; handlers.change(); },
        accept: () => handlers.accept(),
        hide: () => handlers.hide(),
    };
    return box;
}

const dependencies: Record<string, unknown> = {
    "vscode": {
        window: { createInputBox: () => { input = createInput(); return input; } },
        l10n: { t: (text: string, ...args: unknown[]) => text.replace(/\{(\d+)\}/g, (_match, index: string) => String(args[Number(index)])) },
    },
    "../explorer/explorerNodeManager": { explorerNodeManager: manager },
    "../explorer/LeetCodeTreeDataProvider": { leetCodeTreeDataProvider: provider },
    "../leetCodeChannel": { leetCodeChannel: { appendLine: () => undefined } },
    "../leetCodeManager": { leetCodeManager: { getUser: () => "user" } },
    "../shared": { Category: { All: "All", Tag: "Tag", Company: "Company" } },
    "../utils/uiUtils": { promptForSignIn: async () => undefined },
};
const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: { filename?: string }, isMain: boolean): unknown {
    if (parent?.filename?.endsWith("search.js") && (request === "vscode" || request.startsWith("."))) {
        return dependencies[request] || {};
    }
    return originalLoad.call(this, request, parent, isMain);
};
const { clearSearch, searchProblem } = require("../../src/commands/search");
moduleLoader._load = originalLoad;

const select = { select: true, focus: false };

beforeEach(() => {
    requested.length = 0; searches.length = 0; revealed.length = 0; status.length = 0;
    children.clear(); for (const key of Object.keys(totals)) { delete totals[key]; }
    manager.search = undefined; manager.matches = []; provider.selection = []; provider.lastProblemParentId = undefined; loaded = undefined;
});

test("Enter applies the typed search at once and selects the exact id without opening it", async () => {
    children.set("All", [problem("All", "15", "3Sum"), problem("All", "1", "Two Sum")]);
    totals.All = 2;
    await searchProblem();
    input.type("1");
    await input.accept();
    assert.deepEqual(searches, ["1"]);
    assert.deepEqual(revealed, [["All/1", { ...select, expand: false }]]);
    assert.deepEqual(status.at(-1), ['"1" · 2 in All problems', undefined]);
    assert.match(input.prompt, /^2 matches in All problems\. /);
    input.hide();
});

test("a search starts in the category browsed last and falls back to All", async () => {
    provider.lastProblemParentId = "Tag.dp";
    children.set("All", [problem("All", "1", "Two Sum")]);
    await searchProblem();
    input.type("two");
    await input.accept();
    assert.deepEqual(requested, ["Tag.dp", "All"]);
    assert.deepEqual(revealed.map(([id]) => id), ["All/1"]);
    input.hide();
});

test("Enter on an applied search moves through the matches and wraps around", async () => {
    const first = problem("All", "1", "Two Sum");
    const second = problem("Difficulty.Easy", "167", "Two Sum II");
    children.set("All", [first]);
    await searchProblem();
    input.type("two");
    await input.accept();
    manager.matches = [first, second];
    provider.selection = [first];
    await input.accept();
    provider.selection = [second];
    await input.accept();
    assert.deepEqual(revealed.map(([id]) => id), ["All/1", "Difficulty.Easy/167", "All/1"]);
    assert.deepEqual(searches, ["two"]);
    input.hide();
});

test("tag: searches only that category, and selects the category itself without a keyword", async () => {
    children.set("Tag", [category("Tag.array")]);
    await searchProblem();
    input.type("tag:array");
    await input.accept();
    assert.deepEqual(revealed, [["Tag.array", { ...select, expand: true }]]);

    input.type("tag:array two");
    await input.accept();
    assert.deepEqual(requested, ["Tag", "Tag.array"], "an empty tag result does not fall back to All");
    assert.deepEqual(status.at(-1), [undefined, 'No problems match "tag:array two".']);
    input.hide();
});

test("Escape keeps the typed search even before the debounce fires", async () => {
    await searchProblem();
    input.type("two");
    input.hide();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(searches, ["two"]);
    assert.equal(input.disposed, true);
});

test("clearing restores the full list and keeps an already loaded selection in view", async () => {
    manager.search = parseProblemSearch("two");
    provider.selection = [problem("All", "1", "Two Sum")];
    loaded = problem("All", "1", "Two Sum");
    assert.equal(await clearSearch(), true);
    assert.deepEqual(searches, [""]);
    assert.deepEqual(revealed, [["All/1", select]]);
    assert.equal(await clearSearch(), false);

    manager.search = parseProblemSearch("two");
    loaded = undefined;
    await searchProblem();
    input.type("");
    await input.accept();
    assert.equal(manager.search, undefined, "emptying the box clears the search");
    assert.equal(revealed.length, 1, "a problem that was never loaded is not revealed");
    input.hide();
});
