import { strict as assert } from "node:assert";
import { test } from "node:test";
import axios from "axios";
import { getCsrfToken, getLeetCodeHeaders, getUserAgent, isCanceled, send, setClientVersion } from "../../src/api/http";

const request = {
    endpoint: "https://leetcode.com/graphql",
    origin: "https://leetcode.com",
    cookie: "LEETCODE_SESSION=session; csrftoken=token",
};

function failure(status: number, config: any): any {
    const error: any = new Error(`Request failed with status code ${status}`);
    error.config = config;
    error.response = { status, headers: { "retry-after": "0" }, data: {} };
    return error;
}

test("getCsrfToken reads the token from anywhere in the cookie", () => {
    assert.equal(getCsrfToken("csrftoken=a; LEETCODE_SESSION=b"), "a");
    assert.equal(getCsrfToken("LEETCODE_SESSION=b; csrftoken=c"), "c");
    assert.equal(getCsrfToken("LEETCODE_SESSION=b; xcsrftoken=d"), undefined);
    assert.equal(getCsrfToken(undefined), undefined);
});

test("the User-Agent reports the extension's version", () => {
    setClientVersion("1.2.3");
    try {
        assert.match(getUserAgent(), /^Mozilla\/5\.0 \(.+\) vscode-leetcode\/1\.2\.3$/);
    } finally {
        setClientVersion(undefined);
    }
    assert.match(getUserAgent(), /\) vscode-leetcode$/);
});

test("getLeetCodeHeaders sends the session and its CSRF token like LeetCode's pages", () => {
    const headers = getLeetCodeHeaders(request, "/problems/two-sum/");
    assert.equal(headers.cookie, request.cookie);
    assert.equal(headers["x-csrftoken"], "token");
    assert.equal(headers["x-requested-with"], "XMLHttpRequest");
    assert.equal(headers.origin, "https://leetcode.com");
    assert.equal(headers.referer, "https://leetcode.com/problems/two-sum/");
    assert.equal(headers["user-agent"], getUserAgent());

    const anonymous = getLeetCodeHeaders({ ...request, cookie: "" });
    assert.equal(anonymous.cookie, undefined);
    assert.equal(anonymous["x-csrftoken"], undefined);
    assert.equal(anonymous.referer, "https://leetcode.com/problemset/");
});

test("send retries a GET but not a POST unless asked", async () => {
    const originalAdapter = axios.defaults.adapter;
    let calls = 0;
    axios.defaults.adapter = async (config: any): Promise<any> => {
        calls += 1;
        if (calls % 2 === 1) {
            throw failure(503, config);
        }
        return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
    };
    try {
        const got = await send<{ ok: boolean }>(request, { url: `${request.origin}/check/` });
        assert.equal(got.data.ok, true);
        assert.equal(calls, 2);

        calls = 0;
        await assert.rejects(send(request, { method: "POST", url: `${request.origin}/submit/`, data: {} }), /503/);
        assert.equal(calls, 1);

        calls = 0;
        const posted = await send<{ ok: boolean }>(request, { method: "POST", url: `${request.origin}/graphql`, data: {} }, { retry: true });
        assert.equal(posted.data.ok, true);
        assert.equal(calls, 2);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("send stops at an aborted signal instead of retrying", async () => {
    const originalAdapter = axios.defaults.adapter;
    let calls = 0;
    let seenSignal: unknown;
    axios.defaults.adapter = async (config: any): Promise<any> => {
        calls += 1;
        seenSignal = config.signal;
        return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    };
    try {
        const controller = new AbortController();
        await send({ ...request, signal: controller.signal }, { url: `${request.origin}/check/` });
        assert.ok(seenSignal instanceof AbortSignal);
        controller.abort();
        assert.equal((seenSignal as AbortSignal).aborted, true, "cancellation propagates into the combined lifetime");

        calls = 0;
        controller.abort();
        await assert.rejects(send({ ...request, signal: controller.signal }, { url: `${request.origin}/check/` }), (error: unknown) => isCanceled(error));
        assert.equal(calls, 0, "an aborted GET is not retried");
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("send applies the shared headers and a timeout to every request", async () => {
    const originalAdapter = axios.defaults.adapter;
    let seen: any;
    axios.defaults.adapter = async (config: any): Promise<any> => {
        seen = config;
        return { data: {}, status: 200, statusText: "OK", headers: {}, config };
    };
    try {
        await send(request, { url: `${request.origin}/api/submissions/two-sum/`, params: { offset: 0 } }, { referer: "/problems/two-sum/" });
        assert.equal(seen.headers["x-csrftoken"], "token");
        assert.equal(seen.headers.referer, "https://leetcode.com/problems/two-sum/");
        assert.equal(seen.headers["user-agent"], getUserAgent());
        assert.equal(seen.timeout, 20000);
        assert.deepEqual(seen.params, { offset: 0 });
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});
