const path = require("node:path");
const fs = require("node:fs");
const { runTests } = require("@vscode/test-electron");

// Code.exe acts as Node when this is inherited, so VS Code rejects its own
// launch arguments. Remove it before spawning the Extension Host.
delete process.env.ELECTRON_RUN_AS_NODE;

async function main() {
    const extensionDevelopmentPath = path.resolve(__dirname, "../..");
    const extensionTestsPath = path.resolve(__dirname, "suite/index");
    const cache = path.join(extensionDevelopmentPath, ".vscode-test");
    fs.mkdirSync(cache, { recursive: true });
    const runRoot = fs.mkdtempSync(path.join(cache, "integration-"));
    const workspace = path.join(runRoot, "workspace");
    fs.mkdirSync(workspace);
    fs.writeFileSync(path.join(workspace, "1.two-sum.py"), "# @lc app=leetcode.com id=1 lang=python3\n# @lc code=start\nx = 1\n# @lc code=end\n");
    fs.writeFileSync(path.join(workspace, "notes.py"), "x = 1\n");
    await runTests({
        version: process.env.VSCODE_TEST_VERSION || "stable",
        extensionDevelopmentPath,
        extensionTestsPath,
        vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH || undefined,
        launchArgs: [
            workspace, "--disable-extensions", "--skip-welcome", "--skip-release-notes", "--disable-workspace-trust",
            "--user-data-dir", path.join(runRoot, "user-data"),
            "--extensions-dir", path.join(runRoot, "extensions"),
        ],
    });
}

main().catch((error) => {
    console.error("Integration test failed:", error);
    process.exit(1);
});
