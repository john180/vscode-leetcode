import { strict as assert } from "node:assert";
import { test } from "node:test";
import { diffLines } from "../../src/utils/diffUtils";

test("diffLines marks changed lines", () => {
    const result = diffLines("a\nb", "a\nc");
    assert.deepEqual(result, [
        { type: "same", text: "a" },
        { type: "remove", text: "b" },
        { type: "add", text: "c" },
    ]);
});

test("diffLines returns only same lines for identical output", () => {
    assert.deepEqual(diffLines("a\nb", "a\nb"), [
        { type: "same", text: "a" },
        { type: "same", text: "b" },
    ]);
});
