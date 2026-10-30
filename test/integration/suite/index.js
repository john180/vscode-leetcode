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
    // Results live in the bottom panel, also outside the editor.
    await vscode.commands.executeCommand("leetCodeResult.focus", { preserveFocus: true });
    assert.equal(vscode.window.tabGroups.all.flatMap((group) => group.tabs).length, tabs);

    // Test cases are a document of the extension's own file system, saved outside the workspace.
    const testCases = vscode.Uri.parse("leetcode-testcase:/1/two-sum.txt");
    await vscode.workspace.fs.writeFile(testCases, Buffer.from("[2,7,11,15]\n9"));
    const testCaseEditor = await vscode.window.showTextDocument(testCases);
    assert.equal(testCaseEditor.document.getText(), "[2,7,11,15]\n9");
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");

    // Quick Test's default key must not take a key that VS Code already uses.
    await vscode.commands.executeCommand("workbench.action.openDefaultKeybindingsFile");
    const bindings = [...vscode.window.activeTextEditor.document.getText().matchAll(/"key":\s*"([^"]+)",\s*"command":\s*"([^"]+)"/g)];
    assert.ok(bindings.length > 100, "the default keybindings were read");
    const taken = bindings
        .filter(([, key, command]) => key.split(" ")[0] === "ctrl+'" && !command.startsWith("leetcode."))
        .map(([, key, command]) => `${key}: ${command}`);
    assert.deepEqual(taken, [], "ctrl+' is free in VS Code");
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");

    const notes = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root, "notes.py"));
    await vscode.window.showTextDocument(notes);
    const unrelated = await vscode.commands.executeCommand("vscode.executeCodeLensProvider", notes.uri);
    assert.equal(unrelated.length, 0, "unrelated files must not receive LeetCode actions");
    console.log("LeetCode integration smoke passed");
};
