import { strict as assert } from "node:assert";
import { EventEmitter } from "node:events";
import { beforeEach, test } from "node:test";
import Module = require("node:module");

interface IFetch { slug: string; resolve: (detail: unknown) => void; reject: (error: Error) => void; }

const disposable = { dispose: () => undefined };
const executed: unknown[][] = [];
const fetches: IFetch[] = [];
const solutionFetches: IFetch[] = [];
const shown: Array<[string, unknown]> = [];
const lookups: Array<{ id: string; resolve: (problem: unknown) => void }> = [];
const problemFiles = new Map<string, string>();
const problemFileEvents = new EventEmitter();
let premium = false;
let user: string | undefined = "user";
let currentProblemId: string | undefined;
let scope = "scope";
let useRealProvider = false;
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
        env: { clipboard: { writeText: async (text: string) => { executed.push(["copy", text]); } } },
        l10n: { t: (text: string, ...args: unknown[]) => text.replace(/\{(\d+)\}/g, (_: string, index: string) => String(args[+index])) },
        window: { setStatusBarMessage: () => disposable },
        workspace: { onDidChangeConfiguration: () => disposable },
    },
    "../api/problems": {
        getProblemCacheScope: () => scope,
        getProblemBySlug: async (slug: string) => problem("15", slug),
    },
    "../api/question": {
        fetchQuestionDetail: (_request: unknown, slug: string) => new Promise((resolve, reject) => fetches.push({ slug, resolve, reject })),
        getAcceptanceRate: () => undefined,
        getSimilarQuestions: (value: { similar?: unknown[] }) => value.similar ?? [],
    },
    "../commands/search": { searchFor: async (text: string) => { executed.push(["search", text]); } },
    "../api/solution": {
        fetchTopSolution: (_request: unknown, slug: string) => new Promise((resolve, reject) => solutionFetches.push({ slug, resolve, reject })),
    },
    "../api/request": { getLeetCodeRequest: () => ({}) },
    "../commands/plugin": { getLeetCodeEndpoint: () => "leetcode-cn" },
    "../explorer/explorerNodeManager": { explorerNodeManager: { getNodeById: () => undefined } },
    "../explorer/LeetCodeNode": { LeetCodeNode: FakeNode },
    "../globalState": { globalState: { getUserStatus: () => ({ isPremium: premium }) } },
    "../leetCodeChannel": { leetCodeChannel: { info: () => undefined, warn: () => undefined, error: () => undefined } },
    "../shared": {
        Endpoint: { LeetCode: "leetcode", LeetCodeCN: "leetcode-cn" }, PREMIUM_URL_CN: "cn-premium", PREMIUM_URL_GLOBAL: "global-premium",
        ProblemState: { AC: 1, NotAC: 2 },
    },
    "../utils/problemDocumentContext": { getProblemFile: (id: string) => problemFiles.get(id), problemFileEvents },
    "../utils/settingUtils": { shouldUseEndpointTranslation: () => true },
    "../utils/uiUtils": {
        openSettingsEditor: async () => undefined,
        openUrl: async (url: string) => { executed.push(["open", url]); },
        promptHintMessage: async () => undefined,
    },
    "./markdownEngine": { markdownEngine: { localResourceRoots: [], getStyles: () => "", render: (text: string) => text, renderSolution: (text: string) => text } },
};
const showDependencies: Record<string, unknown> = {
    "vscode": { window: vscodeWindow, l10n: { t: (text: string) => text }, Uri: FakeUri },
    "../leetCodeManager": { leetCodeManager: { getUser: () => user } },
    "../leetCodeChannel": { leetCodeChannel: { info: () => undefined, warn: () => undefined, error: () => undefined } },
    "../utils/settingUtils": { shouldFollowActiveEditor: () => true },
    "../utils/problemDocumentContext": { isProblemDocument: (document: { problem: boolean }) => document.problem },
    "../utils/problemUtils": { getNodeIdFromText: (text: string) => text },
    "../explorer/explorerNodeManager": { explorerNodeManager: { getNodeById: () => undefined } },
    "../explorer/LeetCodeNode": { LeetCodeNode: FakeNode },
    "../api/problems": {
        getProblemCacheScope: () => scope,
        getProblemById: (id: string) => new Promise((resolve) => lookups.push({ id, resolve })),
    },
    "../webview/leetCodePreviewProvider": { leetCodePreviewProvider: {
        get currentProblemId(): string | undefined { return useRealProvider ? leetCodePreviewProvider.currentProblemId : currentProblemId; },
        show: async (problem: { id: string }, options?: unknown) => {
            shown.push([problem.id, options ?? {}]);
            if (useRealProvider) { await leetCodePreviewProvider.show(problem, options); }
        },
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

/** What the view shows: the latest content posted to the page, or the page it was created with. */
function content(view: any): string {
    return view.posted.at(-1)?.html ?? view.webview.html;
}

function createView(): { view: any; post: (message: unknown) => Promise<void>; dispose: () => void } {
    let receive: (message: unknown) => Promise<void> = async () => undefined;
    let dispose: () => void = () => undefined;
    const view: any = {
        description: undefined,
        posted: [] as Array<{ type: string; version: number; page: string; html: string }>,
        webview: {
            cspSource: "vscode-resource:", options: {}, html: "",
            onDidReceiveMessage: (listener: (message: unknown) => Promise<void>, thisArg: unknown) => {
                receive = (message: unknown) => listener.call(thisArg, message);
                return disposable;
            },
            postMessage: async (message: any) => { view.posted.push(message); return true; },
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
    problemFiles.clear();
    premium = false; user = "user"; currentProblemId = undefined; vscodeWindow.activeTextEditor = undefined;
    scope = "scope"; useRealProvider = false;
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
    assert.match(content(view), /<p>Find two numbers<\/p>/);
    assert.match(content(view), /script-src 'nonce-/);
    assert.doesNotMatch(content(view), /onerror/);
    assert.match(content(view), /data-command="code"/);
    dispose();
});

test("a slower earlier fetch never replaces the latest problem", async () => {
    const { view } = createView();
    const first = leetCodePreviewProvider.show(problem("11", "slow-one"));
    const second = leetCodePreviewProvider.show(problem("12", "fast-two"));
    assert.match(content(view), /Loading the problem description\.\.\./);

    fetches[1].resolve(detail("fast-two", "<p>second</p>"));
    await second;
    fetches[0].resolve(detail("slow-one", "<p>first</p>"));
    await first;
    assert.match(content(view), /<p>second<\/p>/);
    assert.doesNotMatch(content(view), /<p>first<\/p>/);
    assert.equal(view.description, "12. fast-two");
});

test("showing the same problem again reuses its description instead of fetching it", async () => {
    const { view } = createView();
    const loading = leetCodePreviewProvider.show(problem("6", "six"));
    fetches[0].resolve(detail("six", "<p>six</p>"));
    await loading;
    await leetCodePreviewProvider.show(problem("6", "six"));
    assert.equal(fetches.length, 1);
    assert.match(content(view), /<p>six<\/p>/);
});

test("the solution tab loads the top solution once and switches back to the description", async () => {
    const { view, post } = createView();
    await leetCodePreviewProvider.show(problem("7", "seven"), { detail: detail("seven", "<p>description</p>") });
    assert.match(content(view), /aria-selected="true" data-command="description"/);
    assert.equal(solutionFetches.length, 0, "the solution loads only when asked for");

    const opening = post({ command: "solution" });
    assert.equal(solutionFetches.length, 1);
    assert.match(content(view), /aria-selected="true" data-command="solution"/);
    assert.match(content(view), /Loading the solution\.\.\./);
    solutionFetches[0].resolve({ title: "Hash map", content: "Use a hash map." });
    await opening;
    assert.match(content(view), /Use a hash map\./);
    assert.doesNotMatch(content(view), /<p>description<\/p>/);

    await post({ command: "description" });
    assert.match(content(view), /<p>description<\/p>/);
    await post({ command: "solution" });
    assert.equal(solutionFetches.length, 1);
});

test("a failed solution offers a retry, and a new problem opens on its description", async () => {
    const { view, post } = createView();
    const failed = leetCodePreviewProvider.show(problem("8", "eight"), { detail: detail("eight", "<p>8</p>"), tab: "solution" });
    solutionFetches[0].reject(new Error("offline"));
    await failed;
    assert.match(content(view), /data-command="solution">Loading failed\. Click to retry\./);

    const retry = post({ command: "solution" });
    assert.equal(solutionFetches.length, 2);
    assert.match(content(view), /Loading the solution\.\.\./);
    solutionFetches[1].resolve({ title: "", content: "Two pointers." });
    await retry;
    assert.match(content(view), /Two pointers\./);

    await leetCodePreviewProvider.show(problem("9", "nine"), { detail: detail("nine", "<p>9</p>") });
    assert.match(content(view), /<p>9<\/p>/);
    assert.equal(solutionFetches.length, 2);
});

test("locked problems show a premium notice without fetching or coding actions", async () => {
    const { view, post } = createView();
    await leetCodePreviewProvider.show(problem("3", "locked", { locked: true, name: `<img src=x>` }));
    assert.equal(fetches.length, 0);
    assert.match(content(view), /This problem requires a LeetCode Premium subscription\./);
    assert.doesNotMatch(content(view), /data-command="code"/);
    assert.doesNotMatch(content(view), /<img src=x>/);

    await post({ command: "premium" });
    assert.deepEqual(executed, [["open", "cn-premium"]]);
});

test("a failed fetch offers a retry that loads the description again", async () => {
    const { view, post } = createView();
    const failed = leetCodePreviewProvider.show(problem("4", "four"));
    fetches[0].reject(new Error("offline"));
    await failed;
    assert.match(content(view), /data-command="retry"/);

    const retry = post({ command: "retry" });
    assert.equal(fetches.length, 2);
    fetches[1].resolve(detail("four", "<p>back online</p>"));
    await retry;
    assert.match(content(view), /<p>back online<\/p>/);
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

test("a problem with a solution file offers Test and Submit for that file instead of Code Now", async () => {
    const { view, post, dispose } = createView();
    await leetCodePreviewProvider.show(problem("35", "thirty-five"), { detail: detail("thirty-five", "<p>35</p>") });
    assert.match(content(view), /data-command="code"/);
    await post({ command: "test" });
    assert.deepEqual(executed, [], "nothing to test without a file");

    problemFiles.set("35", "file:///35.two-sum.py");
    problemFileEvents.emit("changed");
    assert.match(content(view), /data-command="test">Test<\/button><button data-command="submit">Submit</);
    assert.doesNotMatch(content(view), /data-command="code"/);
    await post({ command: "test" });
    await post({ command: "submit" });
    assert.deepEqual(executed, [["leetcode.testSolution", "file:///35.two-sum.py"], ["leetcode.submitSolution", "file:///35.two-sum.py"]]);

    const listeners: number = problemFileEvents.listenerCount("changed");
    dispose();
    assert.equal(problemFileEvents.listenerCount("changed"), listeners - 1);
});

test("previewing a list item reveals the sidebar description", async () => {
    await previewProblem(problem("42", "trapping-rain-water"));
    assert.deepEqual(shown, [["42", { reveal: true, tab: "description" }]]);
});

test("Show Description switches from the solution back to the cached description", async () => {
    useRealProvider = true;
    const { view } = createView();
    const node = problem("20", "twenty");
    const opening = leetCodePreviewProvider.show(node, { detail: detail("twenty", "<p>Description</p>"), tab: "solution" });
    solutionFetches[0].resolve({ title: "", content: "Solution content" });
    await opening;
    await previewProblem(node);
    assert.match(content(view), /aria-selected="true" data-command="description"/);
    assert.match(content(view), /<p>Description<\/p>/);
    assert.doesNotMatch(content(view), /Solution content/);
    assert.equal(fetches.length, 0);
});

for (const changedScope of ["another-account", "another-endpoint"]) {
    test(`editor follow reloads the same problem after switching to ${changedScope}`, async () => {
        useRealProvider = true;
        const { view } = createView();
        await leetCodePreviewProvider.show(problem("21", "twenty-one"), { detail: detail("twenty-one", "<p>Old content</p>") });
        const active = editor("21");
        vscodeWindow.activeTextEditor = active;
        scope = changedScope;
        assert.equal(leetCodePreviewProvider.currentProblemId, undefined);
        const follow = followActiveEditor(active);
        assert.equal(lookups.length, 1);
        lookups[0].resolve(problem("21", "twenty-one", { isFavorite: true }));
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(fetches.length, 1);
        fetches[0].resolve(detail("twenty-one", "<p>New content</p>"));
        await follow;
        assert.match(content(view), /<p>New content<\/p>/);
        assert.doesNotMatch(content(view), /Old content/);
        assert.match(content(view), /data-command="unstar"/);
    });
}

test("clearing the session removes content and drops pending description and solution loads", async () => {
    const { view, post } = createView();
    const opening = leetCodePreviewProvider.show(problem("22", "twenty-two"), { tab: "solution" });
    leetCodePreviewProvider.clear();
    assert.equal(view.description, undefined);
    assert.equal(leetCodePreviewProvider.currentProblemId, undefined);
    await post({ command: "code" });
    assert.deepEqual(executed, []);
    fetches[0].resolve(detail("twenty-two", "<p>Old description</p>"));
    solutionFetches[0].resolve({ title: "", content: "Old solution" });
    await opening;
    assert.match(content(view), /Select a problem in the list above/);
    assert.doesNotMatch(content(view), /Old description|Old solution/);
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

test("updates are posted to the page with increasing versions instead of reloading it", async () => {
    const { view } = createView();
    const page: string = view.webview.html;
    const loading = leetCodePreviewProvider.show(problem("30", "thirty"));
    fetches[0].resolve(detail("thirty", "<p>thirty</p>"));
    await loading;
    assert.equal(view.webview.html, page);
    assert.deepEqual(view.posted.map((message: any) => [message.type, message.page]), [["render", "thirty#description"], ["render", "thirty#description"]]);
    assert.ok(view.posted[1].version > view.posted[0].version);
});

test("the header shows difficulty, solved state and acceptance, and the description lists hints, similar problems and tags", async () => {
    const { view, post } = createView();
    await leetCodePreviewProvider.show(problem("31", "thirty-one", { state: 1, passRate: "48.2 %", isFavorite: true }), {
        detail: {
            ...detail("thirty-one", "<p>31</p>"),
            likes: 12,
            hints: ["Try a <code>map</code>.<script>x</script>"],
            similar: [{ title: "3Sum", translatedTitle: "三数之和", titleSlug: "3sum", difficulty: "Medium" }],
            topicTags: [{ name: "Array", translatedName: "数组", slug: "array" }],
        },
    });
    const html: string = content(view);
    assert.match(html, /<button class="icon starred" data-command="unstar" title="Unstar"/);
    assert.match(html, /<div class="badges"><span class="pill difficulty easy">Easy<\/span><span class="pill solved">✓ Solved<\/span><span>Acceptance 48\.2 %<\/span><\/div>/);
    assert.doesNotMatch(html, /👍|Likes/, "likes are not shown");
    assert.match(html, /<\/header><nav class="tabs" role="tablist">/, "only the tabs stay in view while scrolling");
    assert.match(html, /<summary>Hint 1<\/summary>Try a <code>map<\/code>\./);
    assert.doesNotMatch(html, /<script>x/);
    assert.match(html, /data-command="similar" data-arg="3sum">三数之和<\/button>/);
    assert.match(html, /data-command="tag" data-arg="array"[^>]*>数组<\/button>/);

    await post({ command: "tag", arg: "array" });
    await post({ command: "tag", arg: "bad tag" });
    assert.deepEqual(executed, [["search", "tag:array"]]);
    // The similar problem's description keeps loading; it is shown right away.
    void post({ command: "similar", arg: "3sum" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(view.description, "15. 3sum");
    assert.deepEqual(fetches.map((fetch) => fetch.slug), ["3sum"]);
});

test("a problem without a solution says so instead of offering a retry", async () => {
    const { view } = createView();
    const opening = leetCodePreviewProvider.show(problem("32", "thirty-two"), { detail: detail("thirty-two", "<p>32</p>"), tab: "solution" });
    solutionFetches[0].resolve(undefined);
    await opening;
    assert.match(content(view), /This problem has no solution to show yet\./);
    assert.doesNotMatch(content(view), /Loading failed/);
});

test("solutions drop LeetCode-only markup and link to the site instead", async () => {
    const { view } = createView();
    const opening = leetCodePreviewProvider.show(problem("33", "thirty-three"), { detail: detail("thirty-three", "<p>33</p>"), tab: "solution" });
    solutionFetches[0].resolve({ title: "<b>Approach</b>", content: "[TOC]\n\nIntro\n\n!?!../Documents/1.json:1000,500!?!\n\n<iframe src=\"https://leetcode.com/playground/x/shared\"></iframe>" });
    await opening;
    const html: string = content(view);
    assert.match(html, /<h3>&#60;b&#62;Approach&#60;\/b&#62;<\/h3>/);
    assert.doesNotMatch(html, /\[TOC\]|!\?!|<iframe/);
    assert.match(html, /\[View the slideshow on LeetCode\]\(https:\/\/leetcode\.cn\/problems\/thirty-three\/solutions\/\?source=vscode\)/);
    assert.match(html, /\[View the code on LeetCode\]\(/);
});

test("the page can copy text and asks for content it may have missed while loading", async () => {
    const { view, post } = createView();
    await post({ command: "copy", text: "int x;" });
    await post({ command: "copy", text: 42 });
    assert.deepEqual(executed, [["copy", "int x;"]]);

    await post({ command: "ready" });
    assert.equal(view.posted.length, 0, "nothing changed since the page was created");
    await leetCodePreviewProvider.show(problem("34", "thirty-four"), { detail: detail("thirty-four", "<p>34</p>") });
    const posts: number = view.posted.length;
    await post({ command: "ready" });
    assert.equal(view.posted.length, posts + 1);
    // The view is not retained while hidden, so the page loads again each time it is shown.
    await post({ command: "ready" });
    assert.equal(view.posted.length, posts + 2);
    assert.equal(view.posted.at(-1).html, view.posted.at(-2).html);
});

test("editor follow drops a lookup that finishes after the session changes", async () => {
    const active = editor("42");
    vscodeWindow.activeTextEditor = active;
    const follow = followActiveEditor(active);
    scope = "another-account";
    lookups[0].resolve(problem("42", "trapping-rain-water"));
    await follow;
    assert.deepEqual(shown, []);
});
