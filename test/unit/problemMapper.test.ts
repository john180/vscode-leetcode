import { strict as assert } from "node:assert";
import { test } from "node:test";
import Module = require("node:module");

const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean): unknown {
    if (request === "vscode") {
        return {
            env: { appName: "Visual Studio Code", uriScheme: "vscode" },
            workspace: { getConfiguration: () => ({ get: () => undefined }) },
            Uri: { file: (value: string) => ({ fsPath: value, toString: () => value }) },
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { mapQuestion } = require("../../src/api/problemMapper");

const question = {
    frontendQuestionId: "1",
    titleSlug: "two-sum",
    title: "Two Sum",
    titleCn: "两数之和",
    acRate: 0.5,
    difficulty: "Easy",
    paidOnly: false,
    status: "ac",
    topicTags: [],
    extra: {
        topCompanyTags: [{ slug: "google", name: "谷歌 Google" }],
    },
};

test("mapQuestion uses the localized company name when translation is on", () => {
    assert.deepEqual(mapQuestion(question, true).companies, ["谷歌 Google"]);
});

test("mapQuestion uses the canonical company slug when translation is off", () => {
    assert.deepEqual(mapQuestion(question, false).companies, ["google"]);
});

test("mapQuestion resolves list slugs through the company name map", () => {
    const listQuestion = {
        ...question,
        extra: { topCompanyTags: [{ slug: "google" }] },
    };
    const names: Map<string, string> = new Map([["google", "谷歌 Google"]]);
    assert.deepEqual(mapQuestion(listQuestion, true, names).companies, ["谷歌 Google"]);
});

test("mapQuestion handles missing optional fields", () => {
    const mapped = mapQuestion({ frontendQuestionId: "" }, false);
    assert.equal(mapped.id, "");
    assert.equal(mapped.slug, "");
    assert.equal(mapped.name, "");
    assert.equal(mapped.difficulty, "Unknown");
    assert.equal(mapped.passRate, "");
    assert.equal(mapped.state, 3);
    assert.deepEqual(mapped.companies, []);
    assert.deepEqual(mapped.tags, []);
});

test("mapQuestion maps difficulty, state, lock, favorite, and missing pass rate", () => {
    const mapped = mapQuestion({
        ...question,
        difficulty: "HARD",
        status: "ATTEMPTED",
        paidOnly: true,
        isInMyFavorites: true,
        acRate: undefined,
    }, false);
    assert.equal(mapped.difficulty, "Hard");
    assert.equal(mapped.state, 2);
    assert.equal(mapped.locked, true);
    assert.equal(mapped.isFavorite, true);
    assert.equal(mapped.passRate, "");
});

test("mapQuestion accepts SOLVED and TRIED statuses", () => {
    assert.equal(mapQuestion({ ...question, status: "SOLVED" }, false).state, 1);
    assert.equal(mapQuestion({ ...question, status: "TRIED" }, false).state, 2);
    assert.equal(mapQuestion({ ...question, status: "NOT_AC" }, false).state, 2);
    assert.equal(mapQuestion({ ...question, status: "TO_DO" }, false).state, 3);
});

test("mapQuestion translates tags when translation is enabled and keeps raw names otherwise", () => {
    const tagged = {
        ...question,
        topicTags: [{ name: "Array", nameTranslated: "数组", slug: "array" }],
    };
    assert.deepEqual(mapQuestion(tagged, true).tags, ["数组"]);
    assert.deepEqual(mapQuestion(tagged, false).tags, ["Array"]);
});

test("mapQuestion falls back to id for slug and name", () => {
    const mapped = mapQuestion({ frontendQuestionId: "7" }, false);
    assert.equal(mapped.id, "7");
    assert.equal(mapped.slug, "7");
    assert.equal(mapped.name, "7");
});
