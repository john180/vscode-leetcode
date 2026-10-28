// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { commands, Disposable, env, l10n, TextDocument, Webview, WebviewView, WebviewViewProvider, window, workspace } from "vscode";
import type { ISubmissionResult, ITestCaseResult } from "../api/submission";
import { LeetCodeNode } from "../explorer/LeetCodeNode";
import { leetCodeChannel } from "../leetCodeChannel";
import { IProblem } from "../shared";
import { compileDiagnostics } from "../utils/compileDiagnostics";
import { diffRange, IDiffRange } from "../utils/diffUtils";
import { openKeybindingsEditor, promptHintMessage } from "../utils/uiUtils";
import { markdownEngine } from "./markdownEngine";
import { escapeHtml } from "./sanitize";

/** The command behind the panel's links, since the panel runs no scripts. */
export const RESULT_ACTION_COMMAND: string = "leetcode.resultAction";

type StatusKind = "ok" | "warn" | "fail";

const STATUS_ICONS: { [kind in StatusKind]: string } = { ok: "✓", warn: "!", fail: "✗" };
/** Longer texts start collapsed. */
const LONG_TEXT_LINES: number = 30;
const LONG_TEXT_LENGTH: number = 3000;

/** The summary is one row in a wide panel and wraps in a narrow one. */
const style: string = `
    body { background: transparent; padding: 4px 16px 16px; tab-size: 4; }
    .summary { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 24px; margin: 8px 0 12px; }
    .status { display: flex; align-items: center; gap: 10px; }
    .status.ok { --status: var(--vscode-testing-iconPassed); }
    .status.warn { --status: var(--vscode-editorWarning-foreground); }
    .status.fail { --status: var(--vscode-testing-iconFailed); }
    .status .icon { display: flex; flex: none; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; }
    .status .icon { font-size: 17px; font-weight: 700; color: var(--vscode-editor-background); background: var(--status); }
    .status h2 { margin: 0; font-size: 1.4em; font-weight: 600; line-height: 1.2; color: var(--status); }
    .status .note { margin: 2px 0 0; }
    .stats { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .stat { display: flex; flex-direction: column; min-width: 120px; padding: 6px 12px; border: 1px solid var(--vscode-panel-border); border-radius: 4px; }
    .stat .value { font-size: 1.3em; font-weight: 600; }
    .stat .label, .stat .beats { font-size: 0.9em; }
    .label, .beats, .note { color: var(--vscode-descriptionForeground); }
    .actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px 12px; margin-left: auto; }
    a.button, a.button:hover { padding: 4px 12px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 2px; text-decoration: none; }
    a.button { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    a.button:hover { color: var(--vscode-button-foreground); background: var(--vscode-button-hoverBackground); }
    a.button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    a.button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .case { margin: 8px 0; padding: 4px 10px; border: 1px solid var(--vscode-panel-border); border-left-width: 3px; border-radius: 4px; }
    .case.pass { border-left-color: var(--vscode-testing-iconPassed); }
    .case.fail { border-left-color: var(--vscode-testing-iconFailed); }
    .case > summary { padding: 2px 0; font-weight: 600; cursor: pointer; }
    .field { margin: 6px 0; }
    .field-head { display: flex; justify-content: space-between; gap: 12px; font-size: 0.9em; }
    .field-head .links { display: flex; gap: 12px; }
    details.field > summary { cursor: pointer; }
    .field pre { margin: 2px 0 0; padding: 6px 8px; max-height: 20em; white-space: pre-wrap; word-break: break-all; }
    mark { color: inherit; }
    mark.removed { background: var(--vscode-diffEditor-removedTextBackground); outline: 1px solid var(--vscode-testing-iconFailed); }
    mark.inserted { background: var(--vscode-diffEditor-insertedTextBackground); outline: 1px solid var(--vscode-testing-iconPassed); }
`;

interface IFieldOptions {
    /** What to show instead of the text that is copied. */
    display?: string;
    /** The changed part to highlight, as [start, end). */
    mark?: [number, number];
    markClass?: "removed" | "inserted";
}

function getStatusKind(status: string): StatusKind {
    if (status === "Accepted") {
        return "ok";
    }
    return /Limit Exceeded/i.test(status) ? "warn" : "fail";
}

/** A test run counts its cases; a submission reports how many of the judge's cases passed. */
function getPassedNote(result: ISubmissionResult): string | undefined {
    const passed: number | undefined = result.cases
        ? result.cases.filter((testCase: ITestCaseResult) => testCase.passed === true).length
        : result.totalCorrect;
    const total: number | undefined = result.cases ? result.cases.length : result.totalTestcases;
    return passed !== undefined && total ? l10n.t("{0} / {1} test cases passed", passed, total) : undefined;
}

/** Prefix each input line with its parameter, when there is one per line. */
function labelInput(input: string, paramNames: string[] | undefined): string {
    const lines: string[] = input.split("\n");
    return paramNames && paramNames.length === lines.length
        ? lines.map((line: string, index: number) => `${paramNames[index]} = ${line}`).join("\n")
        : input;
}

/** Test and submission results, shown in the bottom panel below the code. */
class LeetCodeSubmissionProvider implements WebviewViewProvider, Disposable {
    private view: WebviewView | undefined;
    private result: ISubmissionResult | undefined;
    private problem: IProblem | undefined;
    /** The solution file of the latest run, which the panel's Test and Submit links act on. */
    private document: TextDocument | undefined;
    /** Set while the latest run has no result yet. */
    private phase: "judging" | "failed" | undefined;
    /** Counts shown runs, so an older run that settles late never replaces a newer one. */
    private run: number = 0;
    /** The texts the panel's links copy or test with, by index. */
    private texts: string[] = [];

    public resolveWebviewView(view: WebviewView): void {
        this.view = view;
        view.webview.options = { localResourceRoots: markdownEngine.localResourceRoots, enableCommandUris: [RESULT_ACTION_COMMAND] };
        const listener: Disposable = workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration("markdown")) {
                this.render();
            }
        });
        view.onDidDispose(() => {
            listener.dispose();
            if (this.view === view) {
                this.view = undefined;
            }
        });
        this.render();
    }

    public show(result: ISubmissionResult, problem?: IProblem, document?: TextDocument): void {
        this.run += 1;
        this.result = result;
        this.problem = problem;
        this.document = document;
        this.phase = undefined;
        this.render();
        void this.reveal();
        void this.showKeybindingsHint();
    }

    /** Show `problem` as judging until `judge` settles, then its result or failure. */
    public async judge(problem: IProblem, document: TextDocument, judge: () => Promise<ISubmissionResult>): Promise<ISubmissionResult> {
        const run: number = ++this.run;
        this.result = undefined;
        this.problem = problem;
        this.document = document;
        this.phase = "judging";
        compileDiagnostics.update(document, undefined);
        this.render();
        void this.reveal();
        try {
            const result: ISubmissionResult = await window.withProgress({ location: { viewId: "leetCodeResult" } }, judge);
            if (run === this.run) {
                compileDiagnostics.update(document, result.compileError);
                this.show(result, problem, document);
            }
            return result;
        } catch (error) {
            leetCodeChannel.appendLine(`[ERROR] Failed to get the judge result: ${error}`);
            if (run === this.run) {
                this.phase = "failed";
                this.render();
            }
            throw error;
        }
    }

    /** Runs a link of the panel, which carries the run it was rendered for. */
    public async runAction(run: unknown, action: unknown, index?: unknown): Promise<void> {
        if (run !== this.run) {
            return;
        }
        const text: string | undefined = typeof index === "number" ? this.texts[index] : undefined;
        switch (action) {
            case "copy":
                if (text !== undefined) {
                    await env.clipboard.writeText(text);
                    window.setStatusBarMessage(l10n.t("Copied to the clipboard."), 2000);
                }
                break;
            case "test":
                if (text !== undefined) {
                    await commands.executeCommand("leetcode.testSolution", this.document?.uri, text);
                }
                break;
            case "submit":
                await commands.executeCommand("leetcode.submitSolution", this.document?.uri);
                break;
            case "solution":
            case "submissions":
                if (this.problem) {
                    const node: LeetCodeNode = this.problem instanceof LeetCodeNode ? this.problem : new LeetCodeNode(this.problem);
                    await commands.executeCommand(action === "solution" ? "leetcode.showSolution" : "leetcode.showSubmissions", node);
                }
                break;
        }
    }

    public dispose(): void {
        this.result = undefined;
        this.problem = undefined;
        this.document = undefined;
        this.phase = undefined;
    }

    private async reveal(): Promise<void> {
        // Keep typing in the editor while the result appears below it.
        if (this.view) {
            this.view.show(true);
            return;
        }
        try {
            await commands.executeCommand("leetCodeResult.focus", { preserveFocus: true });
        } catch (error) {
            leetCodeChannel.appendLine(`[WARN] Failed to reveal the result view: ${error}`);
        }
    }

    private render(): void {
        if (!this.view) {
            return;
        }
        this.view.description = this.problem ? `${this.problem.id}. ${this.problem.name}` : undefined;
        this.view.webview.html = this.getWebviewContent(this.view.webview);
    }

    private getWebviewContent(webview: Webview): string {
        const body: string = this.getBody();
        const styles: string = markdownEngine.getStyles(webview);
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta http-equiv="Content-Security-Policy" content="
                    default-src 'none';
                    base-uri 'none';
                    form-action 'none';
                    worker-src 'self' ${webview.cspSource};
                    img-src https: data: ${webview.cspSource};
                    style-src ${webview.cspSource} 'unsafe-inline';
                "/>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                ${styles}
                <style>${style}</style>
            </head>
            <body>
                ${body}
            </body>
            </html>
        `;
    }

    private getBody(): string {
        this.texts = [];
        if (this.phase === "judging") {
            return `<p class="note">${escapeHtml(l10n.t("Judging..."))}</p>`;
        }
        if (this.phase === "failed") {
            return `<p class="note">${escapeHtml(l10n.t("Failed to get the judge result. Please open the output channel for details."))}</p>`;
        }
        return this.result
            ? this.getResultHtml(this.result)
            : markdownEngine.render(l10n.t("Run **Test** or **Submit** in a problem file to see the result here."));
    }

    private getResultHtml(result: ISubmissionResult): string {
        const status: string = result.statusMessage || result.state;
        const kind: StatusKind = getStatusKind(status);
        const note: string | undefined = getPassedNote(result);
        const header: string = [
            `<header class="status ${kind}"><span class="icon" aria-hidden="true">${STATUS_ICONS[kind]}</span>`,
            `<div><h2>${escapeHtml(status)}</h2>${note ? `<p class="note">${escapeHtml(note)}</p>` : ""}</div></header>`,
        ].join("");
        const parts: string[] = [`<section class="summary">${header}${this.getStats(result)}${this.getActions(result, kind)}</section>`];
        if (result.compileError) {
            parts.push(this.getField(l10n.t("Compile Error"), result.compileError));
        }
        if (result.runtimeError) {
            parts.push(this.getField(l10n.t("Runtime Error"), result.runtimeError));
        }
        if (result.cases) {
            const { cases } = result;
            parts.push(...cases.map((testCase: ITestCaseResult, index: number) =>
                this.getCase(result, testCase, l10n.t("Case {0}", index + 1), cases.length <= 3 || testCase.passed !== true)));
        } else if (kind !== "ok" && (result.lastTestcase || result.codeOutput !== undefined || result.expectedOutput !== undefined)) {
            // The judge sends these fields empty for an accepted submission, so only a failed one has a case to show.
            // What a submission printed belongs to the case it failed on.
            const failed: ITestCaseResult = {
                input: result.lastTestcase || undefined, output: result.codeOutput, expected: result.expectedOutput, stdout: result.stdout, passed: false,
            };
            return [...parts, this.getCase(result, failed, l10n.t("Last Testcase"), true)].join("\n");
        }
        if (result.input) {
            parts.push(this.getField(l10n.t("Input"), result.input));
        }
        if (result.stdout) {
            parts.push(this.getField(l10n.t("Stdout"), result.stdout));
        }
        return parts.join("\n");
    }

    private getStats(result: ISubmissionResult): string {
        const stat = (label: string, value: string, percentile?: number): string => {
            const beats: string | undefined = percentile === undefined ? undefined : result.language
                ? l10n.t("Beats {0}% of users with {1}", percentile.toFixed(2), result.language)
                : l10n.t("Beats {0}%", percentile.toFixed(2));
            return [
                `<li class="stat"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span>`,
                beats ? `<span class="beats">${escapeHtml(beats)}</span>` : "",
                "</li>",
            ].join("");
        };
        const items: string[] = [];
        if (result.runtime) {
            items.push(stat(l10n.t("Runtime"), result.runtime, result.runtimePercentile));
        }
        if (result.memory) {
            items.push(stat(l10n.t("Memory"), result.memory, result.memoryPercentile));
        }
        return items.length > 0 ? `<ul class="stats">${items.join("")}</ul>` : "";
    }

    /** The next step: submit a passing test run, test a failed submission's case, or learn from the solution. */
    private getActions(result: ISubmissionResult, kind: StatusKind): string {
        const links: string[] = [];
        // Only submissions have a page on LeetCode.
        if (result.submissionUrl) {
            if (kind !== "ok" && result.lastTestcase) {
                links.push(this.getActionLink(l10n.t("Test with this input"), "test", this.texts.push(result.lastTestcase) - 1, "button"));
            }
            if (!result.compileError) {
                links.push(this.getActionLink(l10n.t("View Solution"), "solution", undefined, "button secondary"));
            }
            if (kind === "ok") {
                links.push(this.getActionLink(l10n.t("Submissions"), "submissions", undefined, "button secondary"));
            }
            links.push(`<a href="${escapeHtml(result.submissionUrl)}">${escapeHtml(l10n.t("View the submission on LeetCode"))}</a>`);
        } else if (result.cases && kind === "ok") {
            // An accepted test run passed every case.
            links.push(this.getActionLink(l10n.t("Submit"), "submit", undefined, "button"));
        }
        return links.length > 0 ? `<div class="actions">${links.join("")}</div>` : "";
    }

    private getCase(result: ISubmissionResult, testCase: ITestCaseResult, title: string, open: boolean): string {
        const state: string = testCase.passed === true ? "pass" : testCase.passed === false ? "fail" : "";
        const icon: string = testCase.passed === true ? "✓" : testCase.passed === false ? "✗" : "•";
        const { input, output, expected, stdout } = testCase;
        const diff: IDiffRange | undefined = output !== undefined && expected !== undefined && output !== expected
            ? diffRange(expected, output)
            : undefined;
        const fields: string[] = [];
        if (input !== undefined) {
            fields.push(this.getField(l10n.t("Input"), input, { display: labelInput(input, result.paramNames) }));
        }
        if (output !== undefined) {
            fields.push(this.getField(l10n.t("Output"), output, diff && { mark: [diff.prefix, output.length - diff.suffix], markClass: "removed" }));
        }
        if (stdout) {
            fields.push(this.getField(l10n.t("Stdout"), stdout));
        }
        if (expected !== undefined) {
            fields.push(this.getField(l10n.t("Expected"), expected, diff && { mark: [diff.prefix, expected.length - diff.suffix], markClass: "inserted" }));
        }
        return `<details class="case ${state}"${open ? " open" : ""}><summary>${icon} ${escapeHtml(title)}</summary>${fields.join("")}</details>`;
    }

    private getField(label: string, text: string, options: IFieldOptions = {}): string {
        const links: string[] = [this.getActionLink(l10n.t("Copy"), "copy", this.texts.push(text) - 1)];
        const [start, end] = options.mark ?? [0, 0];
        const body: string = options.mark && end > start
            ? `${escapeHtml(text.slice(0, start))}<mark class="${options.markClass}">${escapeHtml(text.slice(start, end))}</mark>${escapeHtml(text.slice(end))}`
            : escapeHtml(options.display ?? text);
        const lines: number = text.split("\n").length;
        const actions: string = `<span class="links">${links.join("")}</span>`;
        if (lines > LONG_TEXT_LINES || text.length > LONG_TEXT_LENGTH) {
            const summary: string = `${label} · ${l10n.t("{0} lines", lines)}`;
            return `<details class="field"><summary class="label">${escapeHtml(summary)}</summary><div class="field-head"><span></span>${actions}</div><pre>${body}</pre></details>`;
        }
        return `<div class="field"><div class="field-head"><span class="label">${escapeHtml(label)}</span>${actions}</div><pre>${body}</pre></div>`;
    }

    private getActionLink(label: string, action: string, index?: number, className?: string): string {
        const args: unknown[] = index === undefined ? [this.run, action] : [this.run, action, index];
        const href: string = `command:${RESULT_ACTION_COMMAND}?${encodeURIComponent(JSON.stringify(args))}`;
        return `<a${className ? ` class="${className}"` : ""} href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
    }

    private async showKeybindingsHint(): Promise<void> {
        await promptHintMessage(
            "hint.commandShortcut",
            l10n.t('You can customize shortcut key bindings in File > Preferences > Keyboard Shortcuts with query "leetcode".'),
            l10n.t("Open Keybindings"),
            (): Promise<any> => openKeybindingsEditor("leetcode solution"),
        );
    }
}

export const leetCodeSubmissionProvider: LeetCodeSubmissionProvider = new LeetCodeSubmissionProvider();
