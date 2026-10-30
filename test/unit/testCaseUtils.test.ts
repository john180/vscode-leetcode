import { strict as assert } from "node:assert";
import { test } from "node:test";
import { appendTestCase, describeTestCaseLines, getLinesPerTestCase, normalizeTestInput } from "../../src/utils/testCaseUtils";

test("test input keeps its lines but not the line breaks an editor leaves", () => {
    assert.equal(normalizeTestInput("[1,2]\r\n3\r\n\r\n"), "[1,2]\n3");
    assert.equal(normalizeTestInput(" \n"), "");
});

test("a case is appended once, after the cases already there", () => {
    assert.equal(appendTestCase("[1]\n2\n", "[3]\n4"), "[1]\n2\n[3]\n4");
    assert.equal(appendTestCase("", "[3]\n4"), "[3]\n4");
    assert.equal(appendTestCase("[1]\n2\n[3]\n4", "[3]\r\n4"), undefined);
    assert.equal(appendTestCase("[1]\n2", " "), undefined);
});

test("a case has as many lines as the first example", () => {
    assert.equal(getLinesPerTestCase("[3,2,0,-4]\n1", ["head"]), 2, "a list with a cycle reads more lines than its function takes");
    assert.equal(getLinesPerTestCase(undefined, ["nums", "target"]), 2);
    assert.equal(getLinesPerTestCase("", []), 0);
});

test("lines are labelled with their case, and with their parameter when a case has one line per parameter", () => {
    assert.deepEqual(describeTestCaseLines(5, 2, ["nums", "target"]), [
        { case: 1, first: true, param: "nums" }, { case: 1, first: false, param: "target" },
        { case: 2, first: true, param: "nums" }, { case: 2, first: false, param: "target" },
        { case: 3, first: true, param: "nums" },
    ]);
    assert.deepEqual(describeTestCaseLines(2, 2, ["head"]), [{ case: 1, first: true }, { case: 1, first: false }]);
    assert.deepEqual(describeTestCaseLines(3, 0, []), []);
});
