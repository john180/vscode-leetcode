import { strict as assert } from "node:assert";
import { test } from "node:test";
import { SessionController } from "../../src/auth/sessionController";
import { Endpoint } from "../../src/site";

const user = { isSignedIn: true, isPremium: false, username: "alice", avatar: "" };

test("a later operation supersedes an earlier one, and only the latest changes the session", () => {
    const sessions = new SessionController();
    const first = sessions.begin();
    assert.equal(sessions.latest(), first, "joining the latest operation does not supersede it");
    const second = sessions.begin();
    assert.equal(first.isCurrent(), false);
    assert.equal(first.signal.aborted, true, "the earlier operation's checks with LeetCode stop");
    assert.equal(second.isCurrent(), true);

    sessions.publish(first, "stale", "old");
    sessions.end(first, Endpoint.LeetCodeCN);
    assert.equal(sessions.current().cookie, undefined);
    assert.equal(sessions.current().site, Endpoint.LeetCode);

    sessions.publish(second, "cookie", "alice");
    assert.deepEqual([sessions.current().cookie, sessions.current().profile], ["cookie", "alice"]);
});

test("only another cookie or site ends a session and its requests", () => {
    const sessions = new SessionController();
    const operation = sessions.begin();
    sessions.publish(operation, "cookie", undefined);
    sessions.setUser(operation, user);
    const session = sessions.current();

    sessions.publish(operation, "cookie", "alice");
    assert.equal(session.signal.aborted, false, "naming the cookie's account keeps the session");
    assert.equal(sessions.current().user, user);

    sessions.publish(operation, "other", "bob");
    assert.equal(session.signal.aborted, true);
    assert.equal(sessions.current().user, undefined, "the user status belongs to the old cookie");

    const replaced = sessions.current();
    sessions.end(operation, Endpoint.LeetCodeCN);
    assert.equal(replaced.signal.aborted, true);
    assert.deepEqual([sessions.current().site, sessions.current().cookie], [Endpoint.LeetCodeCN, undefined]);

    const ended = sessions.current();
    sessions.revoke();
    assert.equal(ended.signal.aborted, true);
    assert.equal(operation.isCurrent(), false, "revoking supersedes every operation");
});

test("writes run in order, and a superseded operation's write is skipped without blocking later ones", async () => {
    const sessions = new SessionController();
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const blocked = sessions.enqueue(async () => { await gate; order.push("blocked"); throw new Error("keyring unavailable"); });
    const stale = sessions.begin();
    const skipped = sessions.commit(stale, async () => { order.push("stale"); });
    const latest = sessions.begin();
    const cleanup = sessions.enqueue(async () => { order.push("cleanup"); });
    const write = sessions.commit(latest, async () => { order.push("latest"); });
    release();
    await assert.rejects(blocked, /keyring unavailable/);
    await Promise.all([skipped, cleanup, write]);
    assert.deepEqual(order, ["blocked", "cleanup", "latest"]);
});
