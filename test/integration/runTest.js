const path = require("node:path");
const { runTests } = require("@vscode/test-electron");

// Code.exe acts as Node when this is inherited, so VS Code rejects its own
// launch arguments. Remove it before spawning the Extension Host.
delete process.env.ELECTRON_RUN_AS_NODE;

async function main() {
    const extensionDevelopmentPath = path.resolve(__dirname, "../..");
    const extensionTestsPath = path.resolve(__dirname, "suite/index");
    await runTests({
        extensionDevelopmentPath,
        extensionTestsPath,
        vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH || undefined,
        launchArgs: ["--disable-extensions", "--skip-welcome"],
    });
}

main().catch((error) => {
    console.error("Integration test failed:", error);
    process.exit(1);
});
