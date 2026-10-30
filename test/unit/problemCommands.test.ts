import { strict as assert } from "node:assert";
import { test, beforeEach } from "node:test";
import { CanceledError } from "axios";
import Module = require("node:module");

const resolved: string[] = [];
const actions: unknown[] = [];
const judged: unknown[] = [];
const pickedInputs: string[] = [];
let failLookup = false;
let cancelTest = false;
let status = 1;
let session = new AbortController();
let origin = "https://leetcode.com";
let metadata = async (): Promise<any> => ({ questionId: "123", sampleTestCase: "[1,2]", exampleTestcases: "[1,2]\n[3,4]" });
const problem ={ id: "42", slug: "trapping-rain-water", name: "Trapping Rain Water" };
const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean): unknown {
    if (request === "./list") { throw new Error("Commands must not load the question bank"); }
    if (request === "vscode") { return {
        l10n: { t: (text: string) => text },
        window: {
            showErrorMessage: (text: string) => actions.push(text),
            showQuickPick: async (items: any[]) => { pickedInputs.push("picker"); return items[0]?.value === ":default" ? items[0] : undefined; },
            showInformationMessage: () => undefined,
        },
    }; }
    if (request === "../shared") { return { UserStatus: { SignedOut: 2 } }; }
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
        fetchSubmissionHistory: async (_request: unknown, slug: string) => { actions.push(slug); return { items: [], hasNext: false }; },
    }; }
    if (request === "../utils/problemUtils") { return { getNodeIdFromText: () => "42", getNodeIdFromFile: async () => "42", getLanguageFromText: () => "python3" }; }
    if (request === "../utils/workspaceUtils") { return {
        getActiveDocument: async () => ({ getText: () => "code", uri: { fsPath: "42.py" } }), getActiveFilePath: async () => "42.py",
    }; }
    if (request === "../utils/uiUtils") { return {
        DialogType: {},
        promptForOpenOutputChannel: async (_message: string, _type: unknown, error?: Error) => actions.push(`error: ${error?.message}`),
        promptForSignIn: async () => actions.push("sign in"),
    }; }
    if (request === "../explorer/explorerNodeManager") { return { explorerNodeManager: { getNodeById: () => undefined } }; }
    if (request === "../explorer/LeetCodeTreeDataProvider") { return { leetCodeTreeDataProvider: { refresh: async (force = false) => actions.push({ refresh: force }) } }; }
    if (request === "../webview/leetCodeSubmissionProvider") { return { leetCodeSubmissionProvider: {
        judge: async (_problem: unknown, _document: unknown, judge: () => Promise<unknown>) => { const result = await judge(); judged.push(result); return result; },
    } }; }
    if (request === "../globalState") { return { globalState: { getTestCase: () => undefined, saveTestCase: async () => undefined } }; }
    return originalLoad.call(this, request, parent, isMain);
};
const { testSolution } = require("../../src/commands/test");
const { submitSolution } = require("../../src/commands/submit");
const { showSubmissionHistory } = require("../../src/commands/submissions");
moduleLoader._load = originalLoad;

beforeEach(() => {
    actions.length = 0; resolved.length = 0; judged.length = 0; pickedInputs.length = 0; failLookup = false; cancelTest = false; status = 1;
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
