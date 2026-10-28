import { strict as assert } from "node:assert";
import { test } from "node:test";
import axios from "axios";
import { fetchDailyChallenge, parseCnDailyChallenge, parseGlobalDailyChallenge } from "../../src/api/dailyChallenge";

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

test("fetchDailyChallenge asks LeetCode CN's GraphQL endpoint for todayRecord", async () => {
    const originalAdapter = axios.defaults.adapter;
    let posted: any;
    axios.defaults.adapter = async (config: any): Promise<any> => {
        posted = { url: config.url, body: JSON.parse(config.data) };
        return { data: { data: cnToday }, status: 200, statusText: "OK", headers: {}, config };
    };
    try {
        const daily = await fetchDailyChallenge({ endpoint: "https://leetcode.cn/graphql", origin: "https://leetcode.cn" }, true);
        assert.equal(posted.url, "https://leetcode.cn/graphql");
        assert.match(posted.body.query, /todayRecord/);
        assert.equal(daily?.slug, "minimum-xor-path-in-a-grid");
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("parseGlobalDailyChallenge maps the GraphQL daily question", () => {
    const daily = parseGlobalDailyChallenge({
        data: {
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
        },
    });
    assert.equal(daily?.id, "3863");
    assert.equal(daily?.slug, "minimum-operations-to-sort-a-string");
    assert.equal(daily?.difficulty, "Medium");
    assert.equal(daily?.state, 1);
    assert.equal(daily?.passRate, "35.0 %");
});
