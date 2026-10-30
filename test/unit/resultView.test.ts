import { strict as assert } from "node:assert";
import { beforeEach, test } from "node:test";
import axios from "axios";
import Module = require("node:module");

const disposable = { dispose: () => undefined };
const executed: unknown[][] = [];
const shown: boolean[] = [];
const copied: string[] = [];
const diagnostics: Array<[unknown, string | undefined]> = [];

class FakeNode {
    constructor(public readonly data: { id: string; name: string }) { }
}

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
    "../explorer/LeetCodeNode": { LeetCodeNode: FakeNode },
    "../leetCodeChannel": { leetCodeChannel: { info: () => undefined, warn: () => undefined, error: () => undefined } },
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
function links(html: string): Array<{ label: string; className?: string; args: unknown[] }> {
    return [...html.matchAll(/<a(?: class="([^"]+)")? href="command:leetcode\.resultAction\?([^"]+)">([^<]+)<\/a>/g)].map((match) => ({
        label: match[3],
        className: match[1],
        args: JSON.parse(decodeURIComponent(match[2].replace(/&#(\d+);/g, (_: string, code: string) => String.fromCharCode(+code)))),
    }));
}

/** The buttons of the summary, as "label (class)". */
function buttons(html: string): string[] {
    return links(html).filter((link) => link.className).map((link) => `${link.label} (${link.className})`);
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
    assert.match(html, /<header class="status fail">.*<h2>Wrong Answer<\/h2><p class="note">3 \/ 5 test cases passed<\/p>/);
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

test("whitespace in a difference is drawn, and a side with nothing there gets a bar", () => {
    const { view, dispose } = createView();
    // The expected "[1,2]" lacks the space of "[1, 2]", so only the output has something to mark.
    leetCodeSubmissionProvider.show({ ...wrongAnswer, codeOutput: "[1, 2]", expectedOutput: "[1,2]" }, { id: "1", name: "Two Sum" });
    let html: string = view.webview.html;
    assert.match(html, /\[1,<mark class="removed"><span class="ws"> <\/span><\/mark>2\]/, "the space itself stays, for copying");
    assert.match(html, /\[1,<mark class="inserted gap" title="Your output has more here\."><\/mark>2\]/);

    leetCodeSubmissionProvider.show({ ...wrongAnswer, codeOutput: "a", expectedOutput: "a\n\tb" }, { id: "1", name: "Two Sum" });
    html = view.webview.html;
    assert.match(html, /a<mark class="removed gap" title="The expected answer has more here\."><\/mark>/);
    assert.match(html, /a<mark class="inserted"><span class="ws eol"><\/span>\n<span class="ws tab">\t<\/span>b<\/mark>/);
    dispose();
});

test("an open panel is brought forward for each new result", () => {
    const { view } = createView();
    leetCodeSubmissionProvider.show({ state: "SUCCESS", statusMessage: "Accepted", runtime: "52 ms", runtimePercentile: 50 }, { id: "2", name: "Add Two Numbers" });
    assert.deepEqual(shown, [true]);
    assert.equal(executed.length, 0);
    assert.match(view.webview.html, /<header class="status ok">/);
    assert.match(view.webview.html, /Runtime<\/span><span class="value">52 ms<\/span><span class="beats">Beats 50\.00%<\/span>/);
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
        state: "SUCCESS", statusMessage: "Accepted", runtime: "3 ms", runtimePercentile: 91.234, memory: "8.0 MB", stdout: "debug", language: "C++",
    }, { id: "1", name: "Two Sum" });
    assert.match(view.webview.html, /Runtime<\/span><span class="value">3 ms<\/span><span class="beats">Beats 91\.23% of users with C\+\+<\/span>/);
    assert.match(view.webview.html, /Memory<\/span><span class="value">8\.0 MB<\/span><\/li>/);
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
    assert.match(html, /<p class="note">2 \/ 2 test cases passed<\/p>/);
    assert.deepEqual(buttons(html), ["Submit (button)"]);

    const submit = links(html).find((link) => link.label === "Submit")!;
    await leetCodeSubmissionProvider.runAction(...submit.args);
    assert.deepEqual(executed.at(-1), ["leetcode.submitSolution", document.uri]);
});

test("a failing test run counts its passing cases and offers nothing to submit", () => {
    const { view } = createView();
    leetCodeSubmissionProvider.show({
        state: "SUCCESS", statusMessage: "Wrong Answer", totalCorrect: 9, totalTestcases: 9,
        cases: [{ input: "1", output: "1", expected: "1", passed: true }, { input: "2", output: "3", expected: "2", passed: false }],
    }, { id: "1", name: "Two Sum" }, document);
    assert.match(view.webview.html, /<p class="note">1 \/ 2 test cases passed<\/p>/);
    assert.deepEqual(buttons(view.webview.html), []);
});

test("an accepted submission opens the solution and submissions of its problem", async () => {
    const { view } = createView();
    const problem = { id: "1", name: "Two Sum" };
    leetCodeSubmissionProvider.show({
        state: "SUCCESS", statusMessage: "Accepted", totalCorrect: 63, totalTestcases: 63, submissionUrl: "https://leetcode.com/submissions/detail/8/",
        // The judge sends the failing case's fields empty.
        lastTestcase: "", codeOutput: "", expectedOutput: "",
    }, problem, document);
    const html: string = view.webview.html;
    assert.match(html, /<p class="note">63 \/ 63 test cases passed<\/p>/);
    assert.doesNotMatch(html, /Last Testcase|class="case/, "an accepted submission has no failing case");
    assert.deepEqual(buttons(html), ["View Solution (button secondary)", "Submissions (button secondary)"]);
    assert.match(html, /<div class="actions">.*href="https:\/\/leetcode\.com\/submissions\/detail\/8\/">View the submission on LeetCode<\/a><\/div>/);

    for (const link of links(html).filter((item) => item.className)) {
        await leetCodeSubmissionProvider.runAction(...link.args);
    }
    assert.deepEqual(executed.map(([command]) => command), ["leetcode.showSolution", "leetcode.showSubmissions"]);
    assert.ok(executed.every(([, node]) => node instanceof FakeNode && node.data === problem));
});

test("a failed submission leads with its failing case, and a compile error offers no solution", () => {
    const { view } = createView();
    leetCodeSubmissionProvider.show(wrongAnswer, { id: "1", name: "Two Sum" }, document);
    assert.deepEqual(buttons(view.webview.html), ["Test with this input (button)", "Add to test cases (button secondary)", "View Solution (button secondary)"]);
    assert.equal(links(view.webview.html).filter((link) => link.label === "Test with this input").length, 1);

    leetCodeSubmissionProvider.show({
        state: "SUCCESS", statusMessage: "Compile Error", compileError: "error", submissionUrl: "https://leetcode.com/submissions/detail/9/",
    }, { id: "1", name: "Two Sum" }, document);
    assert.deepEqual(buttons(view.webview.html), []);
    assert.match(view.webview.html, /View the submission on LeetCode/);
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

test("links copy the raw text, test with the failing input or keep it; stale links do nothing", async () => {
    const { view } = createView();
    const problem = { id: "1", slug: "two-sum", name: "Two Sum" };
    leetCodeSubmissionProvider.show(wrongAnswer, problem, document);
    const rendered = links(view.webview.html);
    const copyInput = rendered.find((link) => link.label === "Copy")!;
    await leetCodeSubmissionProvider.runAction(...copyInput.args);
    assert.deepEqual(copied, ["[2,7]\n9"]);

    const testWith = rendered.find((link) => link.label === "Test with this input")!;
    await leetCodeSubmissionProvider.runAction(...testWith.args);
    assert.deepEqual(executed.at(-1), ["leetcode.testSolution", document.uri, "[2,7]\n9"]);

    const keep = rendered.find((link) => link.label === "Add to test cases")!;
    await leetCodeSubmissionProvider.runAction(...keep.args);
    assert.deepEqual(executed.at(-1), ["leetcode.addTestCase", problem, "[2,7]\n9"]);

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

test("a newer run aborts the run it replaces without marking itself failed", async () => {
    const { view } = createView();
    let oldSignal: AbortSignal | undefined;
    let newSignal: AbortSignal | undefined;
    const old = leetCodeSubmissionProvider.judge({ id: "1", name: "Two Sum" }, document, (signal: AbortSignal) => {
        oldSignal = signal;
        return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new axios.CanceledError())));
    });
    const oldRejected = assert.rejects(old, (error: unknown) => axios.isCancel(error));
    await leetCodeSubmissionProvider.judge({ id: "2", name: "Add Two Numbers" }, document, async (signal: AbortSignal) => {
        newSignal = signal;
        return { state: "SUCCESS", statusMessage: "Accepted" };
    });
    await oldRejected;
    assert.equal(oldSignal?.aborted, true);
    assert.equal(newSignal?.aborted, false);
    assert.match(view.webview.html, /<h2>Accepted<\/h2>/);
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
