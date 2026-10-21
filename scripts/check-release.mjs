import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

function git(args) {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function fail(message) {
    console.error(`[release-check] ${message}`);
    process.exit(1);
}

if (git(["status", "--porcelain"])) {
    fail("working tree is not clean; commit or discard changes before publishing");
}

const subject = git(["log", "-1", "--format=%s"]);
if (subject !== `release: ${version}`) {
    fail(`HEAD subject is ${JSON.stringify(subject)}; expected "release: ${version}"`);
}

const tags = git(["tag", "--points-at", "HEAD"]).split(/\r?\n/).filter(Boolean);
if (!tags.includes(`v${version}`)) {
    fail(`tag v${version} does not point to HEAD; create the release commit first, then tag that commit`);
}

console.log(`[release-check] ${subject} at v${version}`);
