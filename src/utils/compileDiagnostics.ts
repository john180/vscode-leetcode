// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { Diagnostic, DiagnosticCollection, DiagnosticSeverity, Disposable, languages, Range, TextDocument, workspace } from "vscode";

/** "Line 5: Char 9: error: expected ';'" (Clang, Go, C#, Kotlin) and "Line 5: error: ';' expected" (Java). */
const LOCATED_MESSAGE: RegExp = /^Line (\d+):(?: Char (\d+):)?\s*(.+)$/;

/** Shows LeetCode compile errors in the solution file. The judge numbers lines from the code we sent, which is the whole file. */
class CompileDiagnostics implements Disposable {
    private collection: DiagnosticCollection | undefined;
    private listener: Disposable | undefined;

    public update(document: TextDocument, compileError: string | undefined): void {
        const diagnostics: Diagnostic[] = compileError ? parseCompileError(compileError, document.lineCount) : [];
        if (diagnostics.length === 0) {
            this.collection?.delete(document.uri);
            return;
        }
        if (!this.collection) {
            this.collection = languages.createDiagnosticCollection("leetcode");
            // Edits move lines, so stale positions would point at the wrong code.
            this.listener = workspace.onDidChangeTextDocument((event) => {
                if (event.contentChanges.length > 0) {
                    this.collection?.delete(event.document.uri);
                }
            });
        }
        this.collection.set(document.uri, diagnostics);
    }

    public dispose(): void {
        this.listener?.dispose();
        this.collection?.dispose();
        this.listener = undefined;
        this.collection = undefined;
    }
}

export function parseCompileError(compileError: string, lineCount: number): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const text of compileError.split(/\r?\n/)) {
        const match: RegExpMatchArray | null = text.match(LOCATED_MESSAGE);
        const line: number = match ? Number(match[1]) - 1 : -1;
        if (!match || line < 0 || line >= lineCount) {
            continue;
        }
        const character: number = Math.max(0, Number(match[2] ?? 1) - 1);
        const severity: DiagnosticSeverity = /^warning\b/i.test(match[3]) ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error;
        // An empty range is widened to the word at that position.
        const diagnostic: Diagnostic = new Diagnostic(new Range(line, character, line, character), match[3], severity);
        diagnostic.source = "LeetCode";
        diagnostics.push(diagnostic);
    }
    return diagnostics;
}

export const compileDiagnostics: CompileDiagnostics = new CompileDiagnostics();
