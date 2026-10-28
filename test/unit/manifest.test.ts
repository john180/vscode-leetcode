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

test("commands that need a problem from the list stay out of the command palette", () => {
    const hidden: string[] = manifest.contributes.menus.commandPalette
        .filter((item: { when?: string }) => item.when === "never")
        .map((item: { command: string }) => item.command);
    for (const command of ["leetcode.showProblem", "leetcode.addFavorite", "leetcode.removeFavorite", "leetcode.addToFavoriteList"]) {
        assert.ok(hidden.includes(command), `${command} is hidden`);
    }
});
