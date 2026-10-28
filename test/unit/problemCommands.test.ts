import { strict as assert } from "node:assert";
import { test, beforeEach } from "node:test";
import Module = require("node:module");

const resolved: string[] = [];
const actions: unknown[] = [];
const judged: unknown[] = [];
const pickedInputs: string[] = [];
let failLookup = false;
const problem = { id: "42", slug: "trapping-rain-water", name: "Trapping Rain Water" };
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
    if (request === "../leetCodeManager") { return { leetCodeManager: { getStatus: () => 1, getUser: () => "user" } }; }
    if (request === "../api/problems") { return {
        getProblemCacheScope: () => "account-a",
        getProblemById: async (id: string) => { resolved.push(id); if (failLookup) { throw new Error("offline"); } return problem; },
        recordSubmission: async (target: unknown, accepted: boolean) => actions.push({ target, accepted }),
    }; }
    if (request === "../api/request") { return { getLeetCodeRequest: () => ({ origin: "https://leetcode.com" }) }; }
    if (request === "../api/question") { return {
        fetchQuestionDetail: async () => ({ questionId: "123", sampleTestCase: "[1,2]" }),
        getParamNames: () => ["nums"],
    }; }
    if (request === "../api/submission") { return {
        testSolution: async (_request: unknown, target: unknown, _language: string, _code: string, input: string) => {
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
    if (request === "../utils/uiUtils") { return { DialogType: {}, promptForOpenOutputChannel: async () => actions.push("error") }; }
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

beforeEach(() => { actions.length = 0; resolved.length = 0; judged.length = 0; pickedInputs.length = 0; failLookup = false; });

test("testing resolves only the current problem and submits its internal question id", async () => {
    await testSolution();
    assert.deepEqual(resolved, ["42"]);
    assert.deepEqual(actions, [{ slug: problem.slug, questionId: "123" }]);
    assert.deepEqual(pickedInputs, ["picker", "[1,2]"]);
    assert.deepEqual(judged, [{ paramNames: ["nums"] }]);
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

test("lookup failures are handled by each command", async () => {
    failLookup = true;
    await testSolution(); await submitSolution(); await showSubmissionHistory();
    assert.deepEqual(actions, ["error", "error", "error"]);
});
