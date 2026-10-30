import { strict as assert } from "node:assert";
import { test, beforeEach } from "node:test";
import { CanceledError } from "axios";
import Module = require("node:module");

const resolved: string[] = [];
const actions: unknown[] = [];
const judged: unknown[] = [];
const pickedInputs: string[] = [];
const offered: string[][] = [];
const opened: unknown[] = [];
let pick = ":default";
let savedCases: string | undefined;
let solutionFile: unknown = "file:///42.trapping-rain-water.py";
let failLookup = false;
let cancelTest = false;
let status = 1;
let session = new AbortController();
let origin = "https://leetcode.com";
let metadata = async (): Promise<any> => ({ questionId: "123", sampleTestCase: "[1,2]", exampleTestcases: "[1,2]\n[3,4]" });
let history: unknown[] = [];
const quickPicks: any[] = [];
/** How the user answers the submission picker; by default Enter on the first submission. */
let respond = (quickPick: any, listeners: Record<string, (event?: unknown) => void>): void => {
    quickPick.selectedItems = [quickPick.items[0]];
    listeners.accept();
};
const problem ={ id: "42", slug: "trapping-rain-water", name: "Trapping Rain Water" };
const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean): unknown {
    if (request === "./list") { throw new Error("Commands must not load the question bank"); }
    if (request === "vscode") { return {
        l10n: { t: (text: string) => text },
        ProgressLocation: { Window: 10 },
        ThemeIcon: class { constructor(public readonly id: string) { } },
        window: {
            showErrorMessage: (text: string) => actions.push(text),
            showQuickPick: async (items: any[]) => {
                pickedInputs.push("picker");
                offered.push(items.map((item) => item.value));
                return items.find((item) => item.value === pick);
            },
            showInformationMessage: () => undefined,
            withProgress: (_options: unknown, task: () => Promise<unknown>) => task(),
            createQuickPick: () => {
                const listeners: Record<string, (event?: unknown) => void> = {};
                const quickPick: any = {
                    items: [], selectedItems: [],
                    onDidAccept: (listener: () => void) => { listeners.accept = listener; },
                    onDidTriggerItemButton: (listener: (event?: unknown) => void) => { listeners.button = listener; },
                    onDidHide: (listener: () => void) => { listeners.hide = listener; },
                    hide: () => listeners.hide(),
                    dispose: () => undefined,
                    show: () => { quickPicks.push(quickPick); respond(quickPick, listeners); },
                };
                return quickPick;
            },
        },
    }; }
    if (request === "../shared") { return { UserStatus: { SignedOut: 2 }, currentSite: () => ({ host: "leetcode.com" }) }; }
    if (request === "../leetCodeManager") { return { leetCodeManager: { getStatus: () => status, getUser: () => status === 1 ? "user" : undefined } }; }
    if (request === "../api/problems") { return {
        getProblemCacheScope: () => "account-a",
        getProblemById: async (id: string) => { resolved.push(id); if (failLookup) { throw new Error("offline"); } return problem; },
        recordSubmission: async (target: unknown, accepted: boolean) => actions.push({ target, accepted }),
    }; }
    if (request === "../api/request") { return { getLeetCodeRequest: () => ({ origin, sessionSignal: session.signal }) }; }
    if (request === "../api/question") { return {
        fetchJudgeInfo: () => metadata(),
        getParamNames: () => ["nums"],
    }; }
    if (request === "../api/submission") { return {
        testSolution: async (_request: unknown, target: unknown, _language: string, _code: string, input: string) => {
            if (cancelTest) { throw new CanceledError(); }
            actions.push(target);
            pickedInputs.push(input);
            return {};
        },
        submitSolution: async (_request: unknown, target: unknown) => { actions.push(target); return { state: "SUCCESS", statusMessage: "Accepted" }; },
    }; }
    if (request === "../api/submissionHistory") { return {
        fetchSubmissionHistory: async (_request: unknown, slug: string) => { actions.push(slug); return { items: history, hasNext: false }; },
        formatSubmissionDate: () => "",
        formatSubmissionLabel: (item: { status: string }) => item.status,
        getLanguageSlug: (lang: string) => lang.toLowerCase(),
    }; }
    if (request === "../submissionDocument") { return {
        compareSubmission: async (target: unknown) => actions.push({ compare: target }),
        showSubmission: async (target: unknown) => actions.push({ show: target }),
        parseSubmissionUri: () => undefined,
    }; }
    if (request === "../utils/problemUtils") { return {
        getNodeIdFromText: () => "42", getNodeIdFromFile: async () => "42", getLanguageFromText: () => "python3",
        genFileExt: (language: string) => { if (language !== "python3") { throw new Error(`unsupported ${language}`); } return "py"; },
    }; }
    if (request === "../utils/workspaceUtils") { return {
        getActiveDocument: async (uri?: unknown) => { opened.push(uri); return { getText: () => "code", uri: { fsPath: "42.py" } }; },
        getActiveFilePath: async () => "42.py",
    }; }
    if (request === "../utils/problemDocumentContext") { return { getProblemFile: (id: string) => id === "42" ? solutionFile : undefined }; }
    if (request === "../testCaseDocument") { return {
        getSavedTestCases: async () => savedCases,
        openTestCases: async (target: unknown) => actions.push({ editor: target }),
        parseTestCaseUri: (uri?: { scheme?: string }) => uri?.scheme === "leetcode-testcase" ? { id: "42", slug: problem.slug } : undefined,
        rememberJudgeInfo: () => undefined,
    }; }
    if (request === "../utils/uiUtils") { return {
        DialogType: {},
        promptForOpenOutputChannel: async (_message: string, _type: unknown, error?: Error) => actions.push(`error: ${error?.message}`),
        promptForSignIn: async () => actions.push("sign in"),
        openUrl: async (url: string) => actions.push({ url }),
    }; }
    if (request === "../explorer/explorerNodeManager") { return { explorerNodeManager: { getNodeById: () => undefined } }; }
    if (request === "../explorer/LeetCodeTreeDataProvider") { return { leetCodeTreeDataProvider: { refresh: async (force = false) => actions.push({ refresh: force }) } }; }
    if (request === "../webview/leetCodeSubmissionProvider") { return { leetCodeSubmissionProvider: {
        judge: async (_problem: unknown, _document: unknown, judge: () => Promise<unknown>) => { const result = await judge(); judged.push(result); return result; },
    } }; }
    return originalLoad.call(this, request, parent, isMain);
};
const { rerunTest, testSolution } = require("../../src/commands/test");
const { submitSolution } = require("../../src/commands/submit");
const { showSubmissionHistory } = require("../../src/commands/submissions");
moduleLoader._load = originalLoad;

beforeEach(() => {
    actions.length = 0; resolved.length = 0; judged.length = 0; pickedInputs.length = 0; failLookup = false; cancelTest = false; status = 1;
    offered.length = 0; opened.length = 0; pick = ":default"; savedCases = undefined; solutionFile = "file:///42.trapping-rain-water.py";
    history = []; quickPicks.length = 0;
    respond = (quickPick, listeners) => { quickPick.selectedItems = [quickPick.items[0]]; listeners.accept(); };
    session = new AbortController(); origin = "https://leetcode.com";
    metadata = async () => ({ questionId: "123", sampleTestCase: "[1,2]", exampleTestcases: "[1,2]\n[3,4]" });
});

test("testing resolves only the current problem and submits its internal question id", async () => {
    await testSolution();
    assert.deepEqual(resolved, ["42"]);
    assert.deepEqual(actions, [{ slug: problem.slug, questionId: "123" }]);
    assert.deepEqual(pickedInputs, ["picker", "[1,2]\n[3,4]"], "the default cases are all of the examples");
    assert.deepEqual(judged, [{ paramNames: ["nums"] }]);
});

test("a test run that a newer run aborted reports nothing", async () => {
    cancelTest = true;
    await testSolution(undefined, "[3,4]");
    assert.deepEqual(actions, []);
});

test("testing with a given input skips the test case picker", async () => {
    await testSolution(undefined, "[3,4]");
    assert.deepEqual(pickedInputs, ["[3,4]"]);
});

test("the picker offers the user's own test cases first, so Enter tests them again", async () => {
    await testSolution();
    assert.deepEqual(offered, [[":default", ":edit", ":file"]]);
    savedCases = "[5,6]\r\n";
    pick = ":saved";
    await testSolution();
    assert.deepEqual(offered[1], [":saved", ":default", ":edit", ":file"]);
    assert.equal(pickedInputs.at(-1), "[5,6]", "the editor's trailing line break is not sent");
});

test("editing test cases opens their editor and tests nothing yet", async () => {
    pick = ":edit";
    await testSolution();
    assert.deepEqual(actions, [{ editor: problem }]);
    assert.deepEqual(judged, []);
});

test("quick test uses the user's test cases, or the examples, without asking", async () => {
    await rerunTest();
    savedCases = "[5,6]";
    await rerunTest();
    assert.deepEqual(pickedInputs, ["[1,2]\n[3,4]", "[5,6]"]);
});

test("testing from a test case editor tests its problem's solution file with its cases", async () => {
    savedCases = "[7,8]";
    await testSolution({ scheme: "leetcode-testcase" });
    assert.deepEqual(opened, [solutionFile]);
    assert.deepEqual(pickedInputs, ["[7,8]"]);

    solutionFile = undefined;
    await rerunTest({ scheme: "leetcode-testcase" });
    assert.equal(actions.at(-1), "Open the solution file of problem {0} to test these cases.");
    assert.equal(opened.length, 1, "nothing is tested without the solution file");
});

test("submission resolves one problem and updates local state without force refreshing", async () => {
    await submitSolution();
    assert.deepEqual(resolved, ["42"]);
    assert.deepEqual(actions, [{ slug: problem.slug, questionId: "123" }, { target: problem, accepted: true }, { refresh: false }]);
    assert.deepEqual(judged, [{ state: "SUCCESS", statusMessage: "Accepted", paramNames: ["nums"] }]);
});

test("history resolves only the active file's problem", async () => {
    await showSubmissionHistory();
    assert.deepEqual(resolved, ["42"]);
    assert.deepEqual(actions, [problem.slug]);
});

test("choosing a submission shows its code, and the buttons of its row compare it or open it on LeetCode", async () => {
    history = [
        { id: "7", status: "Accepted", lang: "Python3", timestamp: "", runtime: "", memory: "" },
        { id: "8", status: "Wrong Answer", lang: "mysql", timestamp: "", runtime: "", memory: "" },
    ];
    const submission = (id: string, ext: string) => ({ host: "leetcode.com", problemId: "42", slug: problem.slug, submissionId: id, ext });
    await showSubmissionHistory();
    assert.deepEqual(actions.at(-1), { show: submission("7", "py") });
    assert.deepEqual(quickPicks[0].items[0].buttons.map((button: { tooltip: string }) => button.tooltip), ["Compare with your solution", "View the submission on LeetCode"]);

    respond = (quickPick, listeners) => listeners.button({ item: quickPick.items[1], button: quickPick.items[1].buttons[0] });
    await showSubmissionHistory();
    assert.deepEqual(actions.at(-1), { compare: submission("8", "txt") }, "a language without solution files is shown as plain text");

    respond = (quickPick, listeners) => listeners.button({ item: quickPick.items[0], button: quickPick.items[0].buttons[1] });
    await showSubmissionHistory();
    assert.deepEqual(actions.at(-1), { url: "https://leetcode.com/submissions/detail/7/" });
});

test("a submission offers no comparison before its problem's solution file is known, and dismissing the picker does nothing", async () => {
    history = [{ id: "7", status: "Accepted", lang: "python3", timestamp: "", runtime: "", memory: "" }];
    solutionFile = undefined;
    respond = (_quickPick, listeners) => listeners.hide();
    await showSubmissionHistory();
    assert.deepEqual(quickPicks[0].items[0].buttons.map((button: { tooltip: string }) => button.tooltip), ["View the submission on LeetCode"]);
    assert.deepEqual(actions, [problem.slug]);
});

test("lookup failures are handled by each command and logged for the output channel", async () => {
    failLookup = true;
    await testSolution(); await submitSolution(); await showSubmissionHistory();
    assert.deepEqual(actions, ["error: offline", "error: offline", "error: offline"]);
});

test("testing and submitting while signed out ask the user to sign in", async () => {
    status = 2;
    await testSolution(); await submitSolution();
    assert.deepEqual(actions, ["sign in", "sign in"]);
    assert.deepEqual(resolved, []);
});

for (const operation of ["test", "submit"]) {
    test(`${operation} cannot send code after its session changes during metadata loading`, async () => {
        let entered!: () => void;
        let release!: (value: any) => void;
        const ready = new Promise<void>((resolve) => { entered = resolve; });
        metadata = () => { entered(); return new Promise((resolve) => { release = resolve; }); };
        const running = operation === "test" ? testSolution(undefined, "[1,2]") : submitSolution();
        await ready;
        session.abort();
        session = new AbortController();
        origin = "https://leetcode.cn";
        status = operation === "submit" ? 2 : 1;
        release({ questionId: "old-site-id" });
        await running;
        assert.deepEqual(actions, [], "no write request or error prompt is produced for a revoked session");
    });
}
