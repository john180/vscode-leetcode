import { strict as assert } from "node:assert";
import { test } from "node:test";
import Module = require("node:module");

const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean): unknown {
    if (request === "vscode") {
        return { l10n: { t: (text: string) => text } };
    }
    return originalLoad.call(this, request, parent, isMain);
};
const { describeFilter, isFiltering, matchesFilter, normalizeFilter, problemFilterStore }: typeof import("../../src/explorer/problemFilter")
    = require("../../src/explorer/problemFilter");
moduleLoader._load = originalLoad;

function problem(difficulty: string, state: number, locked: boolean = false): any {
    return { id: "1", slug: "two-sum", name: "Two Sum", difficulty, state, locked, isFavorite: false, passRate: "", companies: [], tags: [] };
}

test("a filter keeps only known values, and a group with every value allows any", () => {
    assert.deepEqual(normalizeFilter(undefined), { difficulties: [], statuses: [] });
    assert.deepEqual(normalizeFilter({ difficulties: ["Hard", "Impossible", "Easy"], statuses: ["SOLVED"], premium: "free" }),
        { difficulties: ["Easy", "Hard"], statuses: ["SOLVED"], premium: "free" });
    assert.deepEqual(normalizeFilter({ difficulties: ["Easy", "Medium", "Hard"], statuses: ["TO_DO", "ATTEMPTED", "SOLVED"] }), { difficulties: [], statuses: [] });
    assert.deepEqual(normalizeFilter({ difficulties: "Easy" as any, premium: "gold" as any }), { difficulties: [], statuses: [] }, "stored values of the wrong shape are dropped");
    assert.equal(isFiltering(normalizeFilter({ premium: "premium" })), true);
    assert.equal(isFiltering(normalizeFilter({})), false);
});

test("a problem matches when every group allows it", () => {
    const filter = normalizeFilter({ difficulties: ["Medium"], statuses: ["TO_DO", "ATTEMPTED"], premium: "free" });
    assert.equal(matchesFilter(problem("Medium", 3), filter), true);
    assert.equal(matchesFilter(problem("Medium", 2), filter), true, "attempted");
    assert.equal(matchesFilter(problem("Medium", 1), filter), false, "solved");
    assert.equal(matchesFilter(problem("Easy", 3), filter), false);
    assert.equal(matchesFilter(problem("Medium", 3, true), filter), false, "premium");
    assert.equal(matchesFilter(problem("Hard", 1, true), normalizeFilter({ premium: "premium" })), true);
    assert.equal(matchesFilter(problem("Hard", 1, true), normalizeFilter({})), true);
});

test("a filter is described in the order of its groups", () => {
    assert.equal(describeFilter(normalizeFilter({ difficulties: ["Hard", "Medium"], statuses: ["TO_DO"], premium: "free" })), "Medium, Hard, To Do, Free");
    assert.equal(describeFilter(normalizeFilter({ statuses: ["SOLVED", "ATTEMPTED"] })), "Attempted, Solved");
    assert.equal(describeFilter(normalizeFilter({})), undefined);
});

test("the filter is stored only while it filters, and reads back the same", async () => {
    const stored = new Map<string, unknown>();
    problemFilterStore.initialize({ get: (key: string) => stored.get(key), update: async (key: string, value: unknown) => { stored.set(key, value); } } as any);
    await problemFilterStore.save({ difficulties: ["Easy"], statuses: [], premium: "premium" });
    assert.deepEqual(problemFilterStore.get(), { difficulties: ["Easy"], statuses: [], premium: "premium" });
    await problemFilterStore.save({ difficulties: ["Easy", "Medium", "Hard"], statuses: [] });
    assert.deepEqual([...stored.values()], [undefined], "no filter leaves nothing behind");
    assert.deepEqual(problemFilterStore.get(), { difficulties: [], statuses: [] });
});
