import { strict as assert } from "node:assert";
import { beforeEach, test } from "node:test";
import Module = require("node:module");

interface IFetch { slug: string; resolve: (detail: unknown) => void; reject: (error: Error) => void; }

const disposable = { dispose: () => undefined };
const executed: unknown[][] = [];
const fetches: IFetch[] = [];
const solutionFetches: IFetch[] = [];
const shown: Array<[string, unknown]> = [];
const lookups: Array<{ id: string; resolve: (problem: unknown) => void }> = [];
let premium = false;
let user: string | undefined = "user";
let currentProblemId: string | undefined;
const vscodeWindow: { activeTextEditor: unknown } = { activeTextEditor: undefined };

class FakeNode {
    constructor(public readonly data: { id: string; slug: string }) { }
    public get id(): string { return this.data.id; }
    public get slug(): string { return this.data.slug; }
}
class FakeUri { }

const providerDependencies: Record<string, unknown> = {
    "vscode": {
        commands: { executeCommand: async (...args: unknown[]) => { executed.push(args); } },
        l10n: { t: (text: string) => text },
        workspace: { onDidChangeConfiguration: () => disposable },
    },
    "../api/problems": { getProblemCacheScope: () => "scope" },
    "../api/question": {
        fetchQuestionDetail: (_request: unknown, slug: string) => new Promise((resolve, reject) => fetches.push({ slug, resolve, reject })),
    },
    "../api/solution": {
        fetchTopSolution: (_request: unknown, slug: string) => new Promise((resolve, reject) => solutionFetches.push({ slug, resolve, reject })),
    },
    "../api/request": { getLeetCodeRequest: () => ({}) },
    "../commands/plugin": { getLeetCodeEndpoint: () => "leetcode-cn" },
    "../explorer/explorerNodeManager": { explorerNodeManager: { getNodeById: () => undefined } },
    "../explorer/LeetCodeNode": { LeetCodeNode: FakeNode },
    "../globalState": { globalState: { getUserStatus: () => ({ isPremium: premium }) } },
    "../leetCodeChannel": { leetCodeChannel: { appendLine: () => undefined } },
    "../shared": { Endpoint: { LeetCode: "leetcode", LeetCodeCN: "leetcode-cn" }, PREMIUM_URL_CN: "cn-premium", PREMIUM_URL_GLOBAL: "global-premium" },
    "../utils/settingUtils": { shouldUseEndpointTranslation: () => true },
    "../utils/uiUtils": {
        openSettingsEditor: async () => undefined,
        openUrl: async (url: string) => { executed.push(["open", url]); },
        promptHintMessage: async () => undefined,
    },
    "./markdownEngine": { markdownEngine: { localResourceRoots: [], getStyles: () => "", render: (text: string) => text } },
};
const showDependencies: Record<string, unknown> = {
    "vscode": { window: vscodeWindow, l10n: { t: (text: string) => text }, Uri: FakeUri },
    "../leetCodeManager": { leetCodeManager: { getUser: () => user } },
    "../leetCodeChannel": { leetCodeChannel: { appendLine: () => undefined } },
    "../utils/settingUtils": { shouldFollowActiveEditor: () => true },
    "../utils/problemDocumentContext": { isProblemDocument: (document: { problem: boolean }) => document.problem },
    "../utils/problemUtils": { getNodeIdFromText: (text: string) => text },
    "../explorer/explorerNodeManager": { explorerNodeManager: { getNodeById: () => undefined } },
    "../explorer/LeetCodeNode": { LeetCodeNode: FakeNode },
    "../api/problems": { getProblemById: (id: string) => new Promise((resolve) => lookups.push({ id, resolve })) },
    "../webview/leetCodePreviewProvider": { leetCodePreviewProvider: {
        get currentProblemId(): string | undefined { return currentProblemId; },
        show: async (problem: { id: string }, options?: unknown) => { shown.push([problem.id, options ?? {}]); },
    } },
};
const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: { filename?: string }, isMain: boolean): unknown {
    if (parent?.filename?.endsWith("leetCodePreviewProvider.js") && request in providerDependencies) {
        return providerDependencies[request];
    }
    if (parent?.filename?.endsWith("show.js") && (request === "vscode" || request.startsWith("."))) {
        return showDependencies[request] || {};
    }
    return originalLoad.call(this, request, parent, isMain);
};
const { leetCodePreviewProvider } = require("../../src/webview/leetCodePreviewProvider");
const { followActiveEditor, previewProblem, showSolution } = require("../../src/commands/show");
moduleLoader._load = originalLoad;

function problem(id: string, slug: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return { id, slug, name: slug, difficulty: "Easy", locked: false, isFavorite: false, state: 3, passRate: "50%", companies: [], tags: [], ...extra };
}

function detail(slug: string, content: string): Record<string, unknown> {
    return { questionId: "1", questionFrontendId: "1", title: slug, titleSlug: slug, difficulty: "Easy", isPaidOnly: false, content, codeSnippets: [], topicTags: [] };
}

function createView(): { view: any; post: (message: unknown) => Promise<void>; dispose: () => void } {
    let receive: (message: unknown) => Promise<void> = async () => undefined;
    let dispose: () => void = () => undefined;
    const view: any = {
        description: undefined,
        webview: {
            cspSource: "vscode-resource:", options: {}, html: "",
            onDidReceiveMessage: (listener: (message: unknown) => Promise<void>, thisArg: unknown) => {
                receive = (message: unknown) => listener.call(thisArg, message);
                return disposable;
            },
        },
        onDidDispose: (listener: () => void) => { dispose = listener; return disposable; },
        show: () => undefined,
    };
    leetCodePreviewProvider.resolveWebviewView(view);
    return { view, post: (message: unknown) => receive(message), dispose: () => dispose() };
}

function editor(text: string, isProblem: boolean = true): { document: { problem: boolean; getText: () => string } } {
    return { document: { problem: isProblem, getText: () => text } };
}

beforeEach(() => {
    executed.length = 0; fetches.length = 0; solutionFetches.length = 0; shown.length = 0; lookups.length = 0;
    premium = false; user = "user"; currentProblemId = undefined; vscodeWindow.activeTextEditor = undefined;
});

test("a problem shown before the view opens is revealed and rendered once the view resolves", async () => {
    await leetCodePreviewProvider.show(problem("1", "two-sum"), {
        detail: detail("two-sum", `<p>Find two numbers</p><img src="https://example.com/a.png" onerror="alert(1)">`),
        reveal: true,
    });
    assert.deepEqual(executed, [["leetCodeDetail.focus", { preserveFocus: true }]]);
    assert.equal(fetches.length, 0, "a caller-provided description is not fetched again");

    const { view, dispose } = createView();
    assert.equal(view.webview.options.enableScripts, true);
    assert.equal(view.description, "1. two-sum");
    assert.match(view.webview.html, /<p>Find two numbers<\/p>/);
    assert.match(view.webview.html, /script-src 'nonce-/);
    assert.doesNotMatch(view.webview.html, /onerror/);
    assert.match(view.webview.html, /data-command="code"/);
    dispose();
});

test("a slower earlier fetch never replaces the latest problem", async () => {
    const { view } = createView();
    const first = leetCodePreviewProvider.show(problem("11", "slow-one"));
    const second = leetCodePreviewProvider.show(problem("12", "fast-two"));
    assert.match(view.webview.html, /Loading the problem description\.\.\./);

    fetches[1].resolve(detail("fast-two", "<p>second</p>"));
    await second;
    fetches[0].resolve(detail("slow-one", "<p>first</p>"));
    await first;
    assert.match(view.webview.html, /<p>second<\/p>/);
    assert.doesNotMatch(view.webview.html, /<p>first<\/p>/);
    assert.equal(view.description, "12. fast-two");
});

test("showing the same problem again reuses its description instead of fetching it", async () => {
    const { view } = createView();
    const loading = leetCodePreviewProvider.show(problem("6", "six"));
    fetches[0].resolve(detail("six", "<p>six</p>"));
    await loading;
    await leetCodePreviewProvider.show(problem("6", "six"));
    assert.equal(fetches.length, 1);
    assert.match(view.webview.html, /<p>six<\/p>/);
});

test("the solution tab loads the top solution once and switches back to the description", async () => {
    const { view, post } = createView();
    await leetCodePreviewProvider.show(problem("7", "seven"), { detail: detail("seven", "<p>description</p>") });
    assert.match(view.webview.html, /aria-selected="true" data-command="description"/);
    assert.equal(solutionFetches.length, 0, "the solution loads only when asked for");

    const opening = post({ command: "solution" });
    assert.equal(solutionFetches.length, 1);
    assert.match(view.webview.html, /aria-selected="true" data-command="solution"/);
    assert.match(view.webview.html, /Loading the solution\.\.\./);
    solutionFetches[0].resolve({ title: "Hash map", content: "Use a hash map." });
    await opening;
    assert.match(view.webview.html, /Use a hash map\./);
    assert.doesNotMatch(view.webview.html, /<p>description<\/p>/);

    await post({ command: "description" });
    assert.match(view.webview.html, /<p>description<\/p>/);
    await post({ command: "solution" });
    assert.equal(solutionFetches.length, 1);
});

test("a failed solution offers a retry, and a new problem opens on its description", async () => {
    const { view, post } = createView();
    const failed = leetCodePreviewProvider.show(problem("8", "eight"), { detail: detail("eight", "<p>8</p>"), tab: "solution" });
    solutionFetches[0].reject(new Error("offline"));
    await failed;
    assert.match(view.webview.html, /data-command="solution">Loading failed\. Click to retry\./);

    const retry = post({ command: "solution" });
    assert.equal(solutionFetches.length, 2);
    assert.match(view.webview.html, /Loading the solution\.\.\./);
    solutionFetches[1].resolve({ title: "", content: "Two pointers." });
    await retry;
    assert.match(view.webview.html, /Two pointers\./);

    await leetCodePreviewProvider.show(problem("9", "nine"), { detail: detail("nine", "<p>9</p>") });
    assert.match(view.webview.html, /<p>9<\/p>/);
    assert.equal(solutionFetches.length, 2);
});

test("locked problems show a premium notice without fetching or coding actions", async () => {
    const { view, post } = createView();
    await leetCodePreviewProvider.show(problem("3", "locked", { locked: true, name: `<img src=x>` }));
    assert.equal(fetches.length, 0);
    assert.match(view.webview.html, /This problem requires a LeetCode Premium subscription\./);
    assert.doesNotMatch(view.webview.html, /data-command="code"/);
    assert.doesNotMatch(view.webview.html, /<img src=x>/);

    await post({ command: "premium" });
    assert.deepEqual(executed, [["open", "cn-premium"]]);
});

test("a failed fetch offers a retry that loads the description again", async () => {
    const { view, post } = createView();
    const failed = leetCodePreviewProvider.show(problem("4", "four"));
    fetches[0].reject(new Error("offline"));
    await failed;
    assert.match(view.webview.html, /data-command="retry"/);

    const retry = post({ command: "retry" });
    assert.equal(fetches.length, 2);
    fetches[1].resolve(detail("four", "<p>back online</p>"));
    await retry;
    assert.match(view.webview.html, /<p>back online<\/p>/);
});

test("actions run LeetCode commands for the shown problem and ignore anything else", async () => {
    const { post } = createView();
    await leetCodePreviewProvider.show(problem("5", "five"), { detail: detail("five", "<p>5</p>") });
    for (const message of [null, "code", {}, { command: "evil" }]) {
        await post(message);
    }
    assert.equal(executed.length, 0);

    await post({ command: "code" });
    await post({ command: "star" });
    await post({ command: "submissions" });
    assert.deepEqual(executed.map(([command]) => command), ["leetcode.showProblem", "leetcode.addFavorite", "leetcode.showSubmissions"]);
    assert.ok(executed.every(([, node]) => node instanceof FakeNode && node.slug === "five"));
});

test("previewing a list item reveals the sidebar description", async () => {
    await previewProblem(problem("42", "trapping-rain-water"));
    assert.deepEqual(shown, [["42", { reveal: true }]]);
});

test("showing the solution opens the solution tab in the sidebar", async () => {
    await showSolution(new FakeNode({ id: "42", slug: "trapping-rain-water" }));
    assert.deepEqual(shown, [["42", { reveal: true, tab: "solution" }]]);
});

test("editor follow shows the active problem file without revealing the sidebar", async () => {
    const active = editor("42");
    vscodeWindow.activeTextEditor = active;
    const follow = followActiveEditor(active);
    lookups[0].resolve(problem("42", "trapping-rain-water"));
    await follow;
    assert.deepEqual(shown, [["42", {}]]);
});

test("editor follow ignores unrelated files, signed-out sessions and the problem already shown", async () => {
    await followActiveEditor(undefined);
    await followActiveEditor(editor("42", false));
    user = undefined;
    await followActiveEditor(editor("42"));
    user = "user";
    currentProblemId = "42";
    await followActiveEditor(editor("42"));
    assert.deepEqual(lookups, []);
    assert.deepEqual(shown, []);
});

test("editor follow drops a lookup that finishes after the user switched editors", async () => {
    const first = editor("42");
    vscodeWindow.activeTextEditor = first;
    const follow = followActiveEditor(first);
    vscodeWindow.activeTextEditor = editor("notes", false);
    lookups[0].resolve(problem("42", "trapping-rain-water"));
    await follow;
    assert.deepEqual(shown, []);
});
