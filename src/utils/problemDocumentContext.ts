import { EventEmitter } from "node:events";
import * as vscode from "vscode";
import { languages } from "../shared";
import { getLanguageFromText, getNodeIdFromText } from "./problemUtils";

interface IProblemFile {
    uri: vscode.Uri;
    id: string;
    language: string;
}

/** Recognized problem files by URI, the most recently seen last. */
const problemFiles = new Map<string, IProblemFile>();

/** Emits "changed" when a file is recognized as a problem file or stops being one. */
export const problemFileEvents: EventEmitter = new EventEmitter();

function readHeader(document: vscode.TextDocument): Omit<IProblemFile, "uri"> | undefined {
    if (document.uri.scheme !== "file") {
        return undefined;
    }
    const header = document.getText(new vscode.Range(0, 0, Math.min(20, document.lineCount), 0));
    const language = getLanguageFromText(header);
    const id = getNodeIdFromText(header);
    return id && language && languages.includes(language) ? { id, language } : undefined;
}

export function isProblemDocument(document: vscode.TextDocument): boolean {
    return readHeader(document) !== undefined;
}

function findProblemFile(id: string): IProblemFile | undefined {
    let file: IProblemFile | undefined;
    for (const entry of problemFiles.values()) {
        if (entry.id === id) {
            file = entry;
        }
    }
    return file;
}

/** The solution file of a problem seen most recently, which may no longer be open in an editor. */
export function getProblemFile(id: string): vscode.Uri | undefined {
    return findProblemFile(id)?.uri;
}

/** The language of the file getProblemFile returns. */
export function getProblemLanguage(id: string): string | undefined {
    return findProblemFile(id)?.language;
}

/** Remember recognized files so Explorer actions also work after their editor closes. */
export function registerProblemDocumentContext(context: vscode.ExtensionContext): void {
    // Edits arrive per keystroke, so the context keys are sent only when they change.
    let resources: string | undefined;
    let isProblem: boolean | undefined;
    const update = (document?: vscode.TextDocument): void => {
        if (document) {
            const uri = document.uri.toString();
            const previous = problemFiles.get(uri);
            const header = readHeader(document);
            problemFiles.delete(uri);
            if (header) {
                problemFiles.set(uri, { uri: document.uri, ...header });
            }
            if (header?.id !== previous?.id || header?.language !== previous?.language) {
                problemFileEvents.emit("changed");
            }
        }
        const keys: string[] = [...problemFiles.keys()];
        if (keys.join("\n") !== resources) {
            resources = keys.join("\n");
            void vscode.commands.executeCommand("setContext", "leetcode.problemResources", keys);
        }
        const active = vscode.window.activeTextEditor?.document;
        const activeIsProblem: boolean = Boolean(active && isProblemDocument(active));
        if (activeIsProblem !== isProblem) {
            isProblem = activeIsProblem;
            void vscode.commands.executeCommand("setContext", "leetcode.isProblem", activeIsProblem);
        }
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
