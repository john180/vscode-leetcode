// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { leetCodeChannel } from "../leetCodeChannel";
import { currentSite } from "../shared";
import { getWorkspaceConfiguration } from "./settingUtils";

export namespace DialogOptions {
    export const open: vscode.MessageItem = { title: vscode.l10n.t("Open") };
    export const yes: vscode.MessageItem = { title: vscode.l10n.t("Yes") };
    export const no: vscode.MessageItem = { title: vscode.l10n.t("No"), isCloseAffordance: true };
    export const never: vscode.MessageItem = { title: vscode.l10n.t("Never") };
    export const singUp: vscode.MessageItem = { title: vscode.l10n.t("Sign up") };
}

/** Show `message` with a button that opens the output channel; `error` is logged there first so the details exist. */
export async function promptForOpenOutputChannel(message: string, type: DialogType, error?: unknown): Promise<void> {
    if (error !== undefined) {
        leetCodeChannel.error(`${message} ${error}`);
    }
    let result: vscode.MessageItem | undefined;
    switch (type) {
        case DialogType.info:
            result = await vscode.window.showInformationMessage(message, DialogOptions.open, DialogOptions.no);
            break;
        case DialogType.warning:
            result = await vscode.window.showWarningMessage(message, DialogOptions.open, DialogOptions.no);
            break;
        case DialogType.error:
            result = await vscode.window.showErrorMessage(message, DialogOptions.open, DialogOptions.no);
            break;
        default:
            break;
    }

    if (result === DialogOptions.open) {
        leetCodeChannel.show();
    }
}

export async function promptForSignIn(): Promise<void> {
    const choice: vscode.MessageItem | undefined = await vscode.window.showInformationMessage(
        vscode.l10n.t("Please sign in to LeetCode."),
        DialogOptions.yes,
        DialogOptions.no,
        DialogOptions.singUp,
    );
    switch (choice) {
        case DialogOptions.yes:
            await vscode.commands.executeCommand("leetcode.signin");
            break;
        case DialogOptions.singUp:
            await openUrl(currentSite().origin);
            break;
        default:
            break;
    }
}

export async function promptHintMessage(config: string, message: string, choiceConfirm: string, onConfirm: () => Promise<any>): Promise<void> {
    if (getWorkspaceConfiguration().get<boolean>(config)) {
        const choiceNoShowAgain: string = vscode.l10n.t("Don't show again");
        const choice: string | undefined = await vscode.window.showInformationMessage(
            message, choiceConfirm, choiceNoShowAgain,
        );
        if (choice === choiceConfirm) {
            await onConfirm();
        } else if (choice === choiceNoShowAgain) {
            await getWorkspaceConfiguration().update(config, false, true /* UserSetting */);
        }
    }
}

export async function openSettingsEditor(query?: string): Promise<void> {
    await vscode.commands.executeCommand("workbench.action.openSettings", query);
}

export async function openKeybindingsEditor(query?: string): Promise<void> {
    await vscode.commands.executeCommand("workbench.action.openGlobalKeybindings", query);
}

export async function showFileSelectDialog(fsPath?: string): Promise<vscode.Uri[] | undefined> {
    const defaultUri: vscode.Uri | undefined = getBelongingWorkspaceFolderUri(fsPath);
    const options: vscode.OpenDialogOptions = {
        defaultUri,
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: vscode.l10n.t("Select"),
    };
    return await vscode.window.showOpenDialog(options);
}

function getBelongingWorkspaceFolderUri(fsPath: string | undefined): vscode.Uri | undefined {
    let defaultUri: vscode.Uri | undefined;
    if (fsPath) {
        const workspaceFolder: vscode.WorkspaceFolder | undefined = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(fsPath));
        if (workspaceFolder) {
            defaultUri = workspaceFolder.uri;
        }
    }
    return defaultUri;
}

export async function showDirectorySelectDialog(fsPath?: string): Promise<vscode.Uri[] | undefined> {
    const defaultUri: vscode.Uri | undefined = getBelongingWorkspaceFolderUri(fsPath);
    const options: vscode.OpenDialogOptions = {
        defaultUri,
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: vscode.l10n.t("Select"),
    };
    return await vscode.window.showOpenDialog(options);
}

export async function openUrl(url: string): Promise<void> {
    await vscode.env.openExternal(vscode.Uri.parse(url));
}

export enum DialogType {
    info = "info",
    warning = "warning",
    error = "error",
}
