# LeetCode Community

**简体中文** · [English](README.en.md)

> 在 VS Code 中刷力扣：题库、题解、测试与提交，默认使用 leetcode.cn。

> 本仓按项目要求只维护简体中文与英文两版，属于对工作区四语言约定的明确例外。

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/yanxijian.vscode-leetcode-community?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=yanxijian.vscode-leetcode-community)

## 安装

- Marketplace：<https://marketplace.visualstudio.com/items?itemName=yanxijian.vscode-leetcode-community>
- 命令行：

  ```powershell
  code --install-extension yanxijian.vscode-leetcode-community
  ```

- 离线安装：从 [GitHub Releases](https://github.com/yanxijian/vscode-leetcode/releases) 下载 `.vsix`，然后：

  ```powershell
  code --install-extension .\vscode-leetcode-community-0.20.1.vsix --force
  ```

> 本项目是 [LeetCode-OpenSource/vscode-leetcode](https://github.com/LeetCode-OpenSource/vscode-leetcode) 的社区分支，不是 LeetCode 官方发布。扩展 ID 为 `yanxijian.vscode-leetcode-community`；命令、视图与设置 ID 与官方版相同，安装前请先禁用官方 `LeetCode.vscode-leetcode`。

## 功能

- 浏览 leetcode.cn 全部题目，支持 `LCP`、面试题等特殊题号，显示中文标题、AC 状态、付费锁、标签与公司。
- 打开题目生成带 `@lc` 头、代码模板与可选描述注释的文件。
- 在 Webview 中查看题目描述与高赞题解。
- 直接运行样例/自定义测试并提交，不依赖内置 CLI，也不需要安装 Node.js。
- 本地多账号会话，可创建、切换、删除。
- 搜索、排序、隐藏已做题目、收藏/取消收藏。

## 环境要求

- [VS Code 1.90](https://code.visualstudio.com/) 或更高版本。
- 不需要 Node.js。

## 登录

1. 在活动栏打开 LeetCode 视图。
2. 执行 **LeetCode: Sign In**（登录）。
3. 选择 **LeetCode Cookie**，粘贴从 `https://leetcode.cn` 复制的 `Cookie` 请求头；也可以使用 **Web Authorization**。

Cookie 只保存在 VS Code 的 `SecretStorage` 中，不会写入明文设置。默认站点是 `leetcode-cn`；如果你手动改过 `leetcode.endpoint`，请确认它仍是 `leetcode-cn`。

## 快速开始

1. 安装并启用扩展，禁用官方版。
2. 登录 leetcode.cn。
3. 在 LeetCode 视图中选择题，或执行 **Search Problem** / **Pick One**。
4. 编辑生成的代码文件，用 CodeLens 的 **Test** 运行样例，或 **Submit** 提交。
5. 需要题解时点击 **Solution**。

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
| `leetcode.endpoint` | 当前站点：`leetcode` 或 `leetcode-cn` | `leetcode-cn` |
| `leetcode.defaultLanguage` | 新文件的默认语言 | 未设置 |
| `leetcode.workspaceFolder` | 题目文件保存目录 | `$HOME/.leetcode` |
| `leetcode.filePath` | 相对目录与文件名模板 | `${id}.${kebab-case-name}.${ext}` |
| `leetcode.showDescription` | `In Webview`、`In File Comment`、`Both` 或 `None` | `In Webview` |
| `leetcode.hideSolved` | 隐藏已通过题目 | `false` |
| `leetcode.useEndpointTranslation` | 使用站点提供的翻译内容 | `true` |
| `leetcode.enableStatusBar` | 显示 LeetCode 状态栏 | `true` |
| `leetcode.editor.shortcuts` | CodeLens 操作：`submit`、`test`、`star`、`solution`、`description` | `["submit", "test"]` |
| `leetcode.enableSideMode` | 在第二编辑列打开预览/题解 | `true` |
| `leetcode.colorizeProblems` | 按难度着色 | `true` |
| `leetcode.problems.sortStrategy` | `None`、`Acceptance Rate (Ascending)`、`Acceptance Rate (Descending)` | `None` |
| `leetcode.allowReportData` | 选择加入匿名使用数据（还需开启 VS Code 遥测） | `false` |

## 常见问题

**登录提示 "The cookie is not signed in"**

- 确认 `leetcode.endpoint` 是 `leetcode-cn`；
- 确认 cookie 来自已登录的 `https://leetcode.cn`，不是 `leetcode.com`；
- 从 Network 请求头复制，确保包含 `LEETCODE_SESSION` 与 `csrftoken`；
- 打开 Output → LeetCode，日志会显示校验的 endpoint 和 `signedIn` 结果（不会打印 cookie）。

**和官方版冲突**

两个扩展使用相同的 `leetcode.*` 命令/设置 ID，安装前禁用官方版即可。

**命令行安装出现 DEP0169 `url.parse()` 警告**

这是 VS Code 1.142 自带 CLI 在查询 Marketplace 元数据时的 Node 弃用提示，栈在 `resources/app/out/vs/code/node/cliProcessMain.js`，不是本扩展代码。可在扩展视图安装，或忽略；临时隐藏可用 `NODE_OPTIONS=--no-deprecation`（只隐藏提示）。

## 开发

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run package
python scripts/repo_rules.py check --config repo-rules.json
```

`npm run package` 使用 esbuild 生成 `dist/extension.js` 并打包 `.vsix`。按 `F5` 启动扩展开发宿主。发布步骤见 [docs/PUBLISHING.zh-CN.md](docs/PUBLISHING.zh-CN.md)。

## 许可证

MIT。基于原 `vscode-leetcode` 项目及其贡献者。
