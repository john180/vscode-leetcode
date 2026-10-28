import { strict as assert } from "node:assert";
import { beforeEach, test } from "node:test";
import Module = require("node:module");

const calls: unknown[] = [];
let metadata: any;
const node: any = { id: "42", slug: "trapping-rain-water" };
const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean): unknown {
    if (request === "vscode") { return { l10n: { t: (text: string) => text }, window: {} }; }
    if (request === "../api/question") { throw new Error("Favoriting must not fetch the full problem detail"); }
    if (request === "../api/favorite") { return {
        setFavorite: async (_request: unknown, target: unknown, favorite: boolean, hash?: string) => { calls.push({ target, favorite, hash }); },
    }; }
    if (request === "../api/favoriteLists") { return { fetchFavoriteLists: async () => [] }; }
    if (request === "../api/request") { return { getLeetCodeRequest: () => ({ origin: "https://leetcode.com" }) }; }
    if (request === "../api/problems") { return {
        getProblemBySlug: async (slug: string) => { calls.push(`metadata ${slug}`); return metadata; },
        getProblemCacheScope: () => "account-a",
        updateCachedFavorite: async (id: string, favorite: boolean) => { calls.push({ cached: id, favorite }); },
    }; }
    if (request === "../codelens/CustomCodeLensProvider") { return { customCodeLensProvider: { refresh: () => undefined } }; }
    if (request === "../explorer/LeetCodeTreeDataProvider") { return { leetCodeTreeDataProvider: { refresh: async () => { calls.push("refresh"); } } }; }
    if (request === "../utils/settingUtils") { return { hasStarShortcut: () => false }; }
    if (request === "../utils/uiUtils") { return {
        DialogType: { error: "error" },
        promptForOpenOutputChannel: async (_message: string, _type: unknown, error?: Error) => { calls.push(`error: ${error?.message}`); },
    }; }
    return originalLoad.call(this, request, parent, isMain);
};
const { addFavorite, removeFavorite } = require("../../src/commands/star");
moduleLoader._load = originalLoad;

beforeEach(() => {
    calls.length = 0;
    metadata = { id: "42", slug: "trapping-rain-water", questionId: "42-internal" };
});

test("favoriting takes the internal question id from the problem's cached metadata", async () => {
    await addFavorite(node);
    await removeFavorite(node);
    assert.deepEqual(calls, [
        "metadata trapping-rain-water",
        { target: { slug: "trapping-rain-water", questionId: "42-internal" }, favorite: true, hash: undefined },
        { cached: "42", favorite: true },
        "refresh",
        "metadata trapping-rain-water",
        { target: { slug: "trapping-rain-water", questionId: "42-internal" }, favorite: false, hash: undefined },
        { cached: "42", favorite: false },
        "refresh",
    ]);
});

test("favoriting a problem LeetCode does not know reports it instead of sending a mutation", async () => {
    metadata = undefined;
    await addFavorite(node);
    assert.deepEqual(calls, ["metadata trapping-rain-water", "error: Problem not found: trapping-rain-water"]);
});
