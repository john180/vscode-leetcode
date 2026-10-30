# 更新记录

**简体中文** · [English](CHANGELOG.md)

本文件维护社区分支从 0.19.0 开始的中文更新记录。0.18.4 及更早版本属于上游历史，见英文版。

## [Unreleased]

## [0.26.0] - 2026-10-30
### 修复
- 更新运行时与打包依赖，修复 KaTeX 和 MSAL Node 的已知安全问题。
- “注册”按钮改为打开当前站点，不再总是打开 leetcode.cn。
- 提示“请打开输出面板查看详情”的失败现在会把错误写入输出面板。
- 打开题目时会创建 `leetcode.filePath` 指定的目录（如 `${difficulty}`），不再写入失败。
- 未登录时点击测试会提示登录，不再没有反应。
- 命令面板中隐藏“加入收藏夹”，该命令需要从题目列表选择题目。
- `leetcode.showDescription` 的每个选项在设置中都有说明。
- 中文界面下在“管理会话”中选择当前会话不再重复切换。
- leetcode.cn 的“每日一题”重新显示当天题目；首页已不再内嵌该数据，改为从 GraphQL 接口读取。
- 请求被 LeetCode 以 401/403 拒绝时，只有在确认会话已退出登录后才删除已保存的会话；403 也可能来自人机验证或 CSRF 校验。
- LeetCode 拒绝查询时，输出面板显示 LeetCode 给出的原因，而不是 “Request failed with status code 400”；返回人机验证或代理页面时也会明确说明。
- 等待判题结果时出现短暂网络故障，不再丢失 LeetCode 已受理的测试或提交结果。
- 启动时校验已保存的会话、加载收藏夹或提交记录时遇到短暂网络故障会自动重试，不再直接失败。
- 收藏变化后，“加入收藏夹”立即显示各列表当前的题目数，不再显示最多 5 分钟前的旧数字。

### 变更
- 升级 KaTeX 至 0.19.1、markdown-it 至 15.0.3、TypeScript 至 6.0.3、VSCE 至 4.1.0；改用 markdown-it 自带的类型定义，并同步第三方许可证清单。
- 先注册命令和视图，再恢复已保存的会话；恢复失败时命令仍然可用。
- 输出面板改为带级别和时间戳的日志通道，可用 “Developer: Set Log Level...” 过滤。
- 题目文件仅在菜单上下文变化时更新，不再每次按键都更新。
- 题目详情视图隐藏时不再常驻内存，重新显示时会重新载入内容。
- 链接改用 `env.openExternal` 打开。
- 启用 TypeScript `strict` 模式；CI 额外在最低支持版本的 VS Code 上运行集成测试。
- 所有发往 LeetCode 的请求改走同一个 HTTP 层，统一发送相同的请求头，包括 CSRF 令牌，以及带扩展真实版本和平台的 User-Agent（此前固定为 “0.19、Windows”）。
- “默认测试用例”改用题目的全部示例测试，与 LeetCode 网页上的“运行”一致，不再只用第一个示例。
- 测试和提交只向 LeetCode 请求题目 ID、示例和参数名，不再拉取完整题面和代码模板。加入或移出收藏时复用已缓存的题目信息和收藏夹列表，通常只需发送这次修改本身。
- “Hot 100”和收藏夹每页最多 20 道题，改为一次请求加载，不再每道题单独请求。
- 收藏夹列表和每日一题与题目列表共用同一个缓存，题目树和各命令共享。
- 开始新的测试时，不再继续等待被它取代的上一次测试结果；切换账号、站点或语言时，停止仍在为旧设置加载的请求。被取代的提交仍会记录判题结果。
- 登录失败的提示改为显示站点名（如 leetcode.cn），不再显示 GraphQL 地址。

## [0.25.0] - 2026-10-28
### 变更
- 仓库迁移至 `john180/vscode-leetcode`，主分支改为 `main`，保留 `community` 的历史。
- 扩展标识改为 `john180.vscode-leetcode`，显示名称简化为 `LeetCode`，同步登录回调、安装说明和测试。
- 仓库规则检查合并至主 CI 流程，精简中英文 README。
- 定位为 Windows 个人自用插件，仅保留简体中文与英文。
- 改为本地 VSIX 安装和 Windows CI，更新开发调试任务及打包依赖声明。

### 移除
- 日语与韩语翻译、商店发布流程、公共反馈模板、无引用文档素材及历史适配计划。
- 旧版 `leetcode.showCommentDescription` 配置兼容和明文 Cookie 迁移；请使用 `leetcode.showDescription`，必要时重新登录。

## [0.24.3] - 2026-10-22
### 变更
- 四种 README 顶部统一放置 CI、Marketplace、VS Code 与 MIT 许可证 badge。
- 替换已停用的 Shields.io Marketplace badge 和不稳定的静态 badge。

## [0.24.2] - 2026-10-22
### 修复
- 四种 README 的 ChangeLog 链接改为 GitHub 绝对地址，确保 Marketplace 页面可以正确解析。

## [0.24.1] - 2026-10-22
### 新增
- 增加 problems 缓存/endpoint 隔离和认证状态机测试。
- 增加发布不变量检查：release commit 必须是 `release: X.Y.Z`，且 `vX.Y.Z` 必须指向同一个提交。

## [0.24.0] - 2026-10-22
### 移除
- 移除遥测实现和 `leetcode.allowReportData` 设置。该遥测来自上游项目（上游提交 71264fa，默认开启），并非本分支引入。本分支此前已将默认值改为关闭并要求 VS Code 遥测开启，现在完全移除，无功能影响。
- 移除 `analysis.leetcode.cn` 与 `analysis.lingkou.xyz` 分析端点的引用。

### 新增
- 增加隐私回归测试和 RepoRules 规则，阻止重新引入遥测。

## [0.23.2] - 2026-10-21
### 修复
- 英、日、韩 README 统一使用全球站 `leetcode.com` 示例，不再使用 `leetcode.cn`。
- 增加 RepoRules 检查，禁止非中文 README 出现 `leetcode.cn` 或“力扣”。

## [0.23.1] - 2026-10-21
### 新增
- 扩展 manifest、运行时消息和 README 增加日语、韩语本地化。
- README 语言切换补齐英语、简体中文、日语、韩语。

## [0.23.0] - 2026-10-21
### 新增
- 支持 LeetCode 国际版：默认端点 `leetcode`、`problemsetQuestionListV2` 题库、GraphQL 每日一题、`Top 100 Liked Questions`、国际版收藏夹和提交历史。
- README 增加 leetcode.com 与 leetcode.cn 的切换说明。
- 自动选择端点（`auto`）：中国大陆时区使用力扣，其他地区使用 LeetCode。

## [0.22.1] - 2026-10-21
### 修复
- 校验已保存 Cookie 时显示“正在登录”，不再提前显示登录欢迎页。
- 初始认证状态未确定时显示 LeetCode Community 欢迎信息。
- 认证状态确定前隐藏登录按钮和标题栏登录入口。
- 通过 slug 映射题库中的中文标题，修复 Hot 100 和收藏夹题目名称。

## [0.22.0] - 2026-10-21
### 新增
- 搜索增强：支持题号、中英文标题、slug、标签和公司，并在选择项详情中展示标签、公司。

## [0.21.0] - 2026-10-21
### 新增
- 从力扣首页 SSR 数据增加“每日一题”树入口。
- 支持将题目加入指定收藏夹。
- 记住每题最后一次自定义测试输入，并提供“上次测试用例”。
- 在提交结果中显示期望输出与实际输出的行级 diff。
- 增加基于官方 HOT 100 题单的 Hot 100 树入口。
- 提交历史支持分页和按状态筛选。
- 收藏夹、Hot 100 和每日一题增加五分钟缓存。
- 收藏夹按列表分组，展示每个列表中的题目。
- 从题目右键菜单或命令面板查看提交历史，包含状态、语言、时间、运行时间和内存；选择记录可打开 LeetCode 提交页。

## [0.20.1] - 2026-10-21
### 修复
- GraphQL/网络临时故障使用指数退避重试，并遵守 `Retry-After`；所有请求增加 20 秒超时。
- 为重试/退避和未授权响应增加单元测试。

## [0.20.0] - 2026-10-21
### 修复
- 完善 Cookie 和 Web Authorization 登录流程：OAuth 回调错误、重复回调、按端点提示，以及显式打开登录页。
- Web Authorization 继续使用当前安装的扩展 ID，而不是官方扩展 ID。
- 已认证请求返回 401/403 时退出登录并要求重新登录。

### 变更
- 升级 axios、fs-extra、highlight.js、lodash 和 markdown-it 到当前稳定版本。
- 只注册 LeetCode 使用的语言，包体从 2.82 MB 降到 1.36 MB，VSIX 从 653 KB 降到 316 KB。
- 通过端点的 `companyTagsV2` 解析公司名称，公司树使用本地化名称而不是 slug。
- 登录后刷新题库时显示原生视图进度和加载提示。
- 完成剩余命令、快速选择、对话框和 Webview 文案的本地化；增加“所有 l10n key 都有中文翻译”的测试。

## [0.19.4] - 2026-10-21
### 修复
- Web Authorization 重定向到当前安装的扩展 ID，不再硬编码官方 `leetcode.vscode-leetcode`。

## [0.19.3] - 2026-10-21
### 变更
- 移除最后一个 `url` 模块引用，使用 Node 全局 `URLSearchParams`。
- 记录 `code --install-extension` 时的 DEP0169 `url.parse()` 警告来自 VS Code CLI，而不是扩展。
- Marketplace README 与 0.19.3 对齐。

## [0.19.2] - 2026-10-21
### 变更
- Marketplace 列表改用简体中文 `README.md`，英文版本移到 `README.en.md`。

## [0.19.1] - 2026-10-21
### 修复
- 默认 `leetcode.endpoint` 改为 `leetcode-cn`，避免把力扣 Cookie 发送到 leetcode.com。
- 登录失败时显示并记录正在校验的端点和 `isSignedIn` 结果（不记录 Cookie）。

## [0.19.0] - 2026-10-20
### 变更
- 社区分支以 `yanxijian.vscode-leetcode-community` 发布，显示名为 `LeetCode Community`。
- 用直接 GraphQL/REST 调用替换内置 `vsc-leetcode-cli`：题库、题目描述、题解、提交、测试和收藏夹。
- Cookie 存入 VS Code `SecretStorage`；多账号会话保存在本地。
- 要求 VS Code 1.90+，不再需要 Node.js、`leetcode.nodePath` 或 `leetcode.useWsl`。
- Webview 使用 `asWebviewUri` 和基于 nonce 的 CSP；遥测为选择加入并遵守 VS Code 遥测设置（0.24.0 已完全移除）。
- 增加英语和简体中文 UI/README 资源。

## [0.18.4] 及更早
上游历史版本保留在[英文更新记录](CHANGELOG.md)中。
