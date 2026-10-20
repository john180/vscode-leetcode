# LeetCode Community

> Solve LeetCode problems in VS Code: problems, solutions, tests, and submissions, with leetcode.cn as the default endpoint.

**English** · [简体中文](README.md)

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/yanxijian.vscode-leetcode-community?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=yanxijian.vscode-leetcode-community)

## Install

- Marketplace: <https://marketplace.visualstudio.com/items?itemName=yanxijian.vscode-leetcode-community>
- Command line:

  ```powershell
  code --install-extension yanxijian.vscode-leetcode-community
  ```

- Offline: download the `.vsix` from [GitHub Releases](https://github.com/yanxijian/vscode-leetcode/releases), then:

  ```powershell
  code --install-extension .\vscode-leetcode-community-0.19.1.vsix --force
  ```

> Community fork of [LeetCode-OpenSource/vscode-leetcode](https://github.com/LeetCode-OpenSource/vscode-leetcode). It is not an official LeetCode release. The extension ID is `yanxijian.vscode-leetcode-community`; command, view, and setting IDs are shared with the official extension, so disable the official `LeetCode.vscode-leetcode` before installing this one.

## Features

- Browse all leetcode.cn problems, including `LCP` and interview-style IDs, with Chinese titles, AC state, paid locks, tags, and companies.
- Generate a file with the `@lc` header, code template, and optional description comment.
- Show the problem description and top solution in a webview.
- Run sample/custom tests and submit without the bundled CLI or a Node.js installation.
- Keep multiple accounts as local sessions and switch between them.
- Search, sort, hide solved problems, and favorite/unfavorite problems.

## Requirements

- [VS Code 1.90](https://code.visualstudio.com/) or newer.
- No Node.js installation is required.

## Sign in

1. Open the LeetCode view in the activity bar.
2. Run **LeetCode: Sign In**.
3. Choose **LeetCode Cookie** and paste the `Cookie` request header copied from `https://leetcode.cn`; **Web Authorization** is also available.

The cookie is stored in VS Code `SecretStorage`, not in plain text settings. The default endpoint is `leetcode-cn`; if you changed `leetcode.endpoint` manually, keep it at `leetcode-cn` for leetcode.cn.

## Quick Start

1. Install and enable the extension, and disable the official one.
2. Sign in to leetcode.cn.
3. Pick a problem in the LeetCode view, or run **Search Problem** / **Pick One**.
4. Edit the generated file and use the CodeLens **Test** or **Submit** action.
5. Click **Solution** when you need the top solution.

## Commands

| Command | Description |
| --- | --- |
| `LeetCode: Sign In` / `Sign Out` | Sign in or out |
| `LeetCode: Switch Endpoint` | Switch between leetcode.cn and leetcode.com |
| `LeetCode: Search Problem` | Search problems |
| `LeetCode: Show Problem` | Open a problem and generate the file |
| `LeetCode: Preview Problem` | Preview the description in a webview |
| `LeetCode: Test in LeetCode` | Run sample or custom tests |
| `LeetCode: Submit to LeetCode` | Submit the current file |
| `LeetCode: Show Top Voted Solution` | Open the top solution |
| `LeetCode: Manage Sessions` | Manage local sessions |
| `LeetCode: Delete Cache` | Clear the problem cache |

## Settings

| Setting | Description | Default |
| --- | --- | --- |
| `leetcode.endpoint` | Active endpoint: `leetcode` or `leetcode-cn` | `leetcode-cn` |
| `leetcode.defaultLanguage` | Default language for new files | unset |
| `leetcode.workspaceFolder` | Folder used to store problem files | `$HOME/.leetcode` |
| `leetcode.filePath` | Relative folder and filename template | `${id}.${kebab-case-name}.${ext}` |
| `leetcode.showDescription` | `In Webview`, `In File Comment`, `Both`, or `None` | `In Webview` |
| `leetcode.hideSolved` | Hide solved problems | `false` |
| `leetcode.useEndpointTranslation` | Use the endpoint's translated content | `true` |
| `leetcode.enableStatusBar` | Show the LeetCode status bar item | `true` |
| `leetcode.editor.shortcuts` | CodeLens actions: `submit`, `test`, `star`, `solution`, `description` | `["submit", "test"]` |
| `leetcode.enableSideMode` | Open preview/solution in the second editor column | `true` |
| `leetcode.colorizeProblems` | Colorize problems by difficulty | `true` |
| `leetcode.problems.sortStrategy` | `None`, `Acceptance Rate (Ascending)`, `Acceptance Rate (Descending)` | `None` |
| `leetcode.allowReportData` | Opt in to anonymous usage data (also requires VS Code telemetry) | `false` |

## Troubleshooting

**"The cookie is not signed in"**

- Confirm `leetcode.endpoint` is `leetcode-cn`.
- Confirm the cookie comes from a signed-in `https://leetcode.cn`, not `leetcode.com`.
- Copy it from a Network request header so it includes both `LEETCODE_SESSION` and `csrftoken`.
- Open Output → LeetCode; the log shows the endpoint and `signedIn` result without printing the cookie.

**Conflict with the official extension**

Both extensions use the same `leetcode.*` command and setting IDs. Disable the official extension first.

## Development

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run package
```

`npm run package` bundles `dist/extension.js` with esbuild and produces a `.vsix`. Press `F5` for an Extension Development Host. Release steps: [docs/PUBLISHING.md](docs/PUBLISHING.md).

## License

MIT. Based on the original `vscode-leetcode` project and its contributors.
