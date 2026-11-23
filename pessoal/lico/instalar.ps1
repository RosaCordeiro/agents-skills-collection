# Instala o Lico (persona + voz + painel) no ~/.claude do usuario que rodar.
# Uso:  .\instalar.ps1                (instala de verdade)
#       .\instalar.ps1 -Destino C:\temp\teste -SemEnv   (teste, sem tocar no ~/.claude nem nas variaveis)
param(
    [string]$Destino = (Join-Path $env:USERPROFILE '.claude'),
    [switch]$SemEnv
)
$ErrorActionPreference = 'Stop'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$utf8bom = New-Object System.Text.UTF8Encoding($true)

New-Item -ItemType Directory -Force "$Destino\output-styles", "$Destino\hooks", "$Destino\mods", "$Destino\backups" | Out-Null

# 1. estilo e voz
Copy-Item "$aqui\output-styles\lico.md" "$Destino\output-styles\lico.md" -Force
Copy-Item "$aqui\hooks\lico-voz.ps1" "$Destino\hooks\lico-voz.ps1" -Force

# 2. memoria do Lico (nunca sobrescreve o que ele ja aprendeu)
$apr = "$Destino\aprendizado-lico.md"
if (-not (Test-Path $apr)) {
    [IO.File]::WriteAllText($apr, "# Aprendizado do Lico`r`n`r`nUma linha por aprendizado, com data. O Lico atualiza este arquivo quando e corrigido ou descobre algo duradouro.`r`n", $utf8bom)
}

# 3. CLAUDE.md global importa a memoria
$cl = "$Destino\CLAUDE.md"
$bloco = "`r`n# Lico (persona global)`r`n`r`nO estilo de saida ``Lico`` (``~/.claude/output-styles/lico.md``) define a personalidade e a linha falada.`r`nAs regras dos CLAUDE.md de cada projeto, skills e agents tem prioridade sobre o estilo.`r`n`r`n## O que o Lico ja aprendeu`r`n`r`n@~/.claude/aprendizado-lico.md`r`n"
if (-not (Test-Path $cl)) { [IO.File]::WriteAllText($cl, $bloco, $utf8bom) }
elseif (-not ((Get-Content $cl -Raw -Encoding UTF8) -match 'aprendizado-lico\.md')) { Add-Content $cl $bloco -Encoding UTF8 }

# 4. settings.json: acrescenta outputStyle e hooks sem tocar no resto
$st = "$Destino\settings.json"
if (Test-Path $st) {
    Copy-Item $st "$Destino\backups\settings.json.antes-do-lico-$(Get-Date -Format yyyyMMdd-HHmmss)" -Force
    $cfg = Get-Content $st -Raw -Encoding UTF8 | ConvertFrom-Json
} else { $cfg = [pscustomobject]@{} }

if (-not $cfg.PSObject.Properties['outputStyle']) { $cfg | Add-Member -NotePropertyName outputStyle -NotePropertyValue 'Lico' }
if (-not $cfg.PSObject.Properties['hooks']) { $cfg | Add-Member -NotePropertyName hooks -NotePropertyValue ([pscustomobject]@{}) }
function Add-Hook($evento, $arg) {
    $cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"`$HOME/.claude/hooks/lico-voz.ps1`" $arg"
    $novo = [pscustomobject]@{ hooks = @([pscustomobject]@{ type = 'command'; command = $cmd }) }
    if (-not $cfg.hooks.PSObject.Properties[$evento]) {
        $cfg.hooks | Add-Member -NotePropertyName $evento -NotePropertyValue @($novo)
    } elseif (-not (($cfg.hooks.$evento | ConvertTo-Json -Depth 10) -match 'lico-voz')) {
        $cfg.hooks.$evento = @($cfg.hooks.$evento) + $novo
    }
}
Add-Hook 'Stop' 'stop'
Add-Hook 'Notification' 'aviso'
[IO.File]::WriteAllText($st, ($cfg | ConvertTo-Json -Depth 20), $utf8bom)

# 5. painel (mod) em lugar fixo + variavel de usuario para carregar em toda sessao
$modDest = "$Destino\mods\lico-mascote"
New-Item -ItemType Directory -Force $modDest | Out-Null
Copy-Item "$aqui\mod\lico-mascote\*" $modDest -Recurse -Force
if (-not $SemEnv) {
    $atual = [Environment]::GetEnvironmentVariable('CLAUDE_CODE_PLUGIN_DIRS', 'User')
    $lista = @($atual -split ';' | Where-Object { $_ })
    if ($lista -notcontains $modDest) {
        [Environment]::SetEnvironmentVariable('CLAUDE_CODE_PLUGIN_DIRS', (($lista + $modDest) -join ';'), 'User')
        Write-Host "CLAUDE_CODE_PLUGIN_DIRS atualizado. Reinicie o app do Claude para o painel carregar."
    }
}
Write-Host "Lico instalado em $Destino"
