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

test("READMEs link to the matching changelog", () => {
    assert.ok(read("README.md").includes("[CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md)"));
    assert.ok(read("README.en.md").includes("[CHANGELOG.md](CHANGELOG.md)"));
});

test("the VSIX ignore list excludes tests and coverage artifacts", () => {
    const ignore = read(".vscodeignore");
    assert.match(ignore, /^test\/\*\*$/m);
    assert.match(ignore, /^coverage\/\*\*$/m);
});
