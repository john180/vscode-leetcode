import { strict as assert } from "node:assert";
import { beforeEach, test } from "node:test";
import Module = require("node:module");

const disposable = { dispose: () => undefined };
const executed: unknown[][] = [];
const shown: boolean[] = [];
const copied: string[] = [];
const diagnostics: Array<[unknown, string | undefined]> = [];

const dependencies: Record<string, unknown> = {
    "vscode": {
        commands: { executeCommand: async (...args: unknown[]) => { executed.push(args); } },
        env: { clipboard: { writeText: async (text: string) => { copied.push(text); } } },
        l10n: { t: (text: string, ...args: unknown[]) => text.replace(/\{(\d+)\}/g, (_: string, index: string) => String(args[+index])) },
        window: {
            withProgress: (_options: unknown, task: () => Promise<unknown>) => task(),
            setStatusBarMessage: () => disposable,
        },
        workspace: { onDidChangeConfiguration: () => disposable },
    },
    "../leetCodeChannel": { leetCodeChannel: { appendLine: () => undefined } },
    "../utils/compileDiagnostics": { compileDiagnostics: { update: (document: unknown, error?: string) => diagnostics.push([document, error]) } },
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

const document = { uri: "file:///1.two-sum.cpp" };

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

/** The panel's command links, decoded. */
function links(html: string): Array<{ label: string; args: unknown[] }> {
    return [...html.matchAll(/<a href="command:leetcode\.resultAction\?([^"]+)">([^<]+)<\/a>/g)]
        .map((match) => ({ label: match[2], args: JSON.parse(decodeURIComponent(match[1].replace(/&#(\d+);/g, (_: string, code: string) => String.fromCharCode(+code)))) }));
}

const wrongAnswer = {
    state: "SUCCESS", statusMessage: "Wrong Answer", totalCorrect: 3, totalTestcases: 5,
    lastTestcase: "[2,7]\n9", codeOutput: "[1,2,3]", expectedOutput: "[1,4,3]", paramNames: ["nums", "target"],
    submissionUrl: "https://leetcode.com/submissions/detail/7/",
};

beforeEach(() => { executed.length = 0; shown.length = 0; copied.length = 0; diagnostics.length = 0; });

test("a result shown before the panel opens is revealed without taking focus", () => {
    leetCodeSubmissionProvider.show(wrongAnswer, { id: "1", name: "Two Sum" });
    assert.deepEqual(executed, [["leetCodeResult.focus", { preserveFocus: true }]]);

    const { view, dispose } = createView();
    const html: string = view.webview.html;
    assert.equal(view.description, "1. Two Sum");
    assert.match(html, /<header class="status fail">.*<h2>Wrong Answer<\/h2>/);
    assert.match(html, /Passed<\/span> 3 \/ 5/);
    assert.match(html, /<summary>✗ Last Testcase<\/summary>/);
    assert.match(html, /nums = \[2,7\]\ntarget = 9/, "inputs are labelled with the parameters");
    assert.match(html, /\[1,<mark class="removed">2<\/mark>,3\]/);
    assert.match(html, /\[1,<mark class="inserted">4<\/mark>,3\]/);
    assert.match(html, /href="https:\/\/leetcode\.com\/submissions\/detail\/7\/"/);
    assert.doesNotMatch(html, /<script|script-src/);
    assert.equal(view.webview.options.enableScripts, undefined);
    assert.deepEqual(view.webview.options.enableCommandUris, ["leetcode.resultAction"]);
    dispose();
});

test("an open panel is brought forward for each new result", () => {
    const { view } = createView();
    leetCodeSubmissionProvider.show({ state: "SUCCESS", statusMessage: "Accepted", runtime: "52 ms" }, { id: "2", name: "Add Two Numbers" });
    assert.deepEqual(shown, [true]);
    assert.equal(executed.length, 0);
    assert.match(view.webview.html, /<header class="status ok">/);
    assert.match(view.webview.html, /Runtime<\/span> 52 ms/);
    assert.equal(view.description, "2. Add Two Numbers");
});

test("output and inputs are escaped", () => {
    const { view } = createView();
    leetCodeSubmissionProvider.show({ state: "SUCCESS", statusMessage: "<b>x</b>", lastTestcase: "<img src=x>", codeOutput: "```\n<script>" });
    assert.doesNotMatch(view.webview.html, /<b>x<\/b>|<img src=x>|<script>/);
    assert.match(view.webview.html, /&#60;img src=x&#62;/);
});

test("a result shows how much of the field it beats and what the code printed", () => {
    const { view } = createView();
    leetCodeSubmissionProvider.show({
        state: "SUCCESS", statusMessage: "Accepted", runtime: "3 ms", runtimePercentile: 91.234, memory: "8.0 MB", stdout: "debug",
    }, { id: "1", name: "Two Sum" });
    assert.match(view.webview.html, /Runtime<\/span> 3 ms <span class="beats">beats 91\.23%<\/span>/);
    assert.match(view.webview.html, /Memory<\/span> 8\.0 MB<\/li>/);
    assert.match(view.webview.html, /Stdout<\/span>.*<pre>debug<\/pre>/s);
});

test("each test case gets a card, and an accepted test run offers to submit", async () => {
    const { view } = createView();
    leetCodeSubmissionProvider.show({
        state: "SUCCESS", statusMessage: "Accepted", paramNames: ["n"],
        cases: [{ input: "1", output: "1", expected: "1", passed: true }, { input: "2", output: "2", expected: "2", passed: true }],
    }, { id: "1", name: "Two Sum" }, document);
    const html: string = view.webview.html;
    assert.equal(html.match(/<details class="case pass" open>/g)?.length, 2);
    assert.match(html, /Case 2/);
    assert.match(html, /n = 2/);

    const submit = links(html).find((link) => link.label === "Submit")!;
    await leetCodeSubmissionProvider.runAction(...submit.args);
    assert.deepEqual(executed.at(-1), ["leetcode.submitSolution", document.uri]);
});

test("many passing cases collapse while failing ones stay open", () => {
    const { view } = createView();
    const passing = { input: "1", output: "1", expected: "1", passed: true };
    leetCodeSubmissionProvider.show({
        state: "SUCCESS", statusMessage: "Wrong Answer",
        cases: [passing, passing, passing, { input: "4", output: "5", expected: "4", passed: false }],
    });
    assert.equal(view.webview.html.match(/<details class="case pass">/g)?.length, 3);
    assert.match(view.webview.html, /<details class="case fail" open>/);
});

test("links copy the raw text and test with the failing input; stale links do nothing", async () => {
    const { view } = createView();
    leetCodeSubmissionProvider.show(wrongAnswer, { id: "1", name: "Two Sum" }, document);
    const rendered = links(view.webview.html);
    const copyInput = rendered.find((link) => link.label === "Copy")!;
    await leetCodeSubmissionProvider.runAction(...copyInput.args);
    assert.deepEqual(copied, ["[2,7]\n9"]);

    const testWith = rendered.find((link) => link.label === "Test with this input")!;
    await leetCodeSubmissionProvider.runAction(...testWith.args);
    assert.deepEqual(executed.at(-1), ["leetcode.testSolution", document.uri, "[2,7]\n9"]);

    leetCodeSubmissionProvider.show({ state: "SUCCESS", statusMessage: "Accepted" });
    executed.length = 0;
    await leetCodeSubmissionProvider.runAction(...testWith.args);
    assert.deepEqual(executed, []);
});

test("long text starts collapsed", () => {
    const { view } = createView();
    leetCodeSubmissionProvider.show({ state: "SUCCESS", statusMessage: "Runtime Error", runtimeError: Array.from({ length: 40 }, (_, i) => `frame ${i}`).join("\n") });
    assert.match(view.webview.html, /<details class="field"><summary class="label">Runtime Error · 40 lines<\/summary>/);
});

test("the panel shows the judge working until the result arrives, and reports compile errors to the file", async () => {
    const { view } = createView();
    let settle: (result: unknown) => void = () => undefined;
    const judged = leetCodeSubmissionProvider.judge({ id: "3", name: "Longest Substring" }, document, () => new Promise((resolve) => { settle = resolve; }));
    assert.match(view.webview.html, /Judging\.\.\./);
    assert.equal(view.description, "3. Longest Substring");
    assert.deepEqual(diagnostics, [[document, undefined]], "old diagnostics clear when a run starts");

    settle({ state: "SUCCESS", statusMessage: "Compile Error", compileError: "Line 3: Char 1: error: x" });
    await judged;
    assert.match(view.webview.html, /<h2>Compile Error<\/h2>/);
    assert.doesNotMatch(view.webview.html, /Judging/);
    assert.deepEqual(diagnostics.at(-1), [document, "Line 3: Char 1: error: x"]);
});

test("an older run that settles late does not replace a newer one", async () => {
    const { view } = createView();
    let settleOld: (result: unknown) => void = () => undefined;
    const old = leetCodeSubmissionProvider.judge({ id: "1", name: "Two Sum" }, document, () => new Promise((resolve) => { settleOld = resolve; }));
    await leetCodeSubmissionProvider.judge({ id: "2", name: "Add Two Numbers" }, document, async () => ({ state: "SUCCESS", statusMessage: "Accepted" }));

    settleOld({ state: "SUCCESS", statusMessage: "Wrong Answer" });
    assert.equal((await old).statusMessage, "Wrong Answer");
    assert.match(view.webview.html, /<h2>Accepted<\/h2>/);
    assert.equal(view.description, "2. Add Two Numbers");
});

test("a failed run leaves the panel saying so and rethrows", async () => {
    const { view } = createView();
    await assert.rejects(
        leetCodeSubmissionProvider.judge({ id: "1", name: "Two Sum" }, document, async () => { throw new Error("offline"); }),
        /offline/,
    );
    assert.match(view.webview.html, /Failed to get the judge result/);
    assert.doesNotMatch(view.webview.html, /Judging/);
});
