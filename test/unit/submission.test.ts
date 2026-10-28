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
            status_runtime: "3 ms",
            memory: 8388608,
            runtime_percentile: 91.234,
            memory_percentile: null,
            lang: "cpp",
            pretty_lang: "C++",
            total_correct: 66,
            total_testcases: 66,
            std_output: "debug\n",
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
        assert.equal(result.runtimePercentile, 91.234);
        assert.equal(result.memoryPercentile, undefined);
        assert.equal(result.language, "C++", "the display name of the language the percentiles are among");
        assert.equal(result.totalCorrect, 66);
        assert.equal(result.stdout, "debug\n");
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("testSolution uses the interpret endpoint and reports a mismatched answer as wrong", async () => {
    const originalAdapter = axios.defaults.adapter;
    let postedBody: any;
    let postedUrl: string = "";
    axios.defaults.adapter = async (config: any) => {
        if (config.method === "post") {
            postedUrl = config.url;
            postedBody = JSON.parse(config.data);
            return response({ interpret_id: 7 }, config);
        }
        return response({
            state: "SUCCESS",
            status_msg: "Accepted",
            status_runtime: "0 ms",
            status_memory: "16.5 MB",
            runtime_percentile: null,
            correct_answer: false,
            compare_result: "10",
            code_answer: ["[0,1]", "[1,2]"],
            expected_code_answer: ["[0,1]", "[0,2]"],
            code_output: ["hello"],
            std_output_list: ["hello", "", ""],
            total_correct: 1,
            total_testcases: 2,
        }, config);
    };
    try {
        const result = await testSolution(request, target, "cpp", "code", "[2,7,11,15]\n9\n[3,2,4]\n6\n", {
            pollIntervalMs: 0,
            pollTimeoutMs: 1000,
        });
        assert.equal(postedUrl, "https://leetcode.com/problems/two-sum/interpret_solution/");
        assert.equal(postedBody.data_input, "[2,7,11,15]\n9\n[3,2,4]\n6\n");
        assert.equal(result.statusMessage, "Wrong Answer");
        assert.deepEqual(result.cases, [
            { input: "[2,7,11,15]\n9", output: "[0,1]", expected: "[0,1]", stdout: "hello", passed: true },
            { input: "[3,2,4]\n6", output: "[1,2]", expected: "[0,2]", stdout: undefined, passed: false },
        ]);
        assert.equal(result.stdout, undefined, "prints are shown per case");
        assert.equal(result.input, undefined);
        assert.equal(result.runtime, "0 ms");
        assert.equal(result.memory, "16.5 MB");
        assert.equal(result.runtimePercentile, undefined);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("testSolution keeps a matching answer accepted and drops blank prints", async () => {
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config: any) => config.method === "post"
        ? response({ interpret_id: 5 }, config)
        : response({
            state: "SUCCESS",
            status_msg: "Accepted",
            correct_answer: true,
            code_answer: ["1"],
            expected_code_answer: ["1"],
            code_output: [],
            std_output_list: ["", ""],
        }, config);
    try {
        const result = await testSolution(request, target, "cpp", "code", "1", { pollIntervalMs: 0, pollTimeoutMs: 1000 });
        assert.equal(result.statusMessage, "Accepted");
        assert.deepEqual(result.cases, [{ input: "1", output: "1", expected: "1", stdout: undefined, passed: true }]);
        assert.equal(result.stdout, undefined);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("testSolution keeps an input it cannot split into the cases whole", async () => {
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config: any) => config.method === "post"
        ? response({ interpret_id: 6 }, config)
        : response({ state: "SUCCESS", status_msg: "Accepted", code_answer: ["1", "2"], expected_code_answer: ["1", "3"], code_output: ["printed"] }, config);
    try {
        const result = await testSolution(request, target, "cpp", "code", "a\nb\nc", { pollIntervalMs: 0, pollTimeoutMs: 1000 });
        assert.equal(result.input, "a\nb\nc");
        assert.deepEqual(result.cases?.map((testCase) => [testCase.input, testCase.passed]), [[undefined, true], [undefined, false]]);
        assert.equal(result.stdout, "printed");
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("submitSolution links the submission page", async () => {
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config: any) => config.method === "post"
        ? response({ submission_id: 12345 }, config)
        : response({ state: "SUCCESS", status_msg: "Accepted" }, config);
    try {
        const result = await submitSolution(request, target, "cpp", "code", { pollIntervalMs: 0, pollTimeoutMs: 1000 });
        assert.equal(result.submissionUrl, "https://leetcode.com/submissions/detail/12345/");
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("submitSolution omits runtime and memory the judge reports as N/A", async () => {
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config: any) => config.method === "post"
        ? response({ submission_id: 11 }, config)
        : response({
            state: "SUCCESS",
            status_msg: "Compile Error",
            status_runtime: "N/A",
            status_memory: "N/A",
            memory: 0,
            full_compile_error: "Line 1: error",
        }, config);
    try {
        const result = await submitSolution(request, target, "cpp", "code", { pollIntervalMs: 0, pollTimeoutMs: 1000 });
        assert.equal(result.statusMessage, "Compile Error");
        assert.equal(result.runtime, undefined);
        assert.equal(result.memory, undefined);
        assert.equal(result.compileError, "Line 1: error");
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

function checkFailure(status: number | undefined, config: any): any {
    const error: any = new Error(status ? `Request failed with status code ${status}` : "socket hang up");
    error.config = config;
    if (status) {
        error.response = { status, headers: { "retry-after": "0" }, data: {} };
    }
    return error;
}

test("submitSolution keeps polling through transient check failures", async () => {
    const originalAdapter = axios.defaults.adapter;
    let checks: number = 0;
    axios.defaults.adapter = async (config: any) => {
        if (config.method === "post") {
            return response({ submission_id: 13 }, config);
        }
        checks += 1;
        if (checks === 1) {
            throw checkFailure(undefined, config);
        }
        if (checks === 2) {
            throw checkFailure(503, config);
        }
        return response({ state: "SUCCESS", status_msg: "Accepted" }, config);
    };
    try {
        const result = await submitSolution(request, target, "cpp", "code", { pollIntervalMs: 0, pollTimeoutMs: 5000 });
        assert.equal(checks, 3);
        assert.equal(result.statusMessage, "Accepted");
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("submitSolution stops polling on a persistent or non-transient check failure", async () => {
    const originalAdapter = axios.defaults.adapter;
    let checks: number = 0;
    let status: number = 503;
    axios.defaults.adapter = async (config: any) => {
        if (config.method === "post") {
            return response({ submission_id: 14 }, config);
        }
        checks += 1;
        throw checkFailure(status, config);
    };
    try {
        await assert.rejects(submitSolution(request, target, "cpp", "code", { pollIntervalMs: 0, pollTimeoutMs: 5000 }), /503/);
        assert.equal(checks, 3, "the first check and two retries");

        checks = 0;
        status = 403;
        await assert.rejects(submitSolution(request, target, "cpp", "code", { pollIntervalMs: 0, pollTimeoutMs: 5000 }), /403/);
        assert.equal(checks, 1);
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

test("submitSolution rejects without a cookie before making a request", async () => {
    const originalAdapter = axios.defaults.adapter;
    let called: boolean = false;
    axios.defaults.adapter = async (config: any) => {
        called = true;
        return response({ submission_id: 1 }, config);
    };
    try {
        await assert.rejects(
            submitSolution({ ...request, cookie: "" }, target, "cpp", "code"),
            /Not signed in/,
        );
        assert.equal(called, false);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("submitSolution rejects a cookie without csrftoken", async () => {
    await assert.rejects(
        submitSolution({ ...request, cookie: "LEETCODE_SESSION=only-session" }, target, "cpp", "code"),
        /does not contain csrftoken/,
    );
});

test("submitSolution propagates an unauthorized post without retrying", async () => {
    const originalAdapter = axios.defaults.adapter;
    let posts: number = 0;
    axios.defaults.adapter = async () => {
        posts += 1;
        const error: any = new Error("unauthorized");
        error.response = { status: 401, data: { error: "unauthorized" } };
        throw error;
    };
    try {
        await assert.rejects(submitSolution(request, target, "cpp", "code"), /unauthorized/);
        assert.equal(posts, 1);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("submitSolution times out when the judge never reaches a terminal state", async () => {
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config: any) => config.method === "post"
        ? response({ submission_id: 8 }, config)
        : response({ state: "STARTED" }, config);
    try {
        await assert.rejects(
            submitSolution(request, target, "cpp", "code", { pollIntervalMs: 0, pollTimeoutMs: 0 }),
            /Timed out/,
        );
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("submitSolution joins array output fields", async () => {
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config: any) => config.method === "post"
        ? response({ submission_id: 10 }, config)
        : response({
            state: "WRONG_ANSWER",
            status_msg: "Wrong Answer",
            code_output: ["1", "2"],
            expected_output: ["1", "3"],
        }, config);
    try {
        const result = await submitSolution(request, target, "cpp", "code", {
            pollIntervalMs: 0,
            pollTimeoutMs: 1000,
        });
        assert.equal(result.codeOutput, "1\n2");
        assert.equal(result.expectedOutput, "1\n3");
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("submitSolution encodes the slug in the submit URL", async () => {
    const originalAdapter = axios.defaults.adapter;
    let postedUrl: string = "";
    axios.defaults.adapter = async (config: any) => {
        if (config.method === "post") {
            postedUrl = config.url;
            return response({ submission_id: 2 }, config);
        }
        return response({ state: "SUCCESS", status_msg: "Accepted" }, config);
    };
    try {
        await submitSolution(
            { ...request, origin: "https://leetcode.com" },
            { slug: "two sum/?", questionId: "1" },
            "cpp",
            "code",
            { pollIntervalMs: 0, pollTimeoutMs: 1000 },
        );
        assert.equal(postedUrl, "https://leetcode.com/problems/two%20sum%2F%3F/submit/");
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("testSolution rejects a response without an interpret id", async () => {
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config: any) => response({}, config);
    try {
        await assert.rejects(
            testSolution(request, target, "cpp", "code", "input"),
            /did not return an interpret id/,
        );
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("submitSolution surfaces an exhausted rate-limit response", async () => {
    const originalAdapter = axios.defaults.adapter;
    let posts: number = 0;
    axios.defaults.adapter = async (config: any) => {
        posts += 1;
        return response({ error: "too soon" }, config);
    };
    try {
        await assert.rejects(
            submitSolution(request, target, "cpp", "code", { rateLimitDelayMs: 0 }),
            /rate limiting/,
        );
        assert.equal(posts, 3);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("submitSolution propagates a server error", async () => {
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async () => {
        const error: any = new Error("server error");
        error.response = { status: 500, data: { error: "server error" } };
        throw error;
    };
    try {
        await assert.rejects(submitSolution(request, target, "cpp", "code"), /server error/);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});
