import { strict as assert } from "node:assert";
import { beforeEach, test } from "node:test";
import Module = require("node:module");

const items: any[] = [];
const warnings: string[] = [];
let endpoint = "leetcode";
let lookups: Array<{ resolve: (challenge: unknown) => void; reject: (error: Error) => void }> = [];

const dependencies: Record<string, unknown> = {
    "vscode": {
        l10n: { t: (text: string) => text },
        StatusBarAlignment: { Left: 1 },
        window: {
            createStatusBarItem: (id: string, alignment: number) => {
                const item: any = { id, alignment, shown: false, disposed: false, show: () => { item.shown = true; }, hide: () => { item.shown = false; }, dispose: () => { item.disposed = true; } };
                items.push(item);
                return item;
            },
        },
    },
    "../api/problems": { getDailyChallenge: () => new Promise((resolve, reject) => lookups.push({ resolve, reject })) },
    "../leetCodeChannel": { leetCodeChannel: { warn: (text: string) => warnings.push(text) } },
    "../shared": { Endpoint: { LeetCode: "leetcode", LeetCodeCN: "leetcode-cn" }, getEffectiveEndpoint: () => endpoint },
};
const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: { filename?: string }, isMain: boolean): unknown {
    if (parent?.filename?.endsWith("DailyChallengeStatusBarItem.js") && request in dependencies) {
        return dependencies[request];
    }
    return originalLoad.call(this, request, parent, isMain);
};
const { DailyChallengeStatusBarItem, getNextDailyReset }: typeof import("../../src/statusbar/DailyChallengeStatusBarItem")
    = require("../../src/statusbar/DailyChallengeStatusBarItem");
moduleLoader._load = originalLoad;

function challenge(completed: boolean, slug: string = "two-sum"): unknown {
    return { problem: { id: "1", slug, name: "Two Sum", difficulty: "Easy" }, completed };
}

/** Lets a refresh that was just answered finish. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => { items.length = 0; warnings.length = 0; lookups = []; endpoint = "leetcode"; });

test("the next challenge starts at midnight UTC on leetcode.com and at midnight in Beijing on leetcode.cn", () => {
    const at = (time: string): number => Date.parse(time);
    assert.equal(getNextDailyReset(at("2026-10-30T09:15:00Z"), "leetcode" as any), at("2026-10-31T00:00:00Z"));
    assert.equal(getNextDailyReset(at("2026-10-30T00:00:00Z"), "leetcode" as any), at("2026-10-31T00:00:00Z"), "a reset that is now is the past one");
    assert.equal(getNextDailyReset(at("2026-10-30T09:15:00Z"), "leetcode-cn" as any), at("2026-10-30T16:00:00Z"));
    assert.equal(getNextDailyReset(at("2026-10-30T17:00:00Z"), "leetcode-cn" as any), at("2026-10-31T16:00:00Z"));
});

test("signed in, the item shows today's problem and whether it was solved today", async () => {
    const daily = new DailyChallengeStatusBarItem();
    const [item] = items;
    assert.equal(item.id, "leetcode.dailyChallenge", "an id lets users hide it from the status bar's menu");
    assert.equal(item.command, "leetcode.openDailyChallenge");
    daily.setSignedIn(true);
    assert.equal(item.shown, false, "nothing to show before LeetCode answers");
    lookups[0].resolve(challenge(false));
    await settle();
    assert.equal(item.shown, true);
    assert.equal(item.text, "$(flame) Daily Challenge");
    assert.equal(item.tooltip, "1. Two Sum · Easy\nNot solved today. Click to open it.");

    daily.recordAccepted("another-problem");
    assert.equal(item.text, "$(flame) Daily Challenge", "another problem does not complete it");
    daily.recordAccepted("two-sum");
    assert.equal(item.text, "$(check) Daily Challenge");
    assert.match(item.tooltip, /Solved today\./);
    assert.equal(lookups.length, 1, "an accepted submission needs no request");

    daily.setVisible(false);
    assert.equal(item.shown, false);
    void daily.refresh();
    assert.equal(lookups.length, 1, "hidden, it asks LeetCode nothing");
    daily.setVisible(true);
    assert.equal(lookups.length, 2, "shown again, it asks");
    lookups[1].resolve(challenge(true));
    await settle();
    assert.equal(item.shown, true);
    daily.setSignedIn(false);
    assert.equal(item.shown, false);
    daily.dispose();
    assert.equal(item.disposed, true);
});

test("an answer for an older sign-in is ignored, and a failed check keeps what was shown", async () => {
    const daily = new DailyChallengeStatusBarItem();
    const [item] = items;
    daily.setSignedIn(true);
    daily.setSignedIn(true);
    lookups[1].resolve(challenge(true));
    await settle();
    lookups[0].resolve(challenge(false));
    await settle();
    assert.equal(item.text, "$(check) Daily Challenge");

    void daily.refresh();
    lookups[2].reject(new Error("offline"));
    await settle();
    assert.equal(item.text, "$(check) Daily Challenge");
    assert.equal(item.shown, true);
    assert.equal(warnings.length, 1);
    daily.dispose();
});
