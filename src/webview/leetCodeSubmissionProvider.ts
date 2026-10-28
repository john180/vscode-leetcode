// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { commands, Disposable, l10n, Webview, WebviewView, WebviewViewProvider, workspace } from "vscode";
import type { ISubmissionResult } from "../api/submission";
import { leetCodeChannel } from "../leetCodeChannel";
import { IProblem } from "../shared";
import { diffLines, IDiffLine } from "../utils/diffUtils";
import { openKeybindingsEditor, promptHintMessage } from "../utils/uiUtils";
import { markdownEngine } from "./markdownEngine";

/** Test and submission results, shown in the bottom panel below the code. */
class LeetCodeSubmissionProvider implements WebviewViewProvider, Disposable {
    private view: WebviewView | undefined;
    private result: ISubmissionResult | undefined;
    private problem: IProblem | undefined;

    public resolveWebviewView(view: WebviewView): void {
        this.view = view;
        view.webview.options = { localResourceRoots: markdownEngine.localResourceRoots };
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

    public show(result: ISubmissionResult, problem?: IProblem): void {
        this.result = result;
        this.problem = problem;
        this.render();
        void this.reveal();
        void this.showKeybindingsHint();
    }

    public dispose(): void {
        this.result = undefined;
        this.problem = undefined;
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
        const body: string = this.result
            ? markdownEngine.render(this.getResultMarkdown(this.result))
            : markdownEngine.render(l10n.t("Run **Test** or **Submit** in a problem file to see the result here."));
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
                <style>body { background: transparent; padding: 4px 16px 16px; }</style>
            </head>
            <body class="vscode-body 'scrollBeyondLastLine' 'wordWrap' 'showEditorSelection'" style="tab-size:4">
                ${body}
            </body>
            </html>
        `;
    }

    private getResultMarkdown(result: ISubmissionResult): string {
        const status: string = result.statusMessage || result.state;
        const lines: string[] = [`## ${status}`];

        if (result.runtime || result.memory || result.totalCorrect !== undefined) {
            const details: string[] = [];
            if (result.runtime) {
                details.push(`* ${l10n.t("Runtime")}: ${result.runtime}`);
            }
            if (result.memory) {
                details.push(`* ${l10n.t("Memory")}: ${result.memory}`);
            }
            if (result.totalCorrect !== undefined) {
                const total: string = result.totalTestcases !== undefined
                    ? ` / ${result.totalTestcases}`
                    : "";
                details.push(`* ${l10n.t("Passed")}: ${result.totalCorrect}${total}`);
            }
            lines.push("", ...details);
        }

        if (result.compileError) {
            lines.push("", `### ${l10n.t("Compile Error")}`, "```text", result.compileError, "```");
        }
        if (result.runtimeError) {
            lines.push("", `### ${l10n.t("Runtime Error")}`, "```text", result.runtimeError, "```");
        }
        if (result.lastTestcase) {
            lines.push("", `### ${l10n.t("Last Testcase")}`, "```text", result.lastTestcase, "```");
        }
        if (result.codeOutput) {
            lines.push("", `### ${l10n.t("Output")}`, "```text", result.codeOutput, "```");
        }
        if (result.expectedOutput) {
            lines.push("", `### ${l10n.t("Expected")}`, "```text", result.expectedOutput, "```");
        }
        if (result.expectedOutput && result.codeOutput && result.expectedOutput !== result.codeOutput) {
            const diff: string[] = diffLines(result.expectedOutput, result.codeOutput)
                .slice(0, 200)
                .map((line: IDiffLine) => `${line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}${line.text}`);
            lines.push("", `### ${l10n.t("Diff")}`, "```diff", ...diff, "```");
        }
        return lines.join("\n");
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
