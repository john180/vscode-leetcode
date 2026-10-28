import { strict as assert } from "node:assert";
import { test } from "node:test";
import Module = require("node:module");

const contexts = new Map<string, unknown>();
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
            commands: { executeCommand: async (_command: string, key: string, value: unknown) => contexts.set(key, value) },
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

const { isProblemDocument, registerProblemDocumentContext } = require("../../src/utils/problemDocumentContext");
moduleLoader._load = originalLoad;

function document(text: string, scheme: string = "file"): any {
    return { uri: { scheme, toString: () => `${scheme}:///solution.py` }, lineCount: 4, getText: () => text };
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
