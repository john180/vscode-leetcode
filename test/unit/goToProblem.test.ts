import { strict as assert } from "node:assert";
import { beforeEach, test } from "node:test";
import Module = require("node:module");

const disposable = { dispose: () => undefined };
const executed: unknown[][] = [];
const searches: unknown[] = [];
const warnings: string[] = [];
let user: string | undefined = "user";
let premium = false;
let signInPrompts = 0;
let search = async (text: string): Promise<{ problems: any[] }> => ({ problems: [problem("15", "3Sum"), problem(text, `Problem ${text}`)] });
let picker: any;

function problem(id: string, name: string, extra: Record<string, unknown> = {}): any {
    return { id, name, slug: name.toLowerCase().replace(/ /g, "-"), difficulty: "Easy", passRate: "50.0 %", state: 3, locked: false, ...extra };
}

class FakeNode { constructor(public readonly data: unknown) { } }

function createPicker(): any {
    const handlers: Record<string, (event?: any) => unknown> = {};
    const on = (name: string) => (handler: (event?: any) => unknown) => { handlers[name] = handler; return disposable; };
    const box: any = {
        value: "", items: [], activeItems: [], busy: false, visible: false, disposed: false,
        onDidChangeValue: on("change"), onDidAccept: on("accept"), onDidTriggerItemButton: on("button"), onDidHide: on("hide"),
        show: () => { box.visible = true; },
        hide: () => { box.visible = false; handlers.hide(); },
        dispose: () => { box.disposed = true; },
        type: (value: string) => { box.value = value; handlers.change(); },
        accept: () => handlers.accept(),
        press: (item: unknown) => handlers.button({ item, button: item }),
    };
    return box;
}

const dependencies: Record<string, unknown> = {
    "vscode": {
        commands: { executeCommand: async (...args: unknown[]) => { executed.push(args); } },
        l10n: { t: (text: string) => text },
        ThemeIcon: class { constructor(public readonly id: string) { } },
        window: { createQuickPick: () => { picker = createPicker(); return picker; } },
    },
    "../api/problems": {
        getProblemPage: async (query: { search: string }, force: boolean, persist: boolean) => {
            searches.push([query, force, persist]);
            return search(query.search);
        },
    },
    "../explorer/LeetCodeNode": { LeetCodeNode: FakeNode },
    "../globalState": { globalState: { getUserStatus: () => ({ isPremium: premium }) } },
    "../leetCodeChannel": { leetCodeChannel: { warn: (text: string) => warnings.push(text) } },
    "../leetCodeManager": { leetCodeManager: { getUser: () => user } },
    "../shared": { ProblemState: { AC: 1, NotAC: 2 } },
    "../utils/uiUtils": { promptForSignIn: async () => { signInPrompts += 1; } },
};
const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: { filename?: string }, isMain: boolean): unknown {
    if (parent?.filename?.endsWith("goToProblem.js") && request in dependencies) {
        return dependencies[request];
    }
    return originalLoad.call(this, request, parent, isMain);
};
const { goToProblem, rankProblems }: typeof import("../../src/commands/goToProblem") = require("../../src/commands/goToProblem");
moduleLoader._load = originalLoad;

beforeEach(() => {
    executed.length = 0; searches.length = 0; warnings.length = 0;
    user = "user"; premium = false; signInPrompts = 0; picker = undefined;
    search = async (text: string) => ({ problems: [problem("15", "3Sum"), problem(text, `Problem ${text}`)] });
});

test("an exact id comes first, then an exact title or slug, then LeetCode's order", () => {
    const problems = [problem("1", "Two Sum"), problem("167", "Two Sum II"), problem("2", "two")];
    assert.deepEqual(rankProblems(problems, "two").map((item) => item.id), ["2", "1", "167"]);
    assert.deepEqual(rankProblems(problems, " 167 ").map((item) => item.id), ["167", "1", "2"]);
    assert.deepEqual(rankProblems(problems, "two-sum").map((item) => item.id), ["1", "167", "2"]);
    assert.deepEqual(rankProblems(problems, "sum").map((item) => item.id), ["1", "167", "2"]);
});

test("Enter right after typing searches what was typed and shows the best match's description", async () => {
    await goToProblem();
    assert.equal(picker.visible, true);
    picker.type("42");
    await picker.accept();
    assert.deepEqual(searches, [[{ search: "42", limit: 20 }, false, false]], "one search, kept out of the disk cache");
    assert.deepEqual(picker.items.map((item: any) => item.label), ["42. Problem 42", "15. 3Sum"]);
    assert.ok(picker.items.every((item: any) => item.alwaysShow), "LeetCode's matches are not filtered again by the label");
    assert.deepEqual(executed, [["leetcode.previewProblem", problem("42", "Problem 42")]]);
    assert.equal(picker.disposed, true);
});

test("a row's button starts coding, and rows show the state and lock of a problem", async () => {
    search = async () => ({ problems: [problem("1", "Two Sum", { state: 1 }), problem("2", "Add", { state: 2 }), problem("3", "Paid", { locked: true })] });
    await goToProblem();
    picker.type("a");
    // The list follows the typing once it pauses.
    await new Promise((resolve) => setTimeout(resolve, 350));
    const [solved, attempted, paid] = picker.items;
    assert.equal(solved.label, "$(pass-filled) 1. Two Sum");
    assert.equal(attempted.label, "$(circle-large-outline) 2. Add");
    assert.equal(paid.label, "$(lock) 3. Paid");
    assert.equal(solved.description, "Easy · 50.0 %");
    assert.equal(paid.buttons.length, 0, "a locked problem cannot be coded without Premium");

    picker.press(solved);
    assert.equal(executed.length, 1);
    assert.equal(executed[0][0], "leetcode.showProblem");
    assert.ok(executed[0][1] instanceof FakeNode);
    assert.equal(picker.visible, false);
});

test("Enter without a result, or on a failed search, does nothing", async () => {
    await goToProblem();
    picker.type("   ");
    await picker.accept();
    assert.deepEqual(searches, [], "a blank box asks nothing");
    assert.deepEqual(executed, []);

    search = async () => { throw new Error("offline"); };
    picker.type("two");
    await picker.accept();
    assert.match(picker.items[0].label, /Search failed/);
    assert.equal(picker.items[0].value, undefined);
    assert.deepEqual(executed, []);
    assert.equal(warnings.length, 1);
    picker.hide();
});

test("a slow search that answers after newer typing is ignored, and opens nothing", async () => {
    let release!: () => void;
    search = async (text: string) => {
        if (text === "slow") { await new Promise<void>((resolve) => { release = resolve; }); }
        return { problems: [problem(text === "slow" ? "8" : "9", `Result for ${text}`)] };
    };
    await goToProblem();
    picker.type("slow");
    const slow = picker.accept();
    picker.type("fast");
    await picker.accept();
    release();
    await slow;
    assert.deepEqual(picker.items.map((item: any) => item.label), ["9. Result for fast"]);
    assert.deepEqual(executed.map(([command, target]: any[]) => [command, target.id]), [["leetcode.previewProblem", "9"]]);
});

test("signed out, it asks to sign in instead", async () => {
    user = undefined;
    await goToProblem();
    assert.equal(signInPrompts, 1);
    assert.equal(picker, undefined);
});
