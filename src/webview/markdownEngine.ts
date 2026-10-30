// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import hljs from "highlight.js/lib/core";
import type { LanguageFn } from "highlight.js";
import katex = require("katex");
import MarkdownIt = require("markdown-it");
import type { MarkdownIt as MarkdownParser, RendererRule } from "markdown-it";
import { randomBytes } from "node:crypto";
import * as os from "os";
import * as vscode from "vscode";
import { escapeHtml, safeFontFamily, sanitizeSolutionHtml } from "./sanitize";

const highlightLanguages: { [name: string]: LanguageFn } = {
    bash: require("highlight.js/lib/languages/bash"),
    c: require("highlight.js/lib/languages/c"),
    cpp: require("highlight.js/lib/languages/cpp"),
    csharp: require("highlight.js/lib/languages/csharp"),
    go: require("highlight.js/lib/languages/go"),
    java: require("highlight.js/lib/languages/java"),
    javascript: require("highlight.js/lib/languages/javascript"),
    json: require("highlight.js/lib/languages/json"),
    kotlin: require("highlight.js/lib/languages/kotlin"),
    php: require("highlight.js/lib/languages/php"),
    python: require("highlight.js/lib/languages/python"),
    ruby: require("highlight.js/lib/languages/ruby"),
    rust: require("highlight.js/lib/languages/rust"),
    scala: require("highlight.js/lib/languages/scala"),
    sql: require("highlight.js/lib/languages/sql"),
    swift: require("highlight.js/lib/languages/swift"),
    typescript: require("highlight.js/lib/languages/typescript"),
};

for (const [name, language] of Object.entries(highlightLanguages)) {
    hljs.registerLanguage(name, language);
}

/** LeetCode groups consecutive fences written like "```Python [sol1-Python3]" into tabs. */
const CODE_TAB_INFO: RegExp = /^(\S+)\s*\[([^\]]*)\]$/;

interface ISolutionEnv extends MarkdownIt.Env {
    host?: string;
    lang?: string;
    /** Rendered math, filled in after sanitizing by the placeholders in `mathKey`. */
    math: string[];
    mathKey: string;
}

/** Fence and setting names of a language, compared loosely: "C++" matches "cpp" and "Python3" matches "python". */
function normalizeLanguage(language: string): string {
    const name: string = language.toLowerCase();
    const aliases: { [name: string]: string } = { "c++": "cpp", "c#": "csharp", "golang": "go", "python3": "python", "js": "javascript", "ts": "typescript" };
    return aliases[name] ?? name;
}

function renderMath(environment: MarkdownIt.Env | undefined, tex: string, displayMode: boolean): string {
    // Only solutionEngine registers math rules, and renderSolution always supplies this environment.
    const env = environment as ISolutionEnv;
    // MathML renders natively in the webview, so no KaTeX stylesheet or fonts are needed. `trust` stays off, which keeps \href and HTML out.
    env.math.push(katex.renderToString(tex, { displayMode, output: "mathml", throwOnError: false }));
    return `@@math-${env.mathKey}-${env.math.length - 1}@@`;
}

/** `$...$` and `$$...$$` inside a paragraph. Like Pandoc, `$` math may not start or end with a space or be followed by a digit, so "$5 and $6" stays text. */
function mathInline(state: MarkdownIt.StateInline, silent: boolean): boolean {
    const { src, pos, posMax } = state;
    if (src[pos] !== "$") {
        return false;
    }
    const marker: string = src[pos + 1] === "$" ? "$$" : "$";
    const start: number = pos + marker.length;
    let end: number = src.indexOf(marker, start);
    while (end > 0 && src[end - 1] === "\\") {
        end = src.indexOf(marker, end + 1);
    }
    if (end < 0 || end === start || end + marker.length > posMax) {
        return false;
    }
    if (marker === "$" && (/\s/.test(src[start]) || /\s/.test(src[end - 1]) || /\d/.test(src[end + 1] ?? ""))) {
        return false;
    }
    if (!silent) {
        const token = state.push(marker === "$$" ? "math_display" : "math_inline", "math", 0);
        token.content = src.slice(start, end);
        token.markup = marker;
    }
    state.pos = end + marker.length;
    return true;
}

/** A block that starts with `$$` on its own line, or a line of just `$$...$$`. */
function mathBlock(state: MarkdownIt.StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
    const begin: number = state.bMarks[startLine] + state.tShift[startLine];
    if (state.sCount[startLine] - state.blkIndent >= 4 || state.src.slice(begin, begin + 2) !== "$$") {
        return false;
    }
    const first: string = state.src.slice(begin + 2, state.eMarks[startLine]).trim();
    let content: string;
    let next: number = startLine;
    if (first.endsWith("$$")) {
        content = first.slice(0, -2);
    } else if (first.includes("$$")) {
        // Math followed by text belongs to the paragraph.
        return false;
    } else {
        let last: string | undefined;
        while (last === undefined && ++next < endLine) {
            const line: string = state.src.slice(state.bMarks[next] + state.tShift[next], state.eMarks[next]).trim();
            if (line.endsWith("$$")) {
                last = line.slice(0, -2);
            }
        }
        if (last === undefined) {
            return false;
        }
        content = [first, state.getLines(startLine + 1, next, state.tShift[startLine], false), last].filter(Boolean).join("\n");
    }
    if (!silent) {
        const token = state.push("math_block", "math", 0);
        token.block = true;
        token.content = content;
        token.map = [startLine, next + 1];
    }
    state.line = next + 1;
    return true;
}

/** Marks runs of tabbed fences so the fence renderer wraps them; the tab in the language of `env.lang`, or else the default language, starts open. */
function groupCodeTabs(state: MarkdownIt.StateCore): void {
    const lang: unknown = (state.env as ISolutionEnv | undefined)?.lang;
    const preferred: string = normalizeLanguage(typeof lang === "string" && lang
        ? lang
        : vscode.workspace.getConfiguration("leetcode").get<string>("defaultLanguage") ?? "");
    const { tokens } = state;
    for (let start: number = 0; start < tokens.length; start += 1) {
        let end: number = start;
        while (end < tokens.length && tokens[end].type === "fence" && CODE_TAB_INFO.test(tokens[end].info.trim())) {
            end += 1;
        }
        if (end - start < 2) {
            continue;
        }
        const run = tokens.slice(start, end);
        const languages: string[] = run.map((token) => token.info.trim().match(CODE_TAB_INFO)![1]);
        const open: number = Math.max(0, languages.findIndex((language: string) => normalizeLanguage(language) === preferred));
        run.forEach((token, index: number) => {
            const name: string = token.info.trim().match(CODE_TAB_INFO)![2].replace(/^[^-]*-/, "");
            token.meta = { tab: name || languages[index], open: index === open, first: index === 0, last: index === run.length - 1 };
        });
        start = end - 1;
    }
}

class MarkdownEngine implements vscode.Disposable {

    // Assigned by reload(), which the constructor calls.
    private engine!: MarkdownParser;
    /** Solutions are written by users and may embed HTML and math, so their output is sanitized. */
    private solutionEngine!: MarkdownParser;
    private config!: MarkdownConfiguration;
    private listener: vscode.Disposable;
    private resourceRoot: vscode.Uri | undefined;

    public initialize(extensionUri: vscode.Uri): void {
        this.resourceRoot = vscode.Uri.joinPath(extensionUri, "resources", "webview");
    }

    public constructor() {
        this.reload();
        this.listener = vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
            if (event.affectsConfiguration("markdown")) {
                this.reload();
            }
        }, this);
    }

    public get localResourceRoots(): vscode.Uri[] {
        return this.resourceRoot ? [this.resourceRoot] : [];
    }

    public dispose(): void {
        this.listener.dispose();
    }

    public reload(): void {
        this.engine = this.initEngine(false);
        this.solutionEngine = this.initSolutionEngine();
        this.config = new MarkdownConfiguration();
    }

    public render(md: string, env?: any): string {
        return this.engine.render(md, env);
    }

    /** Render user-written markdown: raw HTML is sanitized, math is typeset, and LeetCode code groups become tabs. */
    public renderSolution(md: string, env: { host?: string; lang?: string } = {}): string {
        const solutionEnv: ISolutionEnv = { ...env, math: [], mathKey: randomBytes(8).toString("hex") };
        const html: string = sanitizeSolutionHtml(this.solutionEngine.render(md, solutionEnv));
        // The key is random per render, so text in the solution cannot forge a placeholder.
        return html.replace(new RegExp(`@@math-${solutionEnv.mathKey}-(\\d+)@@`, "g"), (_match: string, index: string) => solutionEnv.math[Number(index)] ?? "");
    }

    public getStyles(webview: vscode.Webview): string {
        return [
            this.getBuiltinStyles(webview),
            this.getSettingsStyles(),
        ].join(os.EOL);
    }

    private getBuiltinStyles(webview: vscode.Webview): string {
        if (!this.resourceRoot) {
            return "";
        }
        const style = webview.asWebviewUri(vscode.Uri.joinPath(this.resourceRoot, "markdown.css"));
        return `<link rel="stylesheet" href="${style.toString()}">`;
    }

    private getSettingsStyles(): string {
        return [
            `<style>`,
            `body {`,
            `    ${this.config.fontFamily ? `font-family: ${this.config.fontFamily};` : ``}`,
            `    ${isNaN(this.config.fontSize) ? `` : `font-size: ${this.config.fontSize}px;`}`,
            `    ${isNaN(this.config.lineHeight) ? `` : `line-height: ${this.config.lineHeight};`}`,
            `}`,
            `</style>`,
        ].join(os.EOL);
    }

    private initSolutionEngine(): MarkdownParser {
        const md: MarkdownParser = this.initEngine(true);
        md.inline.ruler.after("escape", "math_inline", mathInline);
        md.block.ruler.after("blockquote", "math_block", mathBlock, { alt: ["paragraph", "reference", "blockquote", "list"] });
        md.renderer.rules["math_inline"] = (tokens, idx, _options, env) => renderMath(env, tokens[idx].content, false);
        md.renderer.rules["math_display"] = (tokens, idx, _options, env) => renderMath(env, tokens[idx].content, true);
        md.renderer.rules["math_block"] = (tokens, idx, _options, env) => `<div>${renderMath(env, tokens[idx].content, true)}</div>\n`;
        md.core.ruler.push("code_tabs", groupCodeTabs);
        const fence: RendererRule = md.renderer.rules["fence"];
        md.renderer.rules["fence"] = (tokens, idx, options, env, self) => {
            const html: string = fence(tokens, idx, options, env, self);
            const tab = tokens[idx].meta;
            if (!tab?.tab) {
                return html;
            }
            return [
                tab.first ? `<div class="code-group">` : "",
                `<details${tab.open ? " open" : ""}><summary>${escapeHtml(String(tab.tab))}</summary>`,
                html,
                `</details>`,
                tab.last ? `</div>` : "",
            ].join("");
        };
        return md;
    }

    private initEngine(html: boolean): MarkdownParser {
        const md: MarkdownParser = new MarkdownIt({
            html,
            linkify: true,
            typographer: true,
            highlight: (code: string, lang: string): string => {
                switch (lang && lang.toLowerCase()) {
                    case "mysql":
                        lang = "sql"; break;
                    case "json5":
                        lang = "json"; break;
                    case "python3":
                        lang = "python"; break;
                }
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
                    } catch (error) { /* do not highlight */ }
                }
                return ""; // use external default escaping
            },
        });

        // Preserve automatic links for bare domains after linkify-it 6 changed its default.
        md.linkify.set({ fuzzyLink: true });
        this.addCodeBlockHighlight(md);
        this.addImageUrlCompletion(md);
        this.addLinkValidator(md);
        return md;
    }

    private addCodeBlockHighlight(md: MarkdownParser): void {
        const codeBlock: RendererRule = md.renderer.rules["code_block"];
        md.renderer.rules["code_block"] = (tokens, idx, options, env, self) => {
            // if any token uses lang-specified code fence, then do not highlight code block
            if (tokens.some((token: any) => token.type === "fence")) {
                return codeBlock(tokens, idx, options, env, self);
            }
            // otherwise, highlight with default lang in env object.
            const highlighted: string = options.highlight
                ? options.highlight(tokens[idx].content, typeof env?.lang === "string" ? env.lang : "", "")
                : "";
            return [
                `<pre><code ${self.renderAttrs(tokens[idx])} >`,
                highlighted || md.utils.escapeHtml(tokens[idx].content),
                "</code></pre>",
            ].join(os.EOL);
        };
    }

    private addImageUrlCompletion(md: MarkdownParser): void {
        const image: RendererRule = md.renderer.rules["image"];
        md.renderer.rules["image"] = (tokens, idx, options, env, self) => {
            const imageSrc = tokens[idx].attrs?.find(([name]) => name === "src");
            if (typeof env?.host === "string" && env.host && typeof imageSrc?.[1] === "string" && imageSrc[1].startsWith("/")) {
                imageSrc[1] = `${env.host}${imageSrc[1]}`;
            }
            return image(tokens, idx, options, env, self);
        };
    }

    private addLinkValidator(md: MarkdownParser): void {
        const validateLink: (link: string) => boolean = md.validateLink;
        md.validateLink = (link: string): boolean => {
            // support file:// protocal link
            return validateLink(link) || link.startsWith("file:");
        };
    }
}

class MarkdownConfiguration {

    public readonly lineHeight: number;
    public readonly fontSize: number;
    public readonly fontFamily: string;

    public constructor() {
        const markdownConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("markdown", null);
        this.lineHeight = Math.max(0.6, +markdownConfig.get<number>("preview.lineHeight", NaN));
        this.fontSize = Math.max(8, +markdownConfig.get<number>("preview.fontSize", NaN));
        this.fontFamily = this.resolveFontFamily(markdownConfig);
    }

    private resolveFontFamily(config: vscode.WorkspaceConfiguration): string {
        let fontFamily: string = config.get<string>("preview.fontFamily", "");
        if (fontFamily === config.inspect<string>("preview.fontFamily")!.defaultValue) {
            fontFamily = `${fontFamily}, 'Microsoft Yahei UI'`;
        }
        return safeFontFamily(fontFamily);
    }
}

export const markdownEngine: MarkdownEngine = new MarkdownEngine();
