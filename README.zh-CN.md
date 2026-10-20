# LeetCode Community

> 在 VS Code 中练习 LeetCode，以 leetcode.cn 为主要站点。

**简体中文** · [English](README.md)

> 本项目是 [LeetCode-OpenSource/vscode-leetcode](https://github.com/LeetCode-OpenSource/vscode-leetcode) 的社区分支，不是 LeetCode 官方发布。扩展 ID 为 `yanxijian.vscode-leetcode`；命令、视图与设置 ID 与官方版相同，安装前请先禁用官方版。

## 运行条件

- [VS Code 1.90](https://code.visualstudio.com/) 或更高版本。
- 不再需要安装 Node.js。扩展直接通过 HTTPS 访问 LeetCode。

## 登录

1. 在活动栏打开 LeetCode 视图。
2. 执行 **LeetCode: Sign In**（登录）。
3. 粘贴从 `https://leetcode.cn` 复制的 `Cookie` 请求头（推荐），或使用 **Web Authorization**。

Cookie 保存在 VS Code 的 `SecretStorage` 中，不会以明文写入设置。

## 功能

- 浏览 leetcode.cn 全部题目，支持 `LCP` / 面试题等特殊题号，显示中文标题、AC 状态、付费锁、标签与公司。
- 打开题目并生成带 `@lc` 头、代码模板与可选描述注释的文件。
- 在 Webview 中查看题目描述与高赞题解。
- 直接运行样例/自定义测试并提交，不再依赖内置的 LeetCode CLI。
- 支持本地多账号会话，可创建、切换、删除。
- 支持搜索、排序、隐藏已做题目与收藏/取消收藏。

## 设置

| 设置 | 说明 | 默认值 |
| --- | --- | --- |
| `leetcode.endpoint` | 当前站点：`leetcode` 或 `leetcode-cn` | `leetcode` |
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

## 开发

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run package
```

`npm run package` 使用 esbuild 生成 `dist/extension.js` 并打包 `.vsix`。按 `F5` 启动扩展开发宿主。

## 许可证

MIT。基于原 `vscode-leetcode` 项目及其贡献者。
