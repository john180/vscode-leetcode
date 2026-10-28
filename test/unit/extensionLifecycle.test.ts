import { strict as assert } from "node:assert";
import { EventEmitter } from "node:events";
import Module = require("node:module");
import { test } from "node:test";

const registered = new Map<string, (...args: any[]) => unknown>();
const errors: string[] = [];
const disposable = { dispose: () => undefined };
const noop = () => undefined;
let login: Promise<void> = Promise.resolve();
let refreshes = 0;
const manager = Object.assign(new EventEmitter(), {
    getStatus: () => 2,
    getUser: () => undefined,
    getLoginStatus: () => login,
    handleUriSignIn: noop,
});
const provider = {
    initialize: noop, setTreeView: noop, setMessage: noop,
    refresh: async () => { refreshes++; },
};
const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: { filename?: string }, isMain: boolean): unknown {
    if (parent?.filename?.endsWith("extension.js")) {
        if (request === "vscode") {
            return {
                commands: {
                    executeCommand: async () => undefined,
                    registerCommand: (name: string, command: (...args: any[]) => unknown) => {
                        registered.set(name, command);
                        return disposable;
                    },
                },
                window: {
                    createTreeView: () => disposable,
                    registerFileDecorationProvider: () => disposable,
                    registerUriHandler: () => disposable,
                },
                l10n: { t: (text: string) => text },
            };
        }
        const dependencies: Record<string, unknown> = {
            "./leetCodeManager": { leetCodeManager: manager },
            "./leetCodeChannel": { leetCodeChannel: { appendLine: (text: string) => errors.push(text) } },
            "./globalState": { globalState: { initialize: async () => undefined, getCookie: () => "test-cookie" } },
            "./shared": { setExtensionId: noop, UserStatus: { SignedIn: 1, SignedOut: 2, SigningIn: 3 } },
            "./api/problemCache": { problemCache: { initialize: noop } },
            "./auth/endpointResolver": { resolveEndpoint: async () => undefined },
            "./auth/session": { sessionEvents: new EventEmitter() },
            "./utils/problemDocumentContext": { registerProblemDocumentContext: noop },
            "./utils/uiUtils": { promptForOpenOutputChannel: (text: string) => errors.push(text) },
            "./webview/markdownEngine": { markdownEngine: { initialize: noop } },
            "./explorer/LeetCodeTreeDataProvider": { leetCodeTreeDataProvider: provider },
        };
        return dependencies[request] || {};
    }
    return originalLoad.call(this, request, parent, isMain);
};
const { activate }: typeof import("../../src/extension") = require("../../src/extension");
moduleLoader._load = originalLoad;

test("activation registers commands without waiting for session restoration", async () => {
    let release!: () => void;
    login = new Promise<void>((resolve) => { release = resolve; });
    let activated = false;
    const activation = activate({ extension: { id: "test" }, subscriptions: [], globalState: {} } as any)
        .then(() => { activated = true; });
    try {
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(activated, true);
        assert.ok(registered.has("leetcode.refreshExplorer"));
        assert.deepEqual(errors, []);
    } finally {
        release();
        await activation;
    }
});

test("manual refresh waits for session restoration before loading the tree", async () => {
    let release!: () => void;
    login = new Promise<void>((resolve) => { release = resolve; });
    refreshes = 0;
    const refresh = registered.get("leetcode.refreshExplorer")!();
    try {
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(refreshes, 0);
    } finally {
        release();
        await refresh;
    }
    assert.equal(refreshes, 1);
});
