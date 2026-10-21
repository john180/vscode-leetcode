const path = require("node:path");
const { runTests } = require("@vscode/test-electron");

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
