import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isSessionExpiredError } from "../../src/auth/session";

test("isSessionExpiredError recognizes 401 and 403", () => {
    assert.equal(isSessionExpiredError({ response: { status: 401 } }), true);
    assert.equal(isSessionExpiredError({ response: { status: 403 } }), true);
});

test("isSessionExpiredError ignores other failures", () => {
    assert.equal(isSessionExpiredError({ response: { status: 429 } }), false);
    assert.equal(isSessionExpiredError({ response: { status: 500 } }), false);
    assert.equal(isSessionExpiredError(new Error("network")), false);
    assert.equal(isSessionExpiredError(undefined), false);
});
