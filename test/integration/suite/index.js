const assert = require("node:assert");
const vscode = require("vscode");

exports.run = async function run() {
    const extension = vscode.extensions.getExtension("john180.vscode-leetcode");
    assert.ok(extension, "the extension is discoverable");
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    for (const command of [
        "leetcode.signin",
        "leetcode.searchProblem",
        "leetcode.refreshExplorer",
        "leetcode.showSubmissions",
        "leetcode.addToFavoriteList",
    ]) {
        assert.ok(commands.includes(command), `${command} is registered`);
    }

    const configuration = vscode.workspace.getConfiguration("leetcode");
    assert.equal(configuration.get("endpoint"), "auto");
    assert.equal(configuration.has("allowReportData"), false);
    console.log("LeetCode integration smoke passed");
};
