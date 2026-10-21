import { strict as assert } from "node:assert";
import { test } from "node:test";
import { normalizeCookie, validateCookie } from "../../src/auth/cookie";

test("normalizeCookie keeps only the required cookies", () => {
    const header = "Cookie: _ga=1; LEETCODE_SESSION=session; __cf_bm=bm; csrftoken=csrf; BDUSS=baidu";
    assert.equal(normalizeCookie(header), "LEETCODE_SESSION=session; csrftoken=csrf");
});

test("normalizeCookie handles line breaks", () => {
    assert.equal(
        normalizeCookie("LEETCODE_SESSION=a;\ncsrftoken=b"),
        "LEETCODE_SESSION=a; csrftoken=b",
    );
});

test("validateCookie reports missing values", () => {
    assert.equal(validateCookie(""), "Cookie must not be empty.");
    assert.equal(validateCookie("_ga=1"), "Cookie must contain LEETCODE_SESSION and csrftoken.");
    assert.equal(validateCookie("LEETCODE_SESSION=a"), "Cookie must contain csrftoken.");
    assert.equal(validateCookie("csrftoken=b"), "Cookie must contain LEETCODE_SESSION.");
});

test("normalizeCookie accepts the Cookie prefix and trims whitespace", () => {
    assert.equal(
        normalizeCookie("  COOKIE:  LEETCODE_SESSION = a ; csrftoken = b ;  "),
        "LEETCODE_SESSION=a; csrftoken=b",
    );
});

test("normalizeCookie keeps the last duplicate value", () => {
    assert.equal(
        normalizeCookie("LEETCODE_SESSION=a; LEETCODE_SESSION=b; csrftoken=c; csrftoken=d"),
        "LEETCODE_SESSION=b; csrftoken=d",
    );
});

test("normalizeCookie ignores empty required values", () => {
    assert.equal(normalizeCookie("LEETCODE_SESSION=; csrftoken=; _ga=1"), "");
});

test("validateCookie accepts a complete normalized cookie", () => {
    assert.equal(validateCookie("LEETCODE_SESSION=a; csrftoken=b"), undefined);
});
