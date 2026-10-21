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

function unescape(value: string): string {
    return value.replace(/\\(["'\\])/g, "$1");
}

function l10nKeys(): string[] {
    const keys: string[] = [];
    for (const file of sourceFiles(join(process.cwd(), "src"))) {
        const text: string = readFileSync(file, "utf8");
        for (const match of text.matchAll(/l10n\.t\(\s*"((?:[^"\\]|\\.)*)"/g)) {
            keys.push(unescape(match[1]));
        }
        for (const match of text.matchAll(/l10n\.t\(\s*'((?:[^'\\]|\\.)*)'/g)) {
            keys.push(unescape(match[1]));
        }
    }
    return keys;
}

test("every l10n key used in src has a translation for each locale", () => {
    for (const locale of ["zh-cn", "ja", "ko"]) {
        const bundle = JSON.parse(readFileSync(join(process.cwd(), "l10n", `bundle.l10n.${locale}.json`), "utf8"));
        const missing: string[] = [...new Set(l10nKeys())].filter((key: string) => !(key in bundle));
        assert.deepEqual(missing, [], `${locale} is missing ${missing.join(", ")}`);
    }
});

test("manifest translations cover every package.nls key", () => {
    const base = JSON.parse(readFileSync(join(process.cwd(), "package.nls.json"), "utf8"));
    for (const locale of ["zh-cn", "ja", "ko"]) {
        const translated = JSON.parse(readFileSync(join(process.cwd(), `package.nls.${locale}.json`), "utf8"));
        assert.deepEqual(Object.keys(base).sort(), Object.keys(translated).sort(), `${locale} manifest keys differ`);
    }
});
