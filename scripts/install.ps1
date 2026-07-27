# Instala agents, skills e rules do cursor-kit no Cursor (Windows).
# Uso: powershell -ExecutionPolicy Bypass -File scripts\install.ps1 [-Force]
param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$CursorDir = Join-Path $env:USERPROFILE ".cursor"

Write-Host "Destino: $CursorDir"

foreach ($name in @("agents", "skills", "rules")) {
  $src = Join-Path $Root $name
  $dest = Join-Path $CursorDir $name
  if (-not (Test-Path $src)) {
    Write-Host "Pulando $name (origem ausente): $src"
    continue
  }
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  if ($Force) {
    Get-ChildItem -Force $dest | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  }
  Copy-Item -Path (Join-Path $src "*") -Destination $dest -Recurse -Force
  Write-Host "OK  $name -> $dest"
}

Write-Host ""
Write-Host "Instalacao concluida."
Write-Host "Abra um chat novo no Cursor (ou reinicie) para carregar agents/skills/rules."
Write-Host "Nao altera skills-cursor/ (skills nativas do Cursor)."
