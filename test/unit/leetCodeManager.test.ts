import { strict as assert } from "node:assert";
import { test } from "node:test";
import Module = require("node:module");

let queryResult: any = {
    isSignedIn: true,
    username: "alice",
    isPremium: false,
    avatar: "",
};
let warnings = 0;
let confirmLogin = false;
let endpoint = "leetcode";
let query = async (): Promise<any> => queryResult;

const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean): unknown {
    if (request === "vscode") {
        return {
            env: { appName: "Visual Studio Code", uriScheme: "vscode", appRoot: process.cwd() },
            workspace: {
                getConfiguration: () => ({
                    get: (key: string, defaultValue: unknown) => {
                        if (key === "endpoint") return "leetcode";
                        if (key === "userGraphql") return "https://leetcode.com/graphql";
                        return defaultValue;
                    },
                }),
                onDidChangeConfiguration: () => ({ dispose: () => undefined }),
            },
            window: {
                showInformationMessage: async (_message: string, options: any, ...items: string[]) =>
                    options?.modal && confirmLogin ? items[0] : undefined,
                showQuickPick: async () => ({ value: "WebAuth" }),
                showWarningMessage: async () => {
                    warnings += 1;
                    return undefined;
                },
                showErrorMessage: async () => undefined,
                createOutputChannel: () => ({
                    append: () => undefined,
                    appendLine: () => undefined,
                    dispose: () => undefined,
                    show: () => undefined,
                }),
                withProgress: async (_options: unknown, task: (progress: any) => Promise<unknown>) => task({
                    report: () => undefined,
                }),
            },
            commands: { executeCommand: async () => undefined },
            Uri: { file: (value: string) => ({ fsPath: value, toString: () => value }) },
            l10n: { t: (value: string) => value },
            ProgressLocation: { Notification: 15 },
            ViewColumn: { One: 1, Two: 2 },
        };
    }
    if (request.endsWith("request/query-user-data")) {
        return { queryUserData: () => query() };
    }
    if (request.endsWith("commands/plugin")) {
        return { getLeetCodeEndpoint: () => endpoint };
    }
    if (request.endsWith("api/problems")) {
        return { invalidateProblemCache: () => undefined };
    }
    if (request.endsWith("utils/uiUtils")) {
        return {
            DialogType: { error: "error", info: "info" },
            openUrl: async () => undefined,
            promptForOpenOutputChannel: async () => undefined,
            promptForSignIn: async () => undefined,
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { globalState } = require("../../src/globalState");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { leetCodeManager } = require("../../src/leetCodeManager");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { UserStatus } = require("../../src/shared");

class FakeMemento {
    public readonly values = new Map<string, unknown>();
    public get<T>(key: string, defaultValue?: T): T {
        return this.values.has(key) ? this.values.get(key) as T : defaultValue as T;
    }
    public async update(key: string, value: unknown): Promise<void> {
        if (value === undefined) this.values.delete(key);
        else this.values.set(key, value);
    }
}

class FakeSecrets {
    public readonly values = new Map<string, string>();
    public async get(key: string): Promise<string | undefined> {
        return this.values.get(key);
    }
    public async store(key: string, value: string): Promise<void> {
        this.values.set(key, value);
    }
    public async delete(key: string): Promise<void> {
        this.values.delete(key);
    }
}

function contextWithCookie(cookie?: string): any {
    const memento = new FakeMemento();
    const secrets = new FakeSecrets();
    if (cookie) {
        secrets.values.set("leetcode-cookie", cookie);
    }
    return { globalState: memento, secrets };
}

test("leetCodeManager transitions through signing in, signed in, expiry, and signed out", async () => {
    const statuses: number[] = [];
    leetCodeManager.on("statusChanged", () => statuses.push(leetCodeManager.getStatus()));

    await globalState.initialize(contextWithCookie("LEETCODE_SESSION=session; csrftoken=csrf"));
    queryResult = { isSignedIn: true, username: "alice", isPremium: false, avatar: "" };
    await leetCodeManager.getLoginStatus();
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedIn);
    assert.equal(leetCodeManager.getUser(), "alice");
    assert.deepEqual(statuses.slice(0, 2), [UserStatus.SigningIn, UserStatus.SignedIn]);

    warnings = 0;
    await leetCodeManager.handleSessionExpired();
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedOut);
    assert.equal(leetCodeManager.getUser(), undefined);
    assert.equal(warnings, 1);
    await leetCodeManager.handleSessionExpired();
    assert.equal(warnings, 1);

    queryResult = { isSignedIn: false, username: "", isPremium: false, avatar: "" };
    await globalState.removeAll();
    await globalState.initialize(contextWithCookie("LEETCODE_SESSION=bad; csrftoken=csrf"));
    statuses.length = 0;
    await leetCodeManager.getLoginStatus();
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedOut);
    assert.deepEqual(statuses, [UserStatus.SigningIn, UserStatus.SignedOut]);
});

test("leetCodeManager starts signed out without a cookie", async () => {
    await globalState.removeAll();
    await globalState.initialize(contextWithCookie());
    queryResult = { isSignedIn: true, username: "alice", isPremium: false, avatar: "" };
    await leetCodeManager.getLoginStatus();
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedOut);
    assert.equal(leetCodeManager.getUser(), undefined);
});

test("leetCodeManager handles URI sign-in and profile switching", async () => {
    await globalState.removeAll();
    await globalState.initialize(contextWithCookie());
    queryResult = { isSignedIn: true, username: "uri-user", isPremium: false, avatar: "" };
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parseAuthCallback } = require("../../src/auth/login");
    assert.equal((leetCodeManager as any).handlingUriSignIn, false);
    assert.equal(parseAuthCallback("cookie=LEETCODE_SESSION%3Duri%3B%20csrftoken%3Duri").cookie, "LEETCODE_SESSION=uri; csrftoken=uri");
    await leetCodeManager.signIn();
    confirmLogin = true;
    await leetCodeManager.handleUriSignIn({
        query: "cookie=LEETCODE_SESSION%3Duri%3B%20csrftoken%3Duri",
    } as any);
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedIn);
    assert.equal(leetCodeManager.getUser(), "uri-user");

    queryResult = { isSignedIn: true, username: "bob", isPremium: false, avatar: "" };
    await leetCodeManager.createProfile("bob", "LEETCODE_SESSION=bob; csrftoken=bob");
    assert.deepEqual(globalState.getProfiles().map((profile: any) => profile.name), ["uri-user", "bob"]);

    queryResult = { isSignedIn: true, username: "uri-user", isPremium: false, avatar: "" };
    await leetCodeManager.switchProfile("uri-user");
    assert.equal(leetCodeManager.getUser(), "uri-user");

    await leetCodeManager.deleteProfile("bob");
    assert.deepEqual(
        globalState.getProfiles().map((profile: any) => profile.name),
        ["uri-user"],
        JSON.stringify(globalState.getProfiles()),
    );
});

test("leetCodeManager ignores an OAuth error callback", async () => {
    await globalState.removeAll();
    await leetCodeManager.signOut();
    await globalState.initialize(contextWithCookie());
    await leetCodeManager.signIn();
    await leetCodeManager.handleUriSignIn({ query: "error=access_denied&error_description=Cancelled" } as any);
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedOut);
    assert.equal(leetCodeManager.getUser(), undefined);
});

test("leetCodeManager rejects an invalid profile cookie", async () => {
    await assert.rejects(leetCodeManager.createProfile("bad", "not-a-cookie"), /Cookie must/);
});

const callback = { query: "cookie=LEETCODE_SESSION%3Duri%3B%20csrftoken%3Duri" };

test("URI login rejects unsolicited, expired, wrong-site and replayed callbacks", async () => {
    await leetCodeManager.signOut();
    const context = contextWithCookie();
    await globalState.initialize(context);
    let requests = 0;
    query = async () => { requests++; return { ...queryResult, isSignedIn: true, username: "callback-user" }; };
    await leetCodeManager.handleUriSignIn(callback);
    assert.equal(requests, 0);

    await leetCodeManager.signIn();
    const now = Date.now;
    Date.now = () => now() + 6 * 60 * 1000;
    try {
        await leetCodeManager.handleUriSignIn(callback);
    } finally {
        Date.now = now;
    }
    assert.equal(requests, 0);

    await leetCodeManager.signIn();
    endpoint = "leetcode-cn";
    await leetCodeManager.handleUriSignIn(callback);
    endpoint = "leetcode";
    assert.equal(requests, 0);

    await leetCodeManager.signIn();
    confirmLogin = false;
    await leetCodeManager.handleUriSignIn(callback);
    assert.equal(requests, 1);
    assert.equal(globalState.getCookie(), undefined);
    confirmLogin = true;
    await leetCodeManager.handleUriSignIn(callback);
    assert.equal(requests, 1, "a rejected callback must not be reusable");
    assert.equal(globalState.getCookie(), undefined);
    query = async () => queryResult;
});

test("temporary login validation failures preserve the credential for retry", async () => {
    for (const status of [undefined, 403, 429, 500]) {
        await leetCodeManager.signOut();
        const context = contextWithCookie("LEETCODE_SESSION=kept; csrftoken=csrf");
        await globalState.initialize(context);
        query = async () => { throw { response: { status } }; };
        await leetCodeManager.getLoginStatus();
        assert.equal(context.secrets.values.get("leetcode-cookie"), "LEETCODE_SESSION=kept; csrftoken=csrf");
        assert.equal(globalState.getCookie(), "LEETCODE_SESSION=kept; csrftoken=csrf");
        assert.equal(leetCodeManager.getStatus(), UserStatus.SignedOut);
    }
    query = async () => { throw { response: { status: 401 } }; };
    await leetCodeManager.getLoginStatus();
    assert.equal(globalState.getCookie(), undefined);
    query = async () => queryResult;
});

test("background login cannot restore an account after sign-out", async () => {
    await globalState.initialize(contextWithCookie("LEETCODE_SESSION=old; csrftoken=csrf"));
    let resolveQuery!: (value: any) => void;
    query = () => new Promise((resolve) => { resolveQuery = resolve; });
    const restoration = leetCodeManager.getLoginStatus();
    await leetCodeManager.signOut();
    resolveQuery({ isSignedIn: true, username: "old", isPremium: false, avatar: "" });
    await restoration;
    assert.equal(leetCodeManager.getUser(), undefined);
    assert.equal(globalState.getCookie(), undefined);
    query = async () => queryResult;
});

test("sign-out waits for in-flight credential writes and remains signed out", async () => {
    await leetCodeManager.signOut();
    const context = contextWithCookie("LEETCODE_SESSION=old; csrftoken=csrf");
    await globalState.initialize(context);
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const writing = new Promise<void>((resolve) => { entered = resolve; });
    const store = context.secrets.store.bind(context.secrets);
    let first = true;
    context.secrets.store = async (key: string, value: string) => {
        if (first) {
            first = false;
            entered();
            await blocked;
        }
        await store(key, value);
    };
    queryResult = { isSignedIn: true, username: "old", isPremium: false, avatar: "" };
    const restoration = leetCodeManager.getLoginStatus();
    await writing;
    const signingOut = leetCodeManager.signOut();
    release();
    await Promise.all([restoration, signingOut]);
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedOut);
    assert.equal(leetCodeManager.getUser(), undefined);
    assert.equal(globalState.getCookie(), undefined);
    assert.equal(context.secrets.values.has("leetcode-cookie"), false);
    assert.equal(context.globalState.values.has("leetcode-active-profile"), false);
});

test("a rejected profile switch leaves the current credential unchanged", async () => {
    await globalState.initialize(contextWithCookie());
    queryResult = { isSignedIn: true, username: "alice", isPremium: false, avatar: "" };
    await leetCodeManager.createProfile("alice", "LEETCODE_SESSION=alice; csrftoken=csrf");
    queryResult = { isSignedIn: true, username: "bob", isPremium: false, avatar: "" };
    await leetCodeManager.createProfile("bob", "LEETCODE_SESSION=bob; csrftoken=csrf");
    queryResult = { isSignedIn: false, username: "", isPremium: false, avatar: "" };
    await assert.rejects(leetCodeManager.switchProfile("alice"), /no longer signed in/);
    assert.equal(globalState.getActiveProfile(), "bob");
    assert.equal(globalState.getCookie(), "LEETCODE_SESSION=bob; csrftoken=csrf");
    assert.equal(leetCodeManager.getUser(), "bob");
});

test("a failed profile switch during restoration does not leave the view signing in", async () => {
    await leetCodeManager.signOut();
    await globalState.initialize(contextWithCookie());
    queryResult = { isSignedIn: true, username: "alice", isPremium: false, avatar: "" };
    await leetCodeManager.createProfile("alice", "LEETCODE_SESSION=alice; csrftoken=csrf");
    queryResult = { isSignedIn: true, username: "bob", isPremium: false, avatar: "" };
    await leetCodeManager.createProfile("bob", "LEETCODE_SESSION=bob; csrftoken=csrf");

    let resolveRestore!: (value: any) => void;
    query = () => new Promise((resolve) => { resolveRestore = resolve; });
    const restoration = leetCodeManager.getLoginStatus();
    assert.equal(leetCodeManager.getStatus(), UserStatus.SigningIn);
    const resolvePending = resolveRestore;
    query = async () => ({ isSignedIn: false, username: "", isPremium: false, avatar: "" });
    await assert.rejects(leetCodeManager.switchProfile("alice"), /no longer signed in/);
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedOut);
    resolvePending({ isSignedIn: true, username: "bob", isPremium: false, avatar: "" });
    await restoration;
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedOut);
    assert.equal(globalState.getCookie(), "LEETCODE_SESSION=bob; csrftoken=csrf", "the credential is kept for a manual refresh");
    query = async () => queryResult;
});

test("a superseded restoration does not leave the view signing in", async () => {
    await leetCodeManager.signOut();
    await globalState.initialize(contextWithCookie("LEETCODE_SESSION=kept; csrftoken=csrf"));
    let resolveRestore!: (value: any) => void;
    query = () => new Promise((resolve) => { resolveRestore = resolve; });
    const restoration = leetCodeManager.getLoginStatus();
    (leetCodeManager as any).authRevision++;
    resolveRestore({ isSignedIn: true, username: "kept", isPremium: false, avatar: "" });
    await restoration;
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedOut);
    query = async () => queryResult;
});

test("deleting another session during restoration resumes restoring the current one", async () => {
    await leetCodeManager.signOut();
    await globalState.initialize(contextWithCookie());
    queryResult = { isSignedIn: true, username: "alice", isPremium: false, avatar: "" };
    await leetCodeManager.createProfile("alice", "LEETCODE_SESSION=alice; csrftoken=csrf");
    queryResult = { isSignedIn: true, username: "bob", isPremium: false, avatar: "" };
    await leetCodeManager.createProfile("bob", "LEETCODE_SESSION=bob; csrftoken=csrf");

    let resolveFirst!: (value: any) => void;
    query = () => new Promise((resolve) => { resolveFirst = resolve; });
    const restoration = leetCodeManager.getLoginStatus();
    const resolveInterrupted = resolveFirst;
    const resumed = new Promise<void>((resolve) => {
        query = async () => { resolve(); return { isSignedIn: true, username: "bob", isPremium: false, avatar: "" }; };
    });
    await leetCodeManager.deleteProfile("alice");
    resolveInterrupted({ isSignedIn: true, username: "bob", isPremium: false, avatar: "" });
    await Promise.all([restoration, resumed]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedIn);
    assert.equal(leetCodeManager.getUser(), "bob");
    query = async () => queryResult;
});

test("a rejected later login cannot cancel queued sign-out cleanup", async () => {
    await leetCodeManager.signOut();
    const context = contextWithCookie("LEETCODE_SESSION=old; csrftoken=csrf");
    await globalState.initialize(context);
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const writing = new Promise<void>((resolve) => { entered = resolve; });
    const store = context.secrets.store.bind(context.secrets);
    context.secrets.store = async (key: string, value: string) => {
        entered();
        await gate;
        await store(key, value);
    };
    queryResult = { isSignedIn: true, username: "old", isPremium: false, avatar: "" };
    const restoration = leetCodeManager.getLoginStatus();
    await writing;
    const signingOut = leetCodeManager.signOut();
    await assert.rejects(leetCodeManager.createProfile("invalid", "invalid-cookie"));
    release();
    await Promise.all([restoration, signingOut]);
    assert.equal(globalState.getCookie(), undefined);
    assert.equal(context.secrets.values.has("leetcode-cookie"), false);
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedOut);
});
