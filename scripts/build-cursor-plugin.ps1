# Monta um plugin do Cursor a partir da fonte deste repositorio.
#
#   .\scripts\build-cursor-plugin.ps1 -Plugin dev-pessoal            # so monta
#   .\scripts\build-cursor-plugin.ps1 -Plugin dev-pessoal -Install   # monta e instala
#
# Le plugins\cursor\<Plugin>.json e grava a pasta pronta em ..\cursor-plugins\<nome>
# (fora do repo). Com -Install, copia para %USERPROFILE%\.cursor\plugins\local\<nome>.
# A fonte nao e alterada.
#
# Chaves da definicao:
#   skills          skills copiadas (md convertido, demais arquivos copiados)
#   agents          agents que rodam como subagent (agents\<nome>.md)
#   agentsAsSkills  agents que rodam "neste chat" e viram skill propria
#   chatAgents      agents que rodam "neste chat" e viram arquivo de uma skill
#   rules           rules (.mdc) copiadas para rules\
#   descriptions    descricao trocada por skill ou agent
#   models          `model:` de um agent (ex.: apelido do Claude Code -> inherit)
#   overrides       arquivo plugins\cursor\overrides\<plugin>\<caminho no plugin> substitui a fonte
#   replacements    trocas literais (todos os arquivos)
#   scrub           limpeza por arquivo: dropSection (heading; com `with` troca a secao),
#                   dropLine (trecho) ou from/to
#   forbid          regex proibidas no resultado; qualquer ocorrencia aborta a montagem
#
# O que a montagem faz com cada .md:
#   - frontmatter: remove claude-model*; em skill remove tambem model/readonly;
#     garante `name:`; aplica descriptions;
#   - remove os blocos marcados com <!-- claude-model --> (ate o proximo `## `);
#   - aplica scrub;
#   - caminhos ~/.claude/{skills,agents,rules}/... viram o installPath do plugin.

param(
    [Parameter(Mandatory = $true)][string]$Plugin,
    [string]$OutRoot,
    [switch]$Install
)
$ErrorActionPreference = 'Stop'

$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$defPath = Join-Path $repo "plugins\cursor\$Plugin.json"
if (-not (Test-Path $defPath)) { throw "Definicao nao encontrada: $defPath" }
$def = [IO.File]::ReadAllText($defPath, [Text.Encoding]::UTF8) | ConvertFrom-Json

if (-not $OutRoot) { $OutRoot = Join-Path $repo '..\cursor-plugins' }
$out = Join-Path ([IO.Path]::GetFullPath($OutRoot)) $def.name
$installPath = $def.installPath
$utf8 = New-Object Text.UTF8Encoding($false)

$skills = @($def.skills | Where-Object { $_ })
$agents = @($def.agents | Where-Object { $_ })
$asSkills = @($def.agentsAsSkills | Where-Object { $_ })
$chat = @($def.chatAgents | Where-Object { $_ })
$rules = @($def.rules | Where-Object { $_ })
$scrub = @($def.scrub | Where-Object { $_ })
$replacements = @($def.replacements | Where-Object { $_ })
$forbid = @($def.forbid | Where-Object { $_ })

$skillSet = @($skills + $asSkills) | Select-Object -Unique
$aliasFile = @{}
foreach ($c in $chat) { $aliasFile[$c.agent] = "skills/$($c.skill)/$($c.file)" }

$scrubHit = @{}
$fmRegex = '\A---\n([\s\S]*?)\n---\n'

function Read-Text($Path) {
    $t = [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
    return $t.Replace("`r`n", "`n")
}

$overrideRoot = Join-Path $repo "plugins\cursor\overrides\$Plugin"
$overridesUsed = New-Object Collections.ArrayList

# fonte do arquivo: se existir plugins\cursor\overrides\<plugin>\<rel>, ele substitui a fonte
function Get-Source($SrcPath, $Rel) {
    $ov = Join-Path $overrideRoot ($Rel -replace '/', '\')
    if (Test-Path $ov) { [void]$overridesUsed.Add($Rel); return Read-Text $ov }
    return Read-Text $SrcPath
}

function Write-Text($Path, $Text) {
    $dir = Split-Path $Path -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    [IO.File]::WriteAllText($Path, $Text, $utf8)
}

function Format-Folded($Text) {
    $lines = @()
    $cur = ''
    foreach ($w in ($Text -split '\s+')) {
        if ($cur -and ($cur.Length + $w.Length + 1) -gt 76) { $lines += "  $cur"; $cur = $w }
        elseif ($cur) { $cur = "$cur $w" }
        else { $cur = $w }
    }
    if ($cur) { $lines += "  $cur" }
    return ($lines -join "`n")
}

function Convert-Frontmatter($Fm, $Name, $Kind) {
    $Fm = [regex]::Replace($Fm, '(?m)^(claude-model|claude-model-fallback|cursor-model):[^\n]*(\n|$)', '')
    if ($Kind -eq 'skill') { $Fm = [regex]::Replace($Fm, '(?m)^(model|readonly):[^\n]*(\n|$)', '') }
    $mdl = $def.models.$Name
    if ($Kind -eq 'agent' -and $mdl) {
        $Fm = [regex]::Replace($Fm, '(?m)^model:[^\n]*(\n|$)', '')
        $Fm = $Fm.TrimEnd() + "`nmodel: $mdl"
    }
    $Fm = $Fm.TrimEnd()
    $desc = $def.descriptions.$Name
    if ($desc) {
        $block = 'description: >-' + "`n" + (Format-Folded $desc) + "`n"
        $Fm = [regex]::Replace($Fm, '(?ms)^description:.*?(?=^[A-Za-z-]+:|\z)', { param($x) $block })
        $Fm = $Fm.TrimEnd()
    }
    if ($Fm -notmatch '(?m)^name:') { $Fm = "name: $Name`n$Fm" }
    return $Fm
}

# remove de "<!-- claude-model -->" ate o proximo "## " (ou fim do arquivo)
function Remove-ClaudeBlocks($Text) {
    $res = New-Object Collections.Generic.List[string]
    $skip = $false
    foreach ($line in ($Text -split "`n")) {
        if ($line -match '^<!--\s*claude-model\s*-->\s*$') { $skip = $true; continue }
        if ($skip -and $line -match '^## ') { $skip = $false }
        if (-not $skip) { $res.Add($line) }
    }
    return ($res -join "`n")
}

function Apply-Scrub($Text, $Rel) {
    for ($i = 0; $i -lt $scrub.Count; $i++) {
        $s = $scrub[$i]
        if ($s.file -and $s.file -ne $Rel) { continue }

        if ($s.dropSection) {
            $lines = New-Object Collections.Generic.List[string]
            $lines.AddRange([string[]]($Text -split "`n"))
            $idx = -1
            for ($k = 0; $k -lt $lines.Count; $k++) {
                if ($lines[$k].StartsWith($s.dropSection)) { $idx = $k; break }
            }
            if ($idx -ge 0) {
                $level = ([regex]::Match($lines[$idx], '^#+')).Length
                $end = $lines.Count
                $fence = $false
                for ($k = $idx + 1; $k -lt $lines.Count; $k++) {
                    if ($lines[$k] -match '^```') { $fence = -not $fence; continue }
                    if (-not $fence -and $lines[$k] -match "^#{1,$level} ") { $end = $k; break }
                }
                $lines.RemoveRange($idx, $end - $idx)
                if ($s.with) { $lines.InsertRange($idx, [string[]]($s.with -split "`n")) }
                $Text = $lines -join "`n"
                $scrubHit[$i] = $true
            }
        }
        elseif ($s.dropLine) {
            $lines = @($Text -split "`n")
            $kept = @($lines | Where-Object { -not $_.Contains($s.dropLine) })
            if ($kept.Count -ne $lines.Count) { $Text = $kept -join "`n"; $scrubHit[$i] = $true }
        }
        elseif ($s.from) {
            if ($Text.Contains($s.from)) { $Text = $Text.Replace($s.from, $s.to); $scrubHit[$i] = $true }
        }
    }
    return $Text
}

function Convert-Paths($Text, $Rel) {
    foreach ($r in $replacements) { $Text = $Text.Replace($r.from, $r.to) }

    $Text = [regex]::Replace($Text, '~/\.(?:claude|cursor)/skills/([a-z0-9-]+)/([A-Za-z0-9_./-]*)', {
        param($m)
        if ($skillSet -contains $m.Groups[1].Value) { return "$installPath/skills/$($m.Groups[1].Value)/$($m.Groups[2].Value)" }
        return $m.Value
    })
    $Text = [regex]::Replace($Text, '~/\.(?:claude|cursor)/agents/([a-z0-9-]+)\.md', {
        param($m)
        $n = $m.Groups[1].Value
        if ($aliasFile.ContainsKey($n)) { return "$installPath/$($aliasFile[$n])" }
        if ($asSkills -contains $n) { return "$installPath/skills/$n/SKILL.md" }
        if ($agents -contains $n) { return "$installPath/agents/$n.md" }
        return $m.Value
    })
    $Text = [regex]::Replace($Text, '~/\.(?:claude|cursor)/rules/([a-z0-9-]+)\.mdc', {
        param($m)
        if ($rules -contains $m.Groups[1].Value) { return "$installPath/rules/$($m.Groups[1].Value).mdc" }
        return $m.Value
    })
    return $Text
}

# Kind: skill | agent | rule | body (sem frontmatter)
function Convert-Doc($Text, $Rel, $Kind, $Name) {
    $m = [regex]::Match($Text, $fmRegex)
    if ($Kind -in 'skill', 'agent') {
        if (-not $m.Success) { throw "Sem frontmatter: $Rel" }
        $fm = Convert-Frontmatter $m.Groups[1].Value $Name $Kind
        $Text = "---`n$fm`n---`n" + $Text.Substring($m.Length)
    }
    $Text = Remove-ClaudeBlocks $Text
    $Text = Apply-Scrub $Text $Rel
    $Text = Convert-Paths $Text $Rel
    $Text = [regex]::Replace($Text, "\n{3,}", "`n`n")
    return $Text.TrimEnd() + "`n"
}

function Get-Body($Text) {
    $m = [regex]::Match($Text, $fmRegex)
    if (-not $m.Success) { return $Text }
    return $Text.Substring($m.Length).Trim() + "`n"
}

# --- destino: so apaga se for um plugin gerado antes ---
if (Test-Path $out) {
    if (-not (Test-Path (Join-Path $out '.cursor-plugin\plugin.json'))) {
        throw "Destino existe e nao parece um plugin gerado: $out"
    }
    Remove-Item $out -Recurse -Force
}

# --- skills ---
foreach ($s in $skills) {
    $src = Join-Path $repo "skills\$s"
    if (-not (Test-Path $src)) { throw "Skill nao existe na fonte: $s" }
    Get-ChildItem $src -Recurse -File | ForEach-Object {
        $rel = "skills/$s" + ($_.FullName.Substring($src.Length) -replace '\\', '/')
        $dst = Join-Path $out ($rel -replace '/', '\')
        if ($_.Extension -eq '.md') {
            $isMain = ($_.Name -eq 'SKILL.md' -and $_.DirectoryName -eq $src)
            $kind = if ($isMain) { 'skill' } else { 'body' }
            Write-Text $dst (Convert-Doc (Get-Source $_.FullName $rel) $rel $kind $s)
        } else {
            $dir = Split-Path $dst -Parent
            if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
            Copy-Item $_.FullName $dst -Force
        }
    }
}

# --- agents (subagents) ---
foreach ($a in $agents) {
    $src = Join-Path $repo "agents\$a.md"
    if (-not (Test-Path $src)) { throw "Agent nao existe na fonte: $a" }
    Write-Text (Join-Path $out "agents\$a.md") (Convert-Doc (Get-Source $src "agents/$a.md") "agents/$a.md" 'agent' $a)
}

# --- agents que rodam neste chat e viram skill propria ---
foreach ($a in $asSkills) {
    $src = Join-Path $repo "agents\$a.md"
    if (-not (Test-Path $src)) { throw "Agent nao existe na fonte: $a" }
    if ($skills -contains $a) { throw "agentsAsSkills: ja existe skill com o nome $a" }
    $rel = "skills/$a/SKILL.md"
    Write-Text (Join-Path $out "skills\$a\SKILL.md") (Convert-Doc (Get-Source $src $rel) $rel 'skill' $a)
}

# --- agents que rodam neste chat e viram arquivo de uma skill ---
foreach ($c in $chat) {
    if ($skills -notcontains $c.skill) { throw "chatAgents: skill $($c.skill) nao esta no plugin" }
    $body = Get-Body (Read-Text (Join-Path $repo "agents\$($c.agent).md"))
    $rel = "skills/$($c.skill)/$($c.file)"
    Write-Text (Join-Path $out ($rel -replace '/', '\')) (Convert-Doc $body $rel 'body' $c.agent)

    $skillMd = Join-Path $out "skills\$($c.skill)\SKILL.md"
    $extra = "`n## Conducao neste chat`n`n" +
        "Antes de comecar, ler ``$installPath/$rel``: traz a primeira acao, " +
        "os gates e as perguntas de aprovacao de cada fase. Este fluxo roda neste chat; nao lancar como subagent.`n"
    Write-Text $skillMd ((Read-Text $skillMd).TrimEnd() + "`n" + $extra)
}

# --- rules ---
foreach ($r in $rules) {
    $src = Join-Path $repo "rules\$r.mdc"
    if (-not (Test-Path $src)) { throw "Rule nao existe na fonte: $r" }
    Write-Text (Join-Path $out "rules\$r.mdc") (Convert-Doc (Get-Source $src "rules/$r.mdc") "rules/$r.mdc" 'rule' $r)
}

# --- regras de limpeza que nao acharam alvo: a fonte mudou ---
$dead = @()
for ($i = 0; $i -lt $scrub.Count; $i++) {
    if (-not $scrubHit.ContainsKey($i)) {
        $s = $scrub[$i]
        $what = "$($s.dropSection)$($s.dropLine)$($s.from)"
        $dead += "scrub sem efeito em $($s.file): $what"
    }
}

# --- manifesto ---
$manifest = [ordered]@{
    name        = $def.name
    displayName = $def.displayName
    version     = $def.version
    description = $def.description
    author      = [ordered]@{ name = $def.author }
    skills      = './skills/'
    agents      = './agents/'
    rules       = './rules/'
}
Write-Text (Join-Path $out '.cursor-plugin\plugin.json') (($manifest | ConvertTo-Json) + "`n")

# --- README ---
$md = @()
$md += "# $($def.displayName)"
$md += ''
$md += $def.description
$md += ''
$md += '## Conteudo'
$md += ''
$md += '| Tipo | Nome |'
$md += '|------|------|'
foreach ($s in ($skills + $asSkills)) { $md += "| Skill | ``$s`` |" }
foreach ($a in $agents) { $md += "| Subagent | ``$a`` |" }
foreach ($r in $rules) { $md += "| Rule | ``$r`` |" }
$md += ''
$md += "Gerado por ``scripts/build-cursor-plugin.ps1 -Plugin $Plugin``. Nao editar aqui: alterar a fonte e montar de novo."
Write-Text (Join-Path $out 'README.md') (($md -join "`n") + "`n")

# --- checagens no que foi gerado ---
$errors = New-Object Collections.ArrayList
foreach ($d in $dead) { [void]$errors.Add($d) }
$cited = @{}
$allNames = @(
    (Get-ChildItem (Join-Path $repo 'skills') -Directory).Name +
    (Get-ChildItem (Join-Path $repo 'agents') -Filter *.md).BaseName | Select-Object -Unique
)
$inPlugin = @($skills + $asSkills + $agents + ($chat | ForEach-Object { $_.agent }))
Get-ChildItem $out -Recurse -File | Where-Object { $_.Extension -in '.md', '.mdc', '.json' } | ForEach-Object {
    $rel = $_.FullName.Substring($out.Length + 1)
    $t = Read-Text $_.FullName
    foreach ($p in $forbid) {
        foreach ($hit in [regex]::Matches($t, $p, 'IgnoreCase')) {
            $ln = ($t.Substring(0, $hit.Index) -split "`n").Count
            [void]$errors.Add("${rel}:$ln : proibido ($($hit.Value))")
        }
    }
    foreach ($n in $allNames) {
        if ($inPlugin -contains $n) { continue }
        $e = [regex]::Escape($n)
        if ([regex]::IsMatch($t, '`' + $e + '`|(?<![\w/.:\\-])/' + $e + '(?![\w-])')) {
            if (-not $cited.ContainsKey($n)) { $cited[$n] = New-Object Collections.ArrayList }
            [void]$cited[$n].Add($rel)
        }
    }
}

Write-Host ''
Write-Host "Plugin $($def.name) $($def.version) -> $out" -ForegroundColor Cyan
Write-Host "  skills: $($skills.Count + $asSkills.Count)   subagents: $($agents.Count)   rules: $($rules.Count)   arquivos: $((Get-ChildItem $out -Recurse -File).Count)"
if ($overridesUsed.Count -gt 0) {
    Write-Host "  Fontes trocadas por override (conferir se a fonte mudou): $(($overridesUsed | Select-Object -Unique) -join ', ')" -ForegroundColor DarkYellow
}
if ($cited.Count -gt 0) {
    Write-Host '  Citacoes a skills/agents fora do plugin (ficam sem efeito):' -ForegroundColor Yellow
    foreach ($n in ($cited.Keys | Sort-Object)) { Write-Host "    $n  <- $(($cited[$n] | Select-Object -Unique) -join ', ')" }
}
if ($errors.Count -gt 0) {
    foreach ($e in $errors) { Write-Host "  ERRO $e" -ForegroundColor Red }
    throw "Plugin gerado com $($errors.Count) erro(s); corrigir a fonte ou a definicao e montar de novo."
}

if ($Install) {
    $dest = Join-Path $env:USERPROFILE ".cursor\plugins\local\$($def.name)"
    if (Test-Path $dest) {
        if (-not (Test-Path (Join-Path $dest '.cursor-plugin\plugin.json'))) { throw "Destino existe e nao parece um plugin: $dest" }
        Remove-Item $dest -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Copy-Item -Path (Join-Path $out '*') -Destination $dest -Recurse -Force
    Copy-Item -Path (Join-Path $out '.cursor-plugin') -Destination $dest -Recurse -Force
    Write-Host "  Instalado em $dest" -ForegroundColor Green
    Write-Host '  Reinicie o Cursor (ou abra um chat novo) para carregar.'
}
Write-Host '  OK' -ForegroundColor Green
