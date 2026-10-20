# Publishing

The extension is published as **`yanxijian.vscode-leetcode`**. The publisher and the
`Marketplace > Manage` token are the only steps that require account access.

## 1. Create the publisher

1. Open <https://marketplace.visualstudio.com/manage>.
2. Create the publisher **`yanxijian`** if it does not exist.
3. Confirm that `yanxijian.vscode-leetcode` is still available.

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
code --install-extension .\vscode-leetcode-0.19.0.vsix --force
```

Disable the official `LeetCode.vscode-leetcode` extension first: both use the
same command, view, and setting IDs.

## Notes

- `npm run package` runs typecheck, ESLint, unit tests, esbuild, and vsce.
- The VSIX is about 563 KB and contains `dist/extension.js`, not `node_modules`.
- `vsce publish` refuses to publish if the publisher does not exist or the token
  lacks the Marketplace scope.
