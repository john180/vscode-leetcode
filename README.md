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
- 在 Webview 中查看题目描述与高赞题解。
- 运行样例或自定义测试并提交代码。
- 本地多账号会话，可创建、切换、删除。
- 搜索、排序、隐藏已做题目、收藏/取消收藏。

## 登录

1. 在活动栏打开 LeetCode 视图。
   题库按展开的分类加载，每页 50 道，点击“加载更多”继续；收藏和热题每页加载 20 道。搜索支持题号、标题和 slug，可使用 `tag:array` 或 `company:google` 筛选。
   浏览过的题目会保存在本地缓存中，重启后可复用；缓存按站点、登录会话和语言隔离，过期后后台更新。刷新按钮重新加载当前展开的分类，**Delete Cache** 会清除持久化题库缓存。测试、提交和查看历史无需加载完整题库。
2. 执行 **LeetCode: Sign In**（登录）。
3. 选择 **LeetCode Cookie**，粘贴从 `https://leetcode.cn` 复制的 `Cookie` 请求头；也可以使用 **Web Authorization**。

Cookie 安全保存在 VS Code 中。默认按系统时区选择站点：中国大陆使用力扣，其他地区使用 LeetCode。可通过 **LeetCode: Switch Endpoint** 手动切换，Cookie 必须来自所选站点。

## 快速开始

1. 登录后，在 LeetCode 视图中选择题目，或执行 **Search Problem** / **Pick One**。
2. 编辑生成的代码文件，用 CodeLens 的 **Test** 运行样例，或 **Submit** 提交。
3. 需要题解时点击 **Solution**。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `LeetCode: Sign In` / `Sign Out` | 登录 / 退出 |
| `LeetCode: Switch Endpoint` | 在 leetcode.cn 与 leetcode.com 之间切换 |
| `LeetCode: Search Problem` | 搜索题目 |
| `LeetCode: Show Problem` | 打开题目并生成代码文件 |
| `LeetCode: Preview Problem` | 在 Webview 中预览题目 |
| `LeetCode: Test in LeetCode` | 用样例或自定义输入测试 |
| `LeetCode: Submit to LeetCode` | 提交代码 |
| `LeetCode: Show Top Voted Solution` | 查看题解 |
| `LeetCode: Manage Sessions` | 管理本地多账号 |
| `LeetCode: Delete Cache` | 清除题库缓存 |

## 设置

| 设置 | 说明 | 默认值 |
| --- | --- | --- |
| `leetcode.endpoint` | `auto`、`leetcode` 或 `leetcode-cn` | `auto` |
| `leetcode.defaultLanguage` | 新文件的默认语言 | 未设置 |
| `leetcode.workspaceFolder` | 题目文件保存目录 | `%USERPROFILE%\.leetcode` |
| `leetcode.filePath` | 相对目录与文件名模板 | `${id}.${kebab-case-name}.${ext}` |
| `leetcode.showDescription` | `In Webview`、`In File Comment`、`Both` 或 `None` | `In Webview` |
| `leetcode.hideSolved` | 隐藏已通过题目 | `false` |
| `leetcode.useEndpointTranslation` | 使用站点提供的翻译内容 | `true` |
| `leetcode.enableStatusBar` | 显示 LeetCode 状态栏 | `true` |
| `leetcode.editor.shortcuts` | CodeLens 操作：`submit`、`test`、`star`、`solution`、`description` | `["submit", "test"]` |
| `leetcode.enableSideMode` | 在第二编辑列打开预览/题解 | `true` |
| `leetcode.colorizeProblems` | 按难度着色 | `true` |
| `leetcode.problems.sortStrategy` | `None`、`Acceptance Rate (Ascending)`、`Acceptance Rate (Descending)` | `None` |

## 常见问题

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
npm run test:integration  # 可选，需要本机 VS Code
npm run package
python scripts/repo_rules.py check --config repo-rules.json
```

`npm run package` 构建扩展并生成 `.vsix`。按 `F5` 启动扩展开发宿主。

## 许可证

MIT。基于 [LeetCode-OpenSource/vscode-leetcode](https://github.com/LeetCode-OpenSource/vscode-leetcode) 及其社区贡献。
