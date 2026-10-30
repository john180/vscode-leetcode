import { strict as assert } from "node:assert";
import { test } from "node:test";
import axios from "axios";
import { setFavorite } from "../../src/api/favorite";
import { fetchJudgeInfo, fetchQuestionDetail, getAcceptanceRate, getParamNames, getSimilarQuestions } from "../../src/api/question";
import { fetchTopSolution } from "../../src/api/solution";
import { fetchCompanyTagNames } from "../../src/api/companyTags";

const request = {
    endpoint: "https://leetcode.com/graphql",
    origin: "https://leetcode.com",
    cookie: "LEETCODE_SESSION=session; csrftoken=csrf",
};
const target = { slug: "two-sum", questionId: "1" };

function response(data: unknown, config: any) {
    return { data, status: 200, statusText: "OK", headers: {}, config };
}

test("question JSON fields are read defensively", () => {
    const metaData = JSON.stringify({ name: "twoSum", params: [{ name: "nums", type: "integer[]" }, { name: "target", type: "integer" }] });
    assert.deepEqual(getParamNames({ metaData }), ["nums", "target"]);
    assert.deepEqual(getParamNames({ metaData: JSON.stringify({ database: true }) }), []);
    assert.deepEqual(getParamNames({ metaData: "{not json" }), []);

    const similarQuestions = JSON.stringify([{ title: "3Sum", titleSlug: "3sum", difficulty: "Medium" }, { bad: true }]);
    assert.deepEqual(getSimilarQuestions({ similarQuestions }), [{ title: "3Sum", titleSlug: "3sum", difficulty: "Medium" }]);
    assert.deepEqual(getSimilarQuestions({}), []);

    assert.equal(getAcceptanceRate({ stats: JSON.stringify({ acRate: "55.2%" }) }), "55.2%");
    assert.equal(getAcceptanceRate({ stats: "oops" }), undefined);
});

test("setFavorite posts the selected favorite list and question id", async () => {
    const originalAdapter = axios.defaults.adapter;
    let payload: any;
    axios.defaults.adapter = async (config: any) => {
        payload = JSON.parse(config.data);
        return response({ data: { addQuestionToFavorite: { ok: true } } }, config);
    };
    try {
        await setFavorite(request, target, true, "list-hash");
        assert.match(payload.query, /addQuestionToFavorite/);
        assert.deepEqual(payload.variables, { favoriteIdHash: "list-hash", questionId: "1" });
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("setFavorite removes from the given list with one request", async () => {
    const originalAdapter = axios.defaults.adapter;
    const payloads: any[] = [];
    axios.defaults.adapter = async (config: any) => {
        payloads.push(JSON.parse(config.data));
        return response({ data: { removeQuestionFromFavorite: { ok: true } } }, config);
    };
    try {
        await setFavorite(request, target, false, "default-hash");
        assert.equal(payloads.length, 1);
        assert.deepEqual(payloads[0].variables, { favoriteIdHash: "default-hash", questionId: "1" });
        assert.match(payloads[0].query, /removeQuestionFromFavorite/);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("setFavorite surfaces a mutation error", async () => {
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config: any) => response({
        data: { addQuestionToFavorite: { ok: false, error: "rejected" } },
    }, config);
    try {
        await assert.rejects(setFavorite(request, target, true, "hash"), /rejected/);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("fetchQuestionDetail returns the question and passes the slug", async () => {
    const originalAdapter = axios.defaults.adapter;
    let payload: any;
    axios.defaults.adapter = async (config: any) => {
        payload = JSON.parse(config.data);
        return response({
            data: {
                question: {
                    questionId: "1",
                    questionFrontendId: "1",
                    title: "Two Sum",
                    titleSlug: "two-sum",
                    difficulty: "Easy",
                    isPaidOnly: false,
                    content: "<p>x</p>",
                    codeSnippets: [],
                    topicTags: [],
                },
            },
        }, config);
    };
    try {
        const detail = await fetchQuestionDetail(request, "two-sum");
        assert.equal(detail.title, "Two Sum");
        assert.deepEqual(payload.variables, { titleSlug: "two-sum" });
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("fetchQuestionDetail rejects a missing question", async () => {
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config: any) => response({ data: { question: null } }, config);
    try {
        await assert.rejects(fetchQuestionDetail(request, "missing"), /Problem not found/);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("fetchJudgeInfo asks only for what judging needs", async () => {
    const originalAdapter = axios.defaults.adapter;
    let payload: any;
    axios.defaults.adapter = async (config: any) => {
        payload = JSON.parse(config.data);
        return response({ data: { question: { questionId: "1", metaData: "{}", sampleTestCase: "a", exampleTestcases: "a\nb" } } }, config);
    };
    try {
        const info = await fetchJudgeInfo(request, "two-sum");
        assert.equal(info.questionId, "1");
        assert.equal(info.exampleTestcases, "a\nb");
        assert.deepEqual(payload.variables, { titleSlug: "two-sum" });
        assert.match(payload.query, /exampleTestcases/);
        assert.doesNotMatch(payload.query, /content|codeSnippets/, "not the description or the code templates");

        axios.defaults.adapter = async (config: any) => response({ data: { question: null } }, config);
        await assert.rejects(fetchJudgeInfo(request, "missing"), /Problem not found/);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("fetchTopSolution prefers an article and falls back to the official solution", async () => {
    const originalAdapter = axios.defaults.adapter;
    const queries: string[] = [];
    let articleAvailable: boolean = true;
    axios.defaults.adapter = async (config: any) => {
        const payload = JSON.parse(config.data);
        queries.push(payload.query);
        if (payload.query.includes("questionSolutionArticles")) {
            return response({
                data: {
                    questionSolutionArticles: {
                        edges: articleAvailable ? [{ node: { title: "Article", slug: "a", content: "article body" } }] : [],
                    },
                },
            }, config);
        }
        return response({
            data: { question: { solution: { content: "official body" } } },
        }, config);
    };
    try {
        const cnRequest = { ...request, endpoint: "https://leetcode.cn/graphql/", origin: "https://leetcode.cn" };
        assert.deepEqual(await fetchTopSolution(cnRequest, "two-sum"), { title: "Article", content: "article body" });
        articleAvailable = false;
        assert.deepEqual(await fetchTopSolution(cnRequest, "two-sum"), { title: "", content: "official body" });
        assert.equal(queries.length, 3);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("fetchTopSolution returns nothing when neither source has a solution", async () => {
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config: any) => {
        const payload = JSON.parse(config.data);
        return payload.query.includes("questionSolutionArticles")
            ? response({ data: { questionSolutionArticles: { edges: [] } } }, config)
            : response({ data: { question: { solution: null } } }, config);
    };
    try {
        assert.equal(await fetchTopSolution({ ...request, origin: "https://leetcode.cn", endpoint: "https://leetcode.cn/graphql/" }, "two-sum"), undefined);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("global solutions use the global article schema and prefer the most voted post", async () => {
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config: any) => {
        const payload = JSON.parse(config.data);
        assert.match(payload.query, /ugcArticleSolutionArticles/);
        assert.match(payload.query, /MOST_VOTES/);
        assert.doesNotMatch(payload.query, /\bquestionSolutionArticles\b/);
        return response({ data: { ugcArticleSolutionArticles: { edges: [{ node: { title: "Global", topic: { post: { content: "global body" } } } }] } } }, config);
    };
    try {
        assert.deepEqual(await fetchTopSolution(request, "two-sum"), { title: "Global", content: "global body" });
    } finally { axios.defaults.adapter = originalAdapter; }
});

test("unsupported article schemas fall back, while authentication failures remain visible", async () => {
    const originalAdapter = axios.defaults.adapter;
    let calls = 0;
    let message = 'Cannot query field "ugcArticleSolutionArticles"';
    axios.defaults.adapter = async (config: any) => {
        calls++;
        const payload = JSON.parse(config.data);
        return response(payload.query.includes("ugcArticleSolutionArticles")
            ? { errors: [{ message }] } : { data: { question: { solution: { content: "official" } } } }, config);
    };
    try {
        assert.deepEqual(await fetchTopSolution(request, "two-sum"), { title: "", content: "official" });
        assert.equal(calls, 2);
        calls = 0;
        message = "Please Register or Sign in";
        await assert.rejects(fetchTopSolution(request, "two-sum"), /Please Register/);
        assert.equal(calls, 1);
    } finally { axios.defaults.adapter = originalAdapter; }
});

test("fetchCompanyTagNames pages until hasMore is false", async () => {
    const originalAdapter = axios.defaults.adapter;
    const offsets: number[] = [];
    axios.defaults.adapter = async (config: any) => {
        const payload = JSON.parse(config.data);
        const offset = payload.variables.offset;
        offsets.push(offset);
        return response({
            data: {
                companyTagsV2: offset === 0
                    ? { companyTagInfoNodes: [{ slug: "google", name: "Google" }, { slug: "meta", name: "Meta" }], hasMore: true }
                    : { companyTagInfoNodes: [{ slug: "amazon", name: "Amazon" }], hasMore: false },
            },
        }, config);
    };
    try {
        const names = await fetchCompanyTagNames(request);
        assert.deepEqual(offsets, [0, 2]);
        assert.deepEqual([...names.entries()], [["google", "Google"], ["meta", "Meta"], ["amazon", "Amazon"]]);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});
