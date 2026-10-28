// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { randomBytes } from "node:crypto";
import { commands, Disposable, l10n, Webview, WebviewView, WebviewViewProvider, workspace } from "vscode";
import { getProblemCacheScope } from "../api/problems";
import { fetchQuestionDetail } from "../api/question";
import type { IQuestionDetail } from "../api/question";
import { getLeetCodeRequest } from "../api/request";
import { fetchTopSolution } from "../api/solution";
import type { ISolution } from "../api/solution";
import { getLeetCodeEndpoint } from "../commands/plugin";
import { explorerNodeManager } from "../explorer/explorerNodeManager";
import { LeetCodeNode } from "../explorer/LeetCodeNode";
import { globalState } from "../globalState";
import { leetCodeChannel } from "../leetCodeChannel";
import { Endpoint, IProblem, PREMIUM_URL_CN, PREMIUM_URL_GLOBAL } from "../shared";
import { shouldUseEndpointTranslation } from "../utils/settingUtils";
import { openSettingsEditor, openUrl, promptHintMessage } from "../utils/uiUtils";
import { markdownEngine } from "./markdownEngine";
import { sanitizeProblemHtml } from "./sanitize";

export type DetailTab = "description" | "solution";

/** One shown problem. Loads write into the state they started for, so a newer problem is never overwritten. */
interface IDetailState {
    problem: IProblem;
    scope: string;
    tab: DetailTab;
    detail?: IQuestionDetail;
    failed?: boolean;
    solution?: ISolution;
    solutionFailed?: boolean;
    solutionPending?: Promise<void>;
}

export interface IShowOptions {
    /** Skip the fetch when the caller already loaded the description. */
    detail?: IQuestionDetail;
    /** Expand the view and switch the sidebar to it, keeping keyboard focus where it is. */
    reveal?: boolean;
    tab?: DetailTab;
}

const style: string = `
    body { background: transparent; padding: 0 12px 24px; }
    header { position: sticky; top: 0; z-index: 1; padding: 8px 0 0; background: var(--vscode-sideBar-background); border-bottom: 1px solid var(--vscode-panel-border); }
    header h2 { margin: 0 0 4px; font-size: 1.15em; }
    .difficulty { font-weight: 600; }
    .difficulty.easy { color: var(--vscode-charts-green); }
    .difficulty.medium { color: var(--vscode-charts-yellow); }
    .difficulty.hard { color: var(--vscode-charts-red); }
    .actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
    button { border: 0; padding: 4px 10px; cursor: pointer; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .tabs { display: flex; gap: 16px; }
    .tabs button, .tabs button:hover { padding: 4px 0; color: var(--vscode-foreground); background: none; border-bottom: 2px solid transparent; opacity: 0.7; }
    .tabs button:hover, .tabs button[aria-selected="true"] { opacity: 1; }
    .tabs button[aria-selected="true"] { border-bottom-color: var(--vscode-focusBorder); font-weight: 600; }
    .status { color: var(--vscode-descriptionForeground); }
    table { display: block; overflow-x: auto; }
`;

function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (char: string) => `&#${char.charCodeAt(0)};`);
}

/** The problem description and top solution, shown in the LeetCode sidebar beside the problem list. */
class LeetCodePreviewProvider implements WebviewViewProvider, Disposable {
    private view: WebviewView | undefined;
    private state: IDetailState | undefined;
    private hinted: boolean = false;

    public get currentProblemId(): string | undefined {
        return this.state?.problem.id;
    }

    public resolveWebviewView(view: WebviewView): void {
        this.view = view;
        view.webview.options = { enableScripts: true, localResourceRoots: markdownEngine.localResourceRoots };
        const listeners: Disposable[] = [
            view.webview.onDidReceiveMessage(this.onDidReceiveMessage, this),
            workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration("markdown") || event.affectsConfiguration("leetcode.useEndpointTranslation")) {
                    this.render();
                }
            }),
        ];
        view.onDidDispose(() => {
            listeners.forEach((listener: Disposable) => listener.dispose());
            if (this.view === view) {
                this.view = undefined;
            }
        });
        this.render();
    }

    public async show(problem: IProblem, options: IShowOptions = {}): Promise<void> {
        const scope: string = getProblemCacheScope();
        // Showing the same problem again keeps what was loaded instead of fetching and flashing it.
        const previous: IDetailState | undefined = this.state?.problem.slug === problem.slug && this.state.scope === scope ? this.state : undefined;
        const state: IDetailState = {
            problem, scope,
            tab: options.tab ?? previous?.tab ?? "description",
            detail: options.detail ?? previous?.detail,
            solution: previous?.solution,
        };
        this.state = state;
        this.render();
        if (options.reveal) {
            void this.reveal();
        }
        if (this.isLocked(problem)) {
            return;
        }
        await Promise.all([
            state.detail ? undefined : this.loadDescription(state),
            state.tab === "solution" ? this.loadSolution(state) : undefined,
        ]);
    }

    public dispose(): void {
        this.state = undefined;
    }

    private async loadDescription(state: IDetailState): Promise<void> {
        try {
            state.detail = await fetchQuestionDetail(getLeetCodeRequest(), state.problem.slug);
        } catch (error) {
            leetCodeChannel.appendLine(`[ERROR] Failed to fetch the problem description: ${error}`);
            state.failed = true;
        }
        if (this.state === state) {
            this.render();
        }
    }

    private loadSolution(state: IDetailState): Promise<void> {
        if (state.solution) {
            return Promise.resolve();
        }
        state.solutionFailed = false;
        state.solutionPending ??= fetchTopSolution(getLeetCodeRequest(), state.problem.slug).then((solution: ISolution) => {
            state.solution = solution;
        }, (error: unknown) => {
            leetCodeChannel.appendLine(`[ERROR] Failed to fetch the top voted solution: ${error}`);
            state.solutionFailed = true;
        }).finally(() => {
            state.solutionPending = undefined;
            if (this.state === state) {
                this.render();
            }
        });
        return state.solutionPending;
    }

    private async reveal(): Promise<void> {
        if (this.view) {
            this.view.show(true);
            return;
        }
        try {
            // The view resolves on first display; the generated focus command opens it.
            await commands.executeCommand("leetCodeDetail.focus", { preserveFocus: true });
        } catch (error) {
            leetCodeChannel.appendLine(`[WARN] Failed to reveal the problem description: ${error}`);
        }
    }

    private isLocked(problem: IProblem): boolean {
        return problem.locked && !globalState.getUserStatus()?.isPremium;
    }

    private render(): void {
        if (!this.view) {
            return;
        }
        const problem: IProblem | undefined = this.state?.problem;
        this.view.description = problem ? `${problem.id}. ${problem.name}` : undefined;
        this.view.webview.html = this.getWebviewContent(this.view.webview);
        if (this.state?.detail && !this.hinted) {
            this.hinted = true;
            void promptHintMessage(
                "hint.configWebviewMarkdown",
                l10n.t('You can change the webview appearance ("fontSize", "lineWidth" & "fontFamily") in "markdown.preview" configuration.'),
                l10n.t("Open settings"),
                (): Promise<any> => openSettingsEditor("markdown.preview"),
            );
        }
    }

    private getWebviewContent(webview: Webview): string {
        const nonce: string = randomBytes(24).toString("base64");
        // Scroll positions are kept per problem and tab.
        const page: string = JSON.stringify(this.state ? `${this.state.problem.slug}#${this.state.tab}` : "").replace(/</g, "\\u003c");
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
                    script-src 'nonce-${nonce}';
                "/>
                ${markdownEngine.getStyles(webview)}
                <style>${style}</style>
            </head>
            <body>
                ${this.state ? this.getProblemContent(this.state) : `<p class="status">${escapeHtml(l10n.t("Select a problem in the list above, or open a problem file to see its description."))}</p>`}
                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();
                    // Sanitized problem HTML and rendered markdown cannot contain buttons, so these are ours.
                    for (const button of document.querySelectorAll("button[data-command]")) {
                        button.addEventListener("click", () => vscode.postMessage({ command: button.dataset.command }));
                    }
                    const page = ${page};
                    const saved = vscode.getState();
                    if (saved && saved.page === page) {
                        window.scrollTo(0, saved.y);
                    }
                    let frame = 0;
                    window.addEventListener("scroll", () => {
                        cancelAnimationFrame(frame);
                        frame = requestAnimationFrame(() => vscode.setState({ page, y: window.scrollY }));
                    });
                </script>
            </body>
            </html>
        `;
    }

    private getProblemContent(state: IDetailState): string {
        const { problem, detail } = state;
        const useTranslation: boolean = shouldUseEndpointTranslation();
        const title: string = detail
            ? (useTranslation ? (detail.translatedTitle || detail.title) : detail.title)
            : problem.name;
        const difficulty: string = detail?.difficulty || problem.difficulty;
        const locked: boolean = this.isLocked(problem);
        const actions: string = locked
            ? `<button data-command="premium">${escapeHtml(l10n.t("Get Premium"))}</button>`
            : [
                `<button data-command="code">${escapeHtml(l10n.t("Code Now"))}</button>`,
                `<button class="secondary" data-command="submissions">${escapeHtml(l10n.t("Submissions"))}</button>`,
                `<button class="secondary" data-command="${problem.isFavorite ? "unstar" : "star"}">${escapeHtml(problem.isFavorite ? l10n.t("Unstar") : l10n.t("Star"))}</button>`,
            ].join("");
        const tab = (id: DetailTab, label: string): string =>
            `<button role="tab" aria-selected="${state.tab === id}" data-command="${id}">${escapeHtml(label)}</button>`;
        const tabs: string = locked ? "" : `<div class="tabs" role="tablist">${tab("description", l10n.t("Description"))}${tab("solution", l10n.t("Solution"))}</div>`;
        const header: string = `
            <header>
                <h2><a href="${escapeHtml(this.getProblemUrl(problem.slug))}">${escapeHtml(`${problem.id}. ${title}`)}</a></h2>
                ${difficulty ? `<span class="difficulty ${escapeHtml(difficulty.toLowerCase())}">${escapeHtml(l10n.t(difficulty))}</span>` : ""}
                <div class="actions">${actions}</div>
                ${tabs}
            </header>`;

        if (locked) {
            return `${header}<p class="status">${escapeHtml(l10n.t("This problem requires a LeetCode Premium subscription."))}</p>`;
        }
        return `${header}${state.tab === "solution" ? this.getSolutionContent(state) : this.getDescriptionContent(state, useTranslation)}`;
    }

    private getDescriptionContent({ problem, detail, failed }: IDetailState, useTranslation: boolean): string {
        if (failed) {
            return `<p class="status"><button class="secondary" data-command="retry">${escapeHtml(l10n.t("Loading failed. Click to retry."))}</button></p>`;
        }
        if (!detail) {
            return `<p class="status">${escapeHtml(l10n.t("Loading the problem description..."))}</p>`;
        }

        const tagItems: string[] = detail.topicTags.length > 0
            ? detail.topicTags.map((tag) => {
                const label: string = useTranslation ? (tag.translatedName || tag.name) : tag.name;
                return `[\`${label}\`](${this.getTagLink(tag.slug)})`;
            })
            : problem.tags.map((tag: string) => `[\`${tag}\`](${this.getTagLink(tag)})`);
        const tags: string = tagItems.length > 0
            ? [
                `<details>`,
                `<summary><strong>${escapeHtml(l10n.t("Tags"))}</strong></summary>`,
                markdownEngine.render(tagItems.join(" | ")),
                `</details>`,
            ].join("\n")
            : "";
        const companies: string = problem.companies.length > 0
            ? [
                `<details>`,
                `<summary><strong>${escapeHtml(l10n.t("Companies"))}</strong></summary>`,
                markdownEngine.render(problem.companies.map((company: string) => `\`${company}\``).join(" | ")),
                `</details>`,
            ].join("\n")
            : "";
        const body: string = useTranslation ? (detail.translatedContent || detail.content) : detail.content;
        const url: string = this.getProblemUrl(detail.titleSlug);
        const links: string = markdownEngine.render(`[${l10n.t("Submissions")}](${this.getSubmissionsLink(url)}) | [${l10n.t("Solution")}](${this.getSolutionsLink(url)})`);
        return `
            ${tags}
            ${companies}
            ${sanitizeProblemHtml(body)}
            <hr />
            ${links}
        `;
    }

    private getSolutionContent({ problem, solution, solutionFailed }: IDetailState): string {
        if (solutionFailed) {
            return `<p class="status"><button class="secondary" data-command="solution">${escapeHtml(l10n.t("Loading failed. Click to retry."))}</button></p>`;
        }
        if (!solution) {
            return `<p class="status">${escapeHtml(l10n.t("Loading the solution..."))}</p>`;
        }
        const title: string = solution.title ? markdownEngine.render(`### ${solution.title}`) : "";
        const body: string = markdownEngine.render(solution.content, { lang: "", host: this.getHost() });
        const url: string = this.getSolutionsLink(this.getProblemUrl(problem.slug));
        return `
            ${title}
            ${body}
            <hr />
            ${markdownEngine.render(`[${l10n.t("Solution")}](${url})`)}
        `;
    }

    private async onDidReceiveMessage(message: unknown): Promise<void> {
        const state: IDetailState | undefined = this.state;
        if (!state || !message || typeof message !== "object" || !("command" in message)) {
            return;
        }
        const problem: IProblem = state.problem;
        const node: LeetCodeNode = problem instanceof LeetCodeNode ? problem : new LeetCodeNode(problem);
        switch (message.command) {
            case "description":
            case "solution": {
                state.tab = message.command;
                // Start loading first so a retry renders as loading rather than as the old failure.
                const loading: Promise<void> | undefined = message.command === "solution" && !this.isLocked(problem) ? this.loadSolution(state) : undefined;
                this.render();
                await loading;
                break;
            }
            case "code":
                await commands.executeCommand("leetcode.showProblem", node);
                break;
            case "submissions":
                await commands.executeCommand("leetcode.showSubmissions", node);
                break;
            case "star":
            case "unstar":
                await commands.executeCommand(message.command === "star" ? "leetcode.addFavorite" : "leetcode.removeFavorite", node);
                if (this.state === state) {
                    state.problem = explorerNodeManager.getNodeById(problem.id) ?? problem;
                    this.render();
                }
                break;
            case "premium":
                await openUrl(getLeetCodeEndpoint() === Endpoint.LeetCode ? PREMIUM_URL_GLOBAL : PREMIUM_URL_CN);
                break;
            case "retry":
                await this.show(problem);
                break;
        }
    }

    private getHost(): string {
        return getLeetCodeEndpoint() === Endpoint.LeetCodeCN
            ? "https://leetcode.cn"
            : "https://leetcode.com";
    }

    private getProblemUrl(slug: string): string {
        return `${this.getHost()}/problems/${slug}/description/`;
    }

    private getTagLink(tag: string): string {
        const endPoint: string = getLeetCodeEndpoint();
        if (endPoint === Endpoint.LeetCodeCN) {
            return `https://leetcode.cn/tag/${tag}?source=vscode`;
        } else if (endPoint === Endpoint.LeetCode) {
            return `https://leetcode.com/tag/${tag}?source=vscode`;
        }

        return "https://leetcode.com?source=vscode";
    }

    private getSolutionsLink(url: string): string {
        return url.replace("/description/", "/solutions/") + "?source=vscode";
    }

    private getSubmissionsLink(url: string): string {
        return url.replace("/description/", "/submissions/") + "?source=vscode";
    }
}

export const leetCodePreviewProvider: LeetCodePreviewProvider = new LeetCodePreviewProvider();
