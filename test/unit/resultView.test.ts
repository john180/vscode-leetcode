import { strict as assert } from "node:assert";
import { beforeEach, test } from "node:test";
import Module = require("node:module");

const disposable = { dispose: () => undefined };
const executed: unknown[][] = [];
const shown: boolean[] = [];

const dependencies: Record<string, unknown> = {
    "vscode": {
        commands: { executeCommand: async (...args: unknown[]) => { executed.push(args); } },
        l10n: { t: (text: string) => text },
        workspace: { onDidChangeConfiguration: () => disposable },
    },
    "../leetCodeChannel": { leetCodeChannel: { appendLine: () => undefined } },
    "../utils/uiUtils": { openKeybindingsEditor: async () => undefined, promptHintMessage: async () => undefined },
    "./markdownEngine": { markdownEngine: { localResourceRoots: [], getStyles: () => "", render: (text: string) => text } },
};
const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: { filename?: string }, isMain: boolean): unknown {
    if (parent?.filename?.endsWith("leetCodeSubmissionProvider.js") && request in dependencies) {
        return dependencies[request];
    }
    return originalLoad.call(this, request, parent, isMain);
};
const { leetCodeSubmissionProvider } = require("../../src/webview/leetCodeSubmissionProvider");
moduleLoader._load = originalLoad;

function createView(): { view: any; dispose: () => void } {
    let dispose: () => void = () => undefined;
    const view: any = {
        description: undefined,
        webview: { cspSource: "vscode-resource:", options: {}, html: "" },
        onDidDispose: (listener: () => void) => { dispose = listener; return disposable; },
        show: (preserveFocus: boolean) => shown.push(preserveFocus),
    };
    leetCodeSubmissionProvider.resolveWebviewView(view);
    return { view, dispose: () => dispose() };
}

const wrongAnswer = { state: "SUCCESS", statusMessage: "Wrong Answer", totalCorrect: 3, totalTestcases: 5, codeOutput: "[1]", expectedOutput: "[2]" };

beforeEach(() => { executed.length = 0; shown.length = 0; });

test("a result shown before the panel opens is revealed without taking focus", () => {
    leetCodeSubmissionProvider.show(wrongAnswer, { id: "1", name: "Two Sum" });
    assert.deepEqual(executed, [["leetCodeResult.focus", { preserveFocus: true }]]);

    const { view, dispose } = createView();
    assert.equal(view.description, "1. Two Sum");
    assert.match(view.webview.html, /## Wrong Answer/);
    assert.match(view.webview.html, /Passed: 3 \/ 5/);
    assert.match(view.webview.html, /```diff\n-\[2\]\n\+\[1\]/);
    assert.doesNotMatch(view.webview.html, /<script|script-src/);
    assert.equal(view.webview.options.enableScripts, undefined);
    dispose();
});

test("an open panel is brought forward for each new result", () => {
    const { view } = createView();
    leetCodeSubmissionProvider.show({ state: "SUCCESS", statusMessage: "Accepted", runtime: "52 ms" }, { id: "2", name: "Add Two Numbers" });
    assert.deepEqual(shown, [true]);
    assert.equal(executed.length, 0);
    assert.match(view.webview.html, /## Accepted/);
    assert.match(view.webview.html, /Runtime: 52 ms/);
    assert.equal(view.description, "2. Add Two Numbers");
});
