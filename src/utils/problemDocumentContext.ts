import * as vscode from "vscode";
import { languages } from "../shared";
import { getLanguageFromText, getNodeIdFromText } from "./problemUtils";

export function isProblemDocument(document: vscode.TextDocument): boolean {
    if (document.uri.scheme !== "file") {
        return false;
    }
    const header = document.getText(new vscode.Range(0, 0, Math.min(20, document.lineCount), 0));
    const language = getLanguageFromText(header);
    return Boolean(getNodeIdFromText(header) && language && languages.includes(language));
}

/** Remember recognized files so Explorer actions also work after their editor closes. */
export function registerProblemDocumentContext(context: vscode.ExtensionContext): void {
    const resources = new Set<string>();
    const update = (document?: vscode.TextDocument): void => {
        if (document) {
            const uri = document.uri.toString();
            if (isProblemDocument(document)) {
                resources.add(uri);
            } else {
                resources.delete(uri);
            }
        }
        void vscode.commands.executeCommand("setContext", "leetcode.problemResources", [...resources]);
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
            for (const uri of event.files) {
                resources.delete(uri.toString());
            }
            update();
        }),
    );
}
