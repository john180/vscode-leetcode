# vscode-leetcode 适配计划：VS Code 1.142 + leetcode.cn

> 状态：Draft v3（决策已定，待执行）
> 基线：`0.18.4` / `586b3e4`（与上游 `LeetCode-OpenSource/vscode-leetcode` 同一提交）
> 更新：2026-10-20
> 决策：D3 / D5 / D6 已确定（见 §8）
> 本文档既是方案，也是执行跟踪清单；每个阶段完成后更新状态与日期。

---

## 1. 目标与非目标

### 1.1 目标

1. 在 **VS Code 1.90+（当前 1.142.0）** 上稳定激活、无弃用告警。
2. **leetcode.cn 一等公民**：Cookie 登录、题库浏览、打开题目、本地测试、提交、收藏。
3. 分阶段摆脱已停更的 `vsc-leetcode-cli@2.8.1`，最终由扩展自己直连力扣 HTTP 接口。
4. 修掉当前已知的安全与稳定性问题：cookie 明文存储、登录挂起、默认遥测、webview 旧 URI scheme。
5. 建立可重复的回归手段（冒烟脚本 + 单测 + CI），避免再次"两年后才发现坏了"。
6. 界面与 README 提供 **简体中文 + English** 两套（D6）；代码注释保持英文。

### 1.2 非目标

- 不做账号密码登录（验证码/2FA/风控不可控）。
- 不承诺 `leetcode.com` 一等公民；保留代码路径，验收以 `.cn` 为准。
- 不做云端同步、不做多人协作、不做题目自动批跑。
- 不冒充官方发布者（`publisher` 不得继续使用 `LeetCode`）。
- 不做日语/韩语 README 与界面（D6 明确只要中英）。
- 不承诺与官方版共存：命令、视图、设置命名空间相同，安装新 ID 前需禁用官方版（见 P6）。

---

## 2. 结论摘要

1. **力扣后端没有整体失效。** `userStatus`、`questionData`、`problemsetQuestionList` 均返回 200，题干含中文 `translatedContent` 与 20 种语言的 `codeSnippets`；提交/测试端点返回 403 `User is not authenticated`，说明端点仍在，只差鉴权。
2. **真正的断点在登录链路与老旧集成。** `setCookieToCli` 只监听 stdout 的三种模式，没有 `close`/超时；`onUri` 激活事件缺失；cookie 明文进 `globalState`；webview 仍用 `vscode-resource:`（1.142 会重写并提示迁移）。
3. **CLI 是"定时炸弹"而非"已死"。** P0 已实测：有效 cookie 下 CLI 仍能列出 **3527 条**（未锁定），现有正则解析 3248 条，**280 条 `LCP`/`LCS`/面试题被丢弃**。题库仍依赖旧 JSON 与文本表格，字段一变就空。
4. **推荐路线 B：混合过渡 → 最终自研。** 先用 GraphQL 接管用户/题库/题干，CLI 暂管提交测试；P4 验证通过后删除 CLI。全部功能保留（D5）后预计约 **3.5 周 / 16.5 人日**，MVP（可浏览）约 5.5 天。

### 2.1 本次复核修正的点（相对 v1）

| # | 修正 | 影响 |
| --- | --- | --- |
| 1 | CLI 题库并非"已死"：P0 实测有效 cookie 下可列 3527 条；但现有正则丢弃 280 条特殊题号 | 故障在登录/解析，不在后端；直连 GraphQL 可覆盖全部 4475 条 |
| 2 | `problemsetQuestionList` 当前 `total = 4475`，`limit` 上限 100，约 45 页 | 分页与缓存设计按 45 页估算，不写死 3900 |
| 3 | 题号可能是 `LCP 06` / `LCS 02`（含空格），现有正则 `\[(\d*)\]` 会丢弃 | 数据模型与文件名必须按字符串处理 |
| 4 | `difficulty` 在列表接口是大写（`EASY`），详情接口可能混合大小写（`Easy`） | 必须归一化后再比较/着色 |
| 5 | `topicTags` 两个接口字段名不同：列表 `nameTranslated`，详情 `translatedName` | 不能共用同一个映射 |
| 6 | `codeSnippets` 含 `dart`/`elixir`/`erlang`/`racket`/`cangjie` 等 20 种，超出扩展硬编码的 17 种 | 语言列表改为从 `codeSnippets` 动态派生 |
| 7 | 提交应使用内部 `questionId`（如 `1000056`），不是展示 ID（`LCP 06`）；需 P4 用真账号确认 | 参数映射写错会 400 或判错题 |
| 8 | P1/P2 顺序修正：P1 保留 CLI 登录，P2 完成后再移除，避免中间态不可用 | 阶段可独立交付 |
| 9 | VSIX 体积预估从 `<1 MB` 改为 **1–1.5 MB**（`highlight.js` 全量较大） | 用 `highlight.js/lib/core` 按需注册可再降 |
| 10 | `leetcode.com` 的 `authorize-login` 返回 403，不能据此判定失效（可能网络/风控） | 标记为待验证，不作为结论 |

### 2.2 v3 变更（决策落定）

| 决策 | 结论 | 对计划的影响 |
| --- | --- | --- |
| D3 发布 | 自有 publisher `yanxijian`；新扩展 ID；`displayName` 去官方化 | P6 增加改名、Marketplace 元数据、冲突说明；ID 变化需写进 README |
| D5 功能 | Company / Session 多账号 / 题解**全部保留** | P3 由 2 d 增至 3 d（题解）；P4 由 3 d 增至 4 d（本地多账号）；总工期 14.5 → 16.5 人日 |
| D6 语言 | 只做简体中文 + English | P5 的 l10n 从"可选"改为"必做"；README 只两语言，明确是对工作区四语言约定的例外 |

---

## 3. 现状诊断

### 3.1 证据等级

- ✅ **已验证**：2026-10-20 实测（HTTP 探测或本机 1.142.0 安装包静态检查）。
- 🟡 **代码推断**：读源码/构建产物得出，未跑通完整链路。
- ⏳ **待账号验证**：需要真实 cookie 才能确认。

### 3.2 力扣中国接口

| 探测 | 结果 | 结论 | 等级 |
| --- | --- | --- | --- |
| `POST https://leetcode.cn/graphql/` `userStatus` | 200，`isSignedIn:false` | 端点可用，可做登录校验 | ✅ |
| `questionData(two-sum)` | 200，`translatedTitle=两数之和`，`translatedContent` 1125 字符，`codeSnippets` 20 种 | 题干/模板可直连 | ✅ |
| `problemsetQuestionList(limit:100, skip:0)` | 200，`total=4475`，翻页 `skip=100` 正常 | 题库可完全脱离 CLI | ✅ |
| CLI `list -q L`（有效 cookie） | 3527 行，中文标题/难度/通过率正常 | CLI 题库仍可用 | ✅ |
| `searchKeywords` 过滤 | 200，`LCP`/`面试题`/`剑指` 均返回结果 | 搜索功能可直连 | ✅ |
| `GET /api/problems/algorithms/` | 200，body 为旧 JSON（`stat_status_pairs`）；未登录时 `user_name` 为空 | 未登录必判过期；有 cookie 时可能可用 | ✅ / ⏳ |
| `POST /problems/two-sum/submit/` | 403 `User is not authenticated` | 端点仍在 | ✅ |
| `POST /problems/two-sum/interpret_solution/` | 403 同上 | 测试端点仍在 | ✅ |
| `GET /submissions/detail/1/check/` | 200 `{"state":"PENDING"}` | 轮询端点仍在 | ✅ |
| `GET /graphql/noj-go/` | 404 | 0.18.4 改路径是对的 | ✅ |
| `GET /authorize-login/vscode/?path=...`（CN） | 302 跳登录 | Web 授权入口仍在 | ✅ |
| 同上（`.com`） | 403 | 受网络/风控影响，**不判定失效** | ⏳ |
| GraphQL introspection | `__type` 返回 null | 匿名请求关闭内省，只能按已知字段写查询 | ✅ |

关键数据形态（已实测）：

- `total = 4475`，`limit` 最大 100 → 约 45 页。
- 列表字段：`frontendQuestionId`、`title`、`titleCn`、`titleSlug`、`difficulty`（`EASY`/`MEDIUM`/`HARD`）、`paidOnly`、`acRate`（0–1 浮点）、`status`（匿名时 `NOT_STARTED`）、`topicTags[].nameTranslated`、`extra.topCompanyTags`。
- 详情字段：`questionId`（内部 ID，如 `1000056`）、`questionFrontendId`（展示 ID，如 `LCP 06`）、`translatedContent`、`content`、`codeSnippets[]`、`topicTags[].translatedName`、`metaData`。
- **题号非纯数字**：`LCP 06`、`LCP 16`、`LCS 02` 均存在。

### 3.3 VS Code 1.142.0

| 检查 | 结果 | 结论 | 等级 |
| --- | --- | --- | --- |
| `engines.vscode: ^1.57.0` | 满足，可安装 | 不会因 engine 被拒 | ✅ |
| `vscode-resource:` | 1.142 仍 `rewriteOldResourceUrlsIfNeeded` 重写，并上报迁移提示 | 短期可用，必须迁移 | ✅ |
| 内置 markdown `markdown.previewStyles` | 仍声明 `./media/markdown.css` 等 | 预览样式短期不会丢 | ✅ |
| `activationEvents` 含 `onUri` | 否 | 未激活时浏览器回跳丢事件 | ✅ |
| `enableCommandUris` + `retainContextWhenHidden` | 均开启 | 攻击面/内存开销偏大 | ✅ |
| `@types/vscode` 1.57 / `@types/node` 14 / TS 4.3 / tslint | 均为 2021–2022 年水平 | 需整体抬版本 | ✅ |

### 3.4 代码层断点

1. **登录（P1 已修）**：原 `setCookieToCli` 用 `else if` 串联匹配 `login: `、`cookie: `，无 `close`/超时；chunk 合并或进程异常退出都会永久挂起。cookie 原先写入 `globalState`（`src/globalState.ts:28-31`），明文落盘；现改为 SecretStorage + 独立 CLI 会话模块。
2. **题库（P2 已替换）**：原实现用一条正则解析 CLI 表格，P0 实测 3527 行中 3248 行匹配、**280 行特殊题号（`LCP 82`/`LCS 02`/面试题）被丢弃**；P2 改为 GraphQL 全量分页，特殊题号全部保留。
3. **题干（P3 已替换）**：原预览按固定行号解构 CLI 输出，一行变化即错位；现改用 `questionData` 的结构化字段。
4. **提交/测试**（`src/webview/leetCodeSubmissionProvider.ts:75`）：解析 `√/×` 文本，失败详情表达力有限。
5. **遥测**（`src/utils/trackingUtils.ts`）：默认开启；上报 username 与 `uri.path`；`NODE_ENV` 判断在仓库内无任何设置点🟡；未接入 `env.isTelemetryEnabled`。
6. **依赖（P4 已移除 CLI）**：原 `vsc-leetcode-cli@2.8.1`（MIT，195 个包，`request` + `cheerio 0.20`）已删除；`npm ci` 从 233 个包降到 68 个，VSIX 体积待 P6 重新打包确认。

### 3.5 诊断结论

> 当前"登录不上/刷不了题"的主因不是力扣关站，而是**登录实现脆弱 + 数据层依赖一份 2022 年的 CLI 文本协议**。适配的重点应放在"把数据层换成结构化接口"，而不是继续修 CLI 的正则。

---

## 4. 方案选型

| 路线 | 做法 | 估时 | 风险 | 结论 |
| --- | --- | --- | --- | --- |
| A. 最小修补 | 保留 CLI，只修登录挂起、`onUri`、engine、webview | 2–4 天 | 低；题库/题解仍受 CLI 冻结牵制 | 作为回退方案，不采用 |
| **B. 混合过渡（采用）** | GraphQL 接管用户/题库/题干/收藏；CLI 暂管提交测试，验证后替换 | 3–3.5 周 | 中；提交需真账号验证 | **推荐** |
| C. 完全自研 | 一次性删 CLI，全部直连 GraphQL + REST | 4–5 周 | 中高；提交结果、题解、多账号要自己维护 | B 的目标态 |

**采用 B 的理由**：

- 题库/题干已证明可直连，数据比 CLI 表格更准（中文标题、AC 状态、付费标记、通过率）。
- 提交/测试是唯一写操作，放到最后用真账号验证，失败可回退到 CLI。
- 达成 C 后可直接去掉 `nodePath`/`useWsl` 设置，VSIX 预计 1–1.5 MB，且不再要求用户安装 Node。
- D5 要求保留全部功能，多账号与题解必须在 C 之前完成自研，故 P3/P4 各加 1 天。

---

## 5. 实施阶段

### 5.0 总览

| 阶段 | 内容 | 估时 | 依赖 | 出口条件 |
| --- | --- | --- | --- | --- |
| P0 | 基线与冒烟 | 0.5 d | — | 能复现失败点并留档；cookie 安全流程可用 |
| P1 | 登录重做（保留 CLI 过渡） | 2 d | P0 | cookie 登录 3s 内成功、重启保持、失败不挂起 |
| P2 | 题库数据层（GraphQL） | 3 d | P1 | 4475 题完整、中文/AC/锁/标签正确；Company 保留 |
| P3 | 题干 + 题解 | 3 d | P2 | 打开题目生成正确文件；题解可用；CodeLens 正常 |
| P4 | 提交/测试 + 多账号 | 4 d | P2、P3 | 真账号 AC/WA/TLE/CE 正确；session 可切换 |
| P5 | VS Code 现代化 + 中英界面 | 2 d | P1–P4 | 1.142 无弃用告警；zh-CN 界面可用；遥测可关 |
| P6 | 工程化与发布 | 2 d | P5 | `npm ci` 可复现、CI 绿、以新 ID 发布 |

里程碑：

- **M1 可浏览**（P0–P2，约 5.5 d）：登录 + 题库 + 搜索/分类（含 Company）。
- **M2 可刷题**（P0–P4，约 12.5 d）：题干 + 题解 + 测试 + 提交 + 多账号。
- **M3 可发布**（P0–P6，约 16.5 d）：现代化 + 中英界面 + 打包 + CI + Marketplace。

### P0 基线与冒烟（0.5 d）

**任务**

- 新增 `scripts/smoke.mjs`：从环境变量 `LC_COOKIE_FILE` 指向的本地文件读取 cookie（不提交、不打印），依次验证 `userStatus` → 题库首页 → `questionData` → 收藏接口。
- **Cookie 安全流程（硬约束）**：
  - 文件只放在**仓库外**，默认 `D:\Codes\_scratch\lc-cookie\cookie.txt`；脚本校验 `realpath` 不在仓库目录内。
  - 日志、异常、快照一律脱敏；只允许输出"已加载，长度 N"这类元信息。
  - `.gitignore` 增加 `cookie.txt`、`.secrets/` 兜底；P0/P1 验证期间保留在 `_scratch`，任务结束必须删除，期间不得复制到仓库或日志。
- 用 `code --extensionDevelopmentPath` 在 1.142 上启动，记录激活日志、登录失败点、webview 报错。
- 记录"未登录 / 有效 cookie / 过期 cookie"三种状态的真实表现。

**产出**：`scripts/smoke.mjs`、一份失败点记录（附在本文档 §10）。

**验收**：脚本能逐步输出 HTTP 状态与错误；扩展在 1.142 能激活；仓库内 `git status` 不含 cookie 文件。

**P0 结果（2026-10-20）**

- 有效 cookie：`userStatus` 已登录，题库 `total=4475`，`two-sum` 状态为 `AC`。
- 过期 cookie：`signedIn=false`，脚本退出码 1 并提示 `cookie is not signed in`，无挂起。
- CLI `list -q L`（有效 cookie）：3527 行；现有正则匹配 3248 行，**280 行特殊题号丢失**。
- CLI `user -c`：正常流程 2.25s 成功；仍无 `close`/超时，异常场景会挂起。
- VS Code 1.142 的真实 UI 激活尚未执行，列为 P1 前置检查。

### P1 登录重做（2 d，保留 CLI 过渡）

**任务**

- cookie 改存 `context.secrets`（SecretStorage）；`globalState` 只留用户名/会员标记等非敏感状态。SecretStorage 的键按 profile 命名，为 D5 多账号预留结构。
- 登录校验直接调 GraphQL `userStatus`，不再依赖 CLI `user` 的文本输出。
- 修 `setCookieToCli`：`spawn` 去掉 `shell`；监听 `close`/`error`；加 15s 超时；失败给出可读原因。**P2 完成前保留此路径**，保证题库仍可用。
- `package.json` 补 `"onUri"` 激活事件；`handleUriSignIn` 校验 `cookie` 参数。
- 登录方式：Cookie 粘贴为默认，Web 授权保留；不做账号密码。

**产出**：`src/auth/`（或改造 `leetCodeManager`）、`package.json` 激活事件、SecretStorage 读写。

**验收**

- 粘贴 cookie 后 3s 内显示用户名；重启 VS Code 仍登录。
- 过期/错误 cookie 有明确提示，不转圈、不写脏状态。
- 浏览器回跳在"扩展未激活"场景也能触发（`onUri` 生效）。
- 在 P2 完成前，CLI 会话仍可用（题库能正常列出），避免中间态退化。

**风险**：cookie 字段名变化（`LEETCODE_SESSION`/`csrftoken`）→ 解析失败要报"cookie 格式不符"。

**P1 结果（2026-10-20）**

- cookie 改存 `SecretStorage`，旧 `globalState` cookie 自动迁移；只保留 `LEETCODE_SESSION` + `csrftoken`，其余浏览器 cookie 丢弃。
- 补 `onUri` 激活事件，URI handler 纳入 `subscriptions`。
- `setCookieToCli` 抽到 `src/auth/cliSession.ts`：无 shell、监听 `close`/`error`/stdin error、15s 超时、输出脱敏。
- 登录先用 GraphQL 校验；CLI 会话更新失败降级为警告，不阻断登录。
- 验证：`tsc`/`tslint` 通过；cookie / globalState / cliSession 单测通过（真实 CLI 1.49s）；VS Code 1.142 扩展宿主激活测试 1 passing。
- 未覆盖：真实 UI 中的 Cookie 粘贴与浏览器回跳（需人工点一次），留作 P1 手工验收。

### P2 题库数据层（3 d）

**任务**

- 新建 `src/api/`：`client.ts`（请求/错误归一）、`queries.ts`（集中管理 GraphQL）、`problems.ts`（映射）。
- `problemsetQuestionList` 按 100/页拉全量（约 45 页），失败重试 + 指数退避；内存缓存 + 手动刷新。
- 模型扩展 `IProblem`：新增 `slug`、`questionId`（内部 ID）、`paidOnly`；`id` 保持字符串（支持 `LCP 06`）。
- 映射规则：
  - `name = useEndpointTranslation ? (titleCn || title) : title`
  - `state`：`SOLVED → AC`、`ATTEMPTED → NotAC`，其余 `Unknown`（枚举值待登录后核对）
  - `locked = paidOnly`
  - `passRate = (acRate * 100).toFixed(1) + " %"`
  - `difficulty` 归一为 `Easy/Medium/Hard`
  - `tags = topicTags.map(t => t.nameTranslated || t.name)`
- 搜索改为 `searchKeywords` 过滤（已验证可用），替换 CLI 全量拉取后的 QuickPick。
- 收藏：`favoriteQuestionList(favoriteSlug: ...)` 需要先拿到收藏夹 hash（CLI 走 `/list/api/questions`）；P2 先调研，拿不到就暂用 REST `/list/api/questions`（需 cookie）。
- **Company 分类保留（D5）**：用 `extra.topCompanyTags` 生成"Top 公司"子分类；完整公司标签若需会员，则在 UI 标注数据范围，不隐藏整个分类。

**产出**：`src/api/*`、新的 `explorerNodeManager`、`listProblems` 不再调用 CLI。

**验收**

- CN 题库 4475 条完整；中文标题、AC 标记、付费锁、标签正确。
- Company 分类可展开、可按公司筛选（数据范围内）。
- `LCP 06`、`LCS 02` 能正常显示与打开。
- 断网/超时有可读错误；刷新不重复拉全量。

**注意**：GraphQL 匿名 `status` 恒为 `NOT_STARTED`，登录后才反映真实状态；必须用真账号验证。

**注意**：CLI 的 3527 是 `-q L` 过滤后的未锁定集合；直连后要用 `paidOnly` 显式过滤，保持与"是否显示锁题"设置一致。

**P2 结果（2026-10-20）**

- GraphQL 全量 **4475 条 / 45 页**；冷加载 8.2–11.2s（并发 4），缓存命中 0ms，手动失效后重载 9.2s。
- `two-sum` → 两数之和 / Easy / **AC**；`LCP 06` → 拿硬币；`locked=787`；Company 样例 `google/amazon/bytedance`。
- 特殊题号全部保留，不再被 `\[(\d*)\]` 丢弃。
- 收藏：`isFavor` 字段存在，但测试账号无收藏，正向用例待新 cookie；`updateCachedFavorite` 已实现。
- 验证后期力扣会话过期（`userStatus` 变 `false`），因此"收藏后刷新/换账号"的最终 UI 验收待新 cookie。

### P3 题干与题解（3 d）

**任务**

- 用 `questionData` 生成题目文件：
  - 文件头保留 `@lc app=leetcode.cn id=<frontendQuestionId> lang=<langSlug>`（CodeLens 依赖该格式）。
  - 保留 `@lc code=begin` / `@lc code=end` 标记（CodeLens 定位依赖）。
  - 代码模板取 `codeSnippets` 对应 `langSlug`；语言列表从返回结果动态派生，扩展 `langExt` 支持 `dart`/`elixir`/`erlang`/`racket`/`cangjie`（至少能展示，不一定要高亮）。
  - 描述按 `showDescription` 四种模式渲染；中文取 `translatedContent`，英文取 `content`。
- **题解保留（D5）**：优先用 GraphQL 题解查询（`questionSolutionArticles` / `ugcArticleSolutionArticles`）实现；若仅会员可见，则展示公开题解列表或提供题解页跳转，最坏才保留 CLI `solution.discuss`（此时 D2 降级为"仅题解保留 CLI"）。

**验收**

- 打开 `two-sum` 与 `LCP 06` 都生成含中文题干与可编译模板的文件。
- 重复打开不覆盖已有代码。
- 题解入口可用：至少能列出/打开公开题解；会员内容有明确提示。
- CodeLens（Submit/Test/Star/Solution/Description）全部出现且命令可用。

**P3 结果（2026-10-20）**

- `questionData` 直连：中文标题/题干、20 种代码模板、`sampleTestCase`/`metaData` 均可取。
- 文件生成：保留 `@lc app=... id=... lang=...` 与 `@lc code=begin/end`；C++ 用 `//`、Python 用 `#`；中文题干可选写入注释；`LCP 06` 这类题号正确。
- 题解：`questionSolutionArticles` 返回 top 文章 `content`（`two-sum` 4972 字符），官方 `question.solution` 兜底；不再按语言弹 QuickPick。
- 验证：`tsc`/`tslint`、cpp/python/LCP 文件生成、题解、1.142 激活（1 passing）通过。
- 未覆盖：真实编辑器打开与 Webview 视觉验收（需 UI 手工）；"最高赞"取决于接口默认排序。

### P4 提交/测试 + 多账号（4 d）

**任务**

- 从 cookie 解析 `csrftoken`；请求头带 `X-CSRFToken`、`Referer`、`X-Requested-With`，body 为 `application/x-www-form-urlencoded`。
- 提交：`POST /problems/{slug}/submit/`，参数 `lang`、`question_id`（**内部 ID**）、`typed_code`、`judge_type=large` → 拿 `submission_id`；轮询 `GET /submissions/detail/{id}/check/` 直到非 `PENDING`。
- 测试：`POST /problems/{slug}/interpret_solution/`，参数含 `data_input`、`typed_code`、`lang`、`question_id`；轮询同一 check 端点。
- 结果页改为渲染结构化字段：`status_msg`、`runtime`、`memory`、`total_correct/total_testcases`、`full_compile_error`、`code_output`、`expected_output`、`last_testcase`。
- **多账号 session 保留（D5）**：不再依赖 CLI 的 `~/.lc`；用本地 profile 实现（SecretStorage 存各账号 cookie，`globalState` 存 profile 名与激活态），保留创建/切换/删除入口，UI 与现状一致。
- 加取消（`CancellationToken`）与超时；失败保留原始 JSON 到输出通道。
- 验证通过后删除 `vsc-leetcode-cli` 依赖、`leetCodeExecutor` 的 CLI 调用、`nodePath`/`useWsl` 设置（保留读取兼容一个版本）；若 P3 的题解仍依赖 CLI，则先完成替换或按 D5 明确保留该依赖。

**验收**

- 真账号下：默认用例、输入框用例、文件用例、正式提交均能出结果。
- AC/WA/TLE/CE 四类结果字段正确；编译错误完整显示。
- `LCP 06` 这类题提交成功（验证 `question_id` 用对）。
- 多账号：可创建第二个 profile、切换后题库/提交归属正确、删除后不影响当前账号。

**风险**：提交触发风控/验证码；需低频 + 退避，不提供批量提交。

**P4 结果（2026-10-20）**

- 提交/测试：JSON body（`lang`、`question_id`、`test_mode`、`typed_code`，外加 `data_input`/`judge_type`）、`x-csrftoken`、轮询 `submissions/detail/{id}/check/`；`interpret_solution` 实测 `two-sum` **Accepted**，8.2 MB，1/1。
- 收藏：REST `/list/api/questions` 取 `Favorite` hash，GraphQL `addQuestionToFavorite`/`removeQuestionFromFavorite`；读接口已验证（hash 长度 6）。
- 多账号：本地 profile（SecretStorage 存 cookie，globalState 存名称/用户名/激活态），支持创建/切换/删除；profile 单测通过。
- 去 CLI：删除 `leetCodeExecutor`、`cliSession`、`wslUtils`、`cpUtils`，移除 `nodePath`/`useWsl` 设置与依赖；1.142 激活 **412ms** 通过。
- 待授权：正式 `submit` 会写入提交记录；收藏 mutation 会改账号状态。需确认后再跑，避免污染账号。

### P5 VS Code 现代化 + 中英界面（2 d）

**任务**

- `engines.vscode` 抬到 `^1.90`，`@types/vscode` 对齐；移除 `@types/node` 14。
- Webview：`asWebviewUri` + `cspSource` + nonce；删除 `vscode-resource:`、`enableCommandUris`；评估去掉 `retainContextWhenHidden`。
- 用 `TreeView.message` / `viewsWelcome` 替代伪"Sign in"节点。
- 遥测：默认关；或至少接入 `env.isTelemetryEnabled`；删除 `extra.path`；去掉 `axios.defaults.withCredentials` 全局副作用。
- **l10n（D6，必做）**：`package.nls.json`（English 默认）+ `package.nls.zh-cn.json`；命令、设置、提示、Webview 静态文案全部走 `vscode.l10n.t()`。
- 可选：`ThemeIcon` 替代 PNG；`workspace.fs` 支持 remote/WSL。

**验收**：1.142 上无弃用告警；`"locale": "zh-cn"` 下界面为简体中文、英文环境为英文；预览/提交页样式正常；关闭遥测后无外发请求。

### P6 工程化与发布（2 d）

**任务**

- esbuild 打包单文件；`highlight.js` 按需注册以缩小体积。
- 修 `package-lock.json` 中 4 条 `r2.cnpmjs.org`（证书已过期，`npm ci` 会失败）；CI 改用 `npm ci`。
- CI：Node 20/22、`actions/checkout@v4`；`@vscode/test-cli`（Linux 需 xvfb，或直接在 Windows runner 跑）。
- tslint → eslint；补单测：映射函数、cookie 解析、结果归一。
- **发布身份（D3）**：
  - `publisher: "yanxijian"`；`name` 暂保留 `vscode-leetcode` → 新扩展 ID **`yanxijian.vscode-leetcode`**。
  - `displayName` 改为 **`LeetCode Community`**，避免冒充官方；`repository`/`homepage`/`bugs` 指向 fork。
  - 若 Marketplace 审核要求改名，回退 `name: "vscode-leetcode-cn"`（ID 同步变化）。
  - 版本从 `0.19.0` 起；README 写明"与官方版命令/视图/设置冲突，安装前禁用官方版"。
- **文档语言（D6）**：只维护 `README.md`（English）+ `README.zh-CN.md`（简体中文）；不新增日/韩版本，并在 README 注明这是对工作区四语言约定的明确例外。
- 若纳入工作区长期维护：补 `codes-workspace/workspace.json`、RepoRules；`markdown.languages` 只配置 en + zh-CN，或把该例外写入 ignore。

**验收**：`npm ci && npm run package` 一键可复现；CI 绿；VSIX 以新 ID 安装可用且 < 1.5 MB。

---

## 6. 验收矩阵

| # | 场景 | 期望 | 阶段 |
| --- | --- | --- | --- |
| 1 | Cookie 粘贴登录 | 3s 内显示用户名，重启保持 | P1 |
| 2 | 浏览器授权回跳（扩展未激活） | 能拉起扩展并完成登录 | P1 |
| 3 | 过期/错误 cookie | 明确提示，不挂起、不写脏状态 | P1 |
| 4 | CN 题库 | 4475 条，中文标题、AC/未做/付费锁正确 | P2 |
| 5 | Company 分类 | 可展开、可按 Top 公司筛选 | P2 |
| 6 | `LCP 06` / `LCS 02` | 正常显示、打开、提交 | P2/P4 |
| 7 | 分类/排序/隐藏已做 | 与设置一致 | P2 |
| 8 | 搜索 | 关键词命中，结果可打开 | P2 |
| 9 | 打开题目 | 中文题干 + 模板 + `@lc` 标记；二次打开不覆盖 | P3 |
| 10 | 题解 | 可列出/打开公开题解；会员内容有提示 | P3 |
| 11 | CodeLens | 5 个入口均出现且可用 | P3 |
| 12 | 测试（默认/输入/文件） | 结果字段完整，失败用例可读 | P4 |
| 13 | 提交 | AC/WA/TLE/CE 正确，耗时内存正确 | P4 |
| 14 | 多账号 session | 创建/切换/删除，归属正确 | P4 |
| 15 | 收藏/取消 | 刷新后状态保持 | P2 |
| 16 | 断网/超时/取消 | 可读错误，可重试 | P2/P4 |
| 17 | 中文界面 | `zh-cn` 下命令/设置/提示均为中文 | P5 |
| 18 | 关闭遥测 | 无外发请求 | P5 |
| 19 | 1.142 激活 | 无弃用告警、无未处理异常 | P5 |
| 20 | 新 ID 安装 | `yanxijian.vscode-leetcode` 可装；与官方版冲突有说明 | P6 |

---

## 7. 风险登记

| ID | 风险 | 概率 | 影响 | 缓解 |
| --- | --- | --- | --- | --- |
| R1 | 力扣 GraphQL schema 变动（无内省） | 中 | 高 | 查询集中 `src/api/queries.ts`；冒烟脚本每日跑；错误信息上报 |
| R2 | 提交触发风控/验证码 | 中 | 中 | 低频、退避、不批量；保留浏览器登录 |
| R3 | 题解接口需会员 | 高 | 低 | P3 先展示公开题解/跳转；会员内容明确提示 |
| R4 | 收藏夹 hash 获取方式变化 | 中 | 中 | P2 先用 REST `/list/api/questions`，失败降级为本地标记 |
| R5 | 公司标签数据不全 | 高 | 低 | 保留分类，用 `topCompanyTags`，UI 标注范围（D5） |
| R6 | 发布身份/品牌审核 | 中 | 中 | `displayName` 去官方化；备用 name `vscode-leetcode-cn`（D3） |
| R7 | cookie 泄露 | 低 | 高 | 仓库外文件、脱敏、SecretStorage、不日志、用完删除 |
| R8 | 删除 CLI 后回归遗漏 | 中 | 中 | P4 保留 feature flag，一个版本后移除 |
| R9 | 多账号重建引入串号 | 中 | 高 | profile 与 cookie 一一绑定；切换后强制刷新题库与用户信息 |
| R10 | l10n 遗漏硬编码文案 | 中 | 低 | 用 lint/脚本扫描 `showInformationMessage` 等字面量；验收切 zh-cn 过一遍 |

---

## 8. 决策记录

| ID | 决策 | 状态 | 说明 |
| --- | --- | --- | --- |
| D1 | `.cn` 一等公民，`.com` 保留但不验收 | 已定 | 降低范围与风险 |
| D2 | 最终删除 `vsc-leetcode-cli` | 已定（P4 门控） | 若题解必须依赖 CLI，则降级为"仅题解保留 CLI" |
| D3 | 自有 publisher 发布，改扩展 ID 与显示名 | **已定** | `publisher: yanxijian`，ID `yanxijian.vscode-leetcode`，`displayName: LeetCode Community`；审核不通则改 `name: vscode-leetcode-cn` |
| D4 | 登录以 Cookie 粘贴为主，Web 授权兜底，不做密码登录 | 已定 | 规避验证码/2FA |
| D5 | Company、Session 多账号、题解全部保留 | **已定** | P2 保 Company；P3 保题解；P4 重建本地多账号 |
| D6 | 只做简体中文 + English | **已定** | UI 走 l10n；README 两语言；不做日/韩 |

---

## 9. 跟踪与变更

- 每个阶段完成后更新：状态、实际耗时、验收证据链接（PR/commit/日志）。
- 阶段状态用复选框维护，禁止"代码完成但验收未跑"就勾选。
- 线上行为变化（力扣改接口）记入 §10，并评估是否影响已勾选阶段。

| 阶段 | 状态 | 完成日期 | 证据 |
| --- | --- | --- | --- |
| P0 | ✅ 完成（冒烟与 CLI 对照通过；1.142 激活在 P1 验证） | 2026-10-20 | `scripts/smoke.mjs`；§10 |
| P1 | ✅ 完成（组件级验证；UI 手工验收待补） | 2026-10-20 | `src/auth/*`；§10 |
| P2 | ✅ 完成（数据层；收藏/多账号正向用例待新 cookie） | 2026-10-20 | `src/api/*`；§10 |
| P3 | ✅ 完成（题干/文件/题解数据层；UI 视觉验收待补） | 2026-10-20 | `src/api/question.ts`、`src/api/problemFile.ts`、`src/api/solution.ts`；§10 |
| P4 | ◐ 进行中（测试/收藏封装/多账号/去 CLI 已完成；正式 submit 与收藏 mutation 待授权） | 2026-10-20 | `src/api/submission.ts`、`src/api/favorite.ts`、`src/commands/session.ts`；§10 |
| P5 | ☐ 未开始 | | |
| P6 | ☐ 未开始 | | |

---

## 10. 复现证据（2026-10-20）

- 环境：VS Code `1.142.0`（`6d62b1d5dace93a33b3a6d3eca1317bd5e15bcb1`），Node `24.22.0`，Windows。
- GraphQL 探测（匿名）：

  ```text
  POST https://leetcode.cn/graphql/
  {"query":"query { userStatus { username isSignedIn isPremium } }"}
  → 200 {"data":{"userStatus":{"username":"","isSignedIn":false,"isPremium":false}}}
  ```

  ```text
  problemsetQuestionList(limit:100, skip:0) → total=4475
  questionData(two-sum) → translatedTitle=两数之和, translatedContent=1125 字符, codeSnippets=20
  questionData(na-ying-bi) → questionFrontendId="LCP 06", questionId="1000056"
  ```

- 旧 REST：

  ```text
  GET https://leetcode.cn/api/problems/algorithms/
  → 200, Content-Type: text/html, body 为 JSON：user_name="" ... stat_status_pairs=[...]
  ```

- 提交/测试端点（未登录）：

  ```text
  POST /problems/two-sum/submit/            → 403 {"error":"User is not authenticated"}
  POST /problems/two-sum/interpret_solution/ → 403 {"error":"User is not authenticated"}
  GET  /submissions/detail/1/check/          → 200 {"state":"PENDING"}
  ```

- VS Code 构建产物：

  ```text
  extensionHostProcess.js:
  /(["'])vscode-resource:([^\s'"]+?)(["'])/i
  → report("Webview vscode-resource: uris", ... "Please migrate to use the 'webview.asWebviewUri' api")
  ```

- 构建验证（在副本中，未改动本仓库）：

  ```text
  npm ci（需先修正 4 条 r2.cnpmjs.org）→ tsc → tslint → vsce package
  → vscode-leetcode-0.18.4.vsix, 4778 files, 6.4 MB
  ```

- P0 冒烟（有效 cookie）：

  ```text
  userStatus: signedIn=true, premium=false
  problemsetQuestionList: total=4475, 1 | 两数之和 | EASY | AC
  questionData(two-sum): translatedTitle=两数之和, snippets=20
  questionData(na-ying-bi): frontendId="LCP 06", internalId=1000056
  ```

- P0 对照（过期 cookie 与 CLI）：

  ```text
  expired cookie: signedIn=false, exit=1
  CLI list -q L: 3527 lines, regex matched 3248, special IDs 280
  CLI user -c: success in 2.25s (per-chunk matching)
  ```

- P1 验证：

  ```text
  tsc/tslint: pass
  unit tests: cookie, globalState, cliSession (real CLI 1.49s)
  VS Code 1.142 extension host: 1 passing (activation + commands + onUri)
  ```

- P2 验证：

  ```text
  GraphQL: total=4475, pages=45, mapped=4475, cold=8.2-11.2s, cache=0ms
  two-sum: 两数之和 / Easy / AC; LCP 06: 拿硬币
  locked=787; companies sample=google,amazon,bytedance
  ```

- P3 验证：

  ```text
  questionData(two-sum): translatedTitle=两数之和, snippets=20
  file builder: @lc header + begin/end, cpp/python, LCP 06 id preserved
  solution: questionSolutionArticles content, 4972 chars
  VS Code 1.142 activation: 1 passing
  ```

- P4 验证：

  ```text
  interpret_solution(two-sum, cpp): SUCCESS / Accepted / 8.2 MB / 1 of 1
  favorite API read: favorite "Favorite", hash length 6
  profile store: create/switch/delete/persist passed
  CLI removed: npm ci 233 -> 68 packages; activation 412ms, 1 passing
  ```

> 以上均为时间点快照；力扣接口随时可能变化，P0 的冒烟脚本应作为长期回归工具保留。
