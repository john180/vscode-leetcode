# LeetCode Community

> Solve LeetCode problems in VS Code, with leetcode.cn as the primary endpoint.

**English** · [简体中文](README.zh-CN.md)

> Community fork of [LeetCode-OpenSource/vscode-leetcode](https://github.com/LeetCode-OpenSource/vscode-leetcode). It is not an official LeetCode release. The extension ID is `yanxijian.vscode-leetcode-community`; command, view, and setting IDs are shared with the official extension, so disable the official extension before installing this one.

## Requirements

- [VS Code 1.90](https://code.visualstudio.com/) or newer.
- No Node.js installation is required. The extension talks to LeetCode over HTTPS directly.

## Sign in

1. Open the LeetCode view in the activity bar.
2. Run **LeetCode: Sign In**.
3. Paste the `Cookie` request header copied from `https://leetcode.cn` (recommended), or use **Web Authorization**.

The cookie is stored in VS Code `SecretStorage`, not in plain text settings.

## Features

- Browse all problems from leetcode.cn, including `LCP` / interview-style IDs, with Chinese titles, AC state, paid locks, tags, and companies.
- Open a problem and generate a file with the `@lc` header, code template, and optional description comment.
- Show the top solution article and the problem description in a webview.
- Run sample/custom tests and submit without the bundled LeetCode CLI.
- Keep multiple accounts as local sessions and switch between them.
- Search, sort, hide solved problems, and favorite/unfavorite problems.

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

## Development

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run package
```

`npm run package` builds `dist/extension.js` with esbuild and produces a `.vsix`. Launch with `F5` for an Extension Development Host. See [docs/PUBLISHING.md](docs/PUBLISHING.md) for release steps.

## License

MIT. Based on the original `vscode-leetcode` project and its contributors.
