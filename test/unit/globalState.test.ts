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

test("globalState migrates legacy cookies and manages profiles/test cases", async () => {
    const memento = new FakeMemento();
    const secrets = new FakeSecrets();
    memento.values.set("leetcode-cookie", "LEETCODE_SESSION=legacy; csrftoken=legacy");
    const context = { globalState: memento, secrets } as any;

    await globalState.initialize(context);
    assert.equal(globalState.getCookie(), "LEETCODE_SESSION=legacy; csrftoken=legacy");
    assert.equal(memento.values.has("leetcode-cookie"), false);
    assert.equal(secrets.values.get("leetcode-cookie"), "LEETCODE_SESSION=legacy; csrftoken=legacy");

    await globalState.saveProfile("alice", "alice-user", "LEETCODE_SESSION=a; csrftoken=a");
    assert.equal(globalState.getActiveProfile(), "alice");
    assert.equal(globalState.getProfiles().length, 1);
    assert.equal(secrets.values.get("leetcode-cookie:alice"), "LEETCODE_SESSION=a; csrftoken=a");
    assert.equal(memento.values.has("leetcode-cookie"), false);

    await globalState.saveProfile("bob", "bob-user", "LEETCODE_SESSION=b; csrftoken=b");
    assert.equal((await globalState.activateProfile("alice")), "LEETCODE_SESSION=a; csrftoken=a");
    assert.equal(globalState.getCookie(), "LEETCODE_SESSION=a; csrftoken=a");
    assert.equal(globalState.getActiveProfile(), "alice");

    await globalState.saveTestCase("two-sum", "[1,2,3]\n4");
    assert.equal(globalState.getTestCase("two-sum"), "[1,2,3]\n4");

    await globalState.deleteProfile("bob");
    assert.equal(globalState.getProfiles().map((profile: any) => profile.name).join(","), "alice");
    await globalState.deleteProfile("alice");
    assert.equal(globalState.getActiveProfile(), undefined);
    assert.equal(globalState.getCookie(), undefined);
    assert.equal(secrets.values.has("leetcode-cookie"), false);
});
