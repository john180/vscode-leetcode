import { strict as assert } from "node:assert";
import { test } from "node:test";
import Module = require("node:module");

class Range {
    constructor(public readonly line: number, public readonly character: number, public readonly endLine: number, public readonly endCharacter: number) { }
}
class Diagnostic {
    public source: string | undefined;
    constructor(public readonly range: Range, public readonly message: string, public readonly severity: number) { }
}

const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: { filename?: string }, isMain: boolean): unknown {
    if (request === "vscode" && parent?.filename?.endsWith("compileDiagnostics.js")) {
        return { Diagnostic, DiagnosticSeverity: { Error: 0, Warning: 1 }, Range, languages: {}, workspace: {} };
    }
    return originalLoad.call(this, request, parent, isMain);
};
const { parseCompileError } = require("../../src/utils/compileDiagnostics");
moduleLoader._load = originalLoad;

test("compile errors become diagnostics on the lines the judge reports", () => {
    const diagnostics = parseCompileError([
        "Line 5: Char 9: error: expected ';' after expression",
        "    5 |     return 0",
        "      |         ^",
        "Line 7: error: cannot find symbol",
        "Line 2: Char 3: warning: unused variable 'x' [-Wunused-variable]",
    ].join("\n"), 10);
    assert.deepEqual(diagnostics.map((diagnostic: Diagnostic) => [diagnostic.range.line, diagnostic.range.character, diagnostic.severity, diagnostic.message]), [
        [4, 8, 0, "error: expected ';' after expression"],
        [6, 0, 0, "error: cannot find symbol"],
        [1, 2, 1, "warning: unused variable 'x' [-Wunused-variable]"],
    ]);
    assert.ok(diagnostics.every((diagnostic: Diagnostic) => diagnostic.source === "LeetCode"));
});

test("lines outside the file are ignored", () => {
    assert.deepEqual(parseCompileError("Line 0: error: a\nLine 11: error: b\nno location", 10), []);
});
