// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { l10n, ViewColumn } from "vscode";
import type { ISubmissionResult } from "../api/submission";
import { openKeybindingsEditor, promptHintMessage } from "../utils/uiUtils";
import { ILeetCodeWebviewOption, LeetCodeWebview } from "./LeetCodeWebview";
import { markdownEngine } from "./markdownEngine";

class LeetCodeSubmissionProvider extends LeetCodeWebview {

    protected readonly viewType: string = "leetcode.submission";
    private result: ISubmissionResult;

    public show(result: ISubmissionResult): void {
        this.result = result;
        void this.showWebviewInternal();
        this.showKeybindingsHint();
    }

    protected getWebviewOption(): ILeetCodeWebviewOption {
        return {
            title: l10n.t("Submission"),
            viewColumn: ViewColumn.Two,
        };
    }

    protected getWebviewContent(): string {
        const status: string = this.result.statusMessage || this.result.state;
        const lines: string[] = [`## ${status}`];

        if (this.result.runtime || this.result.memory || this.result.totalCorrect !== undefined) {
            const details: string[] = [];
            if (this.result.runtime) {
                details.push(`* ${l10n.t("Runtime")}: ${this.result.runtime}`);
            }
            if (this.result.memory) {
                details.push(`* ${l10n.t("Memory")}: ${this.result.memory}`);
            }
            if (this.result.totalCorrect !== undefined) {
                const total: string = this.result.totalTestcases !== undefined
                    ? ` / ${this.result.totalTestcases}`
                    : "";
                details.push(`* ${l10n.t("Passed")}: ${this.result.totalCorrect}${total}`);
            }
            lines.push("", ...details);
        }

        if (this.result.compileError) {
            lines.push("", `### ${l10n.t("Compile Error")}`, "```text", this.result.compileError, "```");
        }
        if (this.result.runtimeError) {
            lines.push("", `### ${l10n.t("Runtime Error")}`, "```text", this.result.runtimeError, "```");
        }
        if (this.result.lastTestcase) {
            lines.push("", `### ${l10n.t("Last Testcase")}`, "```text", this.result.lastTestcase, "```");
        }
        if (this.result.codeOutput) {
            lines.push("", `### ${l10n.t("Output")}`, "```text", this.result.codeOutput, "```");
        }
        if (this.result.expectedOutput) {
            lines.push("", `### ${l10n.t("Expected")}`, "```text", this.result.expectedOutput, "```");
        }

        const body: string = markdownEngine.render(lines.join("\n"));
        const webview = this.webview!;
        const styles: string = markdownEngine.getStyles(webview);
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta http-equiv="Content-Security-Policy" content="
                    default-src 'none';
                    worker-src 'self' ${webview.cspSource};
                    img-src https: data: ${webview.cspSource};
                    style-src ${webview.cspSource} 'unsafe-inline';
                "/>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                ${styles}
            </head>
            <body class="vscode-body 'scrollBeyondLastLine' 'wordWrap' 'showEditorSelection'" style="tab-size:4">
                ${body}
            </body>
            </html>
        `;
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
