# 发布说明

扩展以 **`yanxijian.vscode-leetcode-community`** 发布；只有创建 publisher 和获取
`Marketplace > Manage` 权限的 PAT 需要账号操作。

> Global PAT 将于 **2026-12-01** 退役。下面的 PAT 流程仅在该日期前有效；
> 之后请按 VS Code 文档改用 Microsoft Entra ID 发布
> （`vsce publish --azure-credential`）。

## 1. 创建 publisher

1. 打开 <https://marketplace.visualstudio.com/manage>。
2. 若不存在，创建 publisher **`yanxijian`**。
3. 确认 `yanxijian.vscode-leetcode-community` 仍可用。

## 2. 创建 PAT

1. 打开 <https://dev.azure.com> 创建 Personal Access Token。
2. 权限选择 **Marketplace > Manage**（组织：all accessible organizations）。
3. 把 token 放在仓库外，例如 `%USERPROFILE%\Desktop\vsce-pat.txt`，不要提交。

## 3. 发布

本地：

```powershell
npm ci
npm run package
.\scripts\publish.ps1 -PatFile "$env:USERPROFILE\Desktop\vsce-pat.txt"
```

脚本优先读取 `VSCE_PAT`，否则读取 `-PatFile` 的第一行。

CI：把 token 配成仓库 secret `VSCE_PAT`，然后手动运行 **Release** 工作流，
版本号需与 `package.json` 一致。

## 4. 验证

```powershell
code --install-extension .\vscode-leetcode-community-0.19.4.vsix --force
```

安装前请禁用官方 `LeetCode.vscode-leetcode`：两者命令、视图与设置 ID 相同。

## 5. 发布检查清单

1. 同步修改 `package.json`、`package-lock.json`、`CHANGELOG.md`、`README.md`
   与所有 `README.*` 版本（含离线 VSIX 文件名）；不一致时仓库规则会失败。
2. 运行 `python scripts/repo_rules.py check --config repo-rules.json`。
3. **先改 README/版本，再打包**：`npm run package`。VSIX 会嵌入当时的
   `README.md`，提前打包会把旧文案发到商店页。
4. 创建一个独立的 release commit，subject 必须是 `release: X.Y.Z`，然后在这个
   **同一个提交**上创建 annotated tag `vX.Y.Z`；不要在后来的测试/文档提交上打 tag。
5. 发布后等 `vsce show` / Marketplace API 显示新版本再对外宣布；
   索引通常需要约 10 分钟。

## 发布不变量

可发布的提交必须同时满足：

1. 各 package/文档文件里的版本已经是 `X.Y.Z`；
2. `HEAD` 的 subject 正好是 `release: X.Y.Z`；
3. `vX.Y.Z` 指向 `HEAD`；
4. 工作区干净；
5. tag 之后没有运行时代码或版本变更。

`node scripts/check-release.mjs` 会在发布前强制检查；
`scripts/publish.ps1` 和 Release 工作流都会调用它。

历史例外：`v0.24.0` 的 tag 曾落在测试提交上，以后不得重复该模式。

## 版本策略

Marketplace 只发布明确确认要上架的版本。中间补丁只发布到 GitHub Releases，
使用 `--force` 安装，不主动上传 Marketplace，除非明确要求。

## 说明

- `npm run package` 会依次执行 typecheck、ESLint、单测、esbuild 与 vsce。
- VSIX 约 320 KB，只包含 `dist/extension.js`，不包含 `node_modules`。
- publisher 不存在或 token 没有 Marketplace 权限时，`vsce publish` 会拒绝发布。
