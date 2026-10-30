// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { randomBytes } from "node:crypto";
import {
    commands, Disposable, env, l10n, Uri, ViewColumn, Webview, WebviewPanel, WebviewView, WebviewViewProvider, window, workspace,
} from "vscode";
import { getProblemBySlug, getProblemCacheScope } from "../api/problems";
import { fetchQuestionDetail, getAcceptanceRate, getSimilarQuestions } from "../api/question";
import type { IQuestionDetail, ISimilarQuestion } from "../api/question";
import { getLeetCodeRequest } from "../api/request";
import { fetchTopSolution } from "../api/solution";
import type { ISolution } from "../api/solution";
import { searchFor } from "../commands/search";
import { explorerNodeManager } from "../explorer/explorerNodeManager";
import { LeetCodeNode } from "../explorer/LeetCodeNode";
import { globalState } from "../globalState";
import { leetCodeChannel } from "../leetCodeChannel";
import { currentSite, IProblem, languages, ProblemState } from "../shared";
import { getProblemFile, getProblemLanguage, problemFileEvents } from "../utils/problemDocumentContext";
import { shouldUseEndpointTranslation } from "../utils/settingUtils";
import { openSettingsEditor, openUrl, promptHintMessage } from "../utils/uiUtils";
import { markdownEngine } from "./markdownEngine";
import { escapeHtml, sanitizeProblemHtml } from "./sanitize";

export type DetailTab = "description" | "solution";

/** The view type of the editor tab, which VS Code restores after a reload. */
export const DESCRIPTION_PANEL: string = "leetCodeDescription";

interface ISolutionState {
    /** Null when the problem has no solution to show. */
    solution?: ISolution | null;
    failed?: boolean;
    pending?: Promise<void>;
}

/** One shown problem. Loads write into the state they started for, so a newer problem is never overwritten. */
interface IDetailState {
    problem: IProblem;
    scope: string;
    tab: DetailTab;
    detail?: IQuestionDetail;
    failed?: boolean;
    /** The language to show a solution in, or "" for any. */
    language: string;
    /** Solutions loaded so far, by language. */
    solutions: Map<string, ISolutionState>;
}

export interface IShowOptions {
    /** Skip the fetch when the caller already loaded the description. */
    detail?: IQuestionDetail;
    /** Bring the description into view, in the editor tab if one is open, keeping keyboard focus where it is. */
    reveal?: boolean;
    tab?: DetailTab;
    /** Open the editor tab, which later reveals use until it is closed. */
    inEditor?: boolean;
}

/** A page the problem is shown on: the sidebar view, or the editor tab. */
interface IHost {
    webview: Webview;
    inEditor: boolean;
    /** The render the page was created with. */
    pageVersion: number;
    setTitle(title: string | undefined): void;
}

/** Language names as LeetCode shows them. */
const LANGUAGE_NAMES: { [language: string]: string } = {
    bash: "Bash", c: "C", cpp: "C++", csharp: "C#", golang: "Go", java: "Java", javascript: "JavaScript", kotlin: "Kotlin", mysql: "MySQL",
    php: "PHP", python: "Python", python3: "Python3", ruby: "Ruby", rust: "Rust", scala: "Scala", swift: "Swift", typescript: "TypeScript",
};

/** The language of the problem's solution file, or else the default language. */
function getPreferredLanguage(problem: IProblem): string {
    const language: string | undefined = getProblemLanguage(problem.id) ?? workspace.getConfiguration("leetcode").get<string>("defaultLanguage");
    return language && languages.includes(language) ? language : "";
}

const style: string = `
    body { background: transparent; padding: 0 12px 24px; }
    header { padding: 10px 0 0; }
    .title { display: flex; align-items: flex-start; gap: 8px; }
    .title h2 { flex: 1; margin: 0; font-size: 1.15em; line-height: 1.4; }
    .title h2 a { color: var(--vscode-foreground); text-decoration: none; }
    .title h2 a:hover { text-decoration: underline; }
    .badges { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin-top: 6px; font-size: 0.9em; color: var(--vscode-descriptionForeground); }
    .difficulty.easy { --tone: var(--vscode-charts-green); }
    .difficulty.medium { --tone: var(--vscode-charts-yellow); }
    .difficulty.hard { --tone: var(--vscode-charts-red); }
    .solved { --tone: var(--vscode-testing-iconPassed); }
    .attempted { --tone: var(--vscode-charts-yellow); }
    .difficulty, .solved, .attempted { font-weight: 600; color: var(--tone); }
    .pill { padding: 0 8px; border-radius: 10px; background: color-mix(in srgb, var(--tone) 18%, transparent); }
    .actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 6px; }
    .actions button { flex: 1 1 0; min-width: max-content; padding: 4px 10px; border: 1px solid var(--vscode-button-border, transparent); }
    button { border: 0; padding: 3px 8px; border-radius: 2px; cursor: pointer; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    /* Sized in em so the icon follows the preview font size, as the glyph it replaced did. */
    button.icon, button.icon:hover { display: flex; align-items: center; justify-content: center; flex: none; width: 1.85em; height: 1.85em; padding: 0.3em; }
    button.icon, button.icon:hover { font-size: inherit; color: var(--vscode-icon-foreground); background: none; }
    button.icon:hover { background: var(--vscode-toolbar-hoverBackground); }
    button.icon.starred { color: var(--vscode-charts-yellow); }
    /* Only the tabs stay in view, so the description gets the rest of the sidebar. --surface is the color behind the page. */
    .tabs { position: sticky; top: 0; z-index: 1; display: flex; gap: 16px; margin: 0 -12px 8px; padding: 0 12px; }
    .tabs { background: var(--surface); border-bottom: 1px solid var(--vscode-panel-border); }
    .tabs button, .tabs button:hover { padding: 4px 0; color: var(--vscode-foreground); background: none; border-radius: 0; border-bottom: 2px solid transparent; opacity: 0.7; }
    .tabs button:hover, .tabs button[aria-selected="true"] { opacity: 1; }
    .tabs button[aria-selected="true"] { border-bottom-color: var(--vscode-focusBorder); font-weight: 600; }
    .status { color: var(--vscode-descriptionForeground); }
    table { display: block; overflow-x: auto; }
    .extra { margin-top: 16px; border-top: 1px solid var(--vscode-panel-border); }
    .extra details { margin: 8px 0; }
    .extra summary { font-weight: 600; cursor: pointer; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
    .chip, .chip:hover { padding: 1px 8px; border-radius: 10px; font-size: 0.9em; color: var(--vscode-badge-foreground); background: var(--vscode-badge-background); }
    button.chip:hover { text-decoration: underline; }
    .similar { margin: 6px 0; padding-left: 0; list-style: none; }
    .similar li { display: flex; gap: 8px; align-items: baseline; margin: 2px 0; }
    button.link, button.link:hover { padding: 0; color: var(--vscode-textLink-foreground); background: none; text-align: left; }
    button.link:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }
    .code-block { position: relative; }
    .code-block > .copy { position: absolute; top: 4px; right: 4px; padding: 1px 6px; font-size: 0.85em; opacity: 0; }
    .code-block > .copy { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    .code-block:hover > .copy, .code-block > .copy:focus { opacity: 1; }
    .code-tabs { display: flex; flex-wrap: wrap; gap: 2px; margin-top: 8px; }
    .code-tabs button, .code-tabs button:hover { padding: 3px 10px; color: var(--vscode-foreground); background: none; border-radius: 0; border-bottom: 2px solid transparent; opacity: 0.7; }
    .code-tabs button[aria-selected="true"] { opacity: 1; border-bottom-color: var(--vscode-focusBorder); }
    .code-group.tabbed > details > summary { display: none; }
    .code-group.tabbed > details:not([open]) { display: none; }
    .code-group > details > pre, .code-group > details > .code-block > pre { margin-top: 0; }
    .solution-language { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px; margin: 4px 0 8px; }
    .solution-language select { padding: 2px 4px; border: 1px solid var(--vscode-dropdown-border); border-radius: 2px; }
    .solution-language select { color: var(--vscode-dropdown-foreground); background: var(--vscode-dropdown-background); font: inherit; }
`;

/**
 * Runs in the view. The page is rendered once, and later content arrives by message so that updates keep
 * scroll positions and open sections instead of reloading the page.
 */
const script: string = `
    const vscode = acquireVsCodeApi();
    const root = document.getElementById("root");
    const state = vscode.getState() || {};
    const pages = state.pages || {};
    const imageBackgrounds = state.imageBackgrounds || {};
    let { version, page } = JSON.parse(document.getElementById("initial").textContent);
    // A position to keep while images above it load, until the user scrolls.
    let target = null;

    function restore(y) {
        target = y;
        window.scrollTo(0, y);
        for (const image of root.querySelectorAll("img")) {
            if (!image.complete) {
                image.addEventListener("load", () => { if (target !== null) { window.scrollTo(0, target); } }, { once: true });
            }
        }
    }

    function saveState() {
        vscode.setState({ pages, imageBackgrounds });
    }

    // Keeps the most recently written keys, dropping the oldest past the limit.
    function remember(store, key, value, limit) {
        delete store[key];
        store[key] = value;
        const keys = Object.keys(store);
        if (keys.length > limit) {
            delete store[keys[0]];
        }
    }

    function isDark() {
        const theme = document.body.classList;
        return theme.contains("vscode-dark") || (theme.contains("vscode-high-contrast") && !theme.contains("vscode-high-contrast-light"));
    }

    function imageKey(image) {
        return JSON.stringify([page, image.getAttribute("src")]);
    }

    // Problem diagrams are often black lines on transparency, so dark themes back images with white unless the reader chose otherwise.
    function applyBackgrounds() {
        const dark = isDark();
        for (const image of root.querySelectorAll("img")) {
            const light = imageBackgrounds[imageKey(image)] ?? dark;
            image.classList.toggle("light-background", light);
            image.closest(".image-frame")?.querySelector(".image-background").setAttribute("aria-pressed", String(light));
        }
    }

    // The control stays hidden on images too small to hold it, where it would cover them and the text beside them.
    const sizes = new ResizeObserver((entries) => {
        for (const { target: frame } of entries) {
            const toggle = frame.querySelector(".image-background");
            frame.classList.toggle("compact", frame.offsetWidth < toggle.offsetWidth + 8 || frame.offsetHeight < toggle.offsetHeight + 8);
        }
    });
    // VS Code switches these classes when the color theme changes.
    new MutationObserver(applyBackgrounds).observe(document.body, { attributeFilter: ["class"] });

    function enhance() {
        for (const image of root.querySelectorAll("img")) {
            // The control stays outside a linked image's anchor; links that hold more than the image keep the theme default.
            const link = image.closest("a");
            const content = !link ? image : link.textContent.trim() === "" && link.querySelectorAll("img").length === 1 ? link : null;
            if (!content || image.closest(".image-frame")) {
                continue;
            }
            const frame = document.createElement("span");
            frame.className = "image-frame";
            content.replaceWith(frame);
            frame.append(content);
            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "image-background";
            toggle.textContent = root.dataset.imageBackground;
            toggle.title = root.dataset.imageBackgroundHint;
            toggle.addEventListener("click", () => {
                const key = imageKey(image);
                const light = !image.classList.contains("light-background");
                // Only choices that differ from the theme default are kept.
                if (light === isDark()) {
                    delete imageBackgrounds[key];
                } else {
                    remember(imageBackgrounds, key, light, 200);
                }
                // Copies of the same image on the page follow the choice too.
                applyBackgrounds();
                saveState();
            });
            frame.append(toggle);
            sizes.observe(frame);
        }
        applyBackgrounds();
        for (const pre of root.querySelectorAll("pre")) {
            if (pre.parentElement.classList.contains("code-block")) {
                continue;
            }
            const block = document.createElement("div");
            block.className = "code-block";
            const copy = document.createElement("button");
            copy.className = "copy";
            copy.type = "button";
            copy.textContent = root.dataset.copy;
            copy.addEventListener("click", () => vscode.postMessage({ command: "copy", text: pre.innerText }));
            pre.replaceWith(block);
            block.append(pre, copy);
        }
        for (const group of root.querySelectorAll(".code-group:not(.tabbed)")) {
            const panels = [...group.children].filter((child) => child.tagName === "DETAILS");
            const bar = document.createElement("div");
            bar.className = "code-tabs";
            bar.setAttribute("role", "tablist");
            const select = (index) => panels.forEach((panel, i) => {
                panel.open = i === index;
                bar.children[i].setAttribute("aria-selected", String(i === index));
            });
            panels.forEach((panel, index) => {
                const tab = document.createElement("button");
                tab.type = "button";
                tab.setAttribute("role", "tab");
                tab.textContent = panel.querySelector("summary")?.textContent || String(index + 1);
                tab.addEventListener("click", () => select(index));
                bar.append(tab);
            });
            group.prepend(bar);
            group.classList.add("tabbed");
            select(Math.max(0, panels.findIndex((panel) => panel.open)));
        }
    }

    // Sanitized problem HTML and rendered markdown cannot contain buttons or menus, so these are ours.
    document.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-command]");
        if (button) {
            vscode.postMessage({ command: button.dataset.command, arg: button.dataset.arg });
        }
    });
    document.addEventListener("change", (event) => {
        const select = event.target.closest("select[data-command]");
        if (select) {
            vscode.postMessage({ command: select.dataset.command, arg: select.value });
        }
    });
    for (const type of ["wheel", "keydown", "pointerdown", "touchstart"]) {
        window.addEventListener(type, () => { target = null; }, { passive: true });
    }
    // The state also holds the image choices, so it is saved once scrolling pauses rather than on every frame.
    let saving = 0;
    window.addEventListener("scroll", () => {
        clearTimeout(saving);
        saving = setTimeout(() => {
            remember(pages, page, window.scrollY, 50);
            saveState();
        }, 200);
    });
    window.addEventListener("message", (event) => {
        const message = event.data;
        if (!message || message.type !== "render" || message.version <= version) {
            return;
        }
        // Keep the sections the user opened when the same page updates, as long as its layout is unchanged.
        const opened = message.page === page ? [...root.querySelectorAll("details")].map((details) => details.open) : [];
        // A control used with the keyboard, such as the language menu, keeps the focus when it is drawn again.
        const focused = root.contains(document.activeElement) ? document.activeElement.dataset.command : undefined;
        pages[page] = window.scrollY;
        ({ version, page } = message);
        sizes.disconnect();
        root.innerHTML = message.html;
        const details = root.querySelectorAll("details");
        if (opened.length === details.length) {
            details.forEach((section, index) => { section.open = opened[index]; });
        }
        enhance();
        restore(pages[page] || 0);
        if (focused) {
            root.querySelector('[data-command="' + focused + '"]')?.focus({ preventScroll: true });
        }
    });
    enhance();
    restore(pages[page] || 0);
    vscode.postMessage({ command: "ready" });
`;

/** LeetCode-only markup: the [TOC] marker, and slideshows and playground frames that only work on the site. */
function cleanSolutionMarkdown(content: string, url: string): string {
    const onLeetCode = (label: string): string => `[${label}](${url})`;
    return content
        .replace(/^[ \t]*\[TOC\][ \t]*$/gim, "")
        .replace(/!\?!.*?!\?!/g, () => onLeetCode(l10n.t("View the slideshow on LeetCode")))
        .replace(/<iframe\b[^>]*>(?:\s*<\/iframe>)?/gi, () => onLeetCode(l10n.t("View the code on LeetCode")));
}

/**
 * The problem description and top solution, shown in the LeetCode sidebar beside the problem list,
 * and in an editor tab while one is open. Both show the same problem.
 */
class LeetCodePreviewProvider implements WebviewViewProvider, Disposable {
    private view: WebviewView | undefined;
    private detachView: (() => void) | undefined;
    private panel: WebviewPanel | undefined;
    private hosts: IHost[] = [];
    private state: IDetailState | undefined;
    private hinted: boolean = false;
    /** Counts renders; a page drops content older than what it shows. */
    private version: number = 0;

    public get currentProblem(): IProblem | undefined {
        return this.state?.scope === getProblemCacheScope() ? this.state.problem : undefined;
    }

    public get currentProblemId(): string | undefined {
        return this.currentProblem?.id;
    }

    /** Drop session-specific content and invalidate outstanding loads. */
    public clear(): void {
        this.state = undefined;
        this.render();
    }

    public resolveWebviewView(view: WebviewView): void {
        // A view resolved again replaces the one before it.
        this.detachView?.();
        this.view = view;
        this.detachView = this.attach({ webview: view.webview, inEditor: false, pageVersion: 0, setTitle: (title) => { view.description = title; } },
            (listener) => view.onDidDispose(listener), () => {
                if (this.view === view) {
                    this.view = undefined;
                    this.detachView = undefined;
                }
            });
    }

    /** Takes over an editor tab VS Code restored after a reload; a second one is closed. */
    public restoreEditor(panel: WebviewPanel): void {
        if (this.panel) {
            panel.dispose();
            return;
        }
        this.attachEditor(panel);
    }

    /** Opens the editor tab beside the editor in use, or brings it into view. */
    public openEditor(): void {
        if (this.panel) {
            this.revealEditor(this.panel);
            return;
        }
        this.attachEditor(window.createWebviewPanel(DESCRIPTION_PANEL, l10n.t("Problem Description"),
            { viewColumn: ViewColumn.Beside, preserveFocus: true }, { enableFindWidget: true }));
    }

    private attachEditor(panel: WebviewPanel): void {
        this.panel = panel;
        this.attach({ webview: panel.webview, inEditor: true, pageVersion: 0, setTitle: (title) => { panel.title = title ?? l10n.t("Problem Description"); } },
            (listener) => panel.onDidDispose(listener), () => {
                // Closing the tab sends later descriptions back to the sidebar.
                if (this.panel === panel) {
                    this.panel = undefined;
                }
            });
    }

    /** A tab already in view stays where it is; one hidden behind other tabs comes up beside the editor in use. */
    private revealEditor(panel: WebviewPanel): void {
        if (!panel.visible) {
            panel.reveal(ViewColumn.Beside, true);
        }
    }

    /** Shows the problem on the host's page until it is disposed or the returned function is called. */
    private attach(host: IHost, onDidDispose: (listener: () => void) => Disposable, disposed: () => void): () => void {
        host.webview.options = { enableScripts: true, localResourceRoots: markdownEngine.localResourceRoots };
        // Test and Submit appear once the problem has a solution file.
        const filesChanged = (): void => this.render(host);
        problemFileEvents.on("changed", filesChanged);
        const listeners: Disposable[] = [
            { dispose: () => problemFileEvents.off("changed", filesChanged) },
            host.webview.onDidReceiveMessage((message: unknown) => this.onDidReceiveMessage(message, host)),
            workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration("markdown")) {
                    // Styles come with the page, so it is created again.
                    this.createPage(host);
                } else if (event.affectsConfiguration("leetcode.useEndpointTranslation")) {
                    this.render(host);
                }
            }),
        ];
        this.hosts.push(host);
        let attached: boolean = true;
        const detach = (): void => {
            if (attached) {
                attached = false;
                listeners.forEach((listener: Disposable) => listener.dispose());
                this.hosts = this.hosts.filter((item: IHost) => item !== host);
                disposed();
            }
        };
        onDidDispose(detach);
        this.createPage(host);
        return detach;
    }

    public async show(problem: IProblem, options: IShowOptions = {}): Promise<void> {
        const scope: string = getProblemCacheScope();
        // Showing the same problem again keeps what was loaded instead of fetching and flashing it.
        const previous: IDetailState | undefined = this.state?.problem.slug === problem.slug && this.state.scope === scope ? this.state : undefined;
        const state: IDetailState = {
            problem, scope,
            tab: options.tab ?? previous?.tab ?? "description",
            detail: options.detail ?? previous?.detail,
            language: previous?.language ?? getPreferredLanguage(problem),
            solutions: previous?.solutions ?? new Map(),
        };
        this.state = state;
        if (options.inEditor) {
            this.openEditor();
        }
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
            leetCodeChannel.error(`Failed to fetch the problem description: ${error}`);
            state.failed = true;
        }
        if (this.state === state) {
            this.render();
        }
    }

    /** Loads the solution in the state's language, once per language. */
    private loadSolution(state: IDetailState): Promise<void> {
        const language: string = state.language;
        const entry: ISolutionState = state.solutions.get(language) ?? {};
        state.solutions.set(language, entry);
        if (entry.solution !== undefined) {
            return Promise.resolve();
        }
        entry.failed = false;
        entry.pending ??= fetchTopSolution(getLeetCodeRequest(), state.problem.slug, language || undefined).then((solution: ISolution | undefined) => {
            entry.solution = solution ?? null;
        }, (error: unknown) => {
            leetCodeChannel.error(`Failed to fetch the top voted solution: ${error}`);
            entry.failed = true;
        }).finally(() => {
            entry.pending = undefined;
            // Showing the same problem again shares what it loads.
            if (this.state?.solutions.get(language) === entry) {
                this.render();
            }
        });
        return entry.pending;
    }

    private async reveal(): Promise<void> {
        if (this.panel) {
            this.revealEditor(this.panel);
            return;
        }
        if (this.view) {
            this.view.show(true);
            return;
        }
        try {
            // The view resolves on first display; the generated focus command opens it.
            await commands.executeCommand("leetCodeDetail.focus", { preserveFocus: true });
        } catch (error) {
            leetCodeChannel.warn(`Failed to reveal the problem description: ${error}`);
        }
    }

    private isLocked(problem: IProblem): boolean {
        return problem.locked && !globalState.getUserStatus()?.isPremium;
    }

    /** Scroll positions are kept per problem and tab, and per language of a solution. */
    private getPage(): string {
        if (!this.state) {
            return "";
        }
        const { problem, tab, language } = this.state;
        return `${problem.slug}#${tab}${tab === "solution" && language ? `:${language}` : ""}`;
    }

    private createPage(host: IHost): void {
        this.updateTitle();
        host.pageVersion = ++this.version;
        host.webview.html = this.getWebviewContent(host);
    }

    /** Send the current content to the page of `host`, or of every host, which swaps it in place. */
    private render(host?: IHost): void {
        const hosts: IHost[] = host ? [host] : this.hosts;
        if (hosts.length === 0) {
            return;
        }
        this.updateTitle();
        const version: number = ++this.version;
        for (const target of hosts) {
            void target.webview.postMessage({ type: "render", version, page: this.getPage(), html: this.getBody(target) });
        }
    }

    private updateTitle(): void {
        const problem: IProblem | undefined = this.state?.problem;
        this.hosts.forEach((host: IHost) => host.setTitle(problem ? `${problem.id}. ${problem.name}` : undefined));
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

    private getWebviewContent(host: IHost): string {
        const webview: Webview = host.webview;
        const nonce: string = randomBytes(24).toString("base64");
        const initial: string = JSON.stringify({ version: this.version, page: this.getPage() }).replace(/</g, "\\u003c");
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
                <style>:root { --surface: var(${host.inEditor ? "--vscode-editor-background" : "--vscode-sideBar-background"}); }${style}</style>
            </head>
            <body>
                <div id="root" data-copy="${escapeHtml(l10n.t("Copy"))}"
                    data-image-background="${escapeHtml(l10n.t("White background"))}"
                    data-image-background-hint="${escapeHtml(l10n.t("Toggle a white background to make this image easier to read"))}">${this.getBody(host)}</div>
                <script type="application/json" id="initial">${initial}</script>
                <script nonce="${nonce}">${script}</script>
            </body>
            </html>
        `;
    }

    private getBody(host: IHost): string {
        if (this.state) {
            return this.getProblemContent(this.state);
        }
        const hint: string = host.inEditor
            ? l10n.t("Select a problem in the problem list, or open a problem file to see its description.")
            : l10n.t("Select a problem in the list above, or open a problem file to see its description.");
        return `<p class="status">${escapeHtml(hint)}</p>`;
    }

    private getProblemContent(state: IDetailState): string {
        const { problem, detail } = state;
        const useTranslation: boolean = shouldUseEndpointTranslation();
        const title: string = detail
            ? (useTranslation ? (detail.translatedTitle || detail.title) : detail.title)
            : problem.name;
        const locked: boolean = this.isLocked(problem);
        const coding: string = getProblemFile(problem.id)
            ? `<button class="secondary" data-command="test">${escapeHtml(l10n.t("Test"))}</button><button data-command="submit">${escapeHtml(l10n.t("Submit"))}</button>`
            : `<button data-command="code">${escapeHtml(l10n.t("Code Now"))}</button>`;
        const actions: string = locked
            ? `<button data-command="premium">${escapeHtml(l10n.t("Get Premium"))}</button>`
            : `${coding}<button class="secondary" data-command="submissions">${escapeHtml(l10n.t("Submissions"))}</button>`;
        const header: string = `
            <header>
                <div class="title">
                    <h2><a href="${escapeHtml(this.getProblemUrl(problem.slug))}">${escapeHtml(`${problem.id}. ${title}`)}</a></h2>
                    ${locked ? "" : this.getStarButton(problem)}
                </div>
                <div class="badges">${this.getBadges(problem, detail)}</div>
                <div class="actions">${actions}</div>
            </header>`;

        if (locked) {
            return `${header}<p class="status">${escapeHtml(l10n.t("This problem requires a LeetCode Premium subscription."))}</p>`;
        }
        const tab = (id: DetailTab, label: string): string =>
            `<button role="tab" aria-selected="${state.tab === id}" data-command="${id}">${escapeHtml(label)}</button>`;
        const tabs: string = `<nav class="tabs" role="tablist">${tab("description", l10n.t("Description"))}${tab("solution", l10n.t("Solution"))}</nav>`;
        return `${header}${tabs}${state.tab === "solution" ? this.getSolutionContent(state) : this.getDescriptionContent(state, useTranslation)}`;
    }

    private getStarButton(problem: IProblem): string {
        const label: string = problem.isFavorite ? l10n.t("Unstar") : l10n.t("Star");
        return [
            `<button class="icon${problem.isFavorite ? " starred" : ""}" data-command="${problem.isFavorite ? "unstar" : "star"}"`,
            ` title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><span class="favorite-icon" aria-hidden="true"></span></button>`,
        ].join("");
    }

    /** Difficulty and progress as tinted pills, then the acceptance rate as plain text. */
    private getBadges(problem: IProblem, detail: IQuestionDetail | undefined): string {
        const items: string[] = [];
        const difficulty: string = detail?.difficulty || problem.difficulty;
        if (difficulty) {
            items.push(`<span class="pill difficulty ${escapeHtml(difficulty.toLowerCase())}">${escapeHtml(l10n.t(difficulty))}</span>`);
        }
        if (problem.state === ProblemState.AC) {
            items.push(`<span class="pill solved">✓ ${escapeHtml(l10n.t("Solved"))}</span>`);
        } else if (problem.state === ProblemState.NotAC) {
            items.push(`<span class="pill attempted">${escapeHtml(l10n.t("Attempted"))}</span>`);
        }
        const acceptance: string | undefined = problem.passRate || (detail && getAcceptanceRate(detail));
        if (acceptance) {
            items.push(`<span>${escapeHtml(l10n.t("Acceptance {0}", acceptance))}</span>`);
        }
        return items.join("");
    }

    private getDescriptionContent({ problem, detail, failed }: IDetailState, useTranslation: boolean): string {
        if (failed) {
            return `<p class="status"><button class="secondary" data-command="retry">${escapeHtml(l10n.t("Loading failed. Click to retry."))}</button></p>`;
        }
        if (!detail) {
            return `<p class="status">${escapeHtml(l10n.t("Loading the problem description..."))}</p>`;
        }

        const section = (summary: string, content: string): string =>
            `<details><summary>${escapeHtml(summary)}</summary>${content}</details>`;
        const sections: string[] = (detail.hints ?? []).map((hint: string, index: number) =>
            section(l10n.t("Hint {0}", index + 1), sanitizeProblemHtml(hint)));

        const similar: ISimilarQuestion[] = getSimilarQuestions(detail);
        if (similar.length > 0) {
            const items: string[] = similar.map((question: ISimilarQuestion) => [
                `<li><button class="link" data-command="similar" data-arg="${escapeHtml(question.titleSlug)}">`,
                escapeHtml(useTranslation ? (question.translatedTitle || question.title) : question.title),
                `</button><span class="difficulty ${escapeHtml(question.difficulty.toLowerCase())}">${escapeHtml(l10n.t(question.difficulty))}</span></li>`,
            ].join(""));
            sections.push(section(l10n.t("Similar Questions"), `<ul class="similar">${items.join("")}</ul>`));
        }

        // Clicking a tag lists its problems; companies have no reliable slug to search by.
        const tags: Array<{ label: string; slug: string }> = detail.topicTags.length > 0
            ? detail.topicTags.map((tag) => ({ label: useTranslation ? (tag.translatedName || tag.name) : tag.name, slug: tag.slug }))
            : problem.tags.map((tag: string) => ({ label: tag, slug: tag }));
        if (tags.length > 0) {
            const chips: string[] = tags.map(({ label, slug }) =>
                `<button class="chip" data-command="tag" data-arg="${escapeHtml(slug)}" title="${escapeHtml(l10n.t("Show the problems with this tag"))}">${escapeHtml(label)}</button>`);
            sections.push(section(l10n.t("Tags"), `<div class="chips">${chips.join("")}</div>`));
        }
        if (problem.companies.length > 0) {
            const chips: string[] = problem.companies.map((company: string) => `<span class="chip">${escapeHtml(company)}</span>`);
            sections.push(section(l10n.t("Companies"), `<div class="chips">${chips.join("")}</div>`));
        }

        const body: string = useTranslation ? (detail.translatedContent || detail.content) : detail.content;
        return `${sanitizeProblemHtml(body)}${sections.length > 0 ? `<div class="extra">${sections.join("")}</div>` : ""}`;
    }

    private getSolutionContent({ problem, language, solutions }: IDetailState): string {
        const { solution, failed }: ISolutionState = solutions.get(language) ?? {};
        const options: string[] = ["", ...languages].map((value: string) => [
            `<option value="${escapeHtml(value)}"${value === language ? " selected" : ""}>`,
            escapeHtml(value ? LANGUAGE_NAMES[value] ?? value : l10n.t("Any language")),
            `</option>`,
        ].join(""));
        const picker: string = `<label class="solution-language">${escapeHtml(l10n.t("Solution language"))}`
            + `<select data-command="language">${options.join("")}</select></label>`;
        if (failed) {
            return `${picker}<p class="status"><button class="secondary" data-command="solution">${escapeHtml(l10n.t("Loading failed. Click to retry."))}</button></p>`;
        }
        if (solution === undefined) {
            return `${picker}<p class="status">${escapeHtml(l10n.t("Loading the solution..."))}</p>`;
        }
        const url: string = this.getSolutionsLink(this.getProblemUrl(problem.slug));
        const more: string = `<p><a href="${escapeHtml(url)}">${escapeHtml(l10n.t("More solutions on LeetCode"))}</a></p>`;
        if (solution === null) {
            return `${picker}<p class="status">${escapeHtml(l10n.t("This problem has no solution to show yet."))}</p>${more}`;
        }
        const fallback: string = language && solution.language !== language
            ? `<p class="status">${escapeHtml(l10n.t("No solution is tagged with {0}, so this is the top solution in any language.", LANGUAGE_NAMES[language] ?? language))}</p>`
            : "";
        const title: string = solution.title ? `<h3>${escapeHtml(solution.title)}</h3>` : "";
        // The language also picks which tab of a solution's code starts open.
        const body: string = markdownEngine.renderSolution(cleanSolutionMarkdown(solution.content, url), { lang: language, host: currentSite().origin });
        return `${picker}${fallback}${title}${body}<hr />${more}`;
    }

    private async onDidReceiveMessage(message: unknown, host: IHost): Promise<void> {
        if (!message || typeof message !== "object" || !("command" in message)) {
            return;
        }
        const arg: unknown = (message as { arg?: unknown }).arg;
        switch (message.command) {
            case "ready":
                // A render posted while the page was still loading may have been missed.
                if (this.version !== host.pageVersion) {
                    this.render(host);
                }
                return;
            case "copy": {
                const text: unknown = (message as { text?: unknown }).text;
                if (typeof text === "string") {
                    await env.clipboard.writeText(text);
                    window.setStatusBarMessage(l10n.t("Copied to the clipboard."), 2000);
                }
                return;
            }
        }
        const state: IDetailState | undefined = this.state;
        if (!state) {
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
            case "language":
                if (typeof arg === "string" && (arg === "" || languages.includes(arg)) && state.tab === "solution" && !this.isLocked(problem)) {
                    state.language = arg;
                    const loading: Promise<void> = this.loadSolution(state);
                    this.render();
                    await loading;
                }
                break;
            case "code":
                await commands.executeCommand("leetcode.showProblem", node);
                break;
            case "test":
            case "submit": {
                const file: Uri | undefined = getProblemFile(problem.id);
                if (file) {
                    await commands.executeCommand(message.command === "test" ? "leetcode.testSolution" : "leetcode.submitSolution", file);
                }
                break;
            }
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
                await openUrl(currentSite().premium);
                break;
            case "retry":
                await this.show(problem);
                break;
            case "tag":
                if (typeof arg === "string" && /^[\w-]+$/.test(arg)) {
                    await searchFor(`tag:${arg}`);
                }
                break;
            case "similar":
                if (typeof arg === "string") {
                    await this.showSimilar(arg);
                }
                break;
        }
    }

    private async showSimilar(slug: string): Promise<void> {
        try {
            const target: IProblem | undefined = await getProblemBySlug(slug);
            if (target) {
                await this.show(target, { tab: "description" });
            }
        } catch (error) {
            leetCodeChannel.error(`Failed to resolve the problem ${slug}: ${error}`);
        }
    }

    private getProblemUrl(slug: string): string {
        return `${currentSite().origin}/problems/${slug}/description/`;
    }

    private getSolutionsLink(url: string): string {
        return url.replace("/description/", "/solutions/") + "?source=vscode";
    }
}

export const leetCodePreviewProvider: LeetCodePreviewProvider = new LeetCodePreviewProvider();
