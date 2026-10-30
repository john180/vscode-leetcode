import { strict as assert } from "node:assert";
import { test } from "node:test";
import { testCaseStore } from "../../src/testCaseStore";

class FakeMemento {
    public readonly values = new Map<string, unknown>();
    public keys(): readonly string[] { return [...this.values.keys()]; }
    public get<T>(key: string, defaultValue?: T): T { return this.values.has(key) ? this.values.get(key) as T : defaultValue as T; }
    public async update(key: string, value: unknown): Promise<void> { this.values.set(key, value); }
}

test("saved test cases keep their storage key and are kept per problem", async () => {
    const memento = new FakeMemento();
    assert.equal(testCaseStore.get("two-sum"), undefined, "nothing is read before initialization");
    testCaseStore.initialize(memento);
    await testCaseStore.save("two-sum", "[1,2,3]\n4");
    await testCaseStore.save("add-two-numbers", "[2,4]\n[5,6]");
    assert.equal(testCaseStore.get("two-sum"), "[1,2,3]\n4");
    assert.equal(testCaseStore.get("three-sum"), undefined);
    assert.equal(memento.values.get("leetcode-test-case:two-sum"), "[1,2,3]\n4", "inputs saved by earlier versions stay readable");
});
