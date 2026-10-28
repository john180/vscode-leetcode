// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as fs from "node:fs/promises";
import camelCase = require("lodash/camelCase");
import upperFirst = require("lodash/upperFirst");
import kebabCase = require("lodash/kebabCase");
import snakeCase = require("lodash/snakeCase");
import * as path from "path";
import * as vscode from "vscode";
import { buildProblemFile } from "../api/problemFile";
import { fetchQuestionDetail } from "../api/question";
import type { IQuestionDetail } from "../api/question";
import { getLeetCodeRequest } from "../api/request";
import { fetchTopSolution } from "../api/solution";
import { explorerNodeManager } from "../explorer/explorerNodeManager";
import { LeetCodeNode } from "../explorer/LeetCodeNode";
import { leetCodeChannel } from "../leetCodeChannel";
import { leetCodeManager } from "../leetCodeManager";
import { Endpoint, IProblem, IQuickItemEx, languages, PREMIUM_URL_CN, PREMIUM_URL_GLOBAL, ProblemState } from "../shared";
import { genFileExt, genFileName, getNodeIdFromText } from "../utils/problemUtils";
import * as settingUtils from "../utils/settingUtils";
import { IDescriptionConfiguration } from "../utils/settingUtils";
import {
    DialogOptions,
    DialogType,
    openSettingsEditor,
    openUrl,
    promptForOpenOutputChannel,
    promptForSignIn,
    promptHintMessage,
} from "../utils/uiUtils";
import { selectWorkspaceFolder } from "../utils/workspaceUtils";
import { leetCodePreviewProvider } from "../webview/leetCodePreviewProvider";
import { leetCodeSolutionProvider } from "../webview/leetCodeSolutionProvider";
import { getProblemById, getProblemBySlug, getProblemCacheScope, getProblemPage, getRandomProblem, IProblemQuery } from "../api/problems";
import { getLeetCodeEndpoint } from "./plugin";
import { globalState } from "../globalState";

async function findProblemById(id: string): Promise<IProblem | undefined> {
    const cached: IProblem | undefined = explorerNodeManager.getNodeById(id);
    if (cached) {
        return cached;
    }
    return getProblemById(id);
}

export async function previewProblem(input?: IProblem | vscode.Uri, isSideMode: boolean = false): Promise<void> {
    let node: IProblem;

    input ??= vscode.window.activeTextEditor?.document.uri;
    if (!input) {
        return;
    }

    if (input instanceof vscode.Uri) {
        const activeFilePath: string = input.toString();
        const document = await vscode.workspace.openTextDocument(input);
        const id = getNodeIdFromText(document.getText()) || path.basename(input.path).split(".")[0];
        if (!id) {
            vscode.window.showErrorMessage(vscode.l10n.t("Failed to resolve the problem id from file: {0}.", activeFilePath));
            return;
        }
        const cachedNode: IProblem | undefined = await findProblemById(id);
        if (!cachedNode) {
            vscode.window.showErrorMessage(vscode.l10n.t("Failed to resolve the problem with id: {0}.", id));
            return;
        }
        node = cachedNode;
        // Move the preview page aside if it's triggered from Code Lens
        isSideMode = true;
    } else {
        node = input;
        const { isPremium } = globalState.getUserStatus() ?? {};
        if (input.locked && !isPremium) {
            const url = getLeetCodeEndpoint() === Endpoint.LeetCode ? PREMIUM_URL_GLOBAL : PREMIUM_URL_CN;
            openUrl(url);
            return;
        }
    }

    const needTranslation: boolean = settingUtils.shouldUseEndpointTranslation();
    let detail: IQuestionDetail;
    try {
        detail = await fetchQuestionDetail(getLeetCodeRequest(), node.slug);
    } catch (error) {
        leetCodeChannel.appendLine(`[ERROR] Failed to fetch the problem description: ${error}`);
        await promptForOpenOutputChannel(vscode.l10n.t("Failed to fetch the problem description. Please open the output channel for details."), DialogType.error);
        return;
    }
    leetCodePreviewProvider.show(detail, node, isSideMode, needTranslation);
}

export async function pickOne(): Promise<void> {
    if (!leetCodeManager.getUser()) { await promptForSignIn(); return; }
    try {
        const randomProblem = await getRandomProblem();
        if (randomProblem) { await showProblemInternal(randomProblem); }
    } catch (error) {
        await promptForOpenOutputChannel(vscode.l10n.t("Failed to list problems. Please open the output channel for details."), DialogType.error);
    }
}

export async function showProblem(node?: LeetCodeNode): Promise<void> {
    if (!node) {
        return;
    }
    await showProblemInternal(node);
}

export async function searchProblem(): Promise<void> {
    if (!leetCodeManager.getUser()) {
        promptForSignIn();
        return;
    }
    type SearchPick = IQuickItemEx<IProblem | undefined> & { action?: "more" | "retry" };
    const picker = vscode.window.createQuickPick<SearchPick>();
    picker.placeholder = vscode.l10n.t("Search by id, title or slug; use tag:array or company:google to filter");
    const scope = getProblemCacheScope();
    let version = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let next = 0;
    let picks: SearchPick[] = [];
    const query = (): IProblemQuery => {
        let search = picker.value;
        const options: IProblemQuery = {};
        search = search.replace(/(?:^|\s)(tag|company):([\w-]+)/g, (_match, kind: "tag" | "company", slug: string) => {
            options[kind] = slug;
            return " ";
        });
        return { ...options, search: search.trim() };
    };
    const load = async (append: boolean, force: boolean = false): Promise<void> => {
        const current = ++version;
        const options = query();
        picker.busy = true;
        try {
            const page = await getProblemPage({ ...options, skip: append ? next : 0 }, force);
            if (disposed || current !== version || scope !== getProblemCacheScope()) { return; }
            const incoming = parseProblemsToPicks(page.problems).map((pick) => ({ ...pick, alwaysShow: true }));
            picks = append ? [...picks, ...incoming] : incoming;
            const unique = new Map(picks.map((pick) => [pick.value!.id, pick]));
            picks = [...unique.values()];
            next = page.next;
            picker.items = page.hasMore ? [...picks, { label: vscode.l10n.t("Load more..."), value: undefined, action: "more", alwaysShow: true }] : picks;
        } catch (error) {
            if (disposed || current !== version) { return; }
            leetCodeChannel.appendLine(String(error));
            picker.items = [...picks, { label: vscode.l10n.t("Loading failed. Click to retry."), value: undefined, action: "retry", alwaysShow: true }];
        } finally {
            if (!disposed && current === version) { picker.busy = false; }
        }
    };
    const choice = await new Promise<IProblem | undefined>((resolve) => {
        const subscriptions = [
            picker.onDidChangeValue(() => {
                version++;
                clearTimeout(timer);
                picks = [];
                next = 0;
                picker.items = [];
                timer = setTimeout(() => { void load(false); }, 300);
            }),
            picker.onDidAccept(() => {
                if (picker.busy || scope !== getProblemCacheScope()) { return; }
                const selected = picker.selectedItems[0];
                if (!selected) { return; }
                if (selected.action) { void load(next > 0, selected.action === "retry"); return; }
                resolve(selected.value);
                picker.hide();
            }),
            picker.onDidHide(() => {
                disposed = true;
                version++;
                clearTimeout(timer);
                subscriptions.forEach((subscription) => subscription.dispose());
                picker.dispose();
                resolve(undefined);
            }),
        ];
        picker.show();
        void load(false);
    });
    if (choice) { await showProblemInternal(choice); }
}

export async function showSolution(input: LeetCodeNode | vscode.Uri): Promise<void> {
    let node: IProblem | undefined;
    if (input instanceof LeetCodeNode) {
        node = input;
    } else {
        const uri = input instanceof vscode.Uri ? input : vscode.window.activeTextEditor?.document.uri;
        if (!uri) {
            vscode.window.showErrorMessage(vscode.l10n.t("Failed to resolve the current problem file."));
            return;
        }
        const document = await vscode.workspace.openTextDocument(uri);
        const id = getNodeIdFromText(document.getText()) || path.basename(uri.path).split(".")[0];
        node = id ? await findProblemById(id) : undefined;
    }

    if (!node) {
        vscode.window.showErrorMessage(vscode.l10n.t("Failed to resolve the problem for the solution."));
        return;
    }

    try {
        const solution = await fetchTopSolution(getLeetCodeRequest(), node.slug);
        leetCodeSolutionProvider.show(solution.title || node.name, solution.content);
    } catch (error) {
        leetCodeChannel.appendLine(error.toString());
        await promptForOpenOutputChannel(vscode.l10n.t("Failed to fetch the top voted solution. Please open the output channel for details."), DialogType.error);
    }
}

async function fetchProblemLanguage(): Promise<string | undefined> {
    const leetCodeConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("leetcode");
    let defaultLanguage: string | undefined = leetCodeConfig.get<string>("defaultLanguage");
    if (defaultLanguage && languages.indexOf(defaultLanguage) < 0) {
        defaultLanguage = undefined;
    }
    const language: string | undefined =
        defaultLanguage ||
        (await vscode.window.showQuickPick(languages, {
            placeHolder: vscode.l10n.t("Select the language you want to use"),
            ignoreFocusOut: true,
        }));
    // fire-and-forget default language query
    (async (): Promise<void> => {
        if (language && !defaultLanguage && leetCodeConfig.get<boolean>("hint.setDefaultLanguage")) {
            const choice: vscode.MessageItem | undefined = await vscode.window.showInformationMessage(
                vscode.l10n.t("Would you like to set '{0}' as your default language?", language),
                DialogOptions.yes,
                DialogOptions.no,
                DialogOptions.never
            );
            if (choice === DialogOptions.yes) {
                leetCodeConfig.update("defaultLanguage", language, true /* UserSetting */);
            } else if (choice === DialogOptions.never) {
                leetCodeConfig.update("hint.setDefaultLanguage", false, true /* UserSetting */);
            }
        }
    })();
    return language;
}

async function showProblemInternal(node: IProblem): Promise<void> {
    try {
        const language: string | undefined = await fetchProblemLanguage();
        if (!language) {
            return;
        }

        const leetCodeConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("leetcode");
        const workspaceFolder: string = await selectWorkspaceFolder();
        if (!workspaceFolder) {
            return;
        }

        const fileFolder: string = leetCodeConfig
            .get<string>(`filePath.${language}.folder`, leetCodeConfig.get<string>(`filePath.default.folder`, ""))
            .trim();
        const fileName: string = leetCodeConfig
            .get<string>(`filePath.${language}.filename`, leetCodeConfig.get<string>(`filePath.default.filename`) || genFileName(node, language))
            .trim();

        if (/\$\{company\}/i.test(fileFolder + fileName) && node.companies.length === 0) {
            node = await getProblemBySlug(node.slug) || node;
        }

        let finalPath: string = path.join(workspaceFolder, fileFolder, fileName);

        if (finalPath) {
            finalPath = await resolveRelativePath(finalPath, node, language);
            if (!finalPath) {
                leetCodeChannel.appendLine("Showing problem canceled by user.");
                return;
            }
        }

        const descriptionConfig: IDescriptionConfiguration = settingUtils.getDescriptionConfiguration();
        const needTranslation: boolean = settingUtils.shouldUseEndpointTranslation();
        const detail: IQuestionDetail = await fetchQuestionDetail(getLeetCodeRequest(), node.slug);

        if (!await fs.access(finalPath).then(() => true, () => false)) {
            const endpointName: string = getLeetCodeEndpoint() === Endpoint.LeetCodeCN ? "leetcode.cn" : "leetcode.com";
            const fileContent: string = buildProblemFile({
                detail,
                problem: node,
                language,
                includeDescription: descriptionConfig.showInComment,
                useTranslation: needTranslation,
                endpoint: endpointName,
            });
            await fs.writeFile(finalPath, fileContent);
        }

        const promises: any[] = [
            vscode.window.showTextDocument(vscode.Uri.file(finalPath), {
                preview: false,
                viewColumn: vscode.ViewColumn.One,
            }),
            promptHintMessage(
                "hint.commentDescription",
                vscode.l10n.t('You can configure how to show the problem description through "leetcode.showDescription".'),
                vscode.l10n.t("Open settings"),
                (): Promise<any> => openSettingsEditor("leetcode.showDescription")
            ),
        ];
        if (descriptionConfig.showInWebview) {
            promises.push(showDescriptionView(node, detail, needTranslation));
        }

        await Promise.all(promises);
    } catch (error) {
        await promptForOpenOutputChannel(vscode.l10n.t("{0} Please open the output channel for details.", String(error)), DialogType.error);
    }
}

async function showDescriptionView(node: IProblem, detail: IQuestionDetail, useTranslation: boolean): Promise<void> {
    return leetCodePreviewProvider.show(
        detail,
        node,
        vscode.workspace.getConfiguration("leetcode").get<boolean>("enableSideMode", true),
        useTranslation,
    );
}
function parseProblemsToPicks(problems: IProblem[]): Array<IQuickItemEx<IProblem>> {
    return problems.map((problem: IProblem) => {
            const tags: string = problem.tags.slice(0, 5).join(", ");
            const companies: string = problem.companies.slice(0, 5).join(", ");
            const details: string[] = [
                `${vscode.l10n.t("AC rate: {0}, Difficulty: {1}", problem.passRate, problem.difficulty)}`,
                `${problem.slug}`,
            ];
            if (tags) {
                details.push(`${vscode.l10n.t("Tags")}: ${tags}`);
            }
            if (companies) {
                details.push(`${vscode.l10n.t("Companies")}: ${companies}`);
            }
            return Object.assign(
                {},
                {
                    label: `${parseProblemDecorator(problem.state, problem.locked)}${problem.id}.${problem.name}`,
                    description: problem.slug,
                    detail: details.join(" · "),
                    value: problem,
                }
            );
        });
}

function parseProblemDecorator(state: ProblemState, locked: boolean): string {
    switch (state) {
        case ProblemState.AC:
            return "$(check) ";
        case ProblemState.NotAC:
            return "$(x) ";
        default:
            return locked ? "$(lock) " : "";
    }
}

async function resolveRelativePath(relativePath: string, node: IProblem, selectedLanguage: string): Promise<string> {
    let tag: string = "";
    if (/\$\{tag\}/i.test(relativePath)) {
        tag = (await resolveTagForProblem(node)) || "";
    }

    let company: string = "";
    if (/\$\{company\}/i.test(relativePath)) {
        company = (await resolveCompanyForProblem(node)) || "";
    }

    return relativePath.replace(/\$\{(.*?)\}/g, (_substring: string, ...args: string[]) => {
        const placeholder: string = args[0].toLowerCase().trim();
        switch (placeholder) {
            case "id":
                return node.id;
            case "name":
                return node.name;
            case "camelcasename":
                return camelCase(node.name);
            case "pascalcasename":
                return upperFirst(camelCase(node.name));
            case "kebabcasename":
            case "kebab-case-name":
                return kebabCase(node.name) || node.slug;
            case "snakecasename":
            case "snake_case_name":
                return snakeCase(node.name);
            case "ext":
                return genFileExt(selectedLanguage);
            case "language":
                return selectedLanguage;
            case "difficulty":
                return node.difficulty.toLocaleLowerCase();
            case "tag":
                return tag;
            case "company":
                return company;
            default:
                const errorMsg: string = `The config '${placeholder}' is not supported.`;
                leetCodeChannel.appendLine(errorMsg);
                throw new Error(errorMsg);
        }
    });
}

async function resolveTagForProblem(problem: IProblem): Promise<string | undefined> {
    if (problem.tags.length === 1) {
        return problem.tags[0];
    }
    return await vscode.window.showQuickPick(problem.tags, {
        matchOnDetail: true,
        placeHolder: vscode.l10n.t("Multiple tags available, please select one"),
        ignoreFocusOut: true,
    });
}

async function resolveCompanyForProblem(problem: IProblem): Promise<string | undefined> {
    if (problem.companies.length === 1) {
        return problem.companies[0];
    }
    return await vscode.window.showQuickPick(problem.companies, {
        matchOnDetail: true,
        placeHolder: vscode.l10n.t("Multiple tags available, please select one"),
        ignoreFocusOut: true,
    });
}
