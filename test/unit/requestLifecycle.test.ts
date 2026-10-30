import { strict as assert } from "node:assert";
import { test } from "node:test";
import axios from "axios";
import { send, isCanceled } from "../../src/api/http";
import { graphql } from "../../src/api/client";
import { LeetCodeApiError } from "../../src/api/errors";
import { sessionEvents } from "../../src/auth/session";
import { SessionScope } from "../../src/auth/sessionScope";
import { fetchFavoriteData } from "../../src/api/favoriteLists";
import { fetchSubmissionHistory } from "../../src/api/submissionHistory";
import { submitSolution } from "../../src/api/submission";

const request = { origin: "https://leetcode.com", endpoint: "https://leetcode.com/graphql", cookie: "LEETCODE_SESSION=mock; csrftoken=mock" };
const response = (data: unknown, config: any) => ({ data, config, status: 200, statusText: "OK", headers: {} });
const limited = () => Object.assign(new Error("rate limited"), { response: { status: 429, headers: { "retry-after": "30" } } });
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("canceling during Retry-After immediately stops the operation without another request", async () => {
    const adapter = axios.defaults.adapter;
    const controller = new AbortController();
    let calls = 0;
    axios.defaults.adapter = async () => { calls++; throw limited(); };
    try {
        const pending = assert.rejects(send({ ...request, signal: controller.signal }, { url: request.origin }), isCanceled);
        await tick();
        controller.abort();
        await pending;
        assert.equal(calls, 1);
    } finally { axios.defaults.adapter = adapter; }
});

test("Retry-After exceeding the remaining budget is surfaced without retrying early", async () => {
    const adapter = axios.defaults.adapter;
    let calls = 0;
    axios.defaults.adapter = async () => { calls++; throw limited(); };
    try {
        await assert.rejects(send({ ...request, deadline: Date.now() + 1000 }, { url: request.origin }),
            (error: unknown) => error instanceof LeetCodeApiError && error.kind === "rate-limit");
        assert.equal(calls, 1);
    } finally { axios.defaults.adapter = adapter; }
});

test("session revocation aborts transport even with a separate view signal", async () => {
    const adapter = axios.defaults.adapter;
    const sessions = new SessionScope();
    const view = new AbortController();
    let received: AbortSignal | undefined;
    axios.defaults.adapter = (config: any) => new Promise((_resolve, reject) => {
        received = config.signal;
        config.signal.addEventListener("abort", () => reject(new axios.CanceledError()), { once: true });
    });
    try {
        const pending = assert.rejects(send({ ...request, ...sessions.capture("alice"), signal: view.signal }, { url: request.origin }), isCanceled);
        await tick();
        sessions.invalidate();
        await pending;
        assert.equal(received?.aborted, true);
        assert.equal(view.signal.aborted, false);
    } finally { axios.defaults.adapter = adapter; }
});

test("a stale context is rejected before any write request reaches the adapter", async () => {
    const adapter = axios.defaults.adapter;
    let calls = 0;
    axios.defaults.adapter = async (config: any) => { calls++; return response({}, config); };
    try {
        await assert.rejects(send({ ...request, isCurrent: () => false }, { method: "POST", url: request.origin }), isCanceled);
        assert.equal(calls, 0);
    } finally { axios.defaults.adapter = adapter; }
});

test("GraphQL authentication errors notify only the originating active session", async () => {
    const adapter = axios.defaults.adapter;
    const events: unknown[] = [];
    const listener = (value: unknown) => events.push(value);
    sessionEvents.on("expired", listener);
    axios.defaults.adapter = async (config: any) => response({ errors: [{ message: "🐸☕Please Register or Sign in" }] }, config);
    try {
        await assert.rejects(graphql(request, "query { privateData }"),
            (error: unknown) => error instanceof LeetCodeApiError && error.kind === "authentication" && error.response?.status === 200);
        assert.deepEqual(events, [request]);
        await assert.rejects(graphql({ ...request, authenticationCheck: true }, "query { userStatus }"));
        await assert.rejects(graphql({ ...request, cookie: "" }, "query { privateData }"));
        assert.equal(events.length, 1, "candidate credentials and anonymous requests must not sign out the active account");
        axios.defaults.adapter = async (config: any) => response({ errors: [{ message: "Cannot query field privateData" }] }, config);
        await assert.rejects(graphql(request, "query { privateData }"));
        assert.equal(events.length, 1, "schema errors are not authentication failures");
    } finally { axios.defaults.adapter = adapter; sessionEvents.off("expired", listener); }
});

test("HTTP authentication failures are reported without installing global Axios interceptors", async () => {
    const adapter = axios.defaults.adapter;
    let events = 0;
    const listener = () => events++;
    sessionEvents.on("expired", listener);
    axios.defaults.adapter = async () => { throw Object.assign(new Error("unauthorized"), { response: { status: 401, data: {} } }); };
    try {
        await assert.rejects(send(request, { url: request.origin }));
        assert.equal(events, 1);
        await assert.rejects(axios.request({ url: request.origin }));
        assert.equal(events, 1, "unrelated Axios requests must not affect the session");
    } finally { axios.defaults.adapter = adapter; sessionEvents.off("expired", listener); }
});

test("GraphQL mutations require an explicit retry opt-in", async () => {
    const adapter = axios.defaults.adapter;
    let calls = 0;
    axios.defaults.adapter = async () => {
        calls++;
        throw Object.assign(new Error("server error"), { response: { status: 503, headers: { "retry-after": "0" } } });
    };
    try {
        await assert.rejects(graphql(request, "mutation { writeSomething }"));
        assert.equal(calls, 1);
        calls = 0;
        await assert.rejects(graphql(request, "mutation { setFavorite }", {}, { retry: true }));
        assert.equal(calls, 3);
    } finally { axios.defaults.adapter = adapter; }
});

test("REST readers reject HTML and missing payloads instead of reporting empty account data", async () => {
    const adapter = axios.defaults.adapter;
    try {
        for (const data of ["<!doctype html><html>Sign in</html>", {}, { favorites: [] }, null]) {
            axios.defaults.adapter = async (config: any) => response(data, config);
            await assert.rejects(fetchFavoriteData(request), (error: unknown) => error instanceof LeetCodeApiError && error.kind === "response");
            await assert.rejects(fetchSubmissionHistory(request, "two-sum"), (error: unknown) => error instanceof LeetCodeApiError && error.kind === "response");
        }
    } finally { axios.defaults.adapter = adapter; }
});

test("empty error bodies keep the classification of their HTTP status", async () => {
    const adapter = axios.defaults.adapter;
    try {
        for (const [status, kind] of [[504, "http"], [429, "rate-limit"], [401, "authentication"]] as const) {
            axios.defaults.adapter = async () => {
                throw Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: "", headers: { "retry-after": "0" } } });
            };
            await assert.rejects(send({ ...request, cookie: "" }, { url: request.origin }),
                (error: unknown) => error instanceof LeetCodeApiError && error.kind === kind && error.response?.status === status
                    && !/invalid JSON/.test(error.message));
        }
    } finally { axios.defaults.adapter = adapter; }
});

test("favorite lists that LeetCode reports as null are empty, not invalid", async () => {
    const adapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config: any) => response({ favorites: {
        private_favorites: [{ id_hash: "a", name: "Favorite", questions: [] }], public_favorites: null, leetcode_favorites: null,
    } }, config);
    try {
        const data = await fetchFavoriteData(request);
        assert.deepEqual(data.lists.map((list) => list.idHash), ["a"]);
        assert.equal(data.hot100, undefined);
    } finally { axios.defaults.adapter = adapter; }
});

test("the poll deadline aborts a pending check and stays distinguishable from cancellation", async () => {
    const adapter = axios.defaults.adapter;
    let signal: AbortSignal | undefined;
    axios.defaults.adapter = async (config: any) => {
        if (config.method === "post") { return response({ submission_id: 1 }, config); }
        signal = config.signal;
        return new Promise((_resolve, reject) => config.signal.addEventListener("abort", () => reject(new axios.CanceledError()), { once: true }));
    };
    // The fake adapter has no socket to keep the event loop alive.
    const keepAlive = setTimeout(() => undefined, 2000);
    try {
        await assert.rejects(submitSolution(request, { slug: "two-sum", questionId: "1" }, "javascript", "mock", { pollTimeoutMs: 25 }),
            (error: unknown) => error instanceof LeetCodeApiError && error.kind === "timeout" && !isCanceled(error));
        assert.equal(signal?.aborted, true);
    } finally { clearTimeout(keepAlive); axios.defaults.adapter = adapter; }
});

test("canceling a judge rate-limit wait prevents another submission", async () => {
    const adapter = axios.defaults.adapter;
    const controller = new AbortController();
    let calls = 0;
    axios.defaults.adapter = async (config: any) => { calls++; return response({ error: "submit too soon" }, config); };
    try {
        const pending = assert.rejects(submitSolution({ ...request, signal: controller.signal }, { slug: "two-sum", questionId: "1" }, "javascript", "mock"), isCanceled);
        await tick();
        controller.abort();
        await pending;
        assert.equal(calls, 1);
    } finally { axios.defaults.adapter = adapter; }
});
