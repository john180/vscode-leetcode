import { strict as assert } from "node:assert";
import { beforeEach, test } from "node:test";
import Module = require("node:module");

class FakeUri {
    constructor(public readonly scheme: string, public readonly path: string) { }
    public toString(): string { return `${this.scheme}:${this.path}`; }
}

class FakeEmitter<T> {
    private readonly listeners: Array<(value: T) => void> = [];
    public readonly event = (listener: (value: T) => void) => { this.listeners.push(listener); return { dispose: () => undefined }; };
    public fire(value: T): void { this.listeners.forEach((listener) => listener(value)); }
}

class FakeInlayHint {
    public paddingRight?: boolean;
    constructor(public readonly position: { line: number }, public readonly label: string) { }
}

let fileSystem: any;
let inlayHints: any;
let fetches = 0;
let paramNames: string[] = [];
let judgeInfo = async (): Promise<any> => ({ questionId: "1", sampleTestCase: "[2,7]\n9", exampleTestcases: "[2,7]\n9\n[3,3]\n6" });
const saved = new Map<string, string>();
const documents: any[] = [];
const warnings: string[] = [];

const dependencies: Record<string, unknown> = {
    "vscode": {
        Uri: { from: ({ scheme, path }: { scheme: string; path: string }) => new FakeUri(scheme, path) },
        EventEmitter: FakeEmitter,
        Disposable: class { constructor(public readonly dispose: () => void) { } },
        FileType: { File: 1, Directory: 2 },
        FileChangeType: { Changed: 1 },
        FileSystemError: { FileNotFound: (uri: unknown) => new Error(`not found: ${uri}`), NoPermissions: (uri: unknown) => new Error(`read only: ${uri}`) },
        InlayHint: FakeInlayHint,
        InlayHintKind: { Parameter: 2 },
        Position: class { constructor(public readonly line: number, public readonly character: number) { } },
        l10n: { t: (text: string, ...args: unknown[]) => text.replace(/\{(\d+)\}/g, (_: string, index: string) => String(args[+index])) },
        workspace: {
            textDocuments: documents,
            registerFileSystemProvider: (_scheme: string, provider: unknown) => { fileSystem = provider; return { dispose: () => undefined }; },
        },
        languages: { registerInlayHintsProvider: (_selector: unknown, provider: unknown) => { inlayHints = provider; return { dispose: () => undefined }; } },
    },
    "./api/question": { fetchJudgeInfo: () => { fetches++; return judgeInfo(); }, getParamNames: () => paramNames },
    "./api/request": { getLeetCodeRequest: () => ({ endpoint: "https://leetcode.com/graphql" }) },
    "./leetCodeChannel": { leetCodeChannel: { warn: (text: string) => warnings.push(text) } },
    "./testCaseStore": { testCaseStore: { get: (slug: string) => saved.get(slug), save: async (slug: string, input: string) => { saved.set(slug, input); } } },
};
const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: { filename?: string }, isMain: boolean): unknown {
    if (parent?.filename?.endsWith("testCaseDocument.js") && request in dependencies) {
        return dependencies[request];
    }
    return originalLoad.call(this, request, parent, isMain);
};
const testCases = require("../../src/testCaseDocument");
moduleLoader._load = originalLoad;
testCases.registerTestCaseDocuments({ subscriptions: [] });

async function read(uri: unknown): Promise<string> {
    return Buffer.from(await fileSystem.readFile(uri)).toString("utf8");
}

beforeEach(() => {
    saved.clear(); documents.length = 0; warnings.length = 0; fetches = 0; paramNames = [];
    judgeInfo = async () => ({ questionId: "1", sampleTestCase: "[2,7]\n9", exampleTestcases: "[2,7]\n9\n[3,3]\n6" });
});

test("a test case editor is named after its problem, and only its own files are test case editors", () => {
    const uri = testCases.getTestCaseUri({ id: "1", slug: "two-sum" });
    assert.equal(uri.toString(), "leetcode-testcase:/1/two-sum.txt");
    assert.deepEqual(testCases.parseTestCaseUri(uri), { id: "1", slug: "two-sum" });
    assert.equal(testCases.parseTestCaseUri(new FakeUri("file", "/1/two-sum.txt")), undefined);
    assert.equal(testCases.parseTestCaseUri(new FakeUri("leetcode-testcase", "/1")), undefined);
    assert.equal(testCases.parseTestCaseUri(undefined), undefined);
});

test("the editor starts with the examples and keeps what the user saves", async () => {
    const uri = testCases.getTestCaseUri({ id: "1", slug: "two-sum" });
    assert.equal(await read(uri), "[2,7]\n9\n[3,3]\n6");
    const before = await fileSystem.stat(uri);
    assert.equal(before.size, Buffer.byteLength("[2,7]\n9\n[3,3]\n6"));
    const changes: unknown[] = [];
    fileSystem.onDidChangeFile((events: unknown[]) => changes.push(...events));

    await fileSystem.writeFile(uri, Buffer.from("[1,1]\n2"));
    assert.equal(saved.get("two-sum"), "[1,1]\n2");
    assert.equal(await read(uri), "[1,1]\n2");
    assert.ok((await fileSystem.stat(uri)).mtime > before.mtime, "VS Code sees that the file changed");
    assert.deepEqual(changes, [{ type: 1, uri }]);
    assert.deepEqual(await testCases.getSavedTestCases({ id: "1", slug: "two-sum" }), "[1,1]\n2");
});

test("cleared test cases count as none, so the examples come back", async () => {
    const problem = { id: "15", slug: "three-sum" };
    await fileSystem.writeFile(testCases.getTestCaseUri(problem), Buffer.from(" \n"));
    assert.equal(await testCases.getSavedTestCases(problem), undefined);
    assert.equal(await read(testCases.getTestCaseUri(problem)), "[2,7]\n9\n[3,3]\n6");
});

test("unsaved edits are saved before the test cases are used", async () => {
    const problem = { id: "16", slug: "3sum-closest" };
    documents.push({ isDirty: true, uri: testCases.getTestCaseUri(problem), save: async () => { saved.set(problem.slug, "[5]\n5"); return true; } });
    documents.push({ isDirty: true, uri: new FakeUri("file", "/16.3sum-closest.py"), save: async () => assert.fail("other documents stay as they are") });
    assert.equal(await testCases.getSavedTestCases(problem), "[5]\n5");
});

test("examples load once per problem, a test run's are reused, and a failed load is retried", async () => {
    testCases.rememberJudgeInfo("4sum", { questionId: "18", exampleTestcases: "[0]\n0" });
    assert.equal(await read(testCases.getTestCaseUri({ id: "18", slug: "4sum" })), "[0]\n0");
    assert.equal(fetches, 0);

    judgeInfo = async () => { throw new Error("offline"); };
    const uri = testCases.getTestCaseUri({ id: "1", slug: "two-sum-ii" });
    assert.equal(await read(uri), "");
    assert.match(warnings[0], /Failed to load the examples of two-sum-ii: Error: offline/);
    judgeInfo = async () => ({ questionId: "167", exampleTestcases: "[2,7]\n9" });
    assert.equal(await read(uri), "[2,7]\n9");
    assert.equal(await read(uri), "[2,7]\n9");
    assert.equal(fetches, 2);
});

test("files outside a problem's folder cannot be read or changed", async () => {
    assert.equal((await fileSystem.stat(new FakeUri("leetcode-testcase", "/1"))).type, 2);
    await assert.rejects(fileSystem.stat(new FakeUri("leetcode-testcase", "/1/a/b.txt")), /not found/);
    assert.throws(() => fileSystem.delete(testCases.getTestCaseUri({ id: "1", slug: "two-sum" })), /read only/);
});

test("each case is labelled, and each line with its parameter", async () => {
    paramNames = ["nums", "target"];
    const document = { uri: testCases.getTestCaseUri({ id: "1", slug: "two-sum-labels" }), getText: () => "[2,7]\n9\n[3,3]\n\n" };
    const hints = await inlayHints.provideInlayHints(document, { start: { line: 0 }, end: { line: 99 } });
    assert.deepEqual(hints.map((hint: FakeInlayHint) => [hint.position.line, hint.label]), [[0, "Case 1 · nums ="], [1, "target ="], [2, "Case 2 · nums ="]]);
    assert.ok(hints.every((hint: FakeInlayHint) => hint.paddingRight));

    paramNames = ["head"];
    const cycle = { uri: testCases.getTestCaseUri({ id: "141", slug: "linked-list-cycle" }), getText: () => "[3,2]\n1\n[1]\n-1" };
    const unnamed = await inlayHints.provideInlayHints(cycle, { start: { line: 0 }, end: { line: 99 } });
    assert.deepEqual(unnamed.map((hint: FakeInlayHint) => [hint.position.line, hint.label]), [[0, "Case 1"], [2, "Case 2"]]);
});
