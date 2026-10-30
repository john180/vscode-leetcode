# Change Log

**English** · [简体中文](CHANGELOG.zh-CN.md)

All notable changes to the "leetcode" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]
### Added
- A test case editor replaces the one-line input box: **Edit test cases...** opens the problem's test cases beside the code, one argument per line, with each line labelled with its case and parameter. It starts with the examples and is kept in the extension's storage, not in the workspace.
- **Quick Test** (`Ctrl+'`, `Cmd+'` on macOS) tests the problem file, or the problem of the test case editor, without asking: with your test cases, or the examples until you write some.
- A failed submission offers **Add to test cases**, which appends its failing input to the test case editor.
- Submission history shows a submission's code in a read-only editor in the submission's language. A row's buttons compare it with your solution file or open it on LeetCode, and **Compare with Your Solution** in the code's title bar does the same.
- The first choice of where to save problem files also lists the open workspace folders, and says which setting keeps the choice.

### Changed
- The test case picker lists your test cases first, so Enter tests them again. Testing with the examples, a file or a failing input no longer replaces them.
- Choosing a submission in its history shows its code instead of opening LeetCode in the browser.

### Fixed
- **Code Now** no longer has to ask every time whether to open a folder of problem files that is not in the workspace: **Just open the problem file, and don't ask again** turns the question off (`leetcode.hint.openWorkspaceFolder`).
- Opening that folder in the current or a new window creates the problem file first, instead of opening the folder without it.

## [0.26.0] - 2026-10-30
### Fixed
- Resolve KaTeX and MSAL Node security advisories by updating runtime and packaging dependencies.
- "Sign up" now opens the site of the current endpoint instead of always opening leetcode.cn.
- Failures that ask you to open the output channel now write the error there.
- Opening a problem creates the folders named by `leetcode.filePath`, such as `${difficulty}`, instead of failing.
- Testing while signed out asks you to sign in instead of doing nothing.
- `Add to Favorite List` is hidden from the Command Palette, where it had no problem to act on.
- Every `leetcode.showDescription` value has a description in Settings.
- Choosing the active session in `Manage Sessions` no longer switches to it again in the Chinese UI.
- The Daily Challenge on leetcode.cn shows today's problem again; it is read from LeetCode's GraphQL API, since the homepage no longer embeds it.
- A request that LeetCode rejects with 401 or 403 no longer deletes the saved session unless LeetCode confirms that the session is signed out; a 403 can also come from a CAPTCHA or CSRF check.
- When LeetCode rejects a query, the output channel shows LeetCode's reason instead of "Request failed with status code 400", and a CAPTCHA or proxy page is reported as such.
- A brief network failure while waiting for a judge result no longer loses the result of a test or submission that LeetCode already accepted.
- A brief network failure while checking the saved session at startup, or while loading favorite lists or submission history, is retried instead of failing.
- `Add to Favorite List` shows each list's current number of problems right after a favorite changes, instead of counts up to five minutes old.

### Changed
- Upgrade KaTeX to 0.19.1, markdown-it to 15.0.3, TypeScript to 6.0.3 and VSCE to 4.1.0; use markdown-it's bundled types and refresh third-party notices.
- Commands and views are registered before the stored session is restored, so a failure there no longer leaves the commands missing.
- The output channel is a log channel with levels and timestamps; use "Developer: Set Log Level..." to filter it.
- Problem files update the menu context keys only when they change, not on every keystroke.
- Problem Details is no longer kept alive while hidden; it reloads its content when shown again.
- Links open with `env.openExternal`.
- TypeScript `strict` mode is enabled, and CI also runs the integration test on the minimum supported VS Code.
- Every request to LeetCode goes through one HTTP layer, so all of them send the same headers, including the CSRF token and a User-Agent with the extension's real version and platform instead of a fixed "0.19 on Windows".
- "Default test cases" tests with all of the problem's examples, like Run on LeetCode, instead of only the first one.
- Testing and submitting ask LeetCode only for the problem's id, examples and parameter names instead of its whole description and code templates. Adding to or removing from favorites reuses the problem's cached metadata and the cached favorite lists, so it usually sends only the change itself.
- Hot 100 and favorite lists load each page of up to 20 problems with one request instead of one request per problem.
- Favorite lists and the daily problem are kept in the same cache as the problem lists, which the tree and the commands share.
- Starting a test stops waiting for the result of the test it replaces, and switching the account, site or language stops what is still loading for the old one. A replaced submission still records its verdict.
- Sign-in errors name the site, such as leetcode.cn, instead of its GraphQL address.

## [0.25.0] - 2026-10-28
### Changed
- Move the repository to `john180/vscode-leetcode` and use `main`, preserving the history of `community`.
- Rename the extension to `john180.vscode-leetcode` with the display name `LeetCode`; update login callbacks, installation instructions, and tests.
- Merge repository rule checks into the main CI workflow and simplify the Chinese and English READMEs.
- Maintain this fork for personal Windows use with Simplified Chinese and English only.
- Use local VSIX installation and Windows CI; refresh the development launch tasks and bundled dependency notices.

### Removed
- Japanese and Korean translations, Marketplace publishing, public issue templates, unused documentation assets and historical adaptation plans.
- Deprecated `leetcode.showCommentDescription` support and migration from plain-text cookie storage; use `leetcode.showDescription` and sign in again if needed.

## [0.24.3] - 2026-10-22
### Changed
- Move CI, Marketplace, VS Code, and MIT license badges to the top of all README variants.
- Replace the retired Shields.io Marketplace badge and the unreliable static badges.

## [0.24.2] - 2026-10-22
### Fixed
- Use absolute GitHub links for the changelog in all README variants so the Marketplace listing resolves them correctly.

## [0.24.1] - 2026-10-22
### Added
- Tests for problem cache/endpoint isolation and authentication state transitions.
- Release invariant check: a release commit must be `release: X.Y.Z`, and `vX.Y.Z` must point to that same commit.

### Changed
- Upgrade TypeScript to 5.9, ESLint to 9 flat config, and typescript-eslint to 8.

## [0.24.0] - 2026-10-22
### Fixed
- URL-encode problem slugs in submission and test endpoints.

### Removed
- Removed the telemetry implementation and the `leetcode.allowReportData` setting. This telemetry was inherited from the upstream project (upstream commit 71264fa, where it defaulted to true); it was not introduced by this fork. This fork had already defaulted it to false and required VS Code telemetry, and it is now removed completely. There is no feature impact.
- Removed references to the `analysis.leetcode.cn` and `analysis.lingkou.xyz` analytics endpoints.

### Added
- A privacy regression test and a RepoRules guard that reject reintroducing telemetry.
- Unit tests for global problem pagination and submission/polling, plus a VS Code Extension Host smoke test skeleton.
- Expanded edge-case tests for problem mapping, favorite-list caching and empty data, submission failures, and documentation consistency.
- Added security and input-boundary tests for markdown rendering, cookie/login parsing, and the problem-file language matrix.
- Added global-state migration/profile tests and axios-adapter tests for favorites, questions, solutions, and company tags.
- Added problem-collection dedupe tests, GraphQL failure/retry tests, Webview CSP assertions, and hardened the integration runner environment.

## [0.23.2] - 2026-10-21
### Fixed
- Align English, Japanese, and Korean READMEs with the global LeetCode site: use leetcode.com examples instead of leetcode.cn.
- Add a RepoRules check that rejects leetcode.cn/Chinese-site references in non-Chinese READMEs.

## [0.23.1] - 2026-10-21
### Added
- Japanese and Korean localization for the extension manifest, runtime messages, and README.
- README language switcher now covers English, Simplified Chinese, Japanese, and Korean.

## [0.23.0] - 2026-10-21
### Added
- LeetCode Global support: default endpoint `leetcode`, `problemsetQuestionListV2` problem loading, GraphQL daily challenge, `Top 100 Liked Questions`, and global favorites/submissions.
- README notes for switching between leetcode.com and leetcode.cn.
- Automatic endpoint selection (auto): mainland China time zones default to LeetCode China, other regions default to LeetCode.

## [0.22.1] - 2026-10-21
### Fixed
- Show a signing-in state instead of the sign-in welcome while a stored cookie is being validated.
- Show a LeetCode Community welcome message while the initial authentication state is unresolved.
- Keep the sign-in welcome and title-bar button hidden until the extension has resolved the authentication state.
- Localize Hot 100 and favorite-list question titles by mapping their slug to the loaded problem list.

## [0.22.0] - 2026-10-21
### Added
- Enhanced problem search: id, Chinese/English title, slug, tags, and companies (with tags/companies shown in the picker detail).

## [0.21.0] - 2026-10-21
### Added
- Add a Daily Challenge tree entry from the CN homepage SSR data.
- Add a problem to a chosen favorite list.
- Remember the last custom test input per problem and offer it as a saved test case.
- Show a line diff between expected and actual output in submission results.
- Add a Hot 100 tree entry backed by the official HOT 100 list.
- Paginate submission history and filter it by status.
- Cache favorite lists, Hot 100, and the daily challenge for five minutes.
- Group the Favorite category by favorite list and show each list's questions.
- Show a problem's submission history from the tree context menu or command palette, with status, language, date, runtime, and memory; selecting an entry opens the submission on LeetCode.


## [0.20.1] - 2026-10-21
### Fixed
- Retry transient GraphQL/network failures with exponential backoff and honor `Retry-After`; all requests now have a 20-second timeout.
- Cover retry/backoff and unauthorized-response behavior with unit tests.

## [0.20.0] - 2026-10-21
### Fixed
- Complete the cookie and Web Authorization flow: OAuth callback errors, duplicate callbacks, endpoint-aware prompts, and an explicit open-login-page action.
- Web Authorization continues to use the installed extension ID rather than the official one.
- Sign out and ask for a fresh login when an authenticated request returns 401/403.

### Changed
- Upgrade axios, fs-extra, highlight.js, lodash, and markdown-it to current stable versions.
- Register only the languages used by LeetCode, reducing the bundle from 2.82 MB to 1.36 MB and the VSIX from 653 KB to 316 KB.
- Resolve company tag names through the endpoint's `companyTagsV2` list so the Company tree uses localized names instead of slugs.
- Show a native view progress spinner and a loading message while the problem tree refreshes after sign-in.
- Localize the remaining command, quick-pick, dialog, and webview strings; add a test that every used `l10n` key has a Chinese translation.

## [0.19.4] - 2026-10-21
### Fixed
- Web Authorization now redirects to the installed extension ID instead of the hardcoded official `leetcode.vscode-leetcode` ID.

## [0.19.3] - 2026-10-21
### Changed
- Removed the last `url` module import; `URLSearchParams` is now the Node global.
- Documented that the DEP0169 `url.parse()` warning during `code --install-extension` comes from the VS Code CLI, not the extension.
- Marketplace README now matches 0.19.3.

## [0.19.2] - 2026-10-21
### Changed
- Marketplace listing now uses the Simplified Chinese `README.md`; the English version moved to `README.en.md`.

## [0.19.1] - 2026-10-21
### Fixed
- Default `leetcode.endpoint` is now `leetcode-cn`, so a leetcode.cn cookie is not sent to leetcode.com.
- Sign-in failures now show and log the endpoint being validated plus the `isSignedIn` result (never the cookie).

## [0.19.0] - 2026-10-20
### Changed
- Community fork published as `yanxijian.vscode-leetcode-community` (display name `LeetCode Community`).
- Replaced the bundled `vsc-leetcode-cli` with direct GraphQL/REST calls: problem list, statements, solutions, submissions, tests, and favorites.
- Cookies now live in VS Code `SecretStorage`; multi-account sessions are stored locally.
- Requires VS Code 1.90+ and no longer requires Node.js, `leetcode.nodePath`, or `leetcode.useWsl`.
- Webviews use `asWebviewUri` with a nonce-based CSP; telemetry is opt-in and respects VS Code telemetry.
- Added English and Simplified Chinese UI/README resources.

## [0.18.4]
### Added
- change graphql path

## [0.18.3]
### Added
- re-add cookie-based login method  [PR#969](https://github.com/LeetCode-OpenSource/vscode-leetcode/pull/969)

## [0.18.2]
### Fixed
- fix login issue on VS Code Insiders  [PR#968](https://github.com/LeetCode-OpenSource/vscode-leetcode/pull/968)

## [0.18.1]
### Changed
- change login way and add tracking logic option [PR#944](https://github.com/LeetCode-OpenSource/vscode-leetcode/pull/944)

## [0.18.0]
### Added
- Add `star` command in shortcuts [PR#601](https://github.com/LeetCode-OpenSource/vscode-leetcode/pull/601)
- Add an option to disable endpoint translation [#389](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/389)

### Changed
- LeetCode actions are moved into sub-menu: `LeetCode` in the editor context menu. [PR#712](https://github.com/LeetCode-OpenSource/vscode-leetcode/pull/712)

### Fixed
[Bugs fixed](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues?q=is%3Aissue+milestone%3A0.18.0+is%3Aclosed+label%3Abug)

## [0.17.0]
### Added
- Add TypeScript support [#560](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/560)

### Changed
- Update the UI resources [PR#561](https://github.com/LeetCode-OpenSource/vscode-leetcode/pull/561)

## [0.16.2]
### Added
- New Category: `Concurrency` [CLI#42](https://github.com/leetcode-tools/leetcode-cli/pull/42)
- New configuration to better configure how to show the description [#310](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/310)

### Removed
- Removed the deprecated setting `leetcode.enableShortcuts` [PR#520](https://github.com/LeetCode-OpenSource/vscode-leetcode/pull/520)
- Removed the deprecated setting `leetcode.outputFolder` [PR#521](https://github.com/LeetCode-OpenSource/vscode-leetcode/pull/521)

## [0.16.1]
### Added
- Can show the problem in current workspace even if it's not a LeetCode workspace [#373](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/373)

### Fixed
[Bugs fixed](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues?q=is%3Aissue+milestone%3A0.16.1+is%3Aclosed+label%3Abug)

## [0.16.0]
### Added
- Support GitHub login and LinkedIn login [PR#496](https://github.com/LeetCode-OpenSource/vscode-leetcode/pull/496)

## [0.15.8]
### Added
- Add a new command `Sign In by Cookie` to workaround the issue that [users cannot login to LeetCode](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/478). Please check the [workaround steps](https://github.com/LeetCode-OpenSource/vscode-leetcode/tree/master#%EF%B8%8F-attention-%EF%B8%8F--workaround-to-login-to-leetcode-endpoint) for more details!

### Changed
- Update the explorer icons to be align with the VS Code design [#460](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/460)

## [0.15.7]
### Fixed
[Bugs fixed](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues?q=is%3Aissue+milestone%3A0.15.7+is%3Aclosed+label%3Abug)

## [0.15.6]
### Added
- Add a link to the solution page [#424](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/424)

### Fixed
[Bugs fixed](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues?q=is%3Aissue+milestone%3A0.15.6+is%3Aclosed+label%3Abug)

## [0.15.5]
### Added
- Add a link to the discussion page [#420](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/420)

### Fixed
[Bugs fixed](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues?q=is%3Aissue+milestone%3A0.15.5+is%3Aclosed+label%3Abug)

## [0.15.4]
### Added
- Add a new setting `leetcode.filePath`. Now users can use this setting to dynamicly specify the relative folder name and file name. [#PR380](https://github.com/LeetCode-OpenSource/vscode-leetcode/pull/380)

### Fixed
- Missing language `Rust` in the supported language list. [#PR412](https://github.com/LeetCode-OpenSource/vscode-leetcode/pull/412)
- Cannot show output when the answer is wrong. [#414](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/414)

## [0.15.3]
### Added
- Support `Pick One` [#263](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/263)
- Support toggling the favorite problems [#378](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/378)

### Changed
- Update the activity bar icon [#395](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/263)

### Fixed
[Bugs fixed](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues?q=is%3Aissue+milestone%3A0.15.3+is%3Aclosed+label%3Abug)

## [0.15.2]
### Added
- Prompt to open the workspace for LeetCode [#130](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/130)
- Support deleting sessions [#198](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/130)

### Fixed
[Bugs fixed](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues?q=is%3Aissue+milestone%3A0.15.2+is%3Aclosed+label%3Abug)

## [0.15.1]
### Fixed
[Bugs fixed](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues?q=is%3Aissue+milestone%3A0.15.1+is%3Aclosed+label%3Abug)

## [0.15.0]
### Added
- Auto refresh the explorer after submitting [#91](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/91)
- Add a editor shortcut `Description` to show the problem description [#286](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/286)
- Support customizing the shortcuts in editor [#335](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/335)

### Fixed
[Bugs fixed](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues?q=is%3Aissue+milestone%3A0.15.0+is%3Aclosed+label%3Abug)

## [0.14.3]
### Added
- Support interpolation for `leetcode.outputFolder` settings [#151](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/151)

### Fixed
[Bugs fixed](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues?q=is%3Aissue+is%3Aclosed+milestone%3A0.14.3+label%3Abug)

## [0.14.2]
### Added
- Add the `All` category in the LeetCode Explorer [#184](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/184)
- Add shortcuts for `Show top voted solution` [#269](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/269)

### Fixed
[Bugs fixed](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues?q=is%3Aissue+is%3Aclosed+label%3Abug+milestone%3A0.14.2)

## [0.14.1]
### Added
- Add setting `leetcode.showCommentDescription` to specify whether including the problem description in comments or not [#287](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/287)

## [0.14.0]
### Added
- Add setting `leetcode.enableShortcuts` to specify whether to show the submit/test shortcuts in editor [#146](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/146)
- Add `Like` and `Dislike` counts in the problem description [#267](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/267)

### Changed
- Improve the `Preview`, `Result` and `Solution` views

### Fixed
[Bugs fixed](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues?q=is%3Aissue+label%3Abug+is%3Aclosed+milestone%3A0.14.0)

## [0.13.3]
### Fixed
- Fix the bug that the extension cannot be activated

## [0.13.2]
### Added
- Add a setting `leetcode.enableStatusBar` to specify whether the LeetCode status bar will be shown or not [#156](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/156)
- Add a setting `leetcode.nodePath` to specify the `Node.js` executable path [#227](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/227)

### Changed
- Update the activity bar icon, See: [#225](https://github.com/LeetCode-OpenSource/vscode-leetcode/pull/225)

### Fixed
[Bugs fixed](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues?q=is%3Aissue+milestone%3A0.13.2+is%3Aclosed+label%3Abug)

## [0.13.1]
### Fixed
[Bugs fixed](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues?q=is%3Aissue+milestone%3A0.13.1+is%3Aclosed+label%3Abug)

## [0.13.0]
### Added
- Preview the problem description [#131](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/131)
- Show top voted solution [#193](https://github.com/LeetCode-OpenSource/vscode-leetcode/pull/193)
- Add `collapse all` for the explorer [#197](https://github.com/LeetCode-OpenSource/vscode-leetcode/pull/197)

### Fixed
[Bugs fixed](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues?q=is%3Aissue+is%3Aclosed+milestone%3A0.13.0+label%3Abug)

## [0.12.0]
### Added
- Add new command `LeetCode: Switch Default Language` to support switching the default language [#115](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/115)
- Support `PHP` and `Rust` ([#83](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/83), [#103](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/103))

### Fixed
- Cannot retrieve time and memory result [#105](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/105)
- Power operator displays in a wrong way [#74](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/74)

## [0.11.0]
### Added
- Add new setting: `leetcode.outputFolder` to customize the sub-directory to save the files generated by 'Show Problem' [#119](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/119)
- Add tooltips for sub-category nodes in LeetCode Explorer [#143](https://github.com/LeetCode-OpenSource/vscode-leetcode/pull/143)

### Changed
- Now when triggering 'Show Problem', the extension will not generate a new file if it already exists [#59](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/59)

### Fixed
- Log in timeout when proxy is enabled [#117](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/117)

## [0.10.2]
### Fixed
- Test cases cannot have double quotes [#60](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/60)

## [0.10.1]
### Changed
- Refine the README page.

## [0.10.0]
### Added
- Add an extension setting to hide solved problems [#95](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/95)
- Support categorize problems by company, tag, difficulty and favorite [#67](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/67)

## [0.9.0]
### Changed
- Improve the experience of switching endpoint [#85](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/85)
- Use web view to show the result page [#76](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/76)


## [0.8.2]
### Added
- Add Code Lens for submitting the answer to LeetCode

### Fixed
- Fix the bug that the extension could not automatically sign in [#72](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/72)

## [0.8.1]
### Changed
- Upgrade LeetCode CLI to v2.6.1

## [0.8.0]
### Added
- Support LeetCode CN [#50](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/50)
- Support Windows Subsystem for Linux [#47](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/47)

## [0.7.0]
### Added
- Add spinner when submitting code [#43](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/43)

## [0.6.1]
### Added
- Add Sign in action into LeetCode Explorer title area [#25](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/25)

## [0.6.0]
### Changed
- Move LeetCode explorer into activity bar [#39](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/39)

### Added
- Support trigger test & submit in the editor [#37](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/37)

### Fixed
- Fix the bug that cannot show problem [#41](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/41)

## [0.5.1]
### Fixed
- Fix the bug when user's path contains white spaces [#34](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/34)

## [0.5.0]
### Added
- Support submit and test solution files from the file explorer in VS Code ([#24](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/24), [#26](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/26))

## [0.4.0]
### Added
- Support locked problem [#20](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/20)

### Changed
- Simplify the command 'LeetCode: Test Current File' to 'LeetCode: Test' [#18](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/18)
- Will automatically save current file when 'LeetCode: Test' command is triggered [#17](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/17)

## [0.3.0]
### Added
- Test current solution file [#15](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/15)

## [0.2.1]
### Fixed
- Fix the wrong icon bug in LeetCode Explorer [#9](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/9)
- Fix the switch session bug when login session is expired [#12](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/12)

## [0.2.0]
### Added
- Support setting the default language to solve problems [#5](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/5)

### Fixed
- When user cancels login, no further actions will happen [#10](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/10)

## [0.1.2]
### Fixed
- Fix the duplicated nodes in LeetCode Explorer bug [#6](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/6)

## [0.1.1]
### Fixed
- Fix a bug in LeetCode Explorer [#3](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/3)
- Remove the show problem command from command palette [#4](https://github.com/LeetCode-OpenSource/vscode-leetcode/issues/4)

## [0.1.0]
### Added
- Sign in/out to LeetCode
- Switch and create session
- Show problems in explorer
- Search problems by keywords
- Submit solutions to LeetCode
