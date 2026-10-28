import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { safeFontFamily, sanitizeProblemHtml } from "../../src/webview/sanitize";

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

test("webview resources are limited to extension-owned roots", () => {
    for (const name of ["leetCodePreviewProvider.ts", "leetCodeSubmissionProvider.ts"]) {
        assert.match(source(name), /localResourceRoots: markdownEngine\.localResourceRoots/);
    }
    assert.doesNotMatch(source("leetCodeSubmissionProvider.ts"), /enableScripts/);
    assert.doesNotMatch(source("markdownEngine.ts"), /appRoot|markdown-language-features/);
});

test("problem HTML preserves formatting but removes active content and UI overrides", () => {
    const html = sanitizeProblemHtml(`
        <p>Example <strong>one</strong></p><pre>x &lt; y</pre><sup>2</sup>
        <img src="https://example.com/diagram.png" alt="diagram" onerror="alert(1)">
        <script>alert(1)</script><style>body { display: none }</style>
        <iframe src="https://example.com"></iframe><form><input name="cookie"></form>
        <div id="solve" style="position:fixed" onclick="alert(1)">text</div>
        <svg><a xlink:href="javascript:alert(1)">bad</a></svg>
        <a href="java&#x73;cript:alert(1)">bad</a><a href="command:leetcode.submitSolution">bad</a>
        <img src="file:///secret"><img src="data:text/html,bad"><img src="//example.com/tracker">
    `);
    assert.match(html, /<strong>one<\/strong>/);
    assert.match(html, /<pre>x &lt; y<\/pre>/);
    assert.match(html, /src="https:\/\/example.com\/diagram.png"/);
    assert.doesNotMatch(html, /<script|<style|<iframe|<form|<input|<svg|onerror|onclick|style=|id=|javascript:|command:|file:|data:|src="\/\//i);
});

test("font families cannot break out of a CSS declaration or style element", () => {
    assert.equal(safeFontFamily("'Cascadia Code', 微软雅黑, monospace"), "'Cascadia Code', 微软雅黑, monospace");
    for (const value of ['</style><img src="https://example.com">', 'a; color:red', 'a}body{display:none}', 'url(https://example.com)', '\\3c /style>']) {
        assert.equal(safeFontFamily(value), "");
    }
});
