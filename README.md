# LeetCode

**简体中文** · [English](README.en.md)

[![CI](https://github.com/john180/vscode-leetcode/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/john180/vscode-leetcode/actions/workflows/build.yml)
[![VS Code 1.143+](https://badgen.net/badge/VS%20Code/1.143%2B/blue?icon=visualstudio)](https://code.visualstudio.com/)
[![License: MIT](https://badgen.net/badge/license/MIT/yellow)](https://github.com/john180/vscode-leetcode/blob/main/LICENSE)

> 在 VS Code 中浏览力扣题目、查看题解、测试和提交代码。

更新记录：[CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md)

## 安装

支持 Windows 和 VS Code 1.143+，提供简体中文与英文界面，通过本地 VSIX 安装。使用时无需单独安装 Node.js。

先按下方开发步骤构建，再在项目目录运行：

```powershell
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
code --install-extension ".\vscode-leetcode-$version.vsix" --force
```

扩展 ID：`john180.vscode-leetcode`。安装前请禁用旧社区版和官方版，避免命令、视图与设置冲突。从旧版迁移后需重新登录。

## 功能

- 浏览 leetcode.cn 全部题目，支持 `LCP`、面试题等特殊题号，显示中文标题、AC 状态、付费锁、标签与公司。
- 打开题目生成带 `@lc` 头、代码模板与可选描述注释的文件。
- 侧边栏题目详情中查看题目描述与高赞题解，测试和提交结果显示在底部面板，编辑区只放代码。
- 运行样例或自定义测试并提交代码。
- 本地多账号会话，可创建、切换、删除。
- 搜索、排序、隐藏已做题目、收藏/取消收藏。

## 登录

1. 在活动栏打开 LeetCode 视图。
2. 执行 **LeetCode: Sign In**（登录）。
3. 选择 **LeetCode Cookie**，粘贴从 `https://leetcode.cn` 复制的 `Cookie` 请求头；也可以使用 **Web Authorization**。

Cookie 安全保存在 VS Code 中。默认按系统时区选择站点：中国大陆使用力扣，其他地区使用 LeetCode。可通过 **LeetCode: Switch Endpoint** 手动切换，Cookie 必须来自所选站点。

两站的账户和 Cookie 分开保存，切换站点时会校验并恢复该站上次使用的账户；直接修改 `leetcode.endpoint` 也会生效。退出登录或切换会话会取消尚在等待的请求。旧版凭据没有站点信息，升级时归入首次启动所选的站点；其他站点的账户需重新添加。

## 快速开始

1. 登录后，在 LeetCode 视图中选择题目，或执行 **Search Problem** / **Pick One**。
   题库按展开的分类加载，每页 50 道，点击“加载更多”继续；收藏和热题每页加载 20 道。
   点击标题栏的搜索图标输入题号、标题或 slug，题目列表会只保留匹配的题目并高亮关键字，自动定位到最匹配的一题（只选中，不打开）；按 Enter 跳到下一个，Esc 关闭输入框但保留结果，点击 ✕ 恢复完整列表。`tag:array` 或 `company:google` 只在对应分类中搜索。
   浏览过的题目会保存在本地缓存中，重启后可复用；缓存按站点、登录会话和语言隔离，过期后后台更新。刷新按钮重新加载当前展开的分类，**Delete Cache** 会清除持久化题库缓存。测试、提交和查看历史无需加载完整题库。
   单击题目后，描述显示在侧边栏下方的 **题目详情** 中；点击 **开始写代码**（或题目右侧的代码图标）在编辑区生成并打开代码文件。切换到题目代码文件时，题目详情会自动显示该题；也可点击编辑器标题栏的书本图标回到描述。
   第一次写代码时选择题目文件的保存位置（默认位置、当前打开的工作区文件夹或自选目录），之后记在 `leetcode.workspaceFolder` 中。该目录不在当前工作区时会询问是否打开它，可选择 **仅打开题目文件，不再询问**；选择打开文件夹时，题目文件会先生成好。
2. 编辑生成的代码文件，用 CodeLens 的 **Test** 运行样例，或 **Submit** 提交；结果显示在代码下方的 **LeetCode 结果** 面板。
   在代码文件中按 `Ctrl+'`（**Quick Test**）直接测试，不再选择用例：使用你编写的测试用例，尚未编写时使用题目示例。
   测试时选择 **编辑测试用例...**，会在代码旁打开该题的测试用例编辑器：每行一个参数，行首标出所属用例和参数名，保存后留在本机（不写入工作区）；在其中按 `Ctrl+'` 或点击标题栏的运行按钮即可测试。清空并保存后改回用题目示例测试。提交未通过时，结果面板的 **加入测试用例** 会把失败的输入追加到编辑器中，方便修改后再测。
3. 需要题解时切换到题目详情的 **题解** 标签，或点击 CodeLens 的 **Solution**。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `LeetCode: Sign In` / `Sign Out` | 登录 / 退出 |
| `LeetCode: Switch Endpoint` | 在 leetcode.cn 与 leetcode.com 之间切换 |
| `LeetCode: Search Problem` / `Clear Search` | 在题目列表中筛选并定位题目 / 恢复完整列表 |
| `LeetCode: Show Problem` | 打开题目并生成代码文件 |
| `LeetCode: Show Description` | 在侧边栏题目详情中查看当前题目文件的描述 |
| `LeetCode: Test in LeetCode` | 选择用例后测试：我的测试用例、题目示例、测试用例编辑器或文件 |
| `LeetCode: Quick Test` | 不再询问，直接用我的测试用例（或题目示例）测试；默认快捷键 `Ctrl+'` |
| `LeetCode: Submit to LeetCode` | 提交代码 |
| `LeetCode: Show Top Voted Solution` | 在题目详情的「题解」标签中查看高赞题解 |
| `LeetCode: Show Submission History` | 列出该题的提交记录：按 Enter 在只读编辑器中查看代码，行内按钮与当前代码比较或在 LeetCode 打开 |
| `LeetCode: Manage Sessions` | 管理本地多账号 |
| `LeetCode: Delete Cache` | 清除题库缓存 |

## 设置

| 设置 | 说明 | 默认值 |
| --- | --- | --- |
| `leetcode.endpoint` | `auto`、`leetcode` 或 `leetcode-cn` | `auto` |
| `leetcode.defaultLanguage` | 新文件的默认语言 | 未设置 |
| `leetcode.workspaceFolder` | 题目文件保存目录 | `%USERPROFILE%\.leetcode` |
| `leetcode.filePath` | 相对目录与文件名模板 | `${id}.${kebab-case-name}.${ext}` |
| `leetcode.showDescription` | `In Webview`（侧边栏题目详情）、`In File Comment`、`Both` 或 `None` | `In Webview` |
| `leetcode.followActiveEditor` | 切换到题目代码文件时，题目详情自动显示该题 | `true` |
| `leetcode.hideSolved` | 隐藏已通过题目 | `false` |
| `leetcode.useEndpointTranslation` | 使用站点提供的翻译内容 | `true` |
| `leetcode.enableStatusBar` | 显示 LeetCode 状态栏 | `true` |
| `leetcode.editor.shortcuts` | CodeLens 操作：`submit`、`test`、`star`、`solution`、`description` | `["submit", "test"]` |
| `leetcode.colorizeProblems` | 按难度着色 | `true` |
| `leetcode.problems.sortStrategy` | `None`、`Acceptance Rate (Ascending)`、`Acceptance Rate (Descending)` | `None` |

## 常见问题

扩展支持受限模式，不在本地执行工作区代码。暂不支持 GitHub Repositories 等虚拟工作区；请使用本地文件夹或具有磁盘文件系统的远程开发工作区。

打开文件并识别到 `@lc` 题目头后，编辑器和资源管理器才会显示对应操作。网页授权须从 **Sign In** 发起，在五分钟内完成，并在 VS Code 中确认目标账户。临时网络故障会保留已保存的凭据，恢复网络后可点击 **Refresh** 重试。

**登录提示 "The cookie is not signed in"**

- 确认 `leetcode.endpoint` 与 Cookie 来源一致（`leetcode.cn` 或 `leetcode.com`）；
- 从 Network 请求头复制，确保包含 `LEETCODE_SESSION` 与 `csrftoken`；
- 打开 Output → LeetCode，日志会显示校验的 endpoint 和 `signedIn` 结果（不会打印 cookie）。

## 开发

构建环境：Node.js 24.18+；仓库规则检查需要 Python。

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run test:integration  # 下载稳定版 VS Code，使用隔离的测试配置
npm run package
python scripts/repo_rules.py check --config repo-rules.json
```

`npm run package` 构建扩展并生成 `.vsix`。按 `F5` 启动扩展开发宿主。

CI 同时运行单元测试和扩展宿主测试。可通过 `VSCODE_EXECUTABLE_PATH` 复用本机 VS Code，或通过 `VSCODE_TEST_VERSION` 指定测试版本。

## 许可证

MIT。基于 [LeetCode-OpenSource/vscode-leetcode](https://github.com/LeetCode-OpenSource/vscode-leetcode) 及其社区贡献。
