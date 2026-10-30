import { strict as assert } from "node:assert";
import { test } from "node:test";
import Module = require("node:module");

const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean): unknown {
    if (request === "vscode") {
        return {};
    }
    return originalLoad.call(this, request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { globalState } = require("../../src/globalState");
const { Endpoint } = require("../../src/shared");

class FakeMemento {
    public readonly values = new Map<string, unknown>();
    public get<T>(key: string, defaultValue?: T): T {
        return this.values.has(key) ? this.values.get(key) as T : defaultValue as T;
    }
    public async update(key: string, value: unknown): Promise<void> {
        if (value === undefined) {
            this.values.delete(key);
        } else {
            this.values.set(key, value);
        }
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

test("globalState loads secure cookies and manages profiles", async () => {
    const memento = new FakeMemento();
    const secrets = new FakeSecrets();
    secrets.values.set("leetcode-cookie", "LEETCODE_SESSION=current; csrftoken=current");
    const context = { globalState: memento, secrets } as any;

    await globalState.initialize(context);
    assert.equal(globalState.getCookie(), "LEETCODE_SESSION=current; csrftoken=current");
    assert.equal(memento.values.has("leetcode-cookie"), false);
    assert.equal(secrets.values.get("leetcode-cookie.v2:leetcode"), "LEETCODE_SESSION=current; csrftoken=current");
    assert.equal(secrets.values.has("leetcode-cookie"), false, "unscoped credentials are removed after migration");

    await globalState.saveProfile("alice", "alice-user", "LEETCODE_SESSION=a; csrftoken=a");
    assert.equal(globalState.getActiveProfile(), "alice");
    assert.equal(globalState.getProfiles().length, 1);
    assert.equal(secrets.values.get("leetcode-cookie.v2:leetcode:alice"), "LEETCODE_SESSION=a; csrftoken=a");
    assert.equal(memento.values.has("leetcode-cookie"), false);

    await globalState.saveProfile("bob", "bob-user", "LEETCODE_SESSION=b; csrftoken=b");
    assert.equal((await globalState.activateProfile("alice")), "LEETCODE_SESSION=a; csrftoken=a");
    assert.equal(globalState.getCookie(), "LEETCODE_SESSION=a; csrftoken=a");
    assert.equal(globalState.getActiveProfile(), "alice");

    await globalState.deleteProfile("bob");
    assert.equal(globalState.getProfiles().map((profile: any) => profile.name).join(","), "alice");
    await globalState.deleteProfile("alice");
    assert.equal(globalState.getActiveProfile(), undefined);
    assert.equal(globalState.getCookie(), undefined);
    assert.equal(secrets.values.has("leetcode-cookie.v2:leetcode"), false);
});

test("globalState does not authenticate from old plain-text cookies", async () => {
    const memento = new FakeMemento();
    const secrets = new FakeSecrets();
    memento.values.set("leetcode-cookie", "LEETCODE_SESSION=old; csrftoken=old");

    await globalState.initialize({ globalState: memento, secrets });
    assert.equal(globalState.getCookie(), undefined);
    assert.equal(secrets.values.size, 0);
});

test("same-named accounts on different sites retain isolated credentials and profiles", async () => {
    const memento = new FakeMemento();
    const secrets = new FakeSecrets();
    await globalState.initialize({ globalState: memento, secrets }, Endpoint.LeetCode);
    await globalState.saveProfile("alice", "alice-us", "us-cookie");
    assert.equal(globalState.getCookie(Endpoint.LeetCodeCN), undefined);
    await globalState.useEndpoint(Endpoint.LeetCodeCN);
    assert.equal(globalState.getCookie(), undefined);
    assert.deepEqual(globalState.getProfiles(), []);
    await assert.rejects(globalState.getProfileCookie("alice"), /not found/);
    await globalState.saveProfile("alice", "alice-cn", "cn-cookie");
    await globalState.useEndpoint(Endpoint.LeetCode);
    assert.equal(globalState.getCookie(), "us-cookie");
    assert.equal(globalState.getProfiles()[0].username, "alice-us");
    await globalState.removeAll();
    await globalState.useEndpoint(Endpoint.LeetCodeCN);
    assert.equal(globalState.getCookie(), "cn-cookie", "signing out affects only its own site");
    assert.equal(globalState.getProfiles()[0].username, "alice-cn");
    assert.equal(JSON.stringify([...memento.values]).includes("cn-cookie"), false);
    assert.equal(JSON.stringify([...memento.values]).includes("us-cookie"), false);
});

test("legacy migration retries safely and keeps its original site even if settings change", async () => {
    const memento = new FakeMemento();
    const secrets = new FakeSecrets();
    memento.values.set("leetcode-profiles", [{ name: "alice", username: "alice", updatedAt: 1 }]);
    memento.values.set("leetcode-active-profile", "alice");
    secrets.values.set("leetcode-cookie:alice", "legacy-cookie");
    const store = secrets.store.bind(secrets);
    secrets.store = async () => { throw new Error("keyring unavailable"); };
    await assert.rejects(globalState.initialize({ globalState: memento, secrets }, Endpoint.LeetCode), /keyring unavailable/);
    assert.equal(secrets.values.get("leetcode-cookie:alice"), "legacy-cookie");
    secrets.store = store;
    await globalState.initialize({ globalState: memento, secrets }, Endpoint.LeetCodeCN);
    assert.equal(globalState.getCookie(), undefined);
    await globalState.useEndpoint(Endpoint.LeetCode);
    assert.equal(globalState.getCookie(), "legacy-cookie");
    assert.equal(globalState.getProfiles().length, 1);
    assert.equal(secrets.values.has("leetcode-cookie:alice"), false);
});

test("a delayed keyring read cannot restore credentials after synchronous revocation", async () => {
    const memento = new FakeMemento();
    const secrets = new FakeSecrets();
    await globalState.initialize({ globalState: memento, secrets });
    await globalState.saveProfile("alice", "alice", "cookie");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const get = secrets.get.bind(secrets);
    secrets.get = async (key: string) => { await gate; return get(key); };
    const reading = globalState.useEndpoint(Endpoint.LeetCode);
    globalState.detach();
    release();
    await reading;
    assert.equal(globalState.getCookie(), undefined);
});

test("the last user status is used only for the same account until it is checked again", async () => {
    const memento = new FakeMemento();
    const secrets = new FakeSecrets();
    await globalState.initialize({ globalState: memento, secrets });
    await globalState.saveProfile("alice", "alice-user", "cookie-a");
    await globalState.setUserStatus({ isSignedIn: true, isPremium: true, username: "alice-user", avatar: "" });
    await globalState.initialize({ globalState: memento, secrets });
    assert.equal(globalState.getUserStatus()?.isPremium, true, "a restart keeps Premium content available before validation");
    await globalState.saveProfile("bob", "bob-user", "cookie-b");
    assert.equal(globalState.getUserStatus(), undefined, "another account never inherits the status");
    await globalState.removeAll();
    assert.equal(globalState.getUserStatus(), undefined);
});

test("deleting a profile that only storage still names as active cannot bring it back", async () => {
    const memento = new FakeMemento();
    const secrets = new FakeSecrets();
    await globalState.initialize({ globalState: memento, secrets });
    await globalState.saveProfile("alice", "alice", "cookie-a");
    globalState.detach();
    await globalState.deleteProfile("alice");
    await globalState.initialize({ globalState: memento, secrets });
    assert.equal(globalState.getCookie(), undefined);
    assert.equal(globalState.getActiveProfile(), undefined);
    assert.deepEqual(globalState.getProfiles(), []);
});

test("migration cleanup can resume without overwriting new credentials or colliding with legacy names", async () => {
    const memento = new FakeMemento();
    const secrets = new FakeSecrets();
    memento.values.set("leetcode-profiles", [{ name: "leetcode", username: "alice", updatedAt: 1 }]);
    secrets.values.set("leetcode-cookie:leetcode", "profile-cookie");
    secrets.values.set("leetcode-cookie", "active-cookie");
    const remove = secrets.delete.bind(secrets);
    secrets.delete = async () => { throw new Error("cleanup unavailable"); };
    await assert.rejects(globalState.initialize({ globalState: memento, secrets }), /cleanup unavailable/);
    secrets.values.set("leetcode-cookie.v2:leetcode", "new-cookie");
    secrets.delete = remove;
    await globalState.initialize({ globalState: memento, secrets });
    assert.equal(globalState.getCookie(), "new-cookie");
    assert.equal(await globalState.getProfileCookie("leetcode"), "profile-cookie");
    assert.equal(secrets.values.has("leetcode-cookie:leetcode"), false);
    assert.equal(secrets.values.has("leetcode-cookie"), false);
});
