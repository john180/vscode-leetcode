import { strict as assert } from "node:assert";
import { test } from "node:test";
import axios from "axios";
import { fetchDailyChallenge, fetchDailyChallengeStatus, parseCnDailyChallenge, parseDailyChallenge, parseGlobalDailyChallenge } from "../../src/api/dailyChallenge";

const cnToday = {
    todayRecord: [{
        question: {
            questionId: "4205",
            questionFrontendId: "3882",
            title: "Minimum XOR Path in a Grid",
            translatedTitle: "网格图中最小异或路径",
            titleSlug: "minimum-xor-path-in-a-grid",
            difficulty: "Medium",
            isPaidOnly: false,
            acRate: 0.6029,
            status: null,
            topicTags: [{ name: "Array", slug: "array" }],
        },
    }],
};

test("parseCnDailyChallenge maps the todayRecord question", () => {
    const daily = parseCnDailyChallenge(cnToday);
    assert.equal(daily?.id, "3882");
    assert.equal(daily?.questionId, "4205", "the backend id, which submissions use");
    assert.equal(daily?.slug, "minimum-xor-path-in-a-grid");
    assert.equal(daily?.name, "网格图中最小异或路径");
    assert.equal(daily?.difficulty, "Medium");
    assert.equal(daily?.passRate, "60.3 %");
    assert.equal(daily?.state, 3);
});

test("parseCnDailyChallenge ignores missing data", () => {
    assert.equal(parseCnDailyChallenge(undefined), undefined);
    assert.equal(parseCnDailyChallenge({ todayRecord: [] }), undefined);
    assert.equal(parseCnDailyChallenge({ todayRecord: [{ question: { title: "No slug" } }] }), undefined);
});

test("fetchDailyChallenge asks each site for its own daily question", async () => {
    const originalAdapter = axios.defaults.adapter;
    let posted: any;
    axios.defaults.adapter = async (config: any): Promise<any> => {
        posted = { url: config.url, body: JSON.parse(config.data) };
        const data = posted.body.query.includes("todayRecord")
            ? cnToday
            : { activeDailyCodingChallengeQuestion: { question: { ...cnToday.todayRecord[0].question, translatedTitle: undefined } } };
        return { data: { data }, status: 200, statusText: "OK", headers: {}, config };
    };
    try {
        const cn = await fetchDailyChallenge({ endpoint: "https://leetcode.cn/graphql", origin: "https://leetcode.cn" });
        assert.equal(posted.url, "https://leetcode.cn/graphql");
        assert.match(posted.body.query, /todayRecord/);
        assert.equal(cn?.name, "网格图中最小异或路径");

        const global = await fetchDailyChallenge({ endpoint: "https://leetcode.com/graphql", origin: "https://leetcode.com" });
        assert.equal(posted.url, "https://leetcode.com/graphql");
        assert.match(posted.body.query, /activeDailyCodingChallengeQuestion/);
        assert.equal(global?.name, "Minimum XOR Path in a Grid");
        assert.equal(global?.questionId, "4205");
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("the daily challenge counts as done only when LeetCode says it was finished today", () => {
    // leetcode.cn answered NOT_START on 2026-10-30, for a problem whose status was null.
    const cn = (userStatus: unknown) => parseDailyChallenge({ todayRecord: [{ ...cnToday.todayRecord[0], userStatus }] }, true);
    assert.equal(cn("NOT_START")?.completed, false);
    assert.equal(cn("FINISH")?.completed, true);
    assert.equal(cn(undefined)?.completed, false);
    assert.equal(cn("FINISH")?.problem.id, "3882");

    const question = { ...cnToday.todayRecord[0].question, status: "SOLVED" };
    const global = (userStatus: unknown) => parseDailyChallenge({ activeDailyCodingChallengeQuestion: { userStatus, question } }, false);
    assert.equal(global("NotStart")?.completed, false, "solved some day before is not solved today");
    assert.equal(global("NotStart")?.problem.state, 1);
    assert.equal(global("Finish")?.completed, true);
    assert.equal(parseDailyChallenge({ todayRecord: [] }, true), undefined);
});

test("fetchDailyChallengeStatus asks each site for its completion with the question", async () => {
    const originalAdapter = axios.defaults.adapter;
    const queries: string[] = [];
    axios.defaults.adapter = async (config: any): Promise<any> => {
        const { query } = JSON.parse(config.data);
        queries.push(query);
        const data = query.includes("todayRecord")
            ? { todayRecord: [{ ...cnToday.todayRecord[0], userStatus: "FINISH" }] }
            : { activeDailyCodingChallengeQuestion: { userStatus: "NotStart", question: cnToday.todayRecord[0].question } };
        return { data: { data }, status: 200, statusText: "OK", headers: {}, config };
    };
    try {
        assert.equal((await fetchDailyChallengeStatus({ endpoint: "https://leetcode.cn/graphql", origin: "https://leetcode.cn" }))?.completed, true);
        assert.equal((await fetchDailyChallengeStatus({ endpoint: "https://leetcode.com/graphql", origin: "https://leetcode.com" }))?.completed, false);
        assert.ok(queries.every((query) => /userStatus\s+question \{/.test(query)), "the status of the record, not of the question");
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("parseGlobalDailyChallenge maps the GraphQL daily question", () => {
    const daily = parseGlobalDailyChallenge({
        activeDailyCodingChallengeQuestion: {
            question: {
                questionFrontendId: "3863",
                title: "Minimum Operations to Sort a String",
                titleSlug: "minimum-operations-to-sort-a-string",
                difficulty: "Medium",
                acRate: 0.3497,
                status: "SOLVED",
                paidOnly: false,
                topicTags: [{ name: "String", slug: "string" }],
            },
        },
    });
    assert.equal(daily?.id, "3863");
    assert.equal(daily?.slug, "minimum-operations-to-sort-a-string");
    assert.equal(daily?.difficulty, "Medium");
    assert.equal(daily?.state, 1);
    assert.equal(daily?.passRate, "35.0 %");
});
