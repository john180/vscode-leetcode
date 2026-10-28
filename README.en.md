# LeetCode

**English** · [简体中文](README.md)

[![CI](https://github.com/john180/vscode-leetcode/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/john180/vscode-leetcode/actions/workflows/build.yml)
[![VS Code 1.143+](https://badgen.net/badge/VS%20Code/1.143%2B/blue?icon=visualstudio)](https://code.visualstudio.com/)
[![License: MIT](https://badgen.net/badge/license/MIT/yellow)](https://github.com/john180/vscode-leetcode/blob/main/LICENSE)

> Browse LeetCode problems, read solutions, test, and submit code in VS Code.

Changelog: [CHANGELOG.md](CHANGELOG.md)

## Install

Supports Windows and VS Code 1.143+, with Simplified Chinese and English UI. Install from a locally built VSIX. No separate Node.js installation is needed to use the extension.

Build using the development steps below, then run from the project directory:

```powershell
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
code --install-extension ".\vscode-leetcode-$version.vsix" --force
```

Extension ID: `john180.vscode-leetcode`. Disable the previous community and official extensions before installing to avoid command, view, and setting conflicts. Sign in again after migrating from an older extension.

## Features

- Browse all LeetCode problems, including contest and interview-style IDs, with AC state, paid locks, tags, and companies.
- Generate a file with the `@lc` header, code template, and optional description comment.
- Show the problem description and top solution in a webview.
- Run sample or custom tests and submit code.
- Keep multiple accounts as local sessions and switch between them.
- Search, sort, hide solved problems, and favorite/unfavorite problems.

## Sign in

1. Open the LeetCode view in the activity bar.
   Categories load when expanded, with 50 problems per page and a **Load more** action; favorites and Hot 100 load 20 at a time. Search by ID, title or slug, with optional filters such as `tag:array` or `company:google`.
   Visited problems are cached locally across restarts, separately for each site, login session and language, and stale entries update in the background. Refresh reloads expanded categories; **Delete Cache** also clears the persistent problem cache. Testing, submitting and viewing history do not require the full question bank.
2. Run **LeetCode: Sign In**.
3. Choose **LeetCode Cookie** and paste the `Cookie` request header copied from `https://leetcode.com`; **Web Authorization** is also available.

The cookie is stored securely in VS Code. The site is selected from the system time zone: LeetCode China in mainland China, LeetCode elsewhere. Use **LeetCode: Switch Endpoint** to switch manually, and copy the cookie from the selected site.

## Quick Start

1. After signing in, pick a problem in the LeetCode view, or run **Search Problem** / **Pick One**.
2. Edit the generated file and use the CodeLens **Test** or **Submit** action.
3. Click **Solution** when you need the top solution.

## Commands

| Command | Description |
| --- | --- |
| `LeetCode: Sign In` / `Sign Out` | Sign in or out |
| `LeetCode: Switch Endpoint` | Switch between LeetCode and LeetCode China |
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
| `leetcode.endpoint` | `auto`, `leetcode`, or `leetcode-cn` | `auto` |
| `leetcode.defaultLanguage` | Default language for new files | unset |
| `leetcode.workspaceFolder` | Folder used to store problem files | `%USERPROFILE%\.leetcode` |
| `leetcode.filePath` | Relative folder and filename template | `${id}.${kebab-case-name}.${ext}` |
| `leetcode.showDescription` | `In Webview`, `In File Comment`, `Both`, or `None` | `In Webview` |
| `leetcode.hideSolved` | Hide solved problems | `false` |
| `leetcode.useEndpointTranslation` | Use the endpoint's translated content | `true` |
| `leetcode.enableStatusBar` | Show the LeetCode status bar item | `true` |
| `leetcode.editor.shortcuts` | CodeLens actions: `submit`, `test`, `star`, `solution`, `description` | `["submit", "test"]` |
| `leetcode.enableSideMode` | Open preview/solution in the second editor column | `true` |
| `leetcode.colorizeProblems` | Colorize problems by difficulty | `true` |
| `leetcode.problems.sortStrategy` | `None`, `Acceptance Rate (Ascending)`, `Acceptance Rate (Descending)` | `None` |

## Troubleshooting

**"The cookie is not signed in"**

- Confirm `leetcode.endpoint` matches the cookie source (`leetcode.com` or `leetcode.cn`).
- Copy it from a Network request header so it includes both `LEETCODE_SESSION` and `csrftoken`.
- Open Output → LeetCode; the log shows the endpoint and `signedIn` result without printing the cookie.

## Development

Build prerequisite: Node.js 24.18+. Repository rule checks require Python.

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run test:integration  # optional, requires VS Code
npm run package
python scripts/repo_rules.py check --config repo-rules.json
```

`npm run package` builds the extension and produces a `.vsix`. Press `F5` for an Extension Development Host.

## License

MIT. Based on [LeetCode-OpenSource/vscode-leetcode](https://github.com/LeetCode-OpenSource/vscode-leetcode) and its community contributions.
