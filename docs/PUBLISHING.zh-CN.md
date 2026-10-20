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
code --install-extension .\vscode-leetcode-community-0.19.1.vsix --force
```

安装前请禁用官方 `LeetCode.vscode-leetcode`：两者命令、视图与设置 ID 相同。

## 说明

- `npm run package` 会依次执行 typecheck、ESLint、单测、esbuild 与 vsce。
- VSIX 约 563 KB，只包含 `dist/extension.js`，不包含 `node_modules`。
- publisher 不存在或 token 没有 Marketplace 权限时，`vsce publish` 会拒绝发布。
