import { strict as assert } from "node:assert";
import { EventEmitter } from "node:events";
import Module = require("node:module");
import { test } from "node:test";

const registered = new Map<string, (...args: any[]) => unknown>();
const errors: string[] = [];
const disposable = { dispose: () => undefined };
const noop = () => undefined;
let login: Promise<void> = Promise.resolve();
let initialize = async (): Promise<void> => undefined;
let refreshes = 0;
let status = 2;
let configurationChanged: ((event: any) => void) | undefined;
const siteChanges: unknown[] = [];
const subscriptions: any[] = [];
const sessionEvents = new EventEmitter();
const detailEvents: string[] = [];
const manager = Object.assign(new EventEmitter(), {
    getStatus: () => status,
    getUser: () => undefined,
    getLoginStatus: () => login,
    handleUriSignIn: noop,
    handleEndpointChange: async (endpoint: unknown) => { siteChanges.push(endpoint); },
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
                workspace: { onDidChangeConfiguration: (listener: (event: any) => void) => {
                    configurationChanged = listener;
                    return { dispose: () => { configurationChanged = undefined; } };
                } },
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
                    registerWebviewViewProvider: () => disposable,
                    onDidChangeActiveTextEditor: () => disposable,
                    registerUriHandler: () => disposable,
                },
                l10n: { t: (text: string) => text },
            };
        }
        const dependencies: Record<string, unknown> = {
            "./leetCodeManager": { leetCodeManager: manager },
            "./leetCodeChannel": { leetCodeChannel: { warn: (text: string) => errors.push(text), error: (text: string) => errors.push(text) } },
            "./globalState": { globalState: { initialize: () => initialize(), getCookie: () => "test-cookie" } },
            "./shared": { setExtensionId: noop, UserStatus: { SignedIn: 1, SignedOut: 2, SigningIn: 3 } },
            "./api/problemCache": { problemCache: { initialize: noop } },
            "./api/http": { setClientVersion: noop },
            "./auth/endpointResolver": { resolveEndpoint: async () => "leetcode-cn" },
            "./auth/session": { sessionEvents },
            "./utils/problemDocumentContext": { registerProblemDocumentContext: noop },
            "./utils/uiUtils": { DialogType: { error: "error" }, promptForOpenOutputChannel: (text: string) => errors.push(text) },
            "./webview/markdownEngine": { markdownEngine: { initialize: noop } },
            "./webview/leetCodePreviewProvider": { leetCodePreviewProvider: { clear: () => detailEvents.push("clear") } },
            "./commands/show": { followActiveEditor: () => detailEvents.push("follow") },
            "./statusbar/leetCodeStatusBarController": { leetCodeStatusBarController: { updateStatusBar: noop } },
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
    const activation = activate({ extension: { id: "test" }, subscriptions, globalState: {} } as any)
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

test("session changes clear the old detail before following the active editor", () => {
    detailEvents.length = 0;
    status = 1;
    manager.emit("statusChanged");
    assert.deepEqual(detailEvents, ["clear", "follow"]);
    detailEvents.length = 0;
    status = 2;
    manager.emit("statusChanged");
    assert.deepEqual(detailEvents, ["clear"]);
});

test("direct endpoint settings changes use the same transition and listeners are disposable", async () => {
    configurationChanged!({ affectsConfiguration: () => false });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(siteChanges, []);
    configurationChanged!({ affectsConfiguration: (key: string) => key === "leetcode.endpoint" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(siteChanges, ["leetcode-cn"]);
    for (const subscription of subscriptions) { subscription?.dispose?.(); }
    assert.equal(configurationChanged, undefined);
    assert.equal(sessionEvents.listenerCount("expired"), 0);
    assert.equal(manager.listenerCount("statusChanged"), 0);
});

// Activates again, so it runs last.
test("commands stay registered when restoring the stored state fails", async () => {
    registered.clear();
    errors.length = 0;
    initialize = async () => { throw new Error("keyring unavailable"); };
    await activate({ extension: { id: "test" }, subscriptions: [], globalState: {} } as any);
    assert.ok(registered.has("leetcode.signin"));
    assert.ok(registered.has("leetcode.refreshExplorer"));
    assert.deepEqual(errors, ["Extension initialization failed. Please open the output channel for details."]);
});
