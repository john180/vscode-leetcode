import { strict as assert } from "node:assert";
import { test } from "node:test";
import { highlightRanges, matchesTerms, parseProblemSearch } from "../../src/explorer/problemSearch";

test("searches split the keyword from tag and company filters", () => {
    assert.equal(parseProblemSearch("   "), undefined);
    assert.deepEqual(parseProblemSearch("  Two   Sum tag:Array company:google "), {
        text: "Two   Sum tag:Array company:google", keyword: "Two Sum", terms: ["two", "sum"], tag: "array", company: "google",
    });
    assert.deepEqual(parseProblemSearch("tag:dynamic-programming"), { text: "tag:dynamic-programming", keyword: "", terms: [], tag: "dynamic-programming" });
});

test("every term must appear, ignoring case", () => {
    assert.equal(matchesTerms("[1] Two Sum two-sum", ["two", "sum"]), true);
    assert.equal(matchesTerms("[2] Add Two Numbers", ["two", "sum"]), false);
    assert.equal(matchesTerms("[1] 两数之和", ["两数"]), true);
});

test("highlights cover every occurrence and merge overlaps", () => {
    assert.deepEqual(highlightRanges("[1] Two Sum II - two", ["two"]), [[4, 7], [17, 20]]);
    assert.deepEqual(highlightRanges("[15] 3Sum", ["sum", "3s"]), [[5, 9]]);
    assert.deepEqual(highlightRanges("[1] Two Sum", ["", "none"]), []);
});
