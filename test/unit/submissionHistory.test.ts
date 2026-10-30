import { strict as assert } from "node:assert";
import { test } from "node:test";
import axios from "axios";
import {
    fetchSubmissionCode,
    fetchSubmissionHistory,
    formatSubmissionDate,
    formatSubmissionLabel,
    getLanguageSlug,
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

test("a language spelled as leetcode.cn's history shows it has the slug of its files", () => {
    assert.deepEqual(["Java", "C++", "C#", "Go", "Python3", "JavaScript", "MySQL", "cpp"].map(getLanguageSlug),
        ["java", "cpp", "csharp", "golang", "python3", "javascript", "mysql", "cpp"]);
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

test("fetchSubmissionCode asks each site for the code in its own schema", async () => {
    const originalAdapter = axios.defaults.adapter;
    const payloads: any[] = [];
    axios.defaults.adapter = async (config: any): Promise<any> => {
        const payload = JSON.parse(config.data);
        payloads.push(payload);
        const detail = { code: `code on ${new URL(config.url).host}` };
        const data = payload.query.includes("submissionDetails(") ? { submissionDetails: detail } : { submissionDetail: detail };
        return { data: { data }, status: 200, statusText: "OK", headers: {}, config };
    };
    try {
        const cookie = "LEETCODE_SESSION=x; csrftoken=y";
        assert.equal(await fetchSubmissionCode({ endpoint: "https://leetcode.com/graphql", origin: "https://leetcode.com", cookie }, "1234"), "code on leetcode.com");
        assert.equal(await fetchSubmissionCode({ endpoint: "https://leetcode.cn/graphql/", origin: "https://leetcode.cn", cookie }, "5678"), "code on leetcode.cn");
        assert.match(payloads[0].query, /\$submissionId: Int!.*submissionDetails\(submissionId: \$submissionId\) \{ code \}/s);
        assert.deepEqual(payloads[0].variables, { submissionId: 1234 });
        assert.match(payloads[1].query, /\$submissionId: ID!.*submissionDetail\(submissionId: \$submissionId\) \{ code \}/s);
        assert.deepEqual(payloads[1].variables, { submissionId: "5678" });
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("fetchSubmissionCode needs a session and rejects a submission LeetCode does not show", async () => {
    await assert.rejects(fetchSubmissionCode({ endpoint: "https://leetcode.com/graphql", origin: "https://leetcode.com", cookie: "" }, "1"), /Not signed in/);
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config: any): Promise<any> => ({ data: { data: { submissionDetails: null } }, status: 200, statusText: "OK", headers: {}, config });
    try {
        await assert.rejects(
            fetchSubmissionCode({ endpoint: "https://leetcode.com/graphql", origin: "https://leetcode.com", cookie: "LEETCODE_SESSION=x; csrftoken=y" }, "1"),
            /LeetCode returned no code for submission 1\./,
        );
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});
