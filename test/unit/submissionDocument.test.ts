import { strict as assert } from "node:assert";
import { beforeEach, test } from "node:test";
import Module = require("node:module");

class FakeUri {
    constructor(public readonly scheme: string, public readonly authority: string, public readonly path: string) { }
    public get fsPath(): string { return this.path; }
    public toString(): string { return `${this.scheme}://${this.authority}${this.path}`; }
}

let provider: any;
let host = "leetcode.com";
const fetched: string[] = [];
const shown: unknown[][] = [];
const executed: unknown[][] = [];
const errors: string[] = [];
const files = new Map<string, FakeUri>();

const dependencies: Record<string, unknown> = {
    "vscode": {
        Uri: { from: ({ scheme, authority, path }: { scheme: string; authority: string; path: string }) => new FakeUri(scheme, authority, path) },
        l10n: { t: (text: string, ...args: unknown[]) => text.replace(/\{(\d+)\}/g, (_: string, index: string) => String(args[+index])) },
        commands: { executeCommand: async (...args: unknown[]) => { executed.push(args); } },
        window: {
            showTextDocument: async (...args: unknown[]) => { shown.push(args); },
            showErrorMessage: (text: string) => { errors.push(text); },
        },
        workspace: { registerTextDocumentContentProvider: (_scheme: string, registered: unknown) => { provider = registered; return { dispose: () => undefined }; } },
    },
    "./api/request": { getLeetCodeRequest: () => ({ origin: `https://${host}` }) },
    "./api/submissionHistory": { fetchSubmissionCode: async (_request: unknown, id: string) => { fetched.push(id); return `code ${id}`; } },
    "./shared": { currentSite: () => ({ host }) },
    "./utils/problemDocumentContext": { getProblemFile: (id: string) => files.get(id) },
};
const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: { filename?: string }, isMain: boolean): unknown {
    if (parent?.filename?.endsWith("submissionDocument.js") && request in dependencies) {
        return dependencies[request];
    }
    return originalLoad.call(this, request, parent, isMain);
};
const submissions = require("../../src/submissionDocument");
moduleLoader._load = originalLoad;
submissions.registerSubmissionDocuments({ subscriptions: [] });

function target(submissionId: string, site: string = "leetcode.com") {
    return { host: site, problemId: "1", slug: "two-sum", submissionId, ext: "py" };
}

beforeEach(() => {
    host = "leetcode.com"; fetched.length = 0; shown.length = 0; executed.length = 0; errors.length = 0; files.clear();
});

test("a submission's editor is named after its problem and number, on its site, with its language's extension", () => {
    const uri = submissions.getSubmissionUri(target("1234"));
    assert.equal(uri.toString(), "leetcode-submission://leetcode.com/1/two-sum (1234).py");
    assert.deepEqual(submissions.parseSubmissionUri(uri), target("1234"));
    assert.equal(submissions.parseSubmissionUri(new FakeUri("file", "", "/1/two-sum (1234).py")), undefined);
    assert.equal(submissions.parseSubmissionUri(new FakeUri("leetcode-submission", "leetcode.com", "/1/two-sum.py")), undefined);
    assert.equal(submissions.parseSubmissionUri(undefined), undefined);
});

test("submitted code is loaded once and shown in a preview editor", async () => {
    await submissions.showSubmission(target("1001"));
    assert.deepEqual(shown, [[submissions.getSubmissionUri(target("1001")), { preview: true }]]);
    assert.equal(await provider.provideTextDocumentContent(submissions.getSubmissionUri(target("1001"))), "code 1001");
    assert.deepEqual(fetched, ["1001"]);
});

test("a submission from the other site is not loaded with this site's session", async () => {
    await assert.rejects(provider.provideTextDocumentContent(submissions.getSubmissionUri(target("1002", "leetcode.cn"))), /made on leetcode\.cn\. Switch to that site/);
    assert.deepEqual(fetched, []);
    host = "leetcode.cn";
    assert.equal(await provider.provideTextDocumentContent(submissions.getSubmissionUri(target("1002", "leetcode.cn"))), "code 1002");
});

test("a submission is compared with the solution file of its problem", async () => {
    await submissions.compareSubmission(target("1003"));
    assert.deepEqual(errors, ["Open the solution file of problem 1 to compare it with this submission."]);
    assert.deepEqual(fetched, [], "nothing is loaded without a file to compare with");

    const solution = new FakeUri("file", "", "/leetcode/1.two-sum.py");
    files.set("1", solution);
    await submissions.compareSubmission(target("1003"));
    assert.deepEqual(executed, [["vscode.diff", submissions.getSubmissionUri(target("1003")), solution, "Submission 1003 ↔ 1.two-sum.py"]]);
    assert.deepEqual(fetched, ["1003"]);
});
