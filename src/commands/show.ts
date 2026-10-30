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
import { explorerNodeManager } from "../explorer/explorerNodeManager";
import { LeetCodeNode } from "../explorer/LeetCodeNode";
import { leetCodeChannel } from "../leetCodeChannel";
import { leetCodeManager } from "../leetCodeManager";
import { currentSite, IProblem, languages } from "../shared";
import { isProblemDocument } from "../utils/problemDocumentContext";
import { genFileExt, genFileName, getNodeIdFromText } from "../utils/problemUtils";
import * as settingUtils from "../utils/settingUtils";
import { IDescriptionConfiguration } from "../utils/settingUtils";
import {
    DialogOptions,
    DialogType,
    openSettingsEditor,
    promptForOpenOutputChannel,
    promptForSignIn,
    promptHintMessage,
} from "../utils/uiUtils";
import { selectWorkspaceFolder } from "../utils/workspaceUtils";
import { leetCodePreviewProvider } from "../webview/leetCodePreviewProvider";
import { getProblemById, getProblemBySlug, getProblemCacheScope, getRandomProblem } from "../api/problems";

async function findProblemById(id: string): Promise<IProblem | undefined> {
    const cached: IProblem | undefined = explorerNodeManager.getNodeById(id);
    if (cached) {
        return cached;
    }
    return getProblemById(id);
}

/** Show the description in the sidebar, for a list item or a problem file (the active editor by default). */
export async function previewProblem(input?: IProblem | vscode.Uri): Promise<void> {
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
    } else {
        node = input;
    }

    await leetCodePreviewProvider.show(node, { reveal: true, tab: "description" });
}

/** Keep the sidebar description on the problem file being edited, without revealing the sidebar. */
export async function followActiveEditor(editor: vscode.TextEditor | undefined): Promise<void> {
    const document: vscode.TextDocument | undefined = editor?.document;
    if (!document || !leetCodeManager.getUser() || !settingUtils.shouldFollowActiveEditor() || !isProblemDocument(document)) {
        return;
    }
    const id: string = getNodeIdFromText(document.getText());
    if (!id || id === leetCodePreviewProvider.currentProblemId) {
        return;
    }
    const scope: string = getProblemCacheScope();
    let problem: IProblem | undefined;
    try {
        problem = await findProblemById(id);
    } catch (error) {
        leetCodeChannel.warn(`Failed to resolve the problem with id ${id}: ${error}`);
        return;
    }
    // Ignore a lookup that finished after the user changed editors, problems or sessions.
    if (problem && leetCodeManager.getUser() && scope === getProblemCacheScope()
        && vscode.window.activeTextEditor?.document === document && id !== leetCodePreviewProvider.currentProblemId) {
        await leetCodePreviewProvider.show(problem);
    }
}

export async function pickOne(): Promise<void> {
    if (!leetCodeManager.getUser()) { await promptForSignIn(); return; }
    try {
        const randomProblem = await getRandomProblem();
        if (randomProblem) { await showProblemInternal(randomProblem); }
    } catch (error) {
        await promptForOpenOutputChannel(vscode.l10n.t("Failed to list problems. Please open the output channel for details."), DialogType.error, error);
    }
}

export async function showProblem(node?: LeetCodeNode): Promise<void> {
    if (!node) {
        return;
    }
    await showProblemInternal(node);
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

    await leetCodePreviewProvider.show(node, { reveal: true, tab: "solution" });
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
                leetCodeChannel.info("Showing problem canceled by user.");
                return;
            }
        }

        const descriptionConfig: IDescriptionConfiguration = settingUtils.getDescriptionConfiguration();
        const needTranslation: boolean = settingUtils.shouldUseEndpointTranslation();
        const detail: IQuestionDetail = await fetchQuestionDetail(getLeetCodeRequest(), node.slug);

        if (!await fs.access(finalPath).then(() => true, () => false)) {
            const fileContent: string = buildProblemFile({
                detail,
                problem: node,
                language,
                includeDescription: descriptionConfig.showInComment,
                useTranslation: needTranslation,
                endpoint: currentSite().host,
            });
            // The folder setting may name folders that do not exist yet, such as "${difficulty}".
            await fs.mkdir(path.dirname(finalPath), { recursive: true });
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
            promises.push(leetCodePreviewProvider.show(node, { detail, reveal: true }));
        }

        await Promise.all(promises);
    } catch (error) {
        await promptForOpenOutputChannel(vscode.l10n.t("{0} Please open the output channel for details.", String(error)), DialogType.error, error);
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
                leetCodeChannel.error(errorMsg);
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
