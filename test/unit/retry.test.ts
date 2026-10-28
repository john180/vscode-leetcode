import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isRetryableError, retryDelayMs } from "../../src/api/retry";

test("isRetryableError retries transient failures only", () => {
    assert.equal(isRetryableError({ response: { status: 429 } }), true);
    assert.equal(isRetryableError({ response: { status: 500 } }), true);
    assert.equal(isRetryableError({ response: { status: 408 } }), true);
    assert.equal(isRetryableError(new Error("timeout")), true);
    assert.equal(isRetryableError({ response: { status: 400 } }), false);
    assert.equal(isRetryableError({ response: { status: 401 } }), false);
    assert.equal(isRetryableError({ response: { status: 403 } }), false);
    assert.equal(isRetryableError({ code: "ERR_CANCELED" }), false, "an aborted request has no response but is not a network failure");
});

test("retryDelayMs honors Retry-After seconds", () => {
    assert.equal(retryDelayMs(0, { response: { status: 429, headers: { "retry-after": "2" } } }), 2000);
});

test("retryDelayMs falls back to exponential backoff", () => {
    assert.equal(retryDelayMs(0), 500);
    assert.equal(retryDelayMs(1), 1000);
    assert.equal(retryDelayMs(4), 5000);
});
