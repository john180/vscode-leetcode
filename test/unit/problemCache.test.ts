import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ProblemCache } from "../../src/api/problemCache";

function storage() {
    const data = new Map<string, unknown>();
    const disk = {
        writes: 0,
        get: (key: string) => structuredClone(data.get(key)),
        update: async (key: string, value: unknown) => { disk.writes++; data.set(key, structuredClone(value)); },
        keys: () => [...data.keys()],
    };
    return disk as any;
}

test("disk cache survives a new instance, clear removes persisted data", async () => {
    const disk = storage();
    const cache = new ProblemCache(); cache.initialize(disk);
    await cache.get("a", async () => ({ value: 1 }));
    await cache.flush();
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

test("a burst of loads is written to disk once", async () => {
    const oldSetTimeout = global.setTimeout;
    const timers: Array<() => void> = [];
    (global as any).setTimeout = (callback: () => void) => { timers.push(callback); return { unref: () => undefined }; };
    try {
        const disk = storage();
        const cache = new ProblemCache(); cache.initialize(disk);
        await Promise.all(Array.from({ length: 20 }, (_, i) => cache.get(`single:${i}`, async () => i)));
        assert.equal(disk.writes, 0);
        assert.equal(timers.length, 1, "one write is scheduled for the whole burst");
        timers[0]();
        await cache.flush();
        const restored = new ProblemCache(); restored.initialize(disk);
        assert.equal(restored.values("single:").length, 20);
    } finally { (global as any).setTimeout = oldSetTimeout; }
});

test("memory-only results are reusable but never stored, announced or kept over browsed pages", async () => {
    const disk = storage();
    const cache = new ProblemCache(); cache.initialize(disk);
    const announced: string[] = [];
    cache.events.on("updated", (key: string) => announced.push(key));
    await cache.get("page:browse", async () => "browse");
    assert.equal(await cache.get("page:search", async () => "search", false, false), "search");
    assert.equal(await cache.get("page:search", async () => "again", false, false), "search");
    assert.deepEqual(announced, ["page:browse"]);
    await cache.flush();
    assert.deepEqual(Object.keys(disk.get("leetcode.problemCache.v1")), ["page:browse"]);

    for (let i = 0; i < 300; i++) { await cache.get(`search:${i}`, async () => i, false, false); }
    assert.deepEqual(cache.values("page:browse"), ["browse"], "searches evict each other first");
    cache.reset();
    assert.deepEqual(cache.values("search:"), []);
    assert.deepEqual(cache.values("page:browse"), ["browse"]);
});
