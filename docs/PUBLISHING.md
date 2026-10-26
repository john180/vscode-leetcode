# Publishing

The extension is published as **`yanxijian.vscode-leetcode-community`**. The publisher and the
`Marketplace > Manage` token are the only steps that require account access.

> Global PATs are retired on **December 1, 2026**. The PAT flow below only works
> before that date; afterwards use Microsoft Entra ID publishing
> (`vsce publish --azure-credential`) as described in the VS Code docs.

## 1. Create the publisher

1. Open <https://marketplace.visualstudio.com/manage>.
2. Create the publisher **`yanxijian`** if it does not exist.
3. Confirm that `yanxijian.vscode-leetcode-community` is still available.

## 2. Create a PAT

1. Open <https://dev.azure.com> and create a personal access token.
2. Scope: **Marketplace > Manage** (organization: all accessible organizations).
3. Store the token outside the repository, for example
   `%USERPROFILE%\Desktop\vsce-pat.txt`. Never commit it.

## 3. Publish

Local:

```powershell
npm ci
npm run package
.\scripts\publish.ps1 -PatFile "$env:USERPROFILE\Desktop\vsce-pat.txt"
```

The script reads `VSCE_PAT` if set, otherwise the first line of `-PatFile`.

CI: add the token as the repository secret `VSCE_PAT`, then run the
**Release** workflow with the version from `package.json`.

## 4. Verify

```powershell
code --install-extension .\vscode-leetcode-community-0.19.4.vsix --force
```

Disable the official `LeetCode.vscode-leetcode` extension first: both use the
same command, view, and setting IDs.

## 5. Release checklist

1. Bump the version in `package.json`, `package-lock.json`, `CHANGELOG.md`,
   `README.md`, and every `README.*` variant (the offline VSIX filename).
   Repository rules fail if these disagree.
2. Run `python scripts/repo_rules.py check --config repo-rules.json`.
3. Build **after** the README/version edits: `npm run package`. The VSIX embeds
   the current `README.md`, so building earlier publishes stale text.
4. Make one dedicated commit whose subject is exactly `release: X.Y.Z`, then
   create the annotated tag `vX.Y.Z` on **that same commit**. Do not tag a later
   test/docs commit.
5. Publish, wait about 10 minutes, then check the Marketplace version **once**.
   Do not poll the Marketplace API in a loop. See
   [Marketplace verification and rate limits](#marketplace-verification-and-rate-limits).

## Marketplace verification and rate limits

Marketplace applies request-rate limits to extension queries, publisher pages,
and the management portal. A verification loop can turn a successful publish
into an HTTP 429 that also blocks sign-in.

- After publishing, wait about 10 minutes before the first check.
- Run `npx vsce show yanxijian.vscode-leetcode-community` once. If it is not
  indexed yet, wait at least another 10 minutes before trying again.
- Never wrap `extensionquery`, `vsce show`, or publisher-page requests in a
  `for`/`while` loop.
- On HTTP 429, stop all requests. Do not refresh repeatedly or retry sign-in in
  a loop. Wait 30–60 minutes, then try once from a different network if needed.
- A 429 means request-rate limiting, not proof that the publisher or extension
  was deleted. Do not recreate the publisher or rotate credentials based only
  on a 429.

## Release invariant

A publishable commit must satisfy all of the following:

1. The version is already `X.Y.Z` in the package and documentation files.
2. `HEAD` subject is exactly `release: X.Y.Z`.
3. `vX.Y.Z` points to `HEAD`.
4. The working tree is clean.
5. No runtime or version changes are committed after the tag.

`node scripts/check-release.mjs` enforces this before publishing;
`scripts/publish.ps1` and the Release workflow call it.

Historical exception: `v0.24.0` was tagged after a test commit. Do not repeat
that pattern.

## Version policy

Marketplace publishes only versions explicitly approved for the store. Intermediate/patch
builds stay on GitHub Releases and are installed with `--force`; they are not uploaded
to Marketplace unless requested.

## Notes

- `npm run package` runs typecheck, ESLint, unit tests, esbuild, and vsce.
- The VSIX is about 320 KB and contains `dist/extension.js`, not `node_modules`.
- `vsce publish` refuses to publish if the publisher does not exist or the token
  lacks the Marketplace scope.
