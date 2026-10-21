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
