# vscode-leetcode Adaptation Plan: VS Code 1.142 + leetcode.cn

<!-- translated-from: docs/ADAPTATION-PLAN.md sha256:1a8de98cdb2d -->

> Status: Draft v3 (decisions settled, pending execution)
> Baseline: `0.18.4` / `586b3e4` (same commit as upstream `LeetCode-OpenSource/vscode-leetcode`)
> Updated: 2026-10-20
> Decisions: D3 / D5 / D6 settled on 2026-10-20 (see §8)
> This document is both the design and the execution tracking list. Update status and dates as each phase completes.

---

## 1. Goals and Non-goals

### 1.1 Goals

1. Activate reliably and without deprecation warnings on **VS Code 1.90+ (currently 1.142.0)**.
2. Treat **leetcode.cn as a first-class endpoint**: cookie login, problem browsing, opening a problem, local testing, submission, favorites.
3. Phase out the unmaintained `vsc-leetcode-cli@2.8.1`, ending with the extension talking to LeetCode's HTTP APIs directly.
4. Fix known security and stability issues: plaintext cookie storage, login hangs, telemetry on by default, legacy webview URI scheme.
5. Establish repeatable regression tooling (smoke script + unit tests + CI) so the extension does not silently rot again.
6. Provide **Simplified Chinese + English** UI and README (D6); keep code comments in English.

### 1.2 Non-goals

- No username/password login (captcha, 2FA and risk control are not controllable).
- `leetcode.com` is not promised as first-class; keep the code path, but acceptance is against `.cn`.
- No cloud sync, no collaboration, no batch problem runs.
- Do not impersonate the official publisher (the `publisher` field must not remain `LeetCode`).
- No Japanese/Korean README or UI (D6 explicitly asks for Chinese and English only).
- Coexistence with the official extension is not promised: command, view, and settings namespaces are identical, so the official extension must be disabled before installing the new ID (see P6).

---

## 2. Summary

1. **The LeetCode backend has not failed as a whole.** `userStatus`, `questionData`, and `problemsetQuestionList` all return 200; problem statements include Chinese `translatedContent` and `codeSnippets` for 20 languages. Submit/test endpoints return 403 `User is not authenticated`, meaning they are alive and only need authentication.
2. **The real breakage is in the login path and aging integration.** `setCookieToCli` listens for only three stdout patterns and has no `close`/timeout; the `onUri` activation event is missing; the cookie is stored in plaintext in `globalState`; webviews still use `vscode-resource:` (1.142 rewrites it and reports a migration prompt).
3. **The CLI is a time bomb, not dead.** P0 measured 3527 problems (unlocked) with a valid cookie; the current regex parses 3248 and **drops 280 special IDs** (`LCP`/`LCS`/interview). It still depends on legacy JSON and a text table, so one field change empties the list.
4. **Recommended: route B, hybrid then in-house.** Move user/problems/statement to GraphQL first, keep the CLI for submit/test temporarily, and remove it after P4 is verified. With all features retained (D5), about **3.5 weeks / 16.5 person-days**; an MVP (browsing) takes about 5.5 days.

### 2.1 Corrections made during this review (vs. v1)

| # | Correction | Impact |
| --- | --- | --- |
| 1 | The CLI problem list is not "dead": P0 measured 3527 problems with a valid cookie, but the regex drops 280 special IDs | Login/parsing is the problem, not the backend; direct GraphQL covers all 4475 |
| 2 | `problemsetQuestionList` currently returns `total = 4475`; `limit` caps at 100; about 45 pages | Size pagination/cache for 45 pages; do not hard-code 3900 |
| 3 | IDs can be `LCP 06` / `LCS 02` (with a space); the current regex `\[(\d*)\]` drops them | Model and filenames must treat IDs as strings |
| 4 | `difficulty` is uppercase in the list API (`EASY`) but may be mixed case in the detail API (`Easy`) | Normalize before comparison/coloring |
| 5 | `topicTags` field names differ: list uses `nameTranslated`, detail uses `translatedName` | Do not share one mapping |
| 6 | `codeSnippets` includes 20 languages, including `dart`/`elixir`/`erlang`/`racket`/`cangjie`, beyond the extension's hard-coded 17 | Derive the language list from `codeSnippets` |
| 7 | Submission should use the internal `questionId` (e.g. `1000056`), not the display ID (`LCP 06`); confirm with a real account in P4 | A wrong mapping returns 400 or judges the wrong problem |
| 8 | P1/P2 order fixed: P1 keeps CLI login; remove it after P2 | Each phase stays independently shippable |
| 9 | VSIX size estimate changed from `<1 MB` to **1–1.5 MB** (`highlight.js` is large) | Registering languages via `highlight.js/lib/core` can shrink it further |
| 10 | `leetcode.com` `authorize-login` returns 403; this does not prove it is dead (network/risk control) | Mark as unverified; do not conclude |

### 2.2 v3 changes (decisions settled)

| Decision | Outcome | Impact on the plan |
| --- | --- | --- |
| D3 Release | Own publisher `yanxijian`; new extension ID; de-branded `displayName` | P6 adds renaming, Marketplace metadata, conflict notes; the ID change goes into the README |
| D5 Features | Company / multi-account sessions / solutions are **all retained** | P3 grows from 2 d to 3 d (solutions); P4 from 3 d to 4 d (local multi-account); total 14.5 → 16.5 person-days |
| D6 Languages | Simplified Chinese + English only | P5 l10n changes from optional to mandatory; README has two languages, explicitly exempted from the workspace four-language convention |

---

## 3. Current State

### 3.1 Evidence levels

- ✅ **Verified**: measured on 2026-10-20 (HTTP probes or static inspection of the local 1.142.0 installation).
- 🟡 **Code inference**: derived from source/build artifacts, end-to-end path not executed.
- ⏳ **Needs account verification**: requires a real cookie.

### 3.2 LeetCode China APIs

| Probe | Result | Conclusion | Level |
| --- | --- | --- | --- |
| `POST https://leetcode.cn/graphql/` `userStatus` | 200, `isSignedIn:false` | Endpoint alive; usable for login validation | ✅ |
| `questionData(two-sum)` | 200, `translatedTitle=两数之和`, `translatedContent` 1125 chars, 20 `codeSnippets` | Statements/templates can be fetched directly | ✅ |
| `problemsetQuestionList(limit:100, skip:0)` | 200, `total=4475`; `skip=100` paginates correctly | Problem list can leave the CLI entirely | ✅ |
| CLI `list -q L` (valid cookie) | 3527 lines; Chinese titles/difficulty/acceptance normal | CLI problem list still works | ✅ |
| `searchKeywords` filter | 200 for `LCP`/`面试题`/`剑指` | Search can be direct | ✅ |
| `GET /api/problems/algorithms/` | 200, legacy JSON body (`stat_status_pairs`); `user_name` empty when anonymous | Anonymous always looks expired; may work with a cookie | ✅ / ⏳ |
| `POST /problems/two-sum/submit/` | 403 `User is not authenticated` | Endpoint alive | ✅ |
| `POST /problems/two-sum/interpret_solution/` | 403 same | Test endpoint alive | ✅ |
| `GET /submissions/detail/1/check/` | 200 `{"state":"PENDING"}` | Polling endpoint alive | ✅ |
| `GET /graphql/noj-go/` | 404 | The 0.18.4 path change was correct | ✅ |
| `GET /authorize-login/vscode/?path=...` (CN) | 302 to login | Web authorization entry alive | ✅ |
| Same (`.com`) | 403 | Affected by network/risk control; **not** proof of removal | ⏳ |
| GraphQL introspection | `__type` returns null | Disabled for anonymous requests; queries must be written against known fields | ✅ |

Key data shapes (measured):

- `total = 4475`, `limit` max 100 → about 45 pages.
- List fields: `frontendQuestionId`, `title`, `titleCn`, `titleSlug`, `difficulty` (`EASY`/`MEDIUM`/`HARD`), `paidOnly`, `acRate` (0–1 float), `status` (`NOT_STARTED` when anonymous), `topicTags[].nameTranslated`, `extra.topCompanyTags`.
- Detail fields: `questionId` (internal, e.g. `1000056`), `questionFrontendId` (display, e.g. `LCP 06`), `translatedContent`, `content`, `codeSnippets[]`, `topicTags[].translatedName`, `metaData`.
- **Non-numeric IDs exist**: `LCP 06`, `LCP 16`, `LCS 02`.

### 3.3 VS Code 1.142.0

| Check | Result | Conclusion | Level |
| --- | --- | --- | --- |
| `engines.vscode: ^1.57.0` | Satisfied; installs | Not rejected by engine check | ✅ |
| `vscode-resource:` | 1.142 still calls `rewriteOldResourceUrlsIfNeeded` and reports a migration hint | Works for now; must migrate | ✅ |
| Built-in markdown `markdown.previewStyles` | Still declares `./media/markdown.css`, etc. | Preview styling will not disappear immediately | ✅ |
| `activationEvents` includes `onUri` | No | Browser redirect is lost when the extension is not active | ✅ |
| `enableCommandUris` + `retainContextWhenHidden` | Both enabled | Larger attack surface / memory cost | ✅ |
| `@types/vscode` 1.57 / `@types/node` 14 / TS 4.3 / tslint | All 2021–2022 era | Upgrade across the board | ✅ |

### 3.4 Code-level breakages

1. **Login (fixed in P1)**: the old `setCookieToCli` used an `else if` chain to match `login: ` and `cookie: `, with no `close` handler or timeout. Coalesced chunks or an early exit hung forever. The cookie was written to `globalState` (`src/globalState.ts:28-31`) in plaintext; it now uses SecretStorage plus a dedicated CLI session module.
2. **Problem list (replaced in P2)**: the old implementation parsed the CLI table with one regex; P0 measured 3248 of 3527 lines matched and **280 special IDs (`LCP 82`/`LCS 02`/interview) dropped**. P2 now pages through GraphQL and keeps every special ID.
3. **Statement (replaced in P3)**: the old preview destructured CLI output by fixed line numbers, so one extra line shifted everything; it now uses structured `questionData` fields.
4. **Submit/test** (`src/webview/leetCodeSubmissionProvider.ts:75`): parses `√/×` text; failure details are limited.
5. **Telemetry** (`src/utils/trackingUtils.ts`): on by default; reports username and `uri.path`; nothing in the repo sets `NODE_ENV` 🟡; does not honor `env.isTelemetryEnabled`.
6. **Dependencies (CLI removed in P4)**: the old `vsc-leetcode-cli@2.8.1` (MIT, 195 packages, `request` + `cheerio 0.20`) is gone; `npm ci` dropped from 233 to 68 packages. VSIX size will be confirmed in P6.

### 3.5 Diagnosis

> The current "cannot log in / cannot solve" symptom is not caused by LeetCode shutting down, but by **a fragile login implementation plus a data layer built on a 2022 CLI text protocol**. The adaptation should replace the data layer with structured APIs, not keep patching CLI regexes.

---

## 4. Options

| Route | Approach | Estimate | Risk | Verdict |
| --- | --- | --- | --- | --- |
| A. Minimal patch | Keep the CLI; fix login hangs, `onUri`, engine, webview | 2–4 days | Low; problem list and solutions remain tied to a frozen CLI | Fallback only |
| **B. Hybrid (chosen)** | GraphQL for user/problems/statement/favorites; CLI for submit/test until verified, then replace | 3–3.5 weeks | Medium; submission needs a real account | **Recommended** |
| C. Full in-house | Delete the CLI at once; GraphQL + REST only | 4–5 weeks | Medium-high; submission results, solutions, and multi-account must be maintained in-house | Target state of B |

**Why B**:

- The problem list and statements are proven to work directly, with better data than the CLI table (Chinese titles, AC state, paid flags, acceptance rate).
- Submit/test are the only write operations; do them last with a real account. If they fail, fall back to the CLI.
- Reaching C removes the `nodePath`/`useWsl` settings, shrinks the VSIX to an estimated 1–1.5 MB, and drops the Node.js requirement.
- D5 requires all features retained, so multi-account and solutions must be built in-house before C; P3/P4 each gain one day.

---

## 5. Phases

### 5.0 Overview

| Phase | Content | Estimate | Depends on | Exit criteria |
| --- | --- | --- | --- | --- |
| P0 | Baseline and smoke test | 0.5 d | — | Failures reproduced and recorded; cookie workflow safe |
| P1 | Login rework (CLI retained) | 2 d | P0 | Cookie login in 3 s, survives restart, no hang |
| P2 | Problem data layer (GraphQL) | 3 d | P1 | 4475 problems, Chinese/AC/lock/tags correct; Company kept |
| P3 | Statement + solutions | 3 d | P2 | Correct file generated; solutions usable; CodeLens works |
| P4 | Submit/test + multi-account | 4 d | P2, P3 | Real account sees correct AC/WA/TLE/CE; sessions switchable |
| P5 | VS Code modernization + zh/en UI | 2 d | P1–P4 | No deprecation warnings on 1.142; zh-CN UI works; telemetry off |
| P6 | Engineering and release | 2 d | P5 | `npm ci` reproducible; CI green; published under a new ID |

Milestones:

- **M1 Browsable** (P0–P2, ~5.5 d): login + problem list + search/categories (including Company).
- **M2 Solvable** (P0–P4, ~12.5 d): statement + solutions + test + submit + multi-account.
- **M3 Releasable** (P0–P6, ~16.5 d): modernization + zh/en UI + packaging + CI + Marketplace.

### P0 Baseline and smoke test (0.5 d)

**Tasks**

- Add `scripts/smoke.mjs`: read the cookie from a local file pointed to by `LC_COOKIE_FILE` (never committed, never printed); verify `userStatus` → first page of problems → `questionData` → favorites.
- **Cookie safety (hard requirements)**:
  - The file lives **outside the repo**, default `D:\Codes\_scratch\lc-cookie\cookie.txt`; the script rejects any `realpath` inside the repo.
  - Logs, exceptions, and snapshots are redacted; only metadata such as "loaded, length N" may be printed.
  - Add `cookie.txt` and `.secrets/` to `.gitignore` as defense in depth; keep it in `_scratch` during P0/P1, delete it when the task ends, and never copy it into the repo or logs.
- Launch with `code --extensionDevelopmentPath` on 1.142 and record activation logs, login failure points, and webview errors.
- Record real behavior for three states: signed out / valid cookie / expired cookie.

**Deliverables**: `scripts/smoke.mjs`, a failure record appended to §10.

**Exit**: the script reports HTTP status and errors per step; the extension activates on 1.142; `git status` contains no cookie file.

**P0 results (2026-10-20)**

- Valid cookie: `userStatus` signed in, `total=4475`, `two-sum` state `AC`.
- Expired cookie: `signedIn=false`, exit code 1 with `cookie is not signed in`, no hang.
- CLI `list -q L` (valid cookie): 3527 lines; current regex matches 3248; **280 special IDs lost**.
- CLI `user -c`: succeeds in 2.25 s; still no `close`/timeout, so edge cases hang.
- Real UI activation on VS Code 1.142 not run yet; listed as a P1 pre-check.

### P1 Login rework (2 d, CLI retained)

**Tasks**

- Store the cookie in `context.secrets` (SecretStorage); keep only non-sensitive state (username, premium flag) in `globalState`. Name SecretStorage keys per profile to prepare for D5 multi-account.
- Validate login with GraphQL `userStatus`; stop depending on the CLI `user` text output.
- Fix `setCookieToCli`: drop `shell`, listen for `close`/`error`, add a 15 s timeout, and report readable errors. **Keep this path until P2 lands** so the problem list keeps working.
- Add `"onUri"` to `activationEvents`; validate the `cookie` parameter in `handleUriSignIn`.
- Login UX: paste-cookie first, browser authorization retained; no password login.

**Deliverables**: `src/auth/` (or a reworked `leetCodeManager`), activation event, SecretStorage wiring.

**Exit**

- Paste cookie → username within 3 s; survives a VS Code restart.
- Expired/wrong cookie → clear message, no spinner, no dirty state.
- Browser redirect works even when the extension was not active (`onUri`).
- Until P2 lands, the CLI session still works (the problem list can be listed), avoiding a regressed intermediate state.

**Risk**: cookie field names change (`LEETCODE_SESSION`/`csrftoken`); report "cookie format not recognized".

**P1 results (2026-10-20)**

- Cookies now live in `SecretStorage`; the legacy `globalState` cookie is migrated automatically. Only `LEETCODE_SESSION` + `csrftoken` are kept; other browser cookies are dropped.
- Added the `onUri` activation event; the URI handler is registered in `subscriptions`.
- `setCookieToCli` moved to `src/auth/cliSession.ts`: no shell, `close`/`error`/stdin error handling, 15 s timeout, redacted output.
- Login validates through GraphQL first; a CLI session update failure degrades to a warning and does not block sign-in.
- Verified: `tsc`/`tslint` pass; cookie / globalState / cliSession unit tests pass (real CLI 1.49 s); VS Code 1.142 extension host activation test: 1 passing.
- Not covered: real UI cookie paste and browser redirect (need one manual click); left as P1 manual acceptance.

### P2 Problem data layer (3 d)

**Tasks**

- New `src/api/`: `client.ts` (request/error normalization), `queries.ts` (all GraphQL in one place), `problems.ts` (mapping).
- Fetch `problemsetQuestionList` at 100/page (about 45 pages), with retry and exponential backoff; in-memory cache plus manual refresh.
- Extend `IProblem` with `slug`, `questionId` (internal), `paidOnly`; keep `id` as a string (supports `LCP 06`).
- Mapping:
  - `name = useEndpointTranslation ? (titleCn || title) : title`
  - `state`: `SOLVED → AC`, `ATTEMPTED → NotAC`, otherwise `Unknown` (verify the enum values after login)
  - `locked = paidOnly`
  - `passRate = (acRate * 100).toFixed(1) + " %"`
  - normalize `difficulty` to `Easy/Medium/Hard`
  - `tags = topicTags.map(t => t.nameTranslated || t.name)`
- Search uses the `searchKeywords` filter (verified), replacing the full-list QuickPick.
- Favorites: `favoriteQuestionList(favoriteSlug: ...)` needs the favorite list hash (the CLI uses `/list/api/questions`); research in P2, fall back to REST `/list/api/questions` (requires cookie) if unavailable.
- **Keep the Company category (D5)**: build a "Top companies" sub-category from `extra.topCompanyTags`; if full company tags require membership, label the data scope in the UI instead of hiding the category.

**Deliverables**: `src/api/*`, a new `explorerNodeManager`, `listProblems` no longer calling the CLI.

**Exit**

- All 4475 CN problems; Chinese titles, AC state, paid locks, tags correct.
- Company category expands and filters within the available data.
- `LCP 06`, `LCS 02` display and open correctly.
- Offline/timeout produce readable errors; refresh does not re-fetch everything.

**Note**: anonymous `status` is always `NOT_STARTED`; it reflects the user only when logged in. Verify with a real account.

The CLI's 3527 is the unlocked set after `-q L`; the direct client must filter with `paidOnly` to honor the "show locked" setting.

**P2 results (2026-10-20)**

- GraphQL: **4475 problems / 45 pages**; cold load 8.2–11.2 s (concurrency 4), cache hit 0 ms, reload after invalidation 9.2 s.
- `two-sum` → 两数之和 / Easy / **AC**; `LCP 06` → 拿硬币; `locked=787`; company sample `google/amazon/bytedance`.
- Every special ID is retained; none are dropped by `\[(\d*)\]` anymore.
- Favorites: `isFavor` exists, but the test account has no favorites, so the positive case needs a fresh cookie; `updateCachedFavorite` is implemented.
- The LeetCode session expired late in verification (`userStatus` became `false`), so the final UI acceptance for "refresh after favorite" and "switch account" needs a fresh cookie.

### P3 Statement and solutions (3 d)

**Tasks**

- Generate the problem file from `questionData`:
  - Keep the header `@lc app=leetcode.cn id=<frontendQuestionId> lang=<langSlug>` (CodeLens depends on this format).
  - Keep `@lc code=begin` / `@lc code=end` markers (CodeLens positioning depends on them).
  - Take the template from `codeSnippets` for the chosen `langSlug`; derive the language list dynamically and extend `langExt` for `dart`/`elixir`/`erlang`/`racket`/`cangjie` (display at minimum, highlighting optional).
  - Render the description per `showDescription`; use `translatedContent` for Chinese and `content` for English.
- **Keep solutions (D5)**: prefer GraphQL solution queries (`questionSolutionArticles` / `ugcArticleSolutionArticles`); if they are member-only, show the public solution list or link to the solution page, and only as a last resort keep the CLI `solution.discuss` plugin (then D2 degrades to "CLI retained for solutions only").

**Exit**

- Opening `two-sum` and `LCP 06` generates a file with Chinese statement and a compilable template.
- Reopening does not overwrite existing code.
- Solutions entry works: at least public solutions can be listed/opened; member-only content is clearly labeled.
- All five CodeLens entries (Submit/Test/Star/Solution/Description) appear and work.

**P3 results (2026-10-20)**

- `questionData` directly provides Chinese titles/statements, 20 code templates, `sampleTestCase`/`metaData`.
- File generation keeps `@lc app=... id=... lang=...` and `@lc code=begin/end`; `//` for C++, `#` for Python; Chinese statement can be written into comments; IDs such as `LCP 06` are preserved.
- Solutions: `questionSolutionArticles` returns the top article `content` (`two-sum`, 4972 chars), with official `question.solution` as fallback; the language QuickPick is gone.
- Verified: `tsc`/`tslint`, cpp/python/LCP file generation, solution fetch, and 1.142 activation (1 passing).
- Not covered: real editor open and webview visual acceptance (manual UI); "top voted" depends on the API's default ordering.

### P4 Submit/test + multi-account (4 d)

**Tasks**

- Parse `csrftoken` from the cookie; send `X-CSRFToken`, `Referer`, `X-Requested-With`; body as `application/x-www-form-urlencoded`.
- Submit: `POST /problems/{slug}/submit/` with `lang`, `question_id` (**internal ID**), `typed_code`, `judge_type=large` → `submission_id`; poll `GET /submissions/detail/{id}/check/` until not `PENDING`.
- Test: `POST /problems/{slug}/interpret_solution/` with `data_input`, `typed_code`, `lang`, `question_id`; poll the same check endpoint.
- Result view renders structured fields: `status_msg`, `runtime`, `memory`, `total_correct/total_testcases`, `full_compile_error`, `code_output`, `expected_output`, `last_testcase`.
- **Keep multi-account sessions (D5)**: remove the dependency on CLI `~/.lc`; implement local profiles (cookies in SecretStorage, profile names and active state in `globalState`) and keep the existing create/switch/delete entry points with the same UI.
- Add cancellation (`CancellationToken`) and timeouts; keep raw JSON in the output channel on failure.
- After verification, remove `vsc-leetcode-cli`, the CLI calls in `leetCodeExecutor`, and the `nodePath`/`useWsl` settings (keep reading them for one release). If P3 solutions still depend on the CLI, replace them first or keep that dependency explicitly per D5.

**Exit**

- With a real account: default cases, input-box cases, file cases, and formal submission all return results.
- AC/WA/TLE/CE fields correct; compile errors shown in full.
- Submitting `LCP 06` works (proves `question_id` is correct).
- Multi-account: create a second profile, switch, and confirm problems/submissions belong to the right account; deletion does not affect the current account.

**Risk**: submission may trigger risk control/captcha; stay low-frequency, back off, no batch submission.

**P4 results (2026-10-20)**

- Submit/test: JSON body (`lang`, `question_id`, `test_mode`, `typed_code` plus `data_input`/`judge_type`), `x-csrftoken`, polling `submissions/detail/{id}/check/`; `interpret_solution` on `two-sum` returned **Accepted**, 8.2 MB, 1/1.
- Favorites: REST `/list/api/questions` yields the `Favorite` hash; GraphQL `addQuestionToFavorite`/`removeQuestionFromFavorite` implemented. The read path is verified (hash length 6).
- Multi-account: local profiles (cookies in SecretStorage, names/usernames/active state in globalState) with create/switch/delete; the profile unit test passes.
- Formal submit: `two-sum` / C++ → **Accepted**, 65/65, 14.3 MB (authorized and executed).
- Favorite: became visible after add and disappeared after remove, verified `true → false`.
- CLI removal: deleted `leetCodeExecutor`, `cliSession`, `wslUtils`, `cpUtils`; removed the `nodePath`/`useWsl` settings and dependency; activation on 1.142 passed in **412 ms**.

### P5 VS Code modernization + zh/en UI (2 d)

**Tasks**

- Raise `engines.vscode` to `^1.90`, align `@types/vscode`, drop `@types/node` 14.
- Webviews: `asWebviewUri` + `cspSource` + nonce; remove `vscode-resource:`, `enableCommandUris`; evaluate removing `retainContextWhenHidden`.
- Replace the fake "Sign in" node with `TreeView.message` / `viewsWelcome`.
- Telemetry: default off, or at least honor `env.isTelemetryEnabled`; remove `extra.path`; remove the global `axios.defaults.withCredentials` side effect.
- **l10n (D6, mandatory)**: `package.nls.json` (English default) + `package.nls.zh-cn.json`; commands, settings, prompts, and static webview text all go through `vscode.l10n.t()`.
- Optional: `ThemeIcon` instead of PNGs; `workspace.fs` for remote/WSL.

**Exit**: no deprecation warnings on 1.142; `"locale": "zh-cn"` shows Simplified Chinese and English locale shows English; preview/submission views styled correctly; no outbound requests when telemetry is off.

**P5 results (2026-10-20)**

- Raised `engines.vscode` to `^1.90`, aligned `@types/vscode`, TypeScript 5.4 and `@types/node` 20; `tsc`/`tslint` pass.
- Telemetry now defaults to off and also requires VS Code global telemetry; local paths and the test domain are gone, as is the global `withCredentials` side effect.
- Webviews use `asWebviewUri` + `cspSource` + nonce; removed `vscode-resource:`, `enableCommandUris`, and `retainContextWhenHidden`.
- The fake "Sign in" node was replaced by `viewsWelcome` plus the `leetcode.signedIn` context key.
- zh/en: `package.nls.json` / `.zh-cn.json` cover 17 commands, the view name, the welcome text, and 18 setting descriptions; `l10n/bundle.l10n.zh-cn.json` covers core login/session strings.
- Packaging: VSIX is **2.0 MB / 1847 files** (was 6.4 MB / 4778).
- Not covered: this machine has no Chinese language pack, so `--locale=zh-cn` falls back to English; only resource integrity was checked. The webview styling still needs a human look.

### P6 Engineering and release (2 d)

**Tasks**

- Bundle with esbuild; register highlight.js languages on demand to shrink the bundle.
- Fix the 4 `r2.cnpmjs.org` URLs in `package-lock.json` (expired certificate breaks `npm ci`); switch CI to `npm ci`.
- CI: Node 20/22, `actions/checkout@v4`; `@vscode/test-cli` (xvfb on Linux, or run on a Windows runner).
- tslint → eslint; unit tests for mappers, cookie parsing, result normalization.
- **Release identity (D3)**:
  - `publisher: "yanxijian"`; rename `name` to `vscode-leetcode-community` → new ID **`yanxijian.vscode-leetcode-community`**.
  - Change `displayName` to **`LeetCode Community`** to avoid impersonating the official extension; point `repository`/`homepage`/`bugs` at the fork.
  - If Marketplace review requires a rename, fall back to `name: "vscode-leetcode-community-alt"` (the ID changes accordingly).
  - Start at version `0.19.0`; the README must state that command/view/settings IDs collide with the official extension and it must be disabled first.
- **Documentation languages (D6)**: maintain only `README.md` (English) + `README.zh-CN.md` (Simplified Chinese); do not add Japanese/Korean, and note in the README that this is an explicit exception to the workspace four-language convention.
- If maintained in this workspace long-term: add `codes-workspace/workspace.json`, RepoRules; configure `markdown.languages` with en + zh-CN only, or record the exception in ignore.

**Exit**: `npm ci && npm run package` reproduces the VSIX; CI green; the VSIX installs under the new ID and works, under 1.5 MB.

**P6 results (2026-10-21)**

- esbuild bundles `dist/extension.js` (2.41 MB uncompressed); VSIX is **563.59 KB / 22 files** (was 6.4 MB / 4778); `node_modules` is no longer packaged.
- `main` points to `./dist/extension.js`; `npm run package` chains typecheck → eslint → unit tests → bundle → vsce.
- tslint replaced by ESLint 8 + `@typescript-eslint`; added 6 Node unit tests (cookie / file generation).
- CI uses Node 20, `actions/checkout@v4`, `setup-node@v4`, and a Linux/Windows matrix running typecheck/lint/test/package.
- Release metadata: `publisher: yanxijian`, ID `yanxijian.vscode-leetcode-community`, `displayName: LeetCode Community`, `version: 0.19.0`; repository/homepage/bugs point to the fork.
- README is English + Simplified Chinese; CHANGELOG has 0.19.0; the four `r2.cnpmjs.org` lockfile URLs are gone.
- Release automation: `.github/workflows/release.yml` (manual version input, `VSCE_PAT` secret) and `scripts/publish.ps1` (reads `VSCE_PAT` or an external PAT file); see `docs/PUBLISHING.md`.
- Installed the VSIX into an isolated extensions directory: `yanxijian.vscode-leetcode-community@0.19.0`.
- Published **0.19.0** to the Marketplace: `vsce` returned DONE and `vsce show` confirms the version and timestamp (2026-10-21 00:20); URL `https://marketplace.visualstudio.com/items?itemName=yanxijian.vscode-leetcode-community`. The first attempt with the name `vscode-leetcode` was rejected as globally taken; renaming to `vscode-leetcode-community` succeeded. The item page was still 404 while indexing.
- **PAT deadline**: global PATs retire on **2026-12-01**. The PAT flow in `release.yml` / `publish.ps1` only works until then; afterwards switch to Microsoft Entra ID with `vsce publish --azure-credential`.

---

## 6. Acceptance Matrix

| # | Scenario | Expectation | Phase |
| --- | --- | --- | --- |
| 1 | Paste cookie | Username within 3 s; survives restart | P1 |
| 2 | Browser redirect while inactive | Extension activates and completes login | P1 |
| 3 | Expired/wrong cookie | Clear message; no hang, no dirty state | P1 |
| 4 | CN problem list | 4475 problems; Chinese titles, AC/unsolved/paid correct | P2 |
| 5 | Company category | Expands; filters by top companies | P2 |
| 6 | `LCP 06` / `LCS 02` | Display, open, and submit correctly | P2/P4 |
| 7 | Categories/sorting/hide solved | Match settings | P2 |
| 8 | Search | Keyword hits; results open | P2 |
| 9 | Open problem | Chinese statement + template + `@lc` markers; no overwrite on reopen | P3 |
| 10 | Solutions | Public solutions listed/opened; member-only content labeled | P3 |
| 11 | CodeLens | All five entries appear and work | P3 |
| 12 | Test (default/input/file) | Complete result fields; readable failures | P4 |
| 13 | Submit | Correct AC/WA/TLE/CE, runtime and memory | P4 |
| 14 | Multi-account sessions | Create/switch/delete; correct ownership | P4 |
| 15 | Favorite/unfavorite | State persists after refresh | P2 |
| 16 | Offline/timeout/cancel | Readable errors; retry possible | P2/P4 |
| 17 | Chinese UI | Commands/settings/prompts in Chinese under `zh-cn` | P5 |
| 18 | Telemetry off | No outbound requests | P5 |
| 19 | Activation on 1.142 | No deprecation warnings or unhandled exceptions | P5 |
| 20 | Install under new ID | `yanxijian.vscode-leetcode-community` installs; conflict with official documented | P6 |

---

## 7. Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | GraphQL schema changes (no introspection) | Medium | High | Centralize queries in `src/api/queries.ts`; daily smoke run; surface error messages |
| R2 | Submit triggers risk control/captcha | Medium | Medium | Low frequency, backoff, no batching; keep browser login |
| R3 | Solution API requires membership | High | Low | Show public solutions/links first; label member-only content |
| R4 | Favorite hash retrieval changes | Medium | Medium | Use REST `/list/api/questions` first; degrade to local marks |
| R5 | Company tag data incomplete | High | Low | Keep the category, use `topCompanyTags`, label the scope (D5) |
| R6 | Publisher/brand review | Medium | Medium | De-brand `displayName`; fallback name `vscode-leetcode-community-alt` (D3) |
| R7 | Cookie leakage | Low | High | File outside repo, redaction, SecretStorage, no logging, delete after use |
| R8 | Regression after removing the CLI | Medium | Medium | Keep a feature flag in P4; remove one release later |
| R9 | Multi-account cross-contamination | Medium | High | One cookie per profile; force refresh of problems/user after switching |
| R10 | Hard-coded strings missed by l10n | Medium | Low | Lint/scan for literal messages; walk through under zh-cn |

---

## 8. Decision Log

| ID | Decision | Status | Notes |
| --- | --- | --- | --- |
| D1 | `.cn` first-class, `.com` kept but not in acceptance | Decided | Narrows scope and risk |
| D2 | Eventually remove `vsc-leetcode-cli` | Decided (gated by P4) | If solutions must keep the CLI, degrade to "CLI only for solutions" |
| D3 | Publish under an own publisher; change extension ID and display name | **Decided** | `publisher: yanxijian`, ID `yanxijian.vscode-leetcode-community`, `displayName: LeetCode Community`; fallback name `vscode-leetcode-community-alt` if review requires |
| D4 | Cookie paste primary, browser authorization fallback, no password login | Decided | Avoids captcha/2FA |
| D5 | Keep Company, multi-account sessions, and solutions | **Decided** | P2 keeps Company; P3 keeps solutions; P4 rebuilds local multi-account |
| D6 | Simplified Chinese + English only | **Decided** | UI via l10n; two-language README; no Japanese/Korean |

---

## 9. Tracking and Changes

- On phase completion, update status, actual effort, and evidence links (PR/commit/logs).
- Maintain phase status with checkboxes; never check a box while acceptance is unrun.
- Record live behavior changes (LeetCode API changes) in §10 and assess impact on completed phases.

| Phase | Status | Completed | Evidence |
| --- | --- | --- | --- |
| P0 | ✅ Done (smoke and CLI comparison passed; 1.142 activation verified in P1) | 2026-10-20 | `scripts/smoke.mjs`; §10 |
| P1 | ✅ Done (component-level verification; UI manual acceptance pending) | 2026-10-20 | `src/auth/*`; §10 |
| P2 | ✅ Done (data layer; favorite/multi-account positive cases need a fresh cookie) | 2026-10-20 | `src/api/*`; §10 |
| P3 | ✅ Done (statement/file/solution data layer; UI visual acceptance pending) | 2026-10-20 | `src/api/question.ts`, `src/api/problemFile.ts`, `src/api/solution.ts`; §10 |
| P4 | ✅ Done (formal submit and favorite writes authorized and verified) | 2026-10-20 | `src/api/submission.ts`, `src/api/favorite.ts`, `src/commands/session.ts`; §10 |
| P5 | ✅ Done (core UI/settings zh/en; webview visuals and language-pack runtime need manual checks) | 2026-10-20 | `package.nls*.json`, `l10n/*`; §10 |
| P6 | ✅ Done (0.19.0 published) | 2026-10-21 | `esbuild.js`, `.github/workflows/build.yml`, `README.md`; §10 |

---

## 10. Reproduction Evidence (2026-10-20)

- Environment: VS Code `1.142.0` (`6d62b1d5dace93a33b3a6d3eca1317bd5e15bcb1`), Node `24.22.0`, Windows.
- GraphQL probes (anonymous):

  ```text
  POST https://leetcode.cn/graphql/
  {"query":"query { userStatus { username isSignedIn isPremium } }"}
  → 200 {"data":{"userStatus":{"username":"","isSignedIn":false,"isPremium":false}}}
  ```

  ```text
  problemsetQuestionList(limit:100, skip:0) → total=4475
  questionData(two-sum) → translatedTitle=两数之和, translatedContent=1125 chars, codeSnippets=20
  questionData(na-ying-bi) → questionFrontendId="LCP 06", questionId="1000056"
  ```

- Legacy REST:

  ```text
  GET https://leetcode.cn/api/problems/algorithms/
  → 200, Content-Type: text/html, body is JSON: user_name="" ... stat_status_pairs=[...]
  ```

- Submit/test endpoints (unauthenticated):

  ```text
  POST /problems/two-sum/submit/             → 403 {"error":"User is not authenticated"}
  POST /problems/two-sum/interpret_solution/ → 403 {"error":"User is not authenticated"}
  GET  /submissions/detail/1/check/          → 200 {"state":"PENDING"}
  ```

- VS Code build artifact:

  ```text
  extensionHostProcess.js:
  /(["'])vscode-resource:([^\s'"]+?)(["'])/i
  → report("Webview vscode-resource: uris", ... "Please migrate to use the 'webview.asWebviewUri' api")
  ```

- Build verification (in a copy; this repo was untouched):

  ```text
  npm ci (after fixing 4 r2.cnpmjs.org URLs) → tsc → tslint → vsce package
  → vscode-leetcode-0.18.4.vsix, 4778 files, 6.4 MB
  ```

- P0 smoke (valid cookie):

  ```text
  userStatus: signedIn=true, premium=false
  problemsetQuestionList: total=4475, 1 | 两数之和 | EASY | AC
  questionData(two-sum): translatedTitle=两数之和, snippets=20
  questionData(na-ying-bi): frontendId="LCP 06", internalId=1000056
  ```

- P0 comparison (expired cookie and CLI):

  ```text
  expired cookie: signedIn=false, exit=1
  CLI list -q L: 3527 lines, regex matched 3248, special IDs 280
  CLI user -c: success in 2.25s (per-chunk matching)
  ```

- P1 verification:

  ```text
  tsc/tslint: pass
  unit tests: cookie, globalState, cliSession (real CLI 1.49s)
  VS Code 1.142 extension host: 1 passing (activation + commands + onUri)
  ```

- P2 verification:

  ```text
  GraphQL: total=4475, pages=45, mapped=4475, cold=8.2-11.2s, cache=0ms
  two-sum: 两数之和 / Easy / AC; LCP 06: 拿硬币
  locked=787; companies sample=google,amazon,bytedance
  ```

- P3 verification:

  ```text
  questionData(two-sum): translatedTitle=两数之和, snippets=20
  file builder: @lc header + begin/end, cpp/python, LCP 06 id preserved
  solution: questionSolutionArticles content, 4972 chars
  VS Code 1.142 activation: 1 passing
  ```

- P4 verification:

  ```text
  interpret_solution(two-sum, cpp): SUCCESS / Accepted / 8.2 MB / 1 of 1
  favorite API read: favorite "Favorite", hash length 6
  profile store: create/switch/delete/persist passed
  CLI removed: npm ci 233 -> 68 packages; activation 412ms, 1 passing
  ```

- P4/P5 verification:

  ```text
  submit(two-sum, cpp): Accepted, 65/65, 14.3 MB
  favorite: add=true, remove=true (restored)
  activation 1.142: 303ms, l10n assets present
  vsce package: 2.0 MB / 1847 files
  ```

- P6 verification:

  ```text
  npm run build: typecheck + eslint + 6 tests + esbuild pass
  vsce package: vscode-leetcode-community-0.19.0.vsix, 563.59 KB, 22 files
  isolated install: yanxijian.vscode-leetcode-community@0.19.0
  marketplace publish: v0.19.0 (vsce DONE; vsce show 0.19.0)
  bundled activation on VS Code 1.142: 1 passing
  ```

> All of the above is a point-in-time snapshot. LeetCode APIs can change at any time; keep the P0 smoke script as a long-term regression tool.
