const assert = require("node:assert");
const vscode = require("vscode");

exports.run = async function run() {
    const extension = vscode.extensions.getExtension("john180.vscode-leetcode");
    assert.ok(extension, "the extension is discoverable");
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    for (const { command } of extension.packageJSON.contributes.commands) {
        assert.ok(commands.includes(command), `${command} is registered`);
    }

    const configuration = vscode.workspace.getConfiguration("leetcode");
    assert.equal(configuration.get("endpoint"), "auto");
    assert.equal(configuration.has("allowReportData"), false);

    assert.equal(extension.packageJSON.capabilities.untrustedWorkspaces.supported, true);
    assert.equal(extension.packageJSON.capabilities.virtualWorkspaces.supported, false);
    const stylesheet = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(extension.extensionUri, "resources", "webview", "markdown.css"));
    assert.ok(stylesheet.byteLength > 0, "the extension owns its webview stylesheet");

    const root = vscode.workspace.workspaceFolders[0].uri;
    const problem = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root, "1.two-sum.py"));
    await vscode.window.showTextDocument(problem);
    const lenses = await vscode.commands.executeCommand("vscode.executeCodeLensProvider", problem.uri);
    assert.ok(lenses.some((lens) => lens.command?.command === "leetcode.submitSolution"));
    assert.ok(lenses.some((lens) => lens.command?.command === "leetcode.testSolution"));
    // The description lives in the LeetCode sidebar; opening it must not add an editor tab.
    const tabs = vscode.window.tabGroups.all.flatMap((group) => group.tabs).length;
    await vscode.commands.executeCommand("leetCodeDetail.focus", { preserveFocus: true });
    assert.equal(vscode.window.tabGroups.all.flatMap((group) => group.tabs).length, tabs);

    const notes = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root, "notes.py"));
    await vscode.window.showTextDocument(notes);
    const unrelated = await vscode.commands.executeCommand("vscode.executeCodeLensProvider", notes.uri);
    assert.equal(unrelated.length, 0, "unrelated files must not receive LeetCode actions");
    console.log("LeetCode integration smoke passed");
};
