import { strict as assert } from "node:assert";
import { test } from "node:test";
import Module = require("node:module");

const contexts = new Map<string, unknown>();
const sent: string[] = [];
const listeners = new Map<string, (value: any) => void>();
const windowMock: any = { activeTextEditor: undefined };
const event = (name: string) => (listener: (value: any) => void) => {
    listeners.set(name, listener);
    return { dispose: () => listeners.delete(name) };
};
windowMock.onDidChangeActiveTextEditor = event("active");
const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean): unknown {
    if (request === "vscode") {
        return {
            Range: class { constructor(..._args: any[]) { /* range is not needed by the fake document */ } },
            commands: { executeCommand: async (_command: string, key: string, value: unknown) => { sent.push(key); contexts.set(key, value); } },
            window: windowMock,
            workspace: {
                textDocuments: [],
                onDidOpenTextDocument: event("open"),
                onDidChangeTextDocument: event("change"),
                onDidDeleteFiles: event("delete"),
            },
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};

const { getProblemFile, isProblemDocument, problemFileEvents, registerProblemDocumentContext } = require("../../src/utils/problemDocumentContext");
moduleLoader._load = originalLoad;

function document(text: string, scheme: string = "file", name: string = "solution.py"): any {
    return { uri: { scheme, toString: () => `${scheme}:///${name}` }, lineCount: 4, getText: () => text };
}

test("only supported local LeetCode documents enable problem menus", () => {
    const header = "# @lc app=leetcode.com id=1 lang=python3";
    assert.equal(isProblemDocument(document(header)), true);
    assert.equal(isProblemDocument(document("print('hello')")), false);
    assert.equal(isProblemDocument(document(header.replace("python3", "unknown"))), false);
    assert.equal(isProblemDocument(document(header, "vscode-vfs")), false);
});

test("menus follow editor changes, header removal and file deletion", () => {
    const context = { subscriptions: [] };
    registerProblemDocumentContext(context);
    assert.equal(contexts.get("leetcode.isProblem"), false);
    const problem = document("# @lc app=leetcode.com id=1 lang=python3");
    windowMock.activeTextEditor = { document: problem };
    listeners.get("open")!(problem);
    assert.equal(contexts.get("leetcode.isProblem"), true);
    assert.deepEqual(contexts.get("leetcode.problemResources"), ["file:///solution.py"]);

    windowMock.activeTextEditor = { document: document("ordinary file") };
    listeners.get("active")!(windowMock.activeTextEditor);
    assert.equal(contexts.get("leetcode.isProblem"), false);
    assert.deepEqual(contexts.get("leetcode.problemResources"), []);

    windowMock.activeTextEditor = undefined;
    listeners.get("open")!(problem);
    listeners.get("delete")!({ files: [problem.uri] });
    assert.deepEqual(contexts.get("leetcode.problemResources"), []);
    for (const disposable of context.subscriptions as any[]) disposable.dispose();
    assert.equal(listeners.size, 0);
});

test("a problem's latest recognized file is found by its id until the file goes away", () => {
    const context = { subscriptions: [] };
    registerProblemDocumentContext(context);
    let changes = 0;
    const changed = (): void => { changes += 1; };
    problemFileEvents.on("changed", changed);
    const python = document("# @lc app=leetcode.com id=1 lang=python3", "file", "1.py");
    const java = document("// @lc app=leetcode.com id=1 lang=java", "file", "1.java");
    assert.equal(getProblemFile("1"), undefined);

    listeners.get("open")!(python);
    listeners.get("open")!(java);
    assert.equal(getProblemFile("1"), java.uri);
    assert.equal(getProblemFile("2"), undefined);
    assert.equal(changes, 2);

    listeners.get("change")!({ document: python });
    assert.equal(getProblemFile("1"), python.uri, "the file edited last wins");
    assert.equal(changes, 2, "edits that keep the header change nothing");

    listeners.get("change")!({ document: document("print('no header')", "file", "1.py") });
    assert.equal(getProblemFile("1"), java.uri);
    listeners.get("delete")!({ files: [java.uri] });
    assert.equal(getProblemFile("1"), undefined);
    assert.equal(changes, 4);

    problemFileEvents.off("changed", changed);
    for (const disposable of context.subscriptions as any[]) disposable.dispose();
});

test("typing sends the context keys only when they change", () => {
    const context = { subscriptions: [] };
    registerProblemDocumentContext(context);
    const problem = document("# @lc app=leetcode.com id=1 lang=python3", "file", "typing.py");
    windowMock.activeTextEditor = { document: problem };
    listeners.get("open")!(problem);
    sent.length = 0;

    for (let keystroke = 0; keystroke < 5; keystroke += 1) {
        listeners.get("change")!({ document: problem });
        listeners.get("change")!({ document: document("output", "output", "LeetCode") });
    }
    assert.deepEqual(sent, []);

    listeners.get("change")!({ document: document("print('header removed')", "file", "typing.py") });
    assert.deepEqual(sent, ["leetcode.problemResources"]);
    windowMock.activeTextEditor = undefined;
    for (const disposable of context.subscriptions as any[]) disposable.dispose();
});
