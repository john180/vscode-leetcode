import { strict as assert } from "node:assert";
import { test } from "node:test";
import axios from "axios";
import { ISubmissionResult, submitSolution, testSolution } from "../../src/api/submission";

const request = {
    endpoint: "https://leetcode.com/graphql",
    origin: "https://leetcode.com",
    cookie: "LEETCODE_SESSION=session; csrftoken=csrf",
};
const target = { slug: "two-sum", questionId: "1" };

function response(data: unknown, config: any) {
    return { data, status: 200, statusText: "OK", headers: {}, config };
}

test("submitSolution posts the submission and maps a successful judge result", async () => {
    const originalAdapter = axios.defaults.adapter;
    let postedBody: any;
    let postedUrl: string = "";
    axios.defaults.adapter = async (config: any) => {
        if (config.method === "post") {
            postedUrl = config.url;
            postedBody = JSON.parse(config.data);
            return response({ submission_id: 42 }, config);
        }
        return response({
            state: "SUCCESS",
            status_msg: "Accepted",
            runtime: "3",
            memory: 8388608,
            total_correct: 66,
            total_testcases: 66,
        }, config);
    };
    try {
        const result: ISubmissionResult = await submitSolution(request, target, "cpp", "class Solution {};", {
            pollIntervalMs: 0,
            pollTimeoutMs: 1000,
        });
        assert.equal(postedUrl, "https://leetcode.com/problems/two-sum/submit/");
        assert.equal(postedBody.lang, "cpp");
        assert.equal(postedBody.question_id, 1);
        assert.equal(postedBody.typed_code, "class Solution {};");
        assert.equal(result.state, "SUCCESS");
        assert.equal(result.statusMessage, "Accepted");
        assert.equal(result.runtime, "3 ms");
        assert.equal(result.memory, "8.0 MB");
        assert.equal(result.totalCorrect, 66);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("testSolution uses the interpret endpoint and forwards the test input", async () => {
    const originalAdapter = axios.defaults.adapter;
    let postedBody: any;
    let postedUrl: string = "";
    axios.defaults.adapter = async (config: any) => {
        if (config.method === "post") {
            postedUrl = config.url;
            postedBody = JSON.parse(config.data);
            return response({ interpret_id: 7 }, config);
        }
        return response({ state: "SUCCESS", status_msg: "Accepted", code_output: "[0,1]", expected_output: "[0,1]" }, config);
    };
    try {
        const result = await testSolution(request, target, "cpp", "code", "[2,7,11,15]\\n9", {
            pollIntervalMs: 0,
            pollTimeoutMs: 1000,
        });
        assert.equal(postedUrl, "https://leetcode.com/problems/two-sum/interpret_solution/");
        assert.equal(postedBody.data_input, "[2,7,11,15]\\n9");
        assert.equal(result.codeOutput, "[0,1]");
        assert.equal(result.expectedOutput, "[0,1]");
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("submitSolution polls pending results until a terminal state", async () => {
    const originalAdapter = axios.defaults.adapter;
    let checks: number = 0;
    axios.defaults.adapter = async (config: any) => {
        if (config.method === "post") {
            return response({ submission_id: 9 }, config);
        }
        checks += 1;
        return response(checks === 1
            ? { state: "PENDING" }
            : { state: "SUCCESS", status_msg: "Accepted" }, config);
    };
    try {
        const result = await submitSolution(request, target, "cpp", "code", {
            pollIntervalMs: 0,
            pollTimeoutMs: 1000,
        });
        assert.equal(checks, 2);
        assert.equal(result.state, "SUCCESS");
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("submitSolution retries a rate-limited post", async () => {
    const originalAdapter = axios.defaults.adapter;
    let posts: number = 0;
    axios.defaults.adapter = async (config: any) => {
        if (config.method === "post") {
            posts += 1;
            return response(posts < 3 ? { error: "too soon" } : { submission_id: 3 }, config);
        }
        return response({ state: "SUCCESS", status_msg: "Accepted" }, config);
    };
    try {
        const result = await submitSolution(request, target, "cpp", "code", {
            pollIntervalMs: 0,
            pollTimeoutMs: 1000,
            rateLimitDelayMs: 0,
        });
        assert.equal(posts, 3);
        assert.equal(result.state, "SUCCESS");
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("submitSolution rejects a response without a submission id", async () => {
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config: any) => response({}, config);
    try {
        await assert.rejects(
            submitSolution(request, target, "cpp", "code"),
            /did not return a submission id/,
        );
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});
