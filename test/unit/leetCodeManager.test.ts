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
                showInformationMessage: async () => undefined,
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
        return { queryUserData: async () => queryResult };
    }
    if (request.endsWith("commands/plugin")) {
        return { getLeetCodeEndpoint: () => "leetcode" };
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
    await leetCodeManager.handleUriSignIn({ query: "error=access_denied&error_description=Cancelled" } as any);
    assert.equal(leetCodeManager.getStatus(), UserStatus.SignedOut);
    assert.equal(leetCodeManager.getUser(), undefined);
});

test("leetCodeManager rejects an invalid profile cookie", async () => {
    await assert.rejects(leetCodeManager.createProfile("bad", "not-a-cookie"), /Cookie must/);
});
