import { strict as assert } from "node:assert";
import { test } from "node:test";
import { diffRange } from "../../src/utils/diffUtils";

test("diffRange isolates the differing middle of two outputs", () => {
    assert.deepEqual(diffRange("[1,2,3]", "[1,4,3]"), { prefix: 3, suffix: 3 });
    assert.deepEqual(diffRange("[1,2]", "[1,2,3]"), { prefix: 4, suffix: 1 });
});

test("diffRange never lets the prefix and suffix overlap", () => {
    assert.deepEqual(diffRange("aa", "aaa"), { prefix: 2, suffix: 0 });
    assert.deepEqual(diffRange("same", "same"), { prefix: 4, suffix: 0 });
    assert.deepEqual(diffRange("", "x"), { prefix: 0, suffix: 0 });
});
