import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root: string = process.cwd();

function source(name: string): string {
    return readFileSync(join(root, "src/webview", name), "utf8");
}

test("preview webview keeps a restrictive CSP with a nonce", () => {
    const text = source("leetCodePreviewProvider.ts");
    assert.match(text, /default-src 'none'/);
    assert.match(text, /worker-src 'self' \$\{webview\.cspSource\}/);
    assert.match(text, /script-src 'nonce-\$\{nonce\}'/);
    assert.doesNotMatch(text, /unsafe-eval/);
    assert.doesNotMatch(text, /script-src[^;]*\*/);
});

test("submission webview keeps a restrictive CSP without scripts", () => {
    const text = source("leetCodeSubmissionProvider.ts");
    assert.match(text, /default-src 'none'/);
    assert.match(text, /worker-src 'self' \$\{webview\.cspSource\}/);
    assert.match(text, /img-src https: data: \$\{webview\.cspSource\}/);
    assert.doesNotMatch(text, /unsafe-eval/);
    assert.doesNotMatch(text, /script-src/);
});

test("webview resources are limited to built-in roots", () => {
    const text = source("LeetCodeWebview.ts");
    assert.match(text, /localResourceRoots: markdownEngine\.localResourceRoots/);
});
