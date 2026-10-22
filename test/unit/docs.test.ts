import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root: string = process.cwd();

function read(name: string): string {
    return readFileSync(join(root, name), "utf8");
}

test("package and both changelogs use the same version", () => {
    const version = JSON.parse(read("package.json")).version;
    assert.match(read("CHANGELOG.md"), new RegExp(`^## \\[${version.replace(/\./g, "\\.")}\\]`, "m"));
    assert.match(read("CHANGELOG.zh-CN.md"), new RegExp(`^## \\[${version.replace(/\./g, "\\.")}\\]`, "m"));
});

test("READMEs point to the changelog matching their language", () => {
    assert.match(
        read("README.md"),
        /\[CHANGELOG\.zh-CN\.md\]\(https:\/\/github\.com\/yanxijian\/vscode-leetcode\/blob\/community\/CHANGELOG\.zh-CN\.md\)/,
    );
    assert.doesNotMatch(read("README.md"), /\[简体中文\]\(https:\/\/github\.com\/yanxijian\/vscode-leetcode\/blob\/community\/CHANGELOG/);
    for (const name of ["README.en.md", "README.ja.md", "README.ko.md"]) {
        const text = read(name);
        assert.match(text, /\[CHANGELOG\.md\]\(https:\/\/github\.com\/yanxijian\/vscode-leetcode\/blob\/community\/CHANGELOG\.md\)/);
        assert.doesNotMatch(text, /\[English\]\(https:\/\/github\.com\/yanxijian\/vscode-leetcode\/blob\/community\/CHANGELOG/);
        assert.doesNotMatch(text, /CHANGELOG\.zh-CN\.md/);
        assert.doesNotMatch(text, /leetcode\.cn|力扣/);
    }
});

test("all README variants and the package keep the current VSIX version", () => {
    const version = JSON.parse(read("package.json")).version;
    for (const name of ["README.md", "README.en.md", "README.ja.md", "README.ko.md"]) {
        assert.match(read(name), new RegExp(`vscode-leetcode-community-${version.replace(/\./g, "\\.")}\\.vsix`));
    }
});

test("the VSIX ignore list excludes tests and coverage artifacts", () => {
    const ignore = read(".vscodeignore");
    assert.match(ignore, /^test\/\*\*$/m);
    assert.match(ignore, /^coverage\/\*\*$/m);
});

test("README Marketplace badges use the working provider", () => {
    for (const name of ["README.md", "README.en.md", "README.ja.md", "README.ko.md"]) {
        const text = read(name);
        assert.match(text, /https:\/\/vsmarketplacebadges\.dev\/version\/yanxijian\.vscode-leetcode-community\.svg/);
        assert.doesNotMatch(text, /img\.shields\.io\/visual-studio-marketplace/);
    }
});

test("READMEs show CI, Marketplace, VS Code, and license badges before the first section", () => {
    for (const name of ["README.md", "README.en.md", "README.ja.md", "README.ko.md"]) {
        const text = read(name);
        for (const marker of [
            "[![CI](https://github.com/yanxijian/vscode-leetcode/actions/workflows/build.yml/badge.svg?branch=community)]",
            "[![Visual Studio Marketplace](https://vsmarketplacebadges.dev/version/yanxijian.vscode-leetcode-community.svg)]",
            "[![VS Code 1.90+](https://badgen.net/badge/VS%20Code/1.90%2B/blue?icon=visualstudio)]",
            "[![License: MIT](https://badgen.net/badge/license/MIT/yellow)]",
        ]) {
            assert.ok(text.includes(marker), `${name} is missing ${marker}`);
        }
        assert.ok(text.indexOf("[![CI]") < text.indexOf("## "), `${name} badges are not at the top`);
    }
});
