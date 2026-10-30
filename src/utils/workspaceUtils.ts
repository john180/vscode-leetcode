// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as fs from "node:fs/promises";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { IQuickItemEx } from "../shared";
import { getWorkspaceConfiguration, getWorkspaceFolder } from "./settingUtils";
import { openSettingsEditor, showDirectorySelectDialog } from "./uiUtils";

/** Where to save a problem file, and what to do with that folder once the file is in it. */
export interface IWorkspaceFolderChoice {
    folder: string;
    /** Opens the folder as the user chose; resolves to false when this window no longer shows the file. */
    openFolder?: () => Promise<boolean>;
}

/** Undefined when the user cancels. */
export async function selectWorkspaceFolder(): Promise<IWorkspaceFolderChoice | undefined> {
    let workspaceFolderSetting: string = getWorkspaceFolder();
    if (workspaceFolderSetting.trim() === "") {
        workspaceFolderSetting = await determineLeetCodeFolder();
        if (workspaceFolderSetting === "") {
            return undefined;
        }
    }
    await fs.mkdir(workspaceFolderSetting, { recursive: true });
    const opened: boolean = (vscode.workspace.workspaceFolders || []).some((folder) => isSubFolder(folder.uri.fsPath, workspaceFolderSetting));
    if (opened || !getWorkspaceConfiguration().get<boolean>("hint.openWorkspaceFolder", true)) {
        return { folder: workspaceFolderSetting };
    }

    const openOptions: Array<IQuickItemEx<OpenOption>> = [
        { label: vscode.l10n.t("Just open the problem file"), value: OpenOption.justOpenFile },
        { label: vscode.l10n.t("Just open the problem file, and don't ask again"), value: OpenOption.neverAsk },
        { label: vscode.l10n.t("Open in current window"), value: OpenOption.openInCurrentWindow },
        { label: vscode.l10n.t("Open in new window"), value: OpenOption.openInNewWindow },
        { label: vscode.l10n.t("Add to workspace"), value: OpenOption.addToWorkspace },
    ];
    const choice: IQuickItemEx<OpenOption> | undefined = await vscode.window.showQuickPick(
        openOptions,
        { placeHolder: vscode.l10n.t("The LeetCode workspace folder is not opened in VS Code, would you like to open it?") },
    );

    // The folder opens only once the problem file is written, so that the file is already there.
    const uri: vscode.Uri = vscode.Uri.file(workspaceFolderSetting);
    switch (choice?.value) {
        case OpenOption.justOpenFile:
            return { folder: workspaceFolderSetting };
        case OpenOption.neverAsk:
            await getWorkspaceConfiguration().update("hint.openWorkspaceFolder", false, vscode.ConfigurationTarget.Global);
            return { folder: workspaceFolderSetting };
        case OpenOption.openInCurrentWindow:
        case OpenOption.openInNewWindow: {
            const newWindow: boolean = choice.value === OpenOption.openInNewWindow;
            return {
                folder: workspaceFolderSetting,
                openFolder: async (): Promise<boolean> => {
                    await vscode.commands.executeCommand("vscode.openFolder", uri, newWindow);
                    return false;
                },
            };
        }
        case OpenOption.addToWorkspace:
            return {
                folder: workspaceFolderSetting,
                openFolder: async (): Promise<boolean> => {
                    vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders?.length ?? 0, 0, { uri });
                    return true;
                },
            };
        default:
            return undefined;
    }
}

export async function getActiveFilePath(uri?: vscode.Uri): Promise<string | undefined> {
    const document: vscode.TextDocument | undefined = await getActiveDocument(uri);
    if (!document) {
        return undefined;
    }
    return document.uri.fsPath;
}

export async function getActiveDocument(uri?: vscode.Uri): Promise<vscode.TextDocument | undefined> {
    let document: vscode.TextDocument | undefined;
    if (uri) {
        document = await vscode.workspace.openTextDocument(uri);
    } else {
        document = vscode.window.activeTextEditor?.document;
    }

    if (!document) {
        return undefined;
    }
    if (document.isDirty && !await document.save()) {
        vscode.window.showWarningMessage(vscode.l10n.t("Please save the solution file first."));
        return undefined;
    }
    return document;
}

function isSubFolder(from: string, to: string): boolean {
    const relative: string = path.relative(from, to);
    if (relative === "") {
        return true;
    }
    return !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function determineLeetCodeFolder(): Promise<string> {
    let result: string;
    const picks: Array<IQuickItemEx<string>> = [];
    picks.push(
        {
            label: vscode.l10n.t("Default location"),
            detail: `${path.join(os.homedir(), ".leetcode")}`,
            value: `${path.join(os.homedir(), ".leetcode")}`,
        },
        // Problem files can also live with a project that is open.
        ...(vscode.workspace.workspaceFolders || []).filter((folder) => folder.uri.scheme === "file").map((folder) => ({
            label: `$(root-folder) ${folder.name}`,
            description: vscode.l10n.t("Workspace folder"),
            detail: folder.uri.fsPath,
            value: folder.uri.fsPath,
        })),
        {
            label: `$(file-directory) ${vscode.l10n.t("Browse...")}`,
            value: ":browse",
        },
    );
    const choice: IQuickItemEx<string> | undefined = await vscode.window.showQuickPick(
        picks,
        { placeHolder: vscode.l10n.t("Select where you would like to save your LeetCode files") },
    );
    if (!choice) {
        result = "";
    } else if (choice.value === ":browse") {
        const directory: vscode.Uri[] | undefined = await showDirectorySelectDialog();
        if (!directory || directory.length < 1) {
            result = "";
        } else {
            result = directory[0].fsPath;
        }
    } else {
        result = choice.value;
    }

    if (result) {
        await getWorkspaceConfiguration().update("workspaceFolder", result, vscode.ConfigurationTarget.Global);
        // The choice is asked once and then kept, so say where it is kept.
        void vscode.window.showInformationMessage(
            vscode.l10n.t("Problem files are saved in {0}. You can change this with the leetcode.workspaceFolder setting.", result),
            vscode.l10n.t("Open settings"),
        ).then((action: string | undefined) => action ? openSettingsEditor("leetcode.workspaceFolder") : undefined);
    }

    return result;
}

enum OpenOption {
    justOpenFile = "Just open the problem file",
    neverAsk = "Just open the problem file, and don't ask again",
    openInCurrentWindow = "Open in current window",
    openInNewWindow = "Open in new window",
    addToWorkspace = "Add to workspace",
}
