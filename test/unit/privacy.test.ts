import { strict as assert } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function sourceFiles(directory: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(directory)) {
        const fullPath: string = join(directory, entry);
        if (statSync(fullPath).isDirectory()) {
            files.push(...sourceFiles(fullPath));
        } else if (fullPath.endsWith(".ts")) {
            files.push(fullPath);
        }
    }
    return files;
}

test("source contains no telemetry implementation or analytics endpoint", () => {
    const forbidden = [/analysis\.leetcode\.cn/, /analysis\.lingkou\.xyz/, /allowReportData/, /TrackData/];
    for (const file of sourceFiles(join(process.cwd(), "src"))) {
        const text = readFileSync(file, "utf8");
        for (const pattern of forbidden) {
            assert.equal(pattern.test(text), false, `${file} still contains ${pattern}`);
        }
    }
});

test("manifest does not expose a telemetry setting", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const properties = packageJson.contributes.configuration[0].properties;
    assert.equal(Object.prototype.hasOwnProperty.call(properties, "leetcode.allowReportData"), false);
});
