import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildAuthLoginUrl, parseAuthCallback } from "../../src/auth/login";

test("buildAuthLoginUrl uses the current extension id", () => {
    assert.equal(
        buildAuthLoginUrl("leetcode-cn", "vscode", "yanxijian.vscode-leetcode-community"),
        "https://leetcode.cn/authorize-login/vscode/?path=yanxijian.vscode-leetcode-community",
    );
});

test("buildAuthLoginUrl keeps the US endpoint and Insiders scheme", () => {
    assert.equal(
        buildAuthLoginUrl("leetcode", "vscode-insiders", "LeetCode.vscode-leetcode"),
        "https://leetcode.com/authorize-login/vscode-insiders/?path=LeetCode.vscode-leetcode",
    );
});

test("parseAuthCallback decodes the cookie query", () => {
    const callback = parseAuthCallback(
        "cookie=LEETCODE_SESSION%3Dabc%3B%20csrftoken%3Ddef",
    );
    assert.equal(callback.cookie, "LEETCODE_SESSION=abc; csrftoken=def");
    assert.equal(callback.error, undefined);
});

test("parseAuthCallback exposes an OAuth error", () => {
    const callback = parseAuthCallback("error=access_denied&error_description=User%20cancelled");
    assert.equal(callback.cookie, undefined);
    assert.equal(callback.error, "User cancelled");
});

test("parseAuthCallback prefers error_description and trims values", () => {
    const callback = parseAuthCallback("error=access_denied&error_description=%20Cancelled%20&cookie=%20LEETCODE_SESSION%3Da%3B%20csrftoken%3Db%20");
    assert.equal(callback.error, "Cancelled");
    assert.equal(callback.cookie, "LEETCODE_SESSION=a; csrftoken=b");
});

test("parseAuthCallback treats a blank cookie as missing", () => {
    assert.deepEqual(parseAuthCallback("cookie=%20%20"), { cookie: undefined, error: undefined });
    assert.deepEqual(parseAuthCallback(""), { cookie: undefined, error: undefined });
});
