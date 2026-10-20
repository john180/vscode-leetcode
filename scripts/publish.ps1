param(
    [string]$PatFile = (Join-Path $env:USERPROFILE "Desktop\vsce-pat.txt"),
    [string]$Vsix = ""
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

if (-not $env:VSCE_PAT) {
    if (-not (Test-Path $PatFile)) {
        throw "Set VSCE_PAT or put the token in $PatFile"
    }
    $env:VSCE_PAT = (Get-Content $PatFile -TotalCount 1).Trim()
}

if (-not $Vsix) {
    $Vsix = Get-ChildItem -Filter "vscode-leetcode-*.vsix" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}
if (-not $Vsix -or -not (Test-Path $Vsix)) {
    throw "VSIX not found. Run 'npm run package' first."
}

Write-Host "Publishing $Vsix"
npx vsce publish --packagePath "$Vsix"
