# LeetCode Community

**한국어** · [简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md)

> VS Code에서 LeetCode 문제를 보고, 풀고, 테스트하고, 제출하세요. 이 README는 글로벌 LeetCode(leetcode.com)를 기준으로 합니다.

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/yanxijian.vscode-leetcode-community?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=yanxijian.vscode-leetcode-community)

## 설치

- Marketplace: <https://marketplace.visualstudio.com/items?itemName=yanxijian.vscode-leetcode-community>
- 명령줄:

  ```powershell
  code --install-extension yanxijian.vscode-leetcode-community
  ```

- 오프라인: [GitHub Releases](https://github.com/yanxijian/vscode-leetcode/releases)에서 `.vsix`를 내려받은 후 실행합니다:

  ```powershell
  code --install-extension .\vscode-leetcode-community-0.24.0.vsix --force
  ```

> [LeetCode-OpenSource/vscode-leetcode](https://github.com/LeetCode-OpenSource/vscode-leetcode)의 커뮤니티 포크입니다. LeetCode 공식 릴리스가 아닙니다. 확장 ID는 `yanxijian.vscode-leetcode-community`이며 명령, 뷰, 설정 ID는 공식 확장과 공유됩니다. 설치 전에 공식 `LeetCode.vscode-leetcode`를 비활성화하세요.

## 기능

- LeetCode 문제를 볼 수 있습니다. AC 상태, 유료 잠금, 태그, 회사를 포함합니다.
- `@lc` 헤더, 코드 템플릿, 선택적 설명 주석이 있는 파일을 생성합니다.
- 문제 설명과 상위 해답을 웹뷰에 표시합니다.
- 별도 CLI나 Node.js 설치 없이 샘플/사용자 테스트를 실행하고 제출합니다.
- 여러 계정을 로컬 세션으로 유지하고 전환합니다.
- 검색, 정렬, 해결한 문제 숨기기, 즐겨찾기 추가/해제를 지원합니다.

## 요구 사항

- [VS Code 1.90](https://code.visualstudio.com/) 이상.
- Node.js 설치가 필요하지 않습니다.

## 로그인

1. 활동 표시줄에서 LeetCode 뷰를 엽니다.
2. **LeetCode: Sign In**을 실행합니다.
3. **LeetCode Cookie**를 선택하고 `https://leetcode.com`에서 복사한 `Cookie` 요청 헤더를 붙여넣습니다. **Web Authorization**도 사용할 수 있습니다.

Cookie는 VS Code `SecretStorage`에 저장되며 일반 텍스트 설정에는 기록되지 않습니다. 기본 엔드포인트는 `auto`입니다. 이 README는 글로벌 사이트를 기준으로 하며 `LeetCode: Switch Endpoint`로 사이트를 전환할 수 있습니다.

`auto`는 시스템 시간대를 기준으로 사이트를 선택합니다. `LeetCode: Switch Endpoint` 또는 `leetcode.endpoint`로 재정의할 수 있습니다. 글로벌 Cookie는 `leetcode.com`에서 가져와야 합니다. 글로벌 Hot 100은 공식 `Top 100 Liked Questions` 목록을 사용합니다.

## 빠른 시작

1. 확장을 설치하고 활성화한 뒤 공식 확장을 비활성화합니다.
2. LeetCode에 로그인합니다.
3. LeetCode 뷰에서 문제를 선택하거나 **Search Problem** / **Pick One**을 실행합니다.
4. 생성된 파일을 편집하고 CodeLens의 **Test** 또는 **Submit**을 사용합니다.
5. 상위 해답이 필요하면 **Solution**을 클릭합니다.

## 명령

| 명령 | 설명 |
| --- | --- |
| `LeetCode: Sign In` / `Sign Out` | 로그인 / 로그아웃 |
| `LeetCode: Switch Endpoint` | LeetCode / LeetCode China 전환 |
| `LeetCode: Search Problem` | 문제 검색 |
| `LeetCode: Show Problem` | 문제를 열고 파일 생성 |
| `LeetCode: Preview Problem` | 문제 설명을 웹뷰에서 미리 보기 |
| `LeetCode: Test in LeetCode` | 샘플 또는 사용자 테스트 실행 |
| `LeetCode: Submit to LeetCode` | 현재 파일 제출 |
| `LeetCode: Show Top Voted Solution` | 상위 해답 열기 |
| `LeetCode: Manage Sessions` | 로컬 세션 관리 |
| `LeetCode: Delete Cache` | 문제 캐시 삭제 |

## 설정

| 설정 | 설명 | 기본값 |
| --- | --- | --- |
| `leetcode.endpoint` | `auto`, `leetcode`, `leetcode-cn` | `auto` |
| `leetcode.defaultLanguage` | 새 파일의 기본 언어 | 설정 안 됨 |
| `leetcode.workspaceFolder` | 문제 파일을 저장할 폴더 | `$HOME/.leetcode` |
| `leetcode.filePath` | 저장 폴더와 파일 이름 템플릿 | `${id}.${kebab-case-name}.${ext}` |
| `leetcode.showDescription` | `In Webview`, `In File Comment`, `Both`, `None` | `In Webview` |
| `leetcode.hideSolved` | 해결한 문제 숨기기 | `false` |
| `leetcode.useEndpointTranslation` | 엔드포인트 번역 사용 | `true` |
| `leetcode.enableStatusBar` | LeetCode 상태 표시줄 표시 | `true` |
| `leetcode.editor.shortcuts` | CodeLens 작업: `submit`, `test`, `star`, `solution`, `description` | `["submit", "test"]` |
| `leetcode.enableSideMode` | 미리 보기/해답을 두 번째 편집기 열에서 열기 | `true` |
| `leetcode.colorizeProblems` | 난이도별로 문제 색상 표시 | `true` |
| `leetcode.problems.sortStrategy` | `None`, `Acceptance Rate (Ascending)`, `Acceptance Rate (Descending)` | `None` |

## 문제 해결

**"The cookie is not signed in"**

- `leetcode.endpoint`가 Cookie 출처(`https://leetcode.com`)와 일치하는지 확인합니다.
- Cookie가 로그인된 사이트에서 가져온 것인지 확인합니다.
- `LEETCODE_SESSION`과 `csrftoken`이 모두 포함되도록 Network 요청 헤더에서 복사합니다.
- Output → LeetCode를 엽니다. Cookie를 출력하지 않고 엔드포인트와 `signedIn` 결과를 기록합니다.

**공식 확장과 충돌**

두 확장 모두 같은 `leetcode.*` 명령/설정 ID를 사용합니다. 공식 확장을 먼저 비활성화하세요.

**CLI 설치 중 DEP0169 `url.parse()` 경고**

VS Code 1.142 CLI가 Marketplace 메타데이터를 조회할 때 발생하는 Node 사용 중단 경고이며 이 확장의 문제가 아닙니다. Extensions 뷰에서 설치하거나 무시하세요. `NODE_OPTIONS=--no-deprecation`으로 숨길 수 있습니다.

## 개발

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run package
python scripts/repo_rules.py check --config repo-rules.json
```

`npm run package`는 esbuild로 `dist/extension.js`를 번들링하고 `.vsix`를 생성합니다. `F5`로 Extension Development Host를 실행합니다. 릴리스 절차: [docs/PUBLISHING.md](docs/PUBLISHING.md).

## 라이선스

MIT. 원본 `vscode-leetcode` 프로젝트와 기여자를 기반으로 합니다.
