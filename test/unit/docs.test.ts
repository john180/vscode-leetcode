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
