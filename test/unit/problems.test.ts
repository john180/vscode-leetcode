import { strict as assert } from "node:assert";
import { test } from "node:test";
import axios from "axios";
import Module = require("node:module");

let endpoint = "leetcode";
const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean): unknown {
    if (request === "vscode") {
        return {
            env: { appName: "Visual Studio Code", uriScheme: "vscode", appRoot: process.cwd() },
            workspace: {
                getConfiguration: () => ({
                    get: (key: string, defaultValue: unknown) => {
                        if (key === "endpoint") return endpoint;
                        if (key === "useEndpointTranslation") return true;
                        return defaultValue;
                    },
                }),
                onDidChangeConfiguration: () => ({ dispose: () => undefined }),
            },
            Uri: { file: (value: string) => ({ fsPath: value, toString: () => value }) },
            window: {
                createOutputChannel: () => ({
                    append: () => undefined,
                    appendLine: () => undefined,
                    dispose: () => undefined,
                    show: () => undefined,
                }),
            },
            l10n: { t: (value: string) => value },
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getProblems, invalidateProblemCache, updateCachedFavorite } = require("../../src/api/problems");

function response(data: unknown, config: any) {
    return { data, status: 200, statusText: "OK", headers: {}, config };
}

test("getProblems caches, invalidates, and isolates endpoints", async () => {
    const originalAdapter = axios.defaults.adapter;
    let requests = 0;
    axios.defaults.adapter = async (config: any) => {
        requests += 1;
        const payload = JSON.parse(config.data);
        const query = String(payload.query);
        if (query.includes("companyTagsV2")) {
            return response({ data: { companyTagsV2: { companyTagInfoNodes: [], hasMore: false } } }, config);
        }
        if (query.includes("problemsetQuestionListV2")) {
            return response({
                data: {
                    problemsetQuestionListV2: {
                        questions: [{
                            questionFrontendId: "1",
                            title: "Two Sum",
                            titleSlug: "two-sum",
                            difficulty: "Easy",
                            paidOnly: false,
                            acRate: 0.5,
                            status: "SOLVED",
                            isInMyFavorites: false,
                            topicTags: [],
                        }],
                    },
                },
            }, config);
        }
        return response({
            data: {
                problemsetQuestionList: {
                    total: 1,
                    questions: [{ frontendQuestionId: "1", title: "Two Sum", titleSlug: "two-sum", difficulty: "Easy", status: "AC" }],
                },
            },
        }, config);
    };
    try {
        invalidateProblemCache();
        endpoint = "leetcode";
        const first = await getProblems(true);
        assert.equal(first.length, 1);
        assert.equal(first[0].name, "Two Sum");
        const afterFirst = requests;
        await getProblems();
        assert.equal(requests, afterFirst);

        updateCachedFavorite("1", true);
        assert.equal((await getProblems())[0].isFavorite, true);

        endpoint = "leetcode-cn";
        const cn = await getProblems();
        assert.equal(cn.length, 1);
        assert.ok(requests > afterFirst);

        const beforeForce = requests;
        await getProblems(true);
        assert.ok(requests > beforeForce);
    } finally {
        axios.defaults.adapter = originalAdapter;
        invalidateProblemCache();
    }
});

test("getProblems expires its cache after the TTL", async () => {
    const originalAdapter = axios.defaults.adapter;
    const originalNow = Date.now;
    let now = 1_000_000;
    let requests = 0;
    Date.now = () => now;
    axios.defaults.adapter = async (config: any) => {
        requests += 1;
        const payload = JSON.parse(config.data);
        if (String(payload.query).includes("companyTagsV2")) {
            return response({ data: { companyTagsV2: { companyTagInfoNodes: [], hasMore: false } } }, config);
        }
        return response({
            data: {
                problemsetQuestionListV2: {
                    questions: [{ questionFrontendId: "1", titleSlug: "two-sum", title: "Two Sum", difficulty: "Easy" }],
                },
            },
        }, config);
    };
    try {
        invalidateProblemCache();
        endpoint = "leetcode";
        await getProblems(true);
        const afterFirst = requests;
        await getProblems();
        assert.equal(requests, afterFirst);
        now += 5 * 60 * 1000 + 1;
        await getProblems();
        assert.ok(requests > afterFirst);
    } finally {
        Date.now = originalNow;
        axios.defaults.adapter = originalAdapter;
        invalidateProblemCache();
    }
});

test("concurrent getProblems calls share one pending request", async () => {
    const originalAdapter = axios.defaults.adapter;
    let requests = 0;
    let releasePage: (() => void) | undefined;
    const pageGate = new Promise<void>((resolve) => {
        releasePage = resolve;
    });
    axios.defaults.adapter = async (config: any) => {
        requests += 1;
        const payload = JSON.parse(config.data);
        if (String(payload.query).includes("companyTagsV2")) {
            return response({ data: { companyTagsV2: { companyTagInfoNodes: [], hasMore: false } } }, config);
        }
        await pageGate;
        return response({
            data: {
                problemsetQuestionListV2: {
                    questions: [{ questionFrontendId: "1", titleSlug: "two-sum", title: "Two Sum", difficulty: "Easy" }],
                },
            },
        }, config);
    };
    try {
        invalidateProblemCache();
        endpoint = "leetcode";
        const first = getProblems(true);
        const second = getProblems();
        await new Promise((resolve) => setImmediate(resolve));
        releasePage?.();
        const results = await Promise.all([first, second]);
        assert.equal(results[0].length, 1);
        assert.equal(results[1].length, 1);
        assert.equal(requests, 2);
    } finally {
        axios.defaults.adapter = originalAdapter;
        invalidateProblemCache();
    }
});

test("a failed load is not cached and can be retried", async () => {
    const originalAdapter = axios.defaults.adapter;
    let fail = true;
    let requests = 0;
    axios.defaults.adapter = async (config: any) => {
        requests += 1;
        const payload = JSON.parse(config.data);
        if (String(payload.query).includes("companyTagsV2")) {
            return response({ data: { companyTagsV2: { companyTagInfoNodes: [], hasMore: false } } }, config);
        }
        if (fail) {
            const error: any = new Error("network down");
            error.config = config;
            error.response = { status: 400, headers: {} };
            throw error;
        }
        return response({
            data: {
                problemsetQuestionListV2: {
                    questions: [{ questionFrontendId: "1", titleSlug: "two-sum", title: "Two Sum", difficulty: "Easy" }],
                },
            },
        }, config);
    };
    try {
        invalidateProblemCache();
        endpoint = "leetcode";
        await assert.rejects(getProblems(true), /network down/);
        fail = false;
        const problems = await getProblems();
        assert.equal(problems.length, 1);
        assert.equal(requests, 4);
    } finally {
        axios.defaults.adapter = originalAdapter;
        invalidateProblemCache();
    }
});
