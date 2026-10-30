import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";
import Module = require("node:module");

const root: string = mkdtempSync(join(tmpdir(), "leetcode-workspace-"));
let settings: Record<string, unknown> = {};
let workspaceFolders: Array<{ name: string; uri: { fsPath: string; scheme: string } }> = [];
let answer = (_items: any[]): any => undefined;
const pickers: string[][] = [];
const executed: unknown[][] = [];
const added: unknown[][] = [];
const messages: string[] = [];

const dependencies: Record<string, unknown> = {
    "vscode": {
        workspace: {
            get workspaceFolders() { return workspaceFolders; },
            updateWorkspaceFolders: (...args: unknown[]) => { added.push(args); return true; },
        },
        window: {
            showQuickPick: async (items: any[]) => { pickers.push(items.map((item) => item.label)); return answer(items); },
            showInformationMessage: async (text: string) => { messages.push(text); return undefined; },
        },
        commands: { executeCommand: async (...args: unknown[]) => { executed.push(args); } },
        Uri: { file: (fsPath: string) => ({ fsPath, scheme: "file" }) },
        l10n: { t: (text: string, ...args: unknown[]) => text.replace(/\{(\d+)\}/g, (_: string, index: string) => String(args[+index])) },
        ConfigurationTarget: { Global: 1 },
    },
    "./settingUtils": {
        getWorkspaceFolder: () => settings.workspaceFolder ?? "",
        getWorkspaceConfiguration: () => ({
            get: (key: string, defaultValue?: unknown) => key in settings ? settings[key] : defaultValue,
            update: async (key: string, value: unknown) => { settings[key] = value; },
        }),
    },
    "./uiUtils": { openSettingsEditor: async () => undefined, showDirectorySelectDialog: async () => undefined },
};
const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: { filename?: string }, isMain: boolean): unknown {
    if (parent?.filename?.endsWith("workspaceUtils.js") && request in dependencies) {
        return dependencies[request];
    }
    return originalLoad.call(this, request, parent, isMain);
};
const { selectWorkspaceFolder } = require("../../src/utils/workspaceUtils");
moduleLoader._load = originalLoad;

const folder: string = join(root, "problems");
const choose = (label: string) => (items: any[]) => items.find((item) => item.label === label);

after(() => rmSync(root, { recursive: true, force: true }));

beforeEach(() => {
    settings = { workspaceFolder: folder }; workspaceFolders = []; answer = () => undefined;
    pickers.length = 0; executed.length = 0; added.length = 0; messages.length = 0;
});

test("a folder inside the workspace is used without asking", async () => {
    workspaceFolders = [{ name: "root", uri: { fsPath: root, scheme: "file" } }];
    assert.deepEqual(await selectWorkspaceFolder(), { folder });
    assert.deepEqual(pickers, []);
});

test("a folder outside the workspace is asked about until the user says not to", async () => {
    answer = choose("Just open the problem file, and don't ask again");
    assert.deepEqual(await selectWorkspaceFolder(), { folder });
    assert.equal(settings["hint.openWorkspaceFolder"], false);
    assert.deepEqual(await selectWorkspaceFolder(), { folder });
    assert.equal(pickers.length, 1, "the second problem opens without the question");

    settings["hint.openWorkspaceFolder"] = true;
    answer = () => undefined;
    assert.equal(await selectWorkspaceFolder(), undefined, "dismissing the question cancels");
});

test("the folder opens only once the caller has written the problem file", async () => {
    answer = choose("Open in new window");
    const newWindow = await selectWorkspaceFolder();
    assert.equal(newWindow.folder, folder);
    assert.deepEqual(executed, [], "nothing opens before the file exists");
    assert.equal(await newWindow.openFolder(), false, "the new window shows the file");
    assert.deepEqual(executed, [["vscode.openFolder", { fsPath: folder, scheme: "file" }, true]]);

    answer = choose("Open in current window");
    assert.equal(await (await selectWorkspaceFolder()).openFolder(), false);
    assert.deepEqual(executed.at(-1), ["vscode.openFolder", { fsPath: folder, scheme: "file" }, false]);

    answer = choose("Add to workspace");
    workspaceFolders = [{ name: "other", uri: { fsPath: join(root, "other"), scheme: "file" } }];
    assert.equal(await (await selectWorkspaceFolder()).openFolder(), true, "this window still shows the file");
    assert.deepEqual(added, [[1, 0, { uri: { fsPath: folder, scheme: "file" } }]]);
});

test("the first choice of a folder offers the open workspace folders and says where it is kept", async () => {
    settings = {};
    workspaceFolders = [
        { name: "project", uri: { fsPath: root, scheme: "file" } },
        { name: "remote", uri: { fsPath: "/remote", scheme: "vscode-remote" } },
    ];
    answer = (items) => items.find((item) => item.detail === root);
    assert.deepEqual(await selectWorkspaceFolder(), { folder: root });
    assert.deepEqual(pickers, [["Default location", "$(root-folder) project", "$(file-directory) Browse..."]]);
    assert.equal(settings.workspaceFolder, root);
    assert.deepEqual(messages, [`Problem files are saved in ${root}. You can change this with the leetcode.workspaceFolder setting.`]);

    settings = {};
    answer = () => undefined;
    assert.equal(await selectWorkspaceFolder(), undefined);
    assert.equal("workspaceFolder" in settings, false, "a dismissed choice saves nothing");
});
