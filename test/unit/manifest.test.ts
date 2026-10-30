import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const manifest = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));

function enumSchemas(schema: any, name: string): Array<[string, any]> {
    const found: Array<[string, any]> = schema.enum ? [[name, schema]] : [];
    for (const [key, child] of Object.entries<any>(schema.properties ?? {})) {
        found.push(...enumSchemas(child, `${name}.${key}`));
    }
    return schema.items ? [...found, ...enumSchemas(schema.items, `${name}[]`)] : found;
}

test("enum settings describe every value or none", () => {
    for (const [key, schema] of Object.entries<any>(manifest.contributes.configuration[0].properties)) {
        for (const [name, values] of enumSchemas(schema, key)) {
            if (values.enumDescriptions) {
                assert.equal(values.enumDescriptions.length, values.enum.length, `${name} has ${values.enum.length} values`);
            }
        }
    }
});

test("only Quick Test has a default key, which works only in problem files and test case editors", () => {
    const bindings: Array<{ command: string; key: string; when: string }> = manifest.contributes.keybindings;
    // A submission cannot be taken back, so it has no key to press by accident.
    assert.deepEqual(bindings.map((binding) => binding.command), ["leetcode.rerunTest"]);
    assert.equal(bindings[0].key, "ctrl+'", "LeetCode's own Run key");
    assert.equal(bindings[0].when, "editorTextFocus && (leetcode.isProblem || resourceScheme == leetcode-testcase)");
    assert.ok(manifest.activationEvents.includes("onFileSystem:leetcode-testcase"), "a restored test case editor activates the extension");
});

test("comparing a submission is offered only in its code's editor, which a restored editor can load", () => {
    const palette = manifest.contributes.menus.commandPalette.find((item: { command: string }) => item.command === "leetcode.compareSubmission");
    const title = manifest.contributes.menus["editor/title"].find((item: { command: string }) => item.command === "leetcode.compareSubmission");
    assert.equal(palette?.when, "resourceScheme == leetcode-submission");
    assert.equal(title?.when, "resourceScheme == leetcode-submission");
    assert.ok(manifest.activationEvents.includes("onFileSystem:leetcode-submission"));
});

test("a restored description tab activates the extension, and Clear Filter shows only while filtering", () => {
    assert.ok(manifest.activationEvents.includes("onWebviewPanel:leetCodeDescription"));
    const titles = manifest.contributes.menus["view/title"];
    assert.equal(titles.find((item: { command: string }) => item.command === "leetcode.clearFilter")?.when, "view == leetCodeExplorer && leetcode.filtered");
    assert.equal(titles.find((item: { command: string }) => item.command === "leetcode.previewProblemInEditor")?.when, "view == leetCodeDetail");
    const palette = manifest.contributes.menus.commandPalette.find((item: { command: string }) => item.command === "leetcode.clearFilter");
    assert.equal(palette?.when, "leetcode.filtered");
    const declared: string[] = manifest.contributes.commands.map((item: { command: string }) => item.command);
    for (const command of ["leetcode.filterProblems", "leetcode.clearFilter", "leetcode.goToProblem", "leetcode.previewProblemInEditor", "leetcode.openDailyChallenge"]) {
        assert.ok(declared.includes(command), `${command} is declared`);
    }
});

test("commands that need a problem from the list stay out of the command palette", () => {
    const hidden: string[] = manifest.contributes.menus.commandPalette
        .filter((item: { when?: string }) => item.when === "never")
        .map((item: { command: string }) => item.command);
    for (const command of ["leetcode.showProblem", "leetcode.addFavorite", "leetcode.removeFavorite", "leetcode.addToFavoriteList"]) {
        assert.ok(hidden.includes(command), `${command} is hidden`);
    }
});
