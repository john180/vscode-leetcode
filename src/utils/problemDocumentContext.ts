import { EventEmitter } from "node:events";
import * as vscode from "vscode";
import { languages } from "../shared";
import { getLanguageFromText, getNodeIdFromText } from "./problemUtils";

/** Recognized problem files by URI, the most recently seen last. */
const problemFiles = new Map<string, { uri: vscode.Uri; id: string }>();

/** Emits "changed" when a file is recognized as a problem file or stops being one. */
export const problemFileEvents: EventEmitter = new EventEmitter();

function getProblemId(document: vscode.TextDocument): string | undefined {
    if (document.uri.scheme !== "file") {
        return undefined;
    }
    const header = document.getText(new vscode.Range(0, 0, Math.min(20, document.lineCount), 0));
    const language = getLanguageFromText(header);
    const id = getNodeIdFromText(header);
    return id && language && languages.includes(language) ? id : undefined;
}

export function isProblemDocument(document: vscode.TextDocument): boolean {
    return getProblemId(document) !== undefined;
}

/** The solution file of a problem seen most recently, which may no longer be open in an editor. */
export function getProblemFile(id: string): vscode.Uri | undefined {
    let file: vscode.Uri | undefined;
    for (const entry of problemFiles.values()) {
        if (entry.id === id) {
            file = entry.uri;
        }
    }
    return file;
}

/** Remember recognized files so Explorer actions also work after their editor closes. */
export function registerProblemDocumentContext(context: vscode.ExtensionContext): void {
    const update = (document?: vscode.TextDocument): void => {
        if (document) {
            const uri = document.uri.toString();
            const previous = problemFiles.get(uri)?.id;
            const id = getProblemId(document);
            problemFiles.delete(uri);
            if (id) {
                problemFiles.set(uri, { uri: document.uri, id });
            }
            if (id !== previous) {
                problemFileEvents.emit("changed");
            }
        }
        void vscode.commands.executeCommand("setContext", "leetcode.problemResources", [...problemFiles.keys()]);
        const active = vscode.window.activeTextEditor?.document;
        void vscode.commands.executeCommand("setContext", "leetcode.isProblem", Boolean(active && isProblemDocument(active)));
    };
    for (const document of vscode.workspace.textDocuments) {
        update(document);
    }
    update();
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(update),
        vscode.workspace.onDidChangeTextDocument((event) => update(event.document)),
        vscode.window.onDidChangeActiveTextEditor((editor) => update(editor?.document)),
        vscode.workspace.onDidDeleteFiles((event) => {
            const deleted = event.files.filter((uri) => problemFiles.delete(uri.toString()));
            update();
            if (deleted.length > 0) {
                problemFileEvents.emit("changed");
            }
        }),
    );
}
