import { strict as assert } from "node:assert";
import { beforeEach, test } from "node:test";
import Module = require("node:module");
import { getSite } from "../../src/site";

const opened: string[] = [];
const messages: string[] = [];
const prompts: string[] = [];
const signIns: Array<{ cookie: string; confirmed?: boolean }> = [];
let pick = "WebAuth";
let acceptAccount = true;
let warnings = 0;
let signedOutByExpiry = false;
let waiting = false;

const manager = {
    beginWebLogin: () => { waiting = true; return "https://leetcode.com/authorize-login/vscode/"; },
    takeWebLogin: () => { const taken = waiting; waiting = false; return taken; },
    signInWithCookie: async (cookie: string, options?: { confirm?: (username: string, site: unknown) => Promise<boolean> }) => {
        const confirmed = options?.confirm ? await options.confirm("alice", getSite("leetcode")) : undefined;
        signIns.push({ cookie, confirmed });
        return confirmed === false ? undefined : "alice";
    },
    handleSessionExpired: async () => signedOutByExpiry,
    signOut: async () => undefined,
};
const format = (text: string, ...args: unknown[]) => text.replace(/\{(\d+)\}/g, (_: string, index: string) => String(args[+index]));
const dependencies: Record<string, unknown> = {
    "vscode": {
        l10n: { t: format },
        ProgressLocation: { Notification: 15 },
        window: {
            showQuickPick: async (items: Array<{ value: string }>) => items.find((item) => item.value === pick),
            showInformationMessage: async (message: string, options?: { modal?: boolean }, ...items: string[]) => {
                if (options?.modal) { return acceptAccount ? items[0] : undefined; }
                messages.push(message);
                return undefined;
            },
            showWarningMessage: async () => { warnings++; return undefined; },
            withProgress: async (_options: unknown, task: (progress: unknown) => Promise<unknown>) => task({ report: () => undefined }),
        },
    },
    "../api/http": { isCanceled: () => false },
    "../api/request": { getLeetCodeRequest: () => ({ isCurrent: () => true }) },
    "../leetCodeChannel": { leetCodeChannel: { error: () => undefined } },
    "../leetCodeManager": { leetCodeManager: manager },
    "../shared": { currentSite: () => getSite("leetcode") },
    "../utils/uiUtils": {
        DialogType: { error: "error" },
        openUrl: async (url: string) => { opened.push(url); },
        promptForOpenOutputChannel: async (message: string) => { prompts.push(message); },
    },
};
const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: { filename?: string }, isMain: boolean): unknown {
    if (/[\\/]commands[\\/]auth\.js$/.test(parent?.filename || "") && request in dependencies) {
        return dependencies[request];
    }
    return originalLoad.call(this, request, parent, isMain);
};
const auth: typeof import("../../src/commands/auth") = require("../../src/commands/auth");
moduleLoader._load = originalLoad;

const callback = { query: "cookie=LEETCODE_SESSION%3Duri%3B%20csrftoken%3Duri" } as any;

beforeEach(() => {
    opened.length = 0; messages.length = 0; prompts.length = 0; signIns.length = 0;
    pick = "WebAuth"; acceptAccount = true; warnings = 0; signedOutByExpiry = false; waiting = false;
});

test("a callback signs in only for a web login started from Sign In, once, after the account is confirmed", async () => {
    await auth.handleUri(callback);
    assert.deepEqual(signIns, [], "an unsolicited callback");

    await auth.signIn();
    assert.deepEqual(opened, ["https://leetcode.com/authorize-login/vscode/"]);
    await auth.handleUri(callback);
    assert.deepEqual(signIns, [{ cookie: "LEETCODE_SESSION=uri; csrftoken=uri", confirmed: true }]);
    assert.ok(messages.includes("Successfully signed in as alice."));

    await auth.handleUri(callback);
    assert.equal(signIns.length, 1, "a callback must not be reusable");
});

test("an account the user does not confirm is not reported as signed in", async () => {
    acceptAccount = false;
    await auth.signIn();
    await auth.handleUri(callback);
    assert.deepEqual(signIns, [{ cookie: "LEETCODE_SESSION=uri; csrftoken=uri", confirmed: false }]);
    assert.equal(messages.some((message) => message.startsWith("Successfully signed in")), false);
});

test("an OAuth error callback is reported without signing in", async () => {
    await auth.signIn();
    await auth.handleUri({ query: "error=access_denied&error_description=Cancelled" } as any);
    assert.deepEqual(signIns, []);
    assert.deepEqual(prompts, ["Login was not completed: Cancelled"]);
});

test("a rejected request offers to sign in again only once the session was signed out", async () => {
    await auth.handleSessionExpired({} as any);
    assert.equal(warnings, 0);
    signedOutByExpiry = true;
    await auth.handleSessionExpired({} as any);
    assert.equal(warnings, 1);
});
