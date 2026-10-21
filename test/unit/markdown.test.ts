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
