import { strict as assert } from "node:assert";
import { test } from "node:test";
import Module = require("node:module");

const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean): unknown {
    if (request === "vscode") {
        return {
            env: { appRoot: process.cwd() },
            window: {
                createOutputChannel: () => ({
                    append: () => undefined,
                    appendLine: () => undefined,
                    dispose: () => undefined,
                    show: () => undefined,
                }),
            },
            workspace: {
                getConfiguration: () => ({
                    get: (_key: string, defaultValue: unknown) => defaultValue,
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
