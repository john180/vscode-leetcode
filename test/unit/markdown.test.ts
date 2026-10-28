import { strict as assert } from "node:assert";
import { test } from "node:test";
import Module = require("node:module");

const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
let defaultLanguage: string | undefined;
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean): unknown {
    if (request === "vscode") {
        return {
            env: { appRoot: process.cwd() },
            window: {
                createOutputChannel: () => ({
                    info: () => undefined,
                    warn: () => undefined,
                    error: () => undefined,
                    dispose: () => undefined,
                    show: () => undefined,
                }),
            },
            workspace: {
                getConfiguration: () => ({
                    get: (key: string, defaultValue: unknown) => key === "defaultLanguage" ? defaultLanguage ?? defaultValue : defaultValue,
                    inspect: () => ({ defaultValue: "" }),
                }),
                onDidChangeConfiguration: () => ({ dispose: () => undefined }),
            },
            Uri: { file: (value: string) => ({ fsPath: value, toString: () => value }) },
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { markdownEngine } = require("../../src/webview/markdownEngine");

test("markdownEngine renders code with the registered highlighter", () => {
    const html: string = markdownEngine.render("```cpp\nint main() { return 0; }\n```", { lang: "cpp" });
    assert.match(html, /hljs-/);
});

test("markdownEngine renders headings", () => {
    assert.match(markdownEngine.render("# Two Sum", {}), /<h1>Two Sum<\/h1>/);
});

test("markdownEngine escapes raw HTML in markdown", () => {
    const html: string = markdownEngine.render("<script>alert(1)</script>", {});
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
});

test("markdownEngine rejects dangerous link schemes", () => {
    for (const link of ["javascript:alert(1)", "data:text/html,hello"]) {
        const html: string = markdownEngine.render(`[x](${link})`, {});
        assert.doesNotMatch(html, /href=/);
        assert.match(html, /\[x\]/);
    }
});

test("markdownEngine allows https and file links", () => {
    assert.match(markdownEngine.render("[web](https://example.com/a)", {}), /href="https:\/\/example\.com\/a"/);
    assert.match(markdownEngine.render("[file](file:///tmp/a)", {}), /href="file:\/\/\/tmp\/a"/);
});

test("markdownEngine escapes HTML inside code fences", () => {
    const html: string = markdownEngine.render("```cpp\n<script>alert(1)</script>\n```", { lang: "cpp" });
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
});

test("markdownEngine prefixes relative image URLs with the host", () => {
    const html: string = markdownEngine.render("![img](/pic.png)", { host: "https://leetcode.cn" });
    assert.match(html, /src="https:\/\/leetcode\.cn\/pic\.png"/);
});

test("solutions keep safe inline HTML and drop active content", () => {
    const html: string = markdownEngine.renderSolution([
        "a<sup>2</sup> and <font face=\"monospace\">x</font><br>",
        "",
        "<script>alert(1)</script><img src=\"https://example.com/a.png\" onerror=\"alert(1)\"><a href=\"javascript:alert(1)\">bad</a>",
        "",
        "<div style=\"position:fixed\" class=\"evil\">styled</div>",
    ].join("\n"));
    assert.match(html, /a<sup>2<\/sup> and <code>x<\/code><br \/>/);
    assert.match(html, /<img src="https:\/\/example\.com\/a\.png" \/>/);
    assert.doesNotMatch(html, /<script|onerror|javascript:|style=|evil/);
});

test("solutions typeset math as MathML and leave prices alone", () => {
    const html: string = markdownEngine.renderSolution("Time $O(n^2)$, costs $5 and $6.\n\n$$\n\\sum_{i=1}^n i\n$$");
    assert.match(html, /<math[^>]*><semantics><mrow><mi>O<\/mi>/);
    assert.match(html, /<msup><mi>n<\/mi><mn>2<\/mn><\/msup>/);
    assert.match(html, /costs \$5 and \$6\./);
    assert.match(html, /<math[^>]*display="block"/);
    assert.match(html, /<munderover><mo>∑<\/mo>/);
    assert.doesNotMatch(html, /@@math-/);
});

test("math in code stays code, and solution text cannot forge a math placeholder", () => {
    const html: string = markdownEngine.renderSolution("`$x$` @@math-0000000000000000-0@@\n\n```\n$$y$$\n```");
    assert.match(html, /<code>\$x\$<\/code>/);
    assert.match(html, /@@math-0000000000000000-0@@/);
    assert.match(html, /\$\$y\$\$/);
    assert.doesNotMatch(html, /<math/);
});

test("LeetCode code groups become tabs that open on the default language", () => {
    const source: string = "```Python [sol1-Python3]\nx = 1\n```\n```C++ [sol1-C++]\nint x = 1;\n```";
    defaultLanguage = "cpp";
    try {
        const html: string = markdownEngine.renderSolution(source);
        assert.match(html, /^<div class="code-group"><details><summary>Python3<\/summary><pre><code class="language-Python">/);
        assert.match(html, /<details open><summary>C\+\+<\/summary>/);
        assert.match(html, /<span class="hljs-type">int<\/span>/);
    } finally {
        defaultLanguage = undefined;
    }
    assert.match(markdownEngine.renderSolution(source), /<details open><summary>Python3<\/summary>/);
    assert.doesNotMatch(markdownEngine.renderSolution("```Python [sol1-Python3]\nx = 1\n```"), /code-group/, "a single fence is not a group");
});
