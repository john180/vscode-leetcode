import { strict as assert } from "node:assert";
import { beforeEach, test } from "node:test";
import Module = require("node:module");

const opened: string[] = [];
const logged: string[] = [];
let endpoint = "leetcode";
let pick = (items: unknown[]): unknown => items[0];
let channelShown = false;

const dependencies: Record<string, unknown> = {
    "vscode": {
        l10n: { t: (text: string) => text },
        env: { openExternal: async (uri: { url: string }) => { opened.push(uri.url); return true; } },
        Uri: { parse: (url: string) => ({ url }) },
        commands: { executeCommand: async () => undefined },
        window: {
            showInformationMessage: async (_message: string, ...items: unknown[]) => pick(items),
            showErrorMessage: async (_message: string, ...items: unknown[]) => pick(items),
        },
    },
    "../commands/plugin": { getLeetCodeEndpoint: () => endpoint },
    "../leetCodeChannel": { leetCodeChannel: { error: (text: string) => logged.push(text), show: () => { channelShown = true; } } },
    "../shared": { Endpoint: { LeetCode: "leetcode", LeetCodeCN: "leetcode-cn" } },
    "./settingUtils": { getWorkspaceConfiguration: () => ({ get: () => undefined }) },
};
const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: { filename?: string }, isMain: boolean): unknown {
    if (parent?.filename?.endsWith("uiUtils.js") && request in dependencies) {
        return dependencies[request];
    }
    return originalLoad.call(this, request, parent, isMain);
};
const { DialogType, promptForOpenOutputChannel, promptForSignIn } = require("../../src/utils/uiUtils");
moduleLoader._load = originalLoad;

beforeEach(() => { opened.length = 0; logged.length = 0; channelShown = false; endpoint = "leetcode"; });

test("sign up opens the site of the current endpoint", async () => {
    // The buttons are Yes, No and Sign up.
    pick = (items: unknown[]) => items[2];
    await promptForSignIn();
    endpoint = "leetcode-cn";
    await promptForSignIn();
    assert.deepEqual(opened, ["https://leetcode.com", "https://leetcode.cn"]);
});

test("an error is logged before the prompt offers to open the output channel", async () => {
    pick = (items: unknown[]) => items[0];
    await promptForOpenOutputChannel("Failed to test the solution.", DialogType.error, new Error("offline"));
    assert.deepEqual(logged, ["Failed to test the solution. Error: offline"]);
    assert.equal(channelShown, true);

    logged.length = 0;
    await promptForOpenOutputChannel("Nothing to log.", DialogType.error);
    assert.deepEqual(logged, []);
});
