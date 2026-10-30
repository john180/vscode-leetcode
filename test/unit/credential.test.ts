import { strict as assert } from "node:assert";
import { test } from "node:test";
import Module = require("node:module");
import { LeetCodeApiError } from "../../src/api/errors";

let query = async (): Promise<any> => ({ isSignedIn: true, username: "alice" });
const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean): unknown {
    if (request === "../request/query-user-data") { return { queryUserData: () => query() }; }
    return originalLoad.call(this, request, parent, isMain);
};
const { verifyCredential }: typeof import("../../src/auth/credential") = require("../../src/auth/credential");
moduleLoader._load = originalLoad;

async function stateFor(answer: () => Promise<any>): Promise<string> {
    query = answer;
    return (await verifyCredential("LEETCODE_SESSION=s; csrftoken=c")).state;
}

test("a credential is signed in only when userStatus names a signed-in user", async () => {
    const check = await verifyCredential("LEETCODE_SESSION=s; csrftoken=c");
    assert.deepEqual(check, { state: "signedIn", user: { isSignedIn: true, username: "alice" } });
    assert.equal(await stateFor(async () => ({ isSignedIn: false, username: "" })), "signedOut");
    assert.equal(await stateFor(async () => ({ isSignedIn: true, username: "" })), "signedOut");
});

test("only a 401 or a 200 asking to sign in proves a credential signed out", async () => {
    const unauthorized = { response: { status: 401 } };
    query = async () => { throw unauthorized; };
    assert.deepEqual(await verifyCredential("cookie"), { state: "signedOut", error: unauthorized });
    assert.equal(await stateFor(async () => { throw new LeetCodeApiError("authentication", "sign in", { status: 200 }); }), "signedOut");

    assert.equal(await stateFor(async () => { throw { response: { status: 403 } }; }), "unknown", "403 may be a CSRF failure or bot challenge");
    assert.equal(await stateFor(async () => { throw new LeetCodeApiError("graphql", "bad query", { status: 200 }); }), "unknown");
    assert.equal(await stateFor(async () => { throw new LeetCodeApiError("network", "offline"); }), "unknown");
});
