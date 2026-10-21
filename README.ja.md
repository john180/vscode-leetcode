# LeetCode Community

**日本語** · [简体中文](README.md) · [English](README.en.md) · [한국어](README.ko.md)

> VS Code で LeetCode の問題閲覧、解答、テスト、提出を行えます。この README はグローバル版 LeetCode（leetcode.com）を前提としています。

変更履歴: [English](CHANGELOG.md)

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/yanxijian.vscode-leetcode-community?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=yanxijian.vscode-leetcode-community)

## インストール

- Marketplace: <https://marketplace.visualstudio.com/items?itemName=yanxijian.vscode-leetcode-community>
- コマンドライン:

  ```powershell
  code --install-extension yanxijian.vscode-leetcode-community
  ```

- オフライン: [GitHub Releases](https://github.com/yanxijian/vscode-leetcode/releases) から `.vsix` をダウンロードし、次を実行します:

  ```powershell
  code --install-extension .\vscode-leetcode-community-0.24.1.vsix --force
  ```

> [LeetCode-OpenSource/vscode-leetcode](https://github.com/LeetCode-OpenSource/vscode-leetcode) のコミュニティ版です。LeetCode 公式リリースではありません。拡張機能 ID は `yanxijian.vscode-leetcode-community` で、コマンド・ビュー・設定 ID は公式版と共通です。インストール前に公式の `LeetCode.vscode-leetcode` を無効化してください。

## 機能

- LeetCode の問題を閲覧できます。AC 状態、有料ロック、タグ、企業を含みます。
- `@lc` ヘッダー、コードテンプレート、任意の説明コメント付きファイルを生成します。
- 問題説明と高評価の解答を Web ビューで表示します。
- 同梱 CLI や Node.js のインストールなしで、サンプル/カスタムテストの実行と提出ができます。
- 複数アカウントをローカルセッションとして保持し、切り替えられます。
- 検索、並べ替え、解決済み問題の非表示、お気に入りの追加/解除ができます。

## 要件

- [VS Code 1.90](https://code.visualstudio.com/) 以降。
- Node.js のインストールは不要です。

## サインイン

1. アクティビティバーの LeetCode ビューを開きます。
2. **LeetCode: Sign In** を実行します。
3. **LeetCode Cookie** を選び、`https://leetcode.com` からコピーした `Cookie` リクエストヘッダーを貼り付けます。**Web Authorization** も利用できます。

Cookie は VS Code の `SecretStorage` に保存され、平文設定には書き込まれません。既定のエンドポイントは `auto` です。この README はグローバル版を前提とし、サイトの切り替えは `LeetCode: Switch Endpoint` で行えます。

`auto` はシステムのタイムゾーンでサイトを選びます。`LeetCode: Switch Endpoint` または `leetcode.endpoint` で上書きできます。グローバル版の Cookie は `leetcode.com` のものである必要があります。グローバル版の Hot 100 は公式の `Top 100 Liked Questions` を使用します。

## クイックスタート

1. 拡張機能をインストールして有効化し、公式版を無効化します。
2. LeetCode にサインインします。
3. LeetCode ビューで問題を選ぶか、**Search Problem** / **Pick One** を実行します。
4. 生成されたファイルを編集し、CodeLens の **Test** または **Submit** を実行します。
5. 高評価の解答が必要な場合は **Solution** をクリックします。

## コマンド

| コマンド | 説明 |
| --- | --- |
| `LeetCode: Sign In` / `Sign Out` | サインイン / サインアウト |
| `LeetCode: Switch Endpoint` | LeetCode / LeetCode China を切り替え |
| `LeetCode: Search Problem` | 問題を検索 |
| `LeetCode: Show Problem` | 問題を開いてファイルを生成 |
| `LeetCode: Preview Problem` | 問題説明を Web ビューでプレビュー |
| `LeetCode: Test in LeetCode` | サンプルまたはカスタムテストを実行 |
| `LeetCode: Submit to LeetCode` | 現在のファイルを提出 |
| `LeetCode: Show Top Voted Solution` | 高評価の解答を開く |
| `LeetCode: Manage Sessions` | ローカルセッションを管理 |
| `LeetCode: Delete Cache` | 問題キャッシュを削除 |

## 設定

| 設定 | 説明 | 既定値 |
| --- | --- | --- |
| `leetcode.endpoint` | `auto`、`leetcode`、`leetcode-cn` | `auto` |
| `leetcode.defaultLanguage` | 新しいファイルの既定言語 | 未設定 |
| `leetcode.workspaceFolder` | 問題ファイルを保存するフォルダー | `$HOME/.leetcode` |
| `leetcode.filePath` | 保存先フォルダーとファイル名テンプレート | `${id}.${kebab-case-name}.${ext}` |
| `leetcode.showDescription` | `In Webview`、`In File Comment`、`Both`、`None` | `In Webview` |
| `leetcode.hideSolved` | 解決済み問題を非表示 | `false` |
| `leetcode.useEndpointTranslation` | エンドポイントの翻訳を使用 | `true` |
| `leetcode.enableStatusBar` | LeetCode のステータスバーを表示 | `true` |
| `leetcode.editor.shortcuts` | CodeLens の操作: `submit`、`test`、`star`、`solution`、`description` | `["submit", "test"]` |
| `leetcode.enableSideMode` | プレビュー/解答を 2 番目のエディター列で開く | `true` |
| `leetcode.colorizeProblems` | 難易度で問題を色分け | `true` |
| `leetcode.problems.sortStrategy` | `None`、`Acceptance Rate (Ascending)`、`Acceptance Rate (Descending)` | `None` |

## トラブルシューティング

**「The cookie is not signed in」**

- `leetcode.endpoint` が Cookie の取得元（`https://leetcode.com`）と一致しているか確認します。
- Cookie がサインイン済みのサイトから取得されているか確認します。
- `LEETCODE_SESSION` と `csrftoken` の両方を含むよう、Network のリクエストヘッダーからコピーします。
- Output → LeetCode を開きます。Cookie を表示せずにエンドポイントと `signedIn` の結果が記録されます。

**公式拡張機能との競合**

両方の拡張機能が同じ `leetcode.*` のコマンド/設定 ID を使用します。先に公式版を無効化してください。

**CLI インストール時の DEP0169 `url.parse()` 警告**

これは VS Code 1.142 CLI が Marketplace のメタデータを問い合わせる際の Node の非推奨警告で、この拡張機能のものではありません。Extensions ビューからインストールするか無視してください。`NODE_OPTIONS=--no-deprecation` で非表示にできます。

## 開発

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run test:integration  # 任意、VS Code が必要
npm run package
python scripts/repo_rules.py check --config repo-rules.json
```

`npm run package` は esbuild で `dist/extension.js` をバンドルし、`.vsix` を生成します。`F5` で Extension Development Host を起動します。リリース手順: [docs/PUBLISHING.md](docs/PUBLISHING.md)。

## ライセンス

MIT。元の `vscode-leetcode` プロジェクトと貢献者に基づきます。
