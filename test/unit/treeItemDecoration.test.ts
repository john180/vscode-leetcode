import { strict as assert } from "node:assert";
import { beforeEach, test } from "node:test";
import Module = require("node:module");

let colorize = true;

class ThemeColor { constructor(public readonly id: string) { } }

const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: { filename?: string }, isMain: boolean): unknown {
    if (parent?.filename?.endsWith("LeetCodeTreeItemDecorationProvider.js") && request === "vscode") {
        return { ThemeColor, workspace: { getConfiguration: () => ({ get: () => colorize }) } };
    }
    return originalLoad.call(this, request, parent, isMain);
};
const { leetCodeTreeItemDecorationProvider } = require("../../src/explorer/LeetCodeTreeItemDecorationProvider");
moduleLoader._load = originalLoad;

/** The parts of a list node's URI the provider reads. */
function uri(authority: string, difficulty: string, scheme: string = "leetcode"): unknown {
    return { scheme, authority, query: `difficulty=${difficulty}` };
}

beforeEach(() => { colorize = true; });

test("problems get a colored difficulty badge", () => {
    const decoration = leetCodeTreeItemDecorationProvider.provideFileDecoration(uri("problems", "Medium"));
    assert.equal(decoration.badge, "M");
    assert.equal(decoration.color.id, "charts.yellow");
});

test("categories, unknown difficulties and other files get no decoration instead of an empty one", () => {
    assert.equal(leetCodeTreeItemDecorationProvider.provideFileDecoration(uri("tree-node", "")), undefined);
    assert.equal(leetCodeTreeItemDecorationProvider.provideFileDecoration(uri("tree-node", "undefined")), undefined);
    assert.equal(leetCodeTreeItemDecorationProvider.provideFileDecoration(uri("problems", "")), undefined);
    assert.equal(leetCodeTreeItemDecorationProvider.provideFileDecoration(uri("problems", "Easy", "file")), undefined);
});

test("badges can be turned off", () => {
    colorize = false;
    assert.equal(leetCodeTreeItemDecorationProvider.provideFileDecoration(uri("problems", "Hard")), undefined);
});
