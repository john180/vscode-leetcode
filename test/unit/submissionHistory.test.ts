import { strict as assert } from "node:assert";
import { test } from "node:test";
import axios from "axios";
import {
    fetchSubmissionHistory,
    formatSubmissionDate,
    formatSubmissionLabel,
    mapSubmissionDump,
} from "../../src/api/submissionHistory";

test("mapSubmissionDump normalizes the REST payload", () => {
    const items = mapSubmissionDump({
        submissions_dump: [
            {
                id: 123,
                status_display: "Accepted",
                lang: "cpp",
                timestamp: "1700000000",
                runtime: "8 ms",
                memory: "8.1 MB",
            },
            { id: 124, status: "Wrong Answer", lang: "python3" },
            { status: "ignored without id" },
        ],
    });
    assert.equal(items.length, 2);
    assert.deepEqual(items[0], {
        id: "123",
        status: "Accepted",
        lang: "cpp",
        timestamp: "1700000000",
        runtime: "8 ms",
        memory: "8.1 MB",
    });
    assert.equal(items[1].status, "Wrong Answer");
});

test("formatSubmissionLabel marks accepted and failed submissions", () => {
    assert.match(formatSubmissionLabel({ id: "1", status: "Accepted", lang: "cpp", timestamp: "", runtime: "", memory: "" }), /\$\(check\)/);
    assert.match(formatSubmissionLabel({ id: "2", status: "Wrong Answer", lang: "cpp", timestamp: "", runtime: "", memory: "" }), /\$\(x\)/);
});

test("formatSubmissionDate keeps unknown values and formats seconds", () => {
    assert.equal(formatSubmissionDate("not-a-date"), "not-a-date");
    assert.match(formatSubmissionDate("1700000000"), /\d{4}/);
});

test("fetchSubmissionHistory passes offset and limit and returns hasNext", async () => {
    const originalAdapter = axios.defaults.adapter;
    let requestedParams: any;
    axios.defaults.adapter = async (config: any): Promise<any> => {
        requestedParams = config.params;
        return {
            data: {
                submissions_dump: [{ id: 7, status_display: "Accepted", lang: "cpp" }],
                has_next: true,
            },
            status: 200,
            statusText: "OK",
            headers: {},
            config,
        };
    };
    try {
        const page = await fetchSubmissionHistory(
            { endpoint: "https://leetcode.cn/graphql/", origin: "https://leetcode.cn", cookie: "LEETCODE_SESSION=x; csrftoken=y" },
            "two-sum",
            5,
            10,
        );
        assert.deepEqual(requestedParams, { offset: 5, limit: 10 });
        assert.equal(page.hasNext, true);
        assert.equal(page.items[0].id, "7");
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});
