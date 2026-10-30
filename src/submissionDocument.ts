// Licensed under the MIT license.

import * as path from "path";
import * as vscode from "vscode";
import { getLeetCodeRequest } from "./api/request";
import { fetchSubmissionCode } from "./api/submissionHistory";
import { currentSite } from "./shared";
import { getProblemFile } from "./utils/problemDocumentContext";

export const SUBMISSION_SCHEME: string = "leetcode-submission";

/** One of the user's submissions, on the site it was made on. */
export interface ISubmissionTarget {
    host: string;
    problemId: string;
    slug: string;
    submissionId: string;
    /** The extension of a solution file in the submission's language, which picks the language mode. */
    ext: string;
}

/** Named after the problem and the submission, so that its tab tells submissions apart. */
export function getSubmissionUri(target: ISubmissionTarget): vscode.Uri {
    return vscode.Uri.from({
        scheme: SUBMISSION_SCHEME,
        authority: target.host,
        path: `/${target.problemId}/${target.slug} (${target.submissionId}).${target.ext}`,
    });
}

export function parseSubmissionUri(uri: vscode.Uri | undefined): ISubmissionTarget | undefined {
    const match: RegExpExecArray | null = uri?.scheme === SUBMISSION_SCHEME ? /^\/([^/]+)\/([^/]+) \((\d+)\)\.([^./]+)$/.exec(uri.path) : null;
    return uri && match ? { host: uri.authority, problemId: match[1], slug: match[2], submissionId: match[3], ext: match[4] } : undefined;
}

/** Submitted code never changes, so it is loaded once; the oldest is dropped past the limit. */
const codes = new Map<string, string>();
const CODE_LIMIT: number = 50;

async function loadCode(target: ISubmissionTarget): Promise<string> {
    const key: string = `${target.host}:${target.submissionId}`;
    const cached: string | undefined = codes.get(key);
    if (cached !== undefined) {
        return cached;
    }
    // Requests go to the current site, where this number names another submission or none.
    if (target.host !== currentSite().host) {
        throw new Error(vscode.l10n.t("This submission was made on {0}. Switch to that site to load it.", target.host));
    }
    const code: string = await fetchSubmissionCode(getLeetCodeRequest(), target.submissionId);
    codes.set(key, code);
    if (codes.size > CODE_LIMIT) {
        codes.delete(codes.keys().next().value!);
    }
    return code;
}

/** Shows the submitted code in a read-only editor; loading first lets a failure reach the caller. */
export async function showSubmission(target: ISubmissionTarget): Promise<void> {
    await loadCode(target);
    await vscode.window.showTextDocument(getSubmissionUri(target), { preview: true });
}

/** Compares the submitted code with the solution file as it is now. */
export async function compareSubmission(target: ISubmissionTarget): Promise<void> {
    const solution: vscode.Uri | undefined = getProblemFile(target.problemId);
    if (!solution) {
        vscode.window.showErrorMessage(vscode.l10n.t("Open the solution file of problem {0} to compare it with this submission.", target.problemId));
        return;
    }
    await loadCode(target);
    await vscode.commands.executeCommand(
        "vscode.diff",
        getSubmissionUri(target),
        solution,
        vscode.l10n.t("Submission {0} ↔ {1}", target.submissionId, path.basename(solution.fsPath)),
    );
}

class SubmissionCodeProvider implements vscode.TextDocumentContentProvider {
    public async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
        const target: ISubmissionTarget | undefined = parseSubmissionUri(uri);
        if (!target) {
            throw new Error(`Not a LeetCode submission: ${uri.toString()}`);
        }
        return loadCode(target);
    }
}

export function registerSubmissionDocuments(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(SUBMISSION_SCHEME, new SubmissionCodeProvider()));
}
