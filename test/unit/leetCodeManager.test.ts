import { strict as assert } from "node:assert";
import { test } from "node:test";
import Module = require("node:module");

let queryResult: any = {
    isSignedIn: true,
    username: "alice",
    isPremium: false,
    avatar: "",
};
let endpoint = "leetcode";
let query = async (_cookie?: string, _signal?: AbortSignal): Promise<any> => queryResult;

const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean): unknown {
    if (request === "vscode") {
        return {
            env: { appName: "Visual Studio Code", uriScheme: "vscode", appRoot: process.cwd() },
            workspace: {
                getConfiguration: () => ({
                    get: (key: string, defaultValue: unknown) => {
                        if (key === "endpoint") return endpoint;
                        return defaultValue;
                    },
                }),
                onDidChangeConfiguration: () => ({ dispose: () => undefined }),
            },
            // The manager shows nothing; only the output channel is needed.
            window: {
                createOutputChannel: () => ({
                    info: () => undefined,
                    warn: () => undefined,
                    error: () => undefined,
                    dispose: () => undefined,
                    show: () => undefined,
                }),
            },
            l10n: { t: (value: string) => value },
        };
    }
    if (request.endsWith("request/query-user-data")) {
        return { queryUserData: (cookie?: string, signal?: AbortSignal) => query(cookie, signal) };
    }
    if (request.endsWith("api/problems")) {
        return { invalidateProblemCache: () => undefined };
    }
    return originalLoad.call(this, request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { globalState } = require("../../src/globalState");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { leetCodeManager } = require("../../src/leetCodeManager");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { UserStatus } = require("../../src/shared");
const { getLeetCodeRequest } = require("../../src/api/request");
const { sessionController } = require("../../src/auth/sessionController");

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

    queryResult = { isSignedIn: false, username: "", isPremium: false, avatar: "" };
    assert.equal(await leetCodeManager.handleSessionExpired(), true);
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedOut);
    assert.equal(leetCodeManager.getUser(), undefined);
    assert.equal(globalState.getCookie(), undefined);
    assert.equal(await leetCodeManager.handleSessionExpired(), false, "a signed-out session is not signed out again");

    queryResult = { isSignedIn: false, username: "", isPremium: false, avatar: "" };
    await globalState.removeAll();
    await globalState.initialize(contextWithCookie("LEETCODE_SESSION=bad; csrftoken=csrf"));
    statuses.length = 0;
    await leetCodeManager.getLoginStatus();
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedOut);
    assert.deepEqual(statuses, [UserStatus.SigningIn, UserStatus.SignedOut]);
});

test("a rejected request keeps a session that LeetCode still reports as signed in", async () => {
    await leetCodeManager.signOut();
    const cookie = "LEETCODE_SESSION=alive; csrftoken=csrf";
    await globalState.initialize(contextWithCookie(cookie));
    queryResult = { isSignedIn: true, username: "alice", isPremium: false, avatar: "" };
    await leetCodeManager.getLoginStatus();
    let checks = 0;
    query = async () => { checks++; return queryResult; };
    try {
        assert.equal(await leetCodeManager.handleSessionExpired(), false);
        assert.equal(checks, 1);
        assert.equal(leetCodeManager.getStatus(), UserStatus.SignedIn);
        assert.equal(globalState.getCookie(), cookie);

        await leetCodeManager.handleSessionExpired();
        assert.equal(checks, 1, "a session that was just confirmed is not checked again");
    } finally {
        query = async () => queryResult;
    }
});

test("a rejected request keeps the session when the check itself fails", async () => {
    for (const status of [undefined, 403, 500]) {
        await leetCodeManager.signOut();
        const cookie = `LEETCODE_SESSION=blocked-${status}; csrftoken=csrf`;
        await globalState.initialize(contextWithCookie(cookie));
        queryResult = { isSignedIn: true, username: "alice", isPremium: false, avatar: "" };
        query = async () => queryResult;
        await leetCodeManager.getLoginStatus();
        query = async () => { throw { response: { status } }; };
        assert.equal(await leetCodeManager.handleSessionExpired(), false);
        assert.equal(leetCodeManager.getStatus(), UserStatus.SignedIn);
        assert.equal(globalState.getCookie(), cookie);
    }

    await leetCodeManager.signOut();
    await globalState.initialize(contextWithCookie("LEETCODE_SESSION=revoked; csrftoken=csrf"));
    query = async () => queryResult;
    await leetCodeManager.getLoginStatus();
    query = async () => { throw { response: { status: 401 } }; };
    assert.equal(await leetCodeManager.handleSessionExpired(), true);
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedOut);
    assert.equal(globalState.getCookie(), undefined);
    query = async () => queryResult;
});

test("leetCodeManager starts signed out without a cookie", async () => {
    await globalState.removeAll();
    await globalState.initialize(contextWithCookie());
    queryResult = { isSignedIn: true, username: "alice", isPremium: false, avatar: "" };
    await leetCodeManager.getLoginStatus();
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedOut);
    assert.equal(leetCodeManager.getUser(), undefined);
});

test("leetCodeManager signs in a confirmed account, saves named sessions and switches between them", async () => {
    await globalState.removeAll();
    await globalState.initialize(contextWithCookie());
    queryResult = { isSignedIn: true, username: "uri-user", isPremium: false, avatar: "" };
    const confirmed: string[] = [];
    const confirm = async (username: string, site: { host: string }) => { confirmed.push(`${username}@${site.host}`); return true; };
    assert.equal(await leetCodeManager.signInWithCookie("LEETCODE_SESSION=uri; csrftoken=uri", { confirm }), "uri-user");
    assert.deepEqual(confirmed, ["uri-user@leetcode.com"], "the account is confirmed before the session changes");
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedIn);
    assert.equal(leetCodeManager.getUser(), "uri-user");

    queryResult = { isSignedIn: true, username: "bob", isPremium: false, avatar: "" };
    assert.equal(await leetCodeManager.signInWithCookie("LEETCODE_SESSION=bob; csrftoken=bob", { name: "bob" }), "bob");
    assert.deepEqual(globalState.getProfiles().map((profile: any) => profile.name), ["uri-user", "bob"]);

    queryResult = { isSignedIn: true, username: "uri-user", isPremium: false, avatar: "" };
    assert.equal(await leetCodeManager.switchProfile("uri-user"), true);
    assert.equal(leetCodeManager.getUser(), "uri-user");

    await leetCodeManager.deleteProfile("bob");
    assert.deepEqual(
        globalState.getProfiles().map((profile: any) => profile.name),
        ["uri-user"],
        JSON.stringify(globalState.getProfiles()),
    );
});

test("restoring the stored session keeps a web login the user is finishing in the browser", async () => {
    await leetCodeManager.signOut();
    await globalState.initialize(contextWithCookie());
    leetCodeManager.beginWebLogin();
    await leetCodeManager.getLoginStatus();
    assert.equal(leetCodeManager.takeWebLogin(), true);
});

test("naming a restored session after its account keeps requests made with the same cookie", async () => {
    await leetCodeManager.signOut();
    await globalState.initialize(contextWithCookie("LEETCODE_SESSION=same; csrftoken=csrf"));
    queryResult = { isSignedIn: true, username: "alice", isPremium: false, avatar: "" };
    assert.equal(globalState.getActiveProfile(), undefined, "upgraded credentials have no profile name yet");
    const snapshot = getLeetCodeRequest();
    await leetCodeManager.getLoginStatus();
    assert.equal(globalState.getActiveProfile(), "alice");
    assert.equal(snapshot.sessionSignal.aborted, false);
    assert.equal(snapshot.isCurrent(), true);
});

test("leetCodeManager rejects an invalid profile cookie", async () => {
    await assert.rejects(leetCodeManager.signInWithCookie("not-a-cookie", { name: "bad" }), /Cookie must/);
});

test("a web login accepts only its own callback, once, for its site and within five minutes", async () => {
    await leetCodeManager.signOut();
    await globalState.initialize(contextWithCookie());
    assert.equal(leetCodeManager.takeWebLogin(), false, "an unsolicited callback");

    leetCodeManager.beginWebLogin();
    const now = Date.now;
    Date.now = () => now() + 6 * 60 * 1000;
    try {
        assert.equal(leetCodeManager.takeWebLogin(), false, "an expired login");
    } finally {
        Date.now = now;
    }

    leetCodeManager.beginWebLogin();
    endpoint = "leetcode-cn";
    try {
        assert.equal(leetCodeManager.takeWebLogin(), false, "a login started for another site");
    } finally {
        endpoint = "leetcode";
    }

    assert.match(leetCodeManager.beginWebLogin(), /^https:\/\/leetcode\.com\/authorize-login\//);
    assert.equal(leetCodeManager.takeWebLogin(), true);
    assert.equal(leetCodeManager.takeWebLogin(), false, "a callback must not be reusable");
});

test("an account the user does not confirm is not signed in", async () => {
    await leetCodeManager.signOut();
    await globalState.initialize(contextWithCookie());
    let requests = 0;
    query = async () => { requests++; return { ...queryResult, isSignedIn: true, username: "callback-user" }; };
    try {
        assert.equal(await leetCodeManager.signInWithCookie("LEETCODE_SESSION=uri; csrftoken=uri", { confirm: async () => false }), undefined);
        assert.equal(requests, 1);
        assert.equal(globalState.getCookie(), undefined);
        assert.equal(leetCodeManager.getStatus(), UserStatus.SignedOut);
    } finally { query = async () => queryResult; }
});

test("temporary login validation failures preserve the credential for retry", async () => {
    for (const status of [undefined, 403, 429, 500]) {
        await leetCodeManager.signOut();
        const context = contextWithCookie("LEETCODE_SESSION=kept; csrftoken=csrf");
        await globalState.initialize(context);
        query = async () => { throw { response: { status } }; };
        await leetCodeManager.getLoginStatus();
        assert.equal(context.secrets.values.get("leetcode-cookie.v2:leetcode"), "LEETCODE_SESSION=kept; csrftoken=csrf");
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
    assert.equal(context.secrets.values.has("leetcode-cookie.v2:leetcode"), false);
    assert.equal(context.globalState.values.has("leetcode-active-profile:leetcode"), false);
});

test("a rejected profile switch leaves the current credential unchanged", async () => {
    await globalState.initialize(contextWithCookie());
    queryResult = { isSignedIn: true, username: "alice", isPremium: false, avatar: "" };
    await leetCodeManager.signInWithCookie("LEETCODE_SESSION=alice; csrftoken=csrf", { name: "alice" });
    queryResult = { isSignedIn: true, username: "bob", isPremium: false, avatar: "" };
    await leetCodeManager.signInWithCookie("LEETCODE_SESSION=bob; csrftoken=csrf", { name: "bob" });
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
    await leetCodeManager.signInWithCookie("LEETCODE_SESSION=alice; csrftoken=csrf", { name: "alice" });
    queryResult = { isSignedIn: true, username: "bob", isPremium: false, avatar: "" };
    await leetCodeManager.signInWithCookie("LEETCODE_SESSION=bob; csrftoken=csrf", { name: "bob" });

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
    sessionController.begin();
    resolveRestore({ isSignedIn: true, username: "kept", isPremium: false, avatar: "" });
    await restoration;
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedOut);
    query = async () => queryResult;
});

test("deleting another session during restoration resumes restoring the current one", async () => {
    await leetCodeManager.signOut();
    await globalState.initialize(contextWithCookie());
    queryResult = { isSignedIn: true, username: "alice", isPremium: false, avatar: "" };
    await leetCodeManager.signInWithCookie("LEETCODE_SESSION=alice; csrftoken=csrf", { name: "alice" });
    queryResult = { isSignedIn: true, username: "bob", isPremium: false, avatar: "" };
    await leetCodeManager.signInWithCookie("LEETCODE_SESSION=bob; csrftoken=csrf", { name: "bob" });

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
    await assert.rejects(leetCodeManager.signInWithCookie("invalid-cookie", { name: "invalid" }));
    release();
    await Promise.all([restoration, signingOut]);
    assert.equal(globalState.getCookie(), undefined);
    assert.equal(context.secrets.values.has("leetcode-cookie.v2:leetcode"), false);
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedOut);
});

test("site changes revoke snapshots immediately and restore only the selected site's account", async () => {
    await leetCodeManager.signOut();
    await globalState.initialize(contextWithCookie());
    const us = "LEETCODE_SESSION=us; csrftoken=csrf";
    const cn = "LEETCODE_SESSION=cn; csrftoken=csrf";
    const validated: string[] = [];
    query = async (cookie) => {
        validated.push(cookie!);
        return { isSignedIn: true, username: cookie === us ? "alice-us" : "alice-cn", isPremium: false, avatar: "" };
    };
    try {
        await leetCodeManager.signInWithCookie(us, { name: "alice" });
        const previous = getLeetCodeRequest();
        assert.equal(Object.isFrozen(previous), true);
        endpoint = "leetcode-cn";
        assert.equal(previous.isCurrent(), false, "the settings change is visible before its event is handled");
        assert.equal(getLeetCodeRequest().cookie, "", "old-site credentials must never be sent to the new site");
        const before = validated.length;
        await leetCodeManager.getLoginStatus();
        assert.equal(validated.length, before, "refreshing before the configuration listener must not validate an old-site cookie");
        assert.equal(previous.sessionSignal.aborted, true);
        assert.equal(leetCodeManager.getUser(), undefined);
        await leetCodeManager.signInWithCookie(cn, { name: "alice" });
        endpoint = "leetcode";
        const switching = leetCodeManager.handleEndpointChange(endpoint);
        assert.equal(switching, leetCodeManager.handleEndpointChange(endpoint), "picker and listener share one transition");
        await switching;
        assert.equal(leetCodeManager.getUser(), "alice-us");
        assert.equal(globalState.getCookie(), us);
        assert.equal(globalState.getProfiles()[0].username, "alice-us");
        endpoint = "leetcode-cn";
        await leetCodeManager.handleEndpointChange(endpoint);
        assert.equal(leetCodeManager.getUser(), "alice-cn");
        assert.equal(globalState.getCookie(), cn);
    } finally {
        endpoint = "leetcode";
        await leetCodeManager.handleEndpointChange(endpoint);
        query = async () => queryResult;
    }
});

test("a later site selection wins over a blocked keyring read for the previous selection", async () => {
    await leetCodeManager.signOut();
    const context = contextWithCookie();
    await globalState.initialize(context);
    queryResult = { isSignedIn: true, username: "alice", isPremium: false, avatar: "" };
    await leetCodeManager.signInWithCookie("LEETCODE_SESSION=us; csrftoken=csrf", { name: "alice" });
    const get = context.secrets.get.bind(context.secrets);
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const reading = new Promise<void>((resolve) => { entered = resolve; });
    context.secrets.get = async (key: string) => {
        if (key.includes("leetcode-cn")) { entered(); await gate; }
        return get(key);
    };
    endpoint = "leetcode-cn";
    const first = leetCodeManager.handleEndpointChange(endpoint);
    await reading;
    assert.equal(leetCodeManager.getLoginStatus(), first, "refresh joins the pending site transition instead of canceling it");
    endpoint = "leetcode";
    const latest = leetCodeManager.handleEndpointChange(endpoint);
    release();
    await Promise.all([first, latest]);
    assert.equal(globalState.getEndpoint(), "leetcode");
    assert.equal(globalState.getCookie(), "LEETCODE_SESSION=us; csrftoken=csrf");
    assert.equal(leetCodeManager.getUser(), "alice");
});

test("sign-out revokes requests before delayed status persistence finishes", async () => {
    await leetCodeManager.signOut();
    const context = contextWithCookie("LEETCODE_SESSION=old; csrftoken=csrf");
    await globalState.initialize(context);
    const update = context.globalState.update.bind(context.globalState);
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const writing = new Promise<void>((resolve) => { entered = resolve; });
    context.globalState.update = async (key: string, value: unknown) => {
        if (key.startsWith("leetcode-user-status:") && value) { entered(); await gate; }
        await update(key, value);
    };
    const restoration = leetCodeManager.getLoginStatus();
    await writing;
    const snapshot = getLeetCodeRequest();
    const signingOut = leetCodeManager.signOut();
    assert.equal(snapshot.sessionSignal.aborted, true);
    assert.equal(globalState.getCookie(), undefined);
    release();
    await Promise.all([restoration, signingOut]);
    assert.equal(leetCodeManager.getUser(), undefined);
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedOut);
    assert.equal(globalState.getUserStatus(), undefined);
});

test("an expired request from before sign-out cannot affect a later login with the same cookie", async () => {
    await leetCodeManager.signOut();
    await globalState.initialize(contextWithCookie());
    const cookie = "LEETCODE_SESSION=alice; csrftoken=csrf";
    await leetCodeManager.signInWithCookie(cookie, { name: "alice" });
    const old = getLeetCodeRequest();
    await leetCodeManager.signOut();
    await leetCodeManager.signInWithCookie(cookie, { name: "alice" });
    let checks = 0;
    query = async () => { checks++; return { isSignedIn: false }; };
    try {
        await leetCodeManager.handleSessionExpired(old);
        assert.equal(checks, 0);
        assert.equal(leetCodeManager.getUser(), "alice");
        assert.equal(getLeetCodeRequest().sessionSignal.aborted, false);
    } finally { query = async () => queryResult; }
});

test("queued sign-out cleanup does not abort a newer login's credential validation", async () => {
    await leetCodeManager.signOut();
    const context = contextWithCookie("LEETCODE_SESSION=old; csrftoken=csrf");
    await globalState.initialize(context);
    let releaseWrite!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const writing = new Promise<void>((resolve) => { entered = resolve; });
    const store = context.secrets.store.bind(context.secrets);
    context.secrets.store = async (key: string, value: string) => { entered(); await gate; await store(key, value); };
    const restoring = leetCodeManager.getLoginStatus();
    await writing;
    const signingOut = leetCodeManager.signOut();
    let releaseQuery!: () => void;
    const validationGate = new Promise<void>((resolve) => { releaseQuery = resolve; });
    let snapshot: ReturnType<typeof getLeetCodeRequest>;
    query = async (cookie) => {
        snapshot = getLeetCodeRequest(cookie);
        await validationGate;
        assert.equal(snapshot.sessionSignal.aborted, false, "cleanup must not revoke a validation that started after sign-out");
        return { isSignedIn: true, username: "new", isPremium: false, avatar: "" };
    };
    const signingIn = leetCodeManager.signInWithCookie("LEETCODE_SESSION=new; csrftoken=csrf", { name: "new" });
    try {
        releaseWrite();
        await Promise.all([restoring, signingOut]);
        releaseQuery();
        await signingIn;
        assert.equal(leetCodeManager.getUser(), "new");
        assert.equal(globalState.getCookie(), "LEETCODE_SESSION=new; csrftoken=csrf");
    } finally { releaseQuery(); query = async () => queryResult; }
});
