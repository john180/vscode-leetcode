import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ProblemCache } from "../../src/api/problemCache";

function storage() {
    const data = new Map<string, unknown>();
    return {
        get: (key: string) => structuredClone(data.get(key)),
        update: async (key: string, value: unknown) => { data.set(key, structuredClone(value)); },
        keys: () => [...data.keys()],
    } as any;
}

test("disk cache survives a new instance, clear removes persisted data", async () => {
    const disk = storage();
    const cache = new ProblemCache(); cache.initialize(disk);
    await cache.get("a", async () => ({ value: 1 }));
    const restored = new ProblemCache(); restored.initialize(disk);
    assert.deepEqual(await restored.get("a", async () => { throw new Error("offline"); }), { value: 1 });
    await restored.clear();
    const empty = new ProblemCache(); empty.initialize(disk);
    assert.equal(await empty.get("a", async () => 2), 2);
});

test("stale data is immediate, revalidates in background and survives network failure", async () => {
    const oldNow = Date.now;
    let now = 1_000_000; Date.now = () => now;
    try {
        const cache = new ProblemCache();
        await cache.get("a", async () => 1);
        now += 300_001;
        let release!: (n: number) => void;
        const gate = new Promise<number>((resolve) => { release = resolve; });
        const updated = new Promise<void>((resolve) => cache.events.once("updated", resolve));
        assert.equal(await cache.get("a", () => gate), 1);
        release(2); await updated;
        assert.equal(await cache.get("a", async () => 3), 2);
        now += 300_001;
        assert.equal(await cache.get("a", async () => { throw new Error("offline"); }), 2);
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(cache.values("a"), [2]);
    } finally { Date.now = oldNow; }
});

test("concurrent callers share requests, failure permits retry, force reports failure", async () => {
    const cache = new ProblemCache();
    let requests = 0;
    const loader = async () => { requests++; return 1; };
    assert.deepEqual(await Promise.all([cache.get("a", loader), cache.get("a", loader)]), [1, 1]);
    assert.equal(requests, 1);
    await assert.rejects(cache.get("a", async () => { throw new Error("offline"); }, true), /offline/);
    assert.equal(await cache.get("a", async () => 2), 1);
    assert.equal(await cache.get("a", async () => 2, true), 2);
});

test("clear and local changes prevent pending requests from resurrecting stale state", async () => {
    const cache = new ProblemCache();
    let release!: (value: { solved: boolean }) => void;
    const gate = new Promise<{ solved: boolean }>((resolve) => { release = resolve; });
    const pending = cache.get("a", () => gate);
    await cache.clear(); release({ solved: false }); await pending;
    assert.deepEqual(cache.values("a"), []);
    await cache.get("a", async () => ({ solved: false }));
    let releaseUpdate!: (value: { solved: boolean }) => void;
    const refreshing = cache.get("a", () => new Promise<{ solved: boolean }>((resolve) => { releaseUpdate = resolve; }), true);
    await cache.update<{ solved: boolean }>("a", (value) => { value.solved = true; });
    releaseUpdate({ solved: false }); await refreshing;
    assert.deepEqual(cache.values("a"), [{ solved: true }]);
});

test("cache ignores malformed envelopes and limits retention", async () => {
    const disk = storage();
    await disk.update("leetcode.problemCache.v1", { bad: null, expired: { at: 0, value: 1 } });
    const cache = new ProblemCache(); cache.initialize(disk);
    assert.deepEqual(cache.values(""), []);
    for (let i = 0; i < 305; i++) { await cache.get(`key:${i}`, async () => i); }
    assert.equal(cache.values("").length, 300);
});
