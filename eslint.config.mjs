import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: ["dist/**", "out/**", "out-test/**", "node_modules/**", "*.vsix"],
    },
    ...tseslint.configs.recommended,
    {
        files: ["src/**/*.ts"],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/explicit-module-boundary-types": "off",
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/no-var-requires": "off",
            "@typescript-eslint/no-require-imports": "off",
            "@typescript-eslint/no-empty-function": "off",
            "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "caughtErrors": "none" }],
            "@typescript-eslint/no-namespace": "off",
            "@typescript-eslint/no-empty-object-type": "off",
            "@typescript-eslint/ban-types": "off",
            "@typescript-eslint/ban-ts-comment": "off",
            "no-case-declarations": "off",
            "no-empty": "off",
            "no-constant-condition": "off",
            "no-async-promise-executor": "off",
        },
    },
);
