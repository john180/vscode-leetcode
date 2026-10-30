// Licensed under the MIT license.

import * as vscode from "vscode";
import { fetchJudgeInfo, getParamNames, IJudgeInfo } from "./api/question";
import { getLeetCodeRequest } from "./api/request";
import { leetCodeChannel } from "./leetCodeChannel";
import { testCaseStore } from "./testCaseStore";
import { appendTestCase, describeTestCaseLines, getLinesPerTestCase, normalizeTestInput } from "./utils/testCaseUtils";

export const TEST_CASE_SCHEME: string = "leetcode-testcase";

/** The problem a test case editor belongs to. */
export interface ITestCaseTarget {
    id: string;
    slug: string;
}

/** Named after the problem, so its tab reads like the solution file's. */
export function getTestCaseUri(problem: ITestCaseTarget): vscode.Uri {
    return vscode.Uri.from({ scheme: TEST_CASE_SCHEME, path: `/${problem.id}/${problem.slug}.txt` });
}

export function parseTestCaseUri(uri: vscode.Uri | undefined): ITestCaseTarget | undefined {
    const match: RegExpExecArray | null = uri?.scheme === TEST_CASE_SCHEME ? /^\/([^/]+)\/([^/]+)\.txt$/.exec(uri.path) : null;
    return match ? { id: match[1], slug: match[2] } : undefined;
}

/** Examples and parameter names by site and problem; a failed load is dropped so that the next use retries. */
const judgeInfos = new Map<string, Promise<IJudgeInfo>>();

function getJudgeInfo(slug: string): Promise<IJudgeInfo> {
    const request = getLeetCodeRequest();
    const key: string = `${request.endpoint}:${slug}`;
    const cached: Promise<IJudgeInfo> | undefined = judgeInfos.get(key);
    if (cached) {
        return cached;
    }
    const info: Promise<IJudgeInfo> = fetchJudgeInfo(request, slug);
    judgeInfos.set(key, info);
    info.catch(() => {
        if (judgeInfos.get(key) === info) {
            judgeInfos.delete(key);
        }
    });
    return info;
}

/** A test run has just loaded `info`, so opening the editor next needs no request. */
export function rememberJudgeInfo(slug: string, info: IJudgeInfo): void {
    judgeInfos.set(`${getLeetCodeRequest().endpoint}:${slug}`, Promise.resolve(info));
}

/** What the user wrote; blank text counts as nothing, so that clearing the editor brings the examples back. */
function getSavedText(slug: string): string | undefined {
    const saved: string | undefined = testCaseStore.get(slug);
    return saved?.trim() ? saved : undefined;
}

/** The editor starts with the examples, as LeetCode's test case console does. */
async function readTestCases(slug: string): Promise<string> {
    const saved: string | undefined = getSavedText(slug);
    if (saved !== undefined) {
        return saved;
    }
    try {
        const info: IJudgeInfo = await getJudgeInfo(slug);
        return info.exampleTestcases || info.sampleTestCase || "";
    } catch (error) {
        leetCodeChannel.warn(`Failed to load the examples of ${slug}: ${error}`);
        return "";
    }
}

/** The user's own test cases, including unsaved edits in their editor; undefined until there are any. */
export async function getSavedTestCases(problem: ITestCaseTarget): Promise<string | undefined> {
    const uri: string = getTestCaseUri(problem).toString();
    const editing: vscode.TextDocument | undefined = vscode.workspace.textDocuments.find((document) => document.isDirty && document.uri.toString() === uri);
    // LeetCode's Run tests what its console shows, saved or not.
    if (editing) {
        await editing.save();
    }
    return getSavedText(problem.slug);
}

/** Opens the problem's test case editor beside the solution, or brings it forward where it is already open. */
export async function openTestCases(problem: ITestCaseTarget): Promise<vscode.TextEditor> {
    const uri: vscode.Uri = getTestCaseUri(problem);
    const visible: vscode.TextEditor | undefined = vscode.window.visibleTextEditors.find((editor) => editor.document.uri.toString() === uri.toString());
    const document: vscode.TextDocument = await vscode.workspace.openTextDocument(uri);
    return vscode.window.showTextDocument(document, { viewColumn: visible?.viewColumn ?? vscode.ViewColumn.Beside, preview: false });
}

/** Adds `input` as the last test case through the editor, so that the edit can be undone, and selects it. */
export async function addTestCase(problem: ITestCaseTarget, input: string): Promise<void> {
    const editor: vscode.TextEditor = await openTestCases(problem);
    const { document } = editor;
    const text: string | undefined = appendTestCase(document.getText(), input);
    if (text === undefined) {
        return;
    }
    const edit: vscode.WorkspaceEdit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), text);
    if (!await vscode.workspace.applyEdit(edit)) {
        return;
    }
    await document.save();
    const start: vscode.Position = new vscode.Position(document.lineCount - normalizeTestInput(input).split("\n").length, 0);
    editor.selection = new vscode.Selection(start, start);
    editor.revealRange(new vscode.Range(start, start));
}

/** Test cases are kept in the extension's storage rather than in a workspace file, and are edited like any document. */
class TestCaseFileSystem implements vscode.FileSystemProvider {
    private readonly changes: vscode.EventEmitter<vscode.FileChangeEvent[]> = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this.changes.event;
    /** Modification times by problem, which tell VS Code when the saved test cases changed. */
    private readonly times: Map<string, number> = new Map<string, number>();

    public watch(): vscode.Disposable {
        // Every change is reported through onDidChangeFile.
        return new vscode.Disposable(() => undefined);
    }

    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        if (uri.path.split("/").filter(Boolean).length < 2) {
            // The folders above the files hold nothing else.
            return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
        }
        const { slug } = this.getTarget(uri);
        let mtime: number | undefined = this.times.get(slug);
        if (mtime === undefined) {
            mtime = Date.now();
            this.times.set(slug, mtime);
        }
        return { type: vscode.FileType.File, ctime: mtime, mtime, size: Buffer.byteLength(await readTestCases(slug)) };
    }

    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        return Buffer.from(await readTestCases(this.getTarget(uri).slug));
    }

    public async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
        const { slug } = this.getTarget(uri);
        await testCaseStore.save(slug, Buffer.from(content).toString("utf8"));
        this.times.set(slug, Math.max(Date.now(), (this.times.get(slug) ?? 0) + 1));
        this.changes.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    }

    public readDirectory(): Array<[string, vscode.FileType]> {
        return [];
    }

    public createDirectory(uri: vscode.Uri): void {
        throw vscode.FileSystemError.NoPermissions(uri);
    }

    public delete(uri: vscode.Uri): void {
        throw vscode.FileSystemError.NoPermissions(uri);
    }

    public rename(uri: vscode.Uri): void {
        throw vscode.FileSystemError.NoPermissions(uri);
    }

    private getTarget(uri: vscode.Uri): ITestCaseTarget {
        const target: ITestCaseTarget | undefined = parseTestCaseUri(uri);
        if (!target) {
            throw vscode.FileSystemError.FileNotFound(uri);
        }
        return target;
    }
}

/** Labels each line with its case and, when the problem names them, its parameter, in place of LeetCode's case tabs. */
class TestCaseInlayHints implements vscode.InlayHintsProvider {
    public async provideInlayHints(document: vscode.TextDocument, range: vscode.Range): Promise<vscode.InlayHint[]> {
        const target: ITestCaseTarget | undefined = parseTestCaseUri(document.uri);
        if (!target) {
            return [];
        }
        let info: IJudgeInfo;
        try {
            info = await getJudgeInfo(target.slug);
        } catch {
            // Reading the editor already reported the failure.
            return [];
        }
        const paramNames: string[] = getParamNames(info);
        const lineCount: number = normalizeTestInput(document.getText()).split("\n").length;
        const hints: vscode.InlayHint[] = [];
        describeTestCaseLines(lineCount, getLinesPerTestCase(info.sampleTestCase, paramNames), paramNames).forEach((line, index: number) => {
            const label: string = [line.first ? vscode.l10n.t("Case {0}", line.case) : "", line.param ? `${line.param} =` : ""].filter(Boolean).join(" · ");
            if (label && index >= range.start.line && index <= range.end.line) {
                const hint: vscode.InlayHint = new vscode.InlayHint(new vscode.Position(index, 0), label, vscode.InlayHintKind.Parameter);
                hint.paddingRight = true;
                hints.push(hint);
            }
        });
        return hints;
    }
}

export function registerTestCaseDocuments(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.workspace.registerFileSystemProvider(TEST_CASE_SCHEME, new TestCaseFileSystem(), { isCaseSensitive: true }),
        vscode.languages.registerInlayHintsProvider({ scheme: TEST_CASE_SCHEME }, new TestCaseInlayHints()),
    );
}
