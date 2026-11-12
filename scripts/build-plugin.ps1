# Monta um plugin do Claude Code a partir da fonte deste repositorio.
#
#   .\scripts\build-plugin.ps1 -Plugin clamed-pb
#
# Le plugins\<Plugin>.json (o que entra no plugin) e grava a pasta pronta em
# ..\clamed-plugins\<nome> (fora do repo). A fonte nao e alterada.
#
# Chaves da definicao:
#   skills          skills copiadas como estao
#   agents          agents que rodam como subagent
#   agentsAsSkills  agents que rodam "neste chat" e viram skill propria
#   chatAgents      agents que rodam "neste chat" e viram arquivo de uma skill
#   rules           rules copiadas para dentro de uma skill (pasta regras/)
#   descriptions    descricao trocada por skill ou agent
#   replacements    trocas literais de texto (de/para)
#   keepSkillModel  grava `model:` nas skills a partir de claude-model
#
# O que a montagem faz com cada .md:
#   - frontmatter: remove os campos do Cursor e os claude-model*; grava
#     `model:` com o valor de claude-model; troca <x> por {x};
#   - caminhos ~/.claude/{skills,agents,rules}/... viram ${CLAUDE_PLUGIN_ROOT}/...;
#   - nomes de skills e agents do plugin ganham o prefixo `<plugin>:`; os que
#     pertencem a outro plugin definido em plugins\ ganham o prefixo dele;
#   - AskQuestion (Cursor) vira AskUserQuestion.

param(
    [Parameter(Mandatory = $true)][string]$Plugin,
    [string]$OutRoot
)
$ErrorActionPreference = 'Stop'

$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$defPath = Join-Path $repo "plugins\$Plugin.json"
if (-not (Test-Path $defPath)) { throw "Definicao nao encontrada: $defPath" }
$def = [IO.File]::ReadAllText($defPath, [Text.Encoding]::UTF8) | ConvertFrom-Json

if (-not $OutRoot) { $OutRoot = Join-Path $repo '..\clamed-plugins' }
$out = Join-Path ([IO.Path]::GetFullPath($OutRoot)) $def.name
$prefix = $def.name
$utf8 = New-Object Text.UTF8Encoding($false)

$skills = @($def.skills | Where-Object { $_ })
$agents = @($def.agents | Where-Object { $_ })
$asSkills = @($def.agentsAsSkills | Where-Object { $_ })
$chat = @($def.chatAgents | Where-Object { $_ })
$replacements = @($def.replacements | Where-Object { $_ })
$alias = @{}
$aliasFile = @{}
foreach ($c in $chat) {
    $alias[$c.agent] = $c.skill
    $aliasFile[$c.agent] = "skills/$($c.skill)/$($c.file)"
}
$ruleNames = @()
$ruleInto = $null
if ($def.rules) {
    $ruleNames = @($def.rules.names | Where-Object { $_ })
    $ruleInto = $def.rules.into
}
$inSet = @($skills + $agents + $asSkills | Select-Object -Unique | Sort-Object Length -Descending)
$allNames = @(
    (Get-ChildItem (Join-Path $repo 'skills') -Directory).Name +
    (Get-ChildItem (Join-Path $repo 'agents') -Filter *.md).BaseName | Select-Object -Unique
)
# nomes que pertencem a outro plugin definido em plugins\*.json: nome -> plugin:nome
$otherMap = @{}
Get-ChildItem (Join-Path $repo 'plugins') -Filter *.json | Where-Object { $_.BaseName -ne $Plugin } | ForEach-Object {
    $o = [IO.File]::ReadAllText($_.FullName, [Text.Encoding]::UTF8) | ConvertFrom-Json
    foreach ($n in (@($o.skills) + @($o.agents) + @($o.agentsAsSkills))) {
        if ($n -and -not $otherMap.ContainsKey($n)) { $otherMap[$n] = "$($o.name):$n" }
    }
    foreach ($c in @($o.chatAgents)) {
        if ($c -and -not $otherMap.ContainsKey($c.agent)) { $otherMap[$c.agent] = "$($o.name):$($c.skill)" }
    }
}
$external = @{}
$cross = @{}
$warnings = New-Object Collections.ArrayList
$fmRegex = '\A(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))'

function Read-Text($Path) {
    return [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
}

function Write-Text($Path, $Text) {
    $dir = Split-Path $Path -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    [IO.File]::WriteAllText($Path, $Text, $utf8)
}

function Get-Body($Text) {
    $m = [regex]::Match($Text, $fmRegex)
    return $Text.Substring($m.Length).Trim() + "`r`n"
}

function Format-Folded($Text, $Nl) {
    $lines = @()
    $cur = ''
    foreach ($w in ($Text -split '\s+')) {
        if ($cur -and ($cur.Length + $w.Length + 1) -gt 76) { $lines += "  $cur"; $cur = $w }
        elseif ($cur) { $cur = "$cur $w" }
        else { $cur = $w }
    }
    if ($cur) { $lines += "  $cur" }
    return ($lines -join $Nl)
}

function Convert-Frontmatter($Text, $Name, $IsSkill) {
    $m = [regex]::Match($Text, $fmRegex)
    if (-not $m.Success) { throw "Sem frontmatter: $Name" }
    $fm = $m.Groups[2].Value
    $nl = "`n"
    if ($m.Groups[1].Value -match "`r") { $nl = "`r`n" }

    $cm = [regex]::Match($fm, '(?m)^claude-model:\s*(\S+)')
    $fm = [regex]::Replace($fm, '(?m)^(model|cursor-model|claude-model|claude-model-fallback|readonly):[^\r\n]*(\r?\n|$)', '')
    $fm = $fm.TrimEnd()

    $desc = $def.descriptions.$Name
    if ($desc) {
        $block = 'description: >-' + $nl + (Format-Folded $desc $nl) + $nl
        $fm = [regex]::Replace($fm, '(?ms)^description:.*?(?=^[A-Za-z-]+:|\z)', { param($x) $block })
        $fm = $fm.TrimEnd()
    }

    # a validacao do claude.ai recusa <...> no frontmatter (le como tag XML)
    $fm = [regex]::Replace($fm, '<([^<>\r\n]+)>', '{$1}')

    if ($cm.Success -and ((-not $IsSkill) -or $def.keepSkillModel)) {
        $fm = $fm + $nl + 'model: ' + $cm.Groups[1].Value
    }
    return $m.Groups[1].Value + $fm + $m.Groups[3].Value + $Text.Substring($m.Length)
}

function Convert-Text($Text, $Rel) {
    foreach ($r in $replacements) { $Text = $Text.Replace($r.from, $r.to) }

    # ~/.claude/skills/<skill>/<arquivo> -> raiz do plugin
    $Text = [regex]::Replace($Text, '~/\.(?:claude|cursor)/skills/([a-z0-9-]+)/([A-Za-z0-9_.-]+)', {
        param($m)
        $n = $m.Groups[1].Value
        if ($skills -contains $n) { return '${CLAUDE_PLUGIN_ROOT}/skills/' + $n + '/' + $m.Groups[2].Value }
        [void]$warnings.Add("$Rel : caminho para skill fora do plugin ($n)")
        return $m.Value
    })

    # ~/.claude/agents/<agent>.md -> onde o agent foi parar no plugin
    $Text = [regex]::Replace($Text, '~/\.(?:claude|cursor)/agents/([a-z0-9-]+)\.md', {
        param($m)
        $n = $m.Groups[1].Value
        if ($aliasFile.ContainsKey($n)) { return '${CLAUDE_PLUGIN_ROOT}/' + $aliasFile[$n] }
        if ($asSkills -contains $n) { return '${CLAUDE_PLUGIN_ROOT}/skills/' + $n + '/SKILL.md' }
        if ($agents -contains $n) { return '${CLAUDE_PLUGIN_ROOT}/agents/' + $n + '.md' }
        [void]$warnings.Add("$Rel : caminho para agent fora do plugin ($n)")
        return $m.Value
    })

    # rules levadas para dentro de uma skill
    foreach ($r in $ruleNames) {
        $target = '${CLAUDE_PLUGIN_ROOT}/skills/' + $ruleInto + '/regras/' + $r + '.md'
        $Text = [regex]::Replace($Text, '(?:~/\.(?:claude|cursor)/rules/)?' + [regex]::Escape($r) + '\.mdc', { param($m) $target })
    }

    # agent "neste chat" passa a ser a skill que o hospeda
    foreach ($a in $alias.Keys) {
        $Text = [regex]::Replace($Text, '(?<![\w-])' + [regex]::Escape($a) + '(?![\w-])', $alias[$a])
    }

    # prefixo do plugin nos nomes citados
    foreach ($n in $inSet) {
        $e = [regex]::Escape($n)
        $Text = [regex]::Replace($Text, '`' + $e + '`', '`' + $prefix + ':' + $n + '`')
        $Text = [regex]::Replace($Text, '(?<![\w/.:\\-])/' + $e + '(?![\w-])', '/' + $prefix + ':' + $n)
    }

    # citacoes a skills e agents que nao vao neste plugin: se pertencem a outro
    # plugin daqui, ganham o prefixo dele; senao entram no relatorio
    foreach ($n in $allNames) {
        if (($inSet -contains $n) -or $alias.ContainsKey($n)) { continue }
        $e = [regex]::Escape($n)
        if (-not [regex]::IsMatch($Text, '`' + $e + '`|(?<![\w/.:\\-])/' + $e + '(?![\w-])')) { continue }
        if ($otherMap.ContainsKey($n)) {
            $Text = [regex]::Replace($Text, '`' + $e + '`', '`' + $otherMap[$n] + '`')
            $Text = [regex]::Replace($Text, '(?<![\w/.:\\-])/' + $e + '(?![\w-])', '/' + $otherMap[$n])
            $cross[$otherMap[$n]] = $true
        } else {
            if (-not $external.ContainsKey($n)) { $external[$n] = New-Object Collections.ArrayList }
            [void]$external[$n].Add($Rel)
        }
    }

    return [regex]::Replace($Text, '\bAskQuestion\b', 'AskUserQuestion')
}

# --- destino: so apaga se for um plugin gerado antes ---
if (Test-Path $out) {
    if (-not (Test-Path (Join-Path $out '.claude-plugin\plugin.json'))) {
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
            $t = Read-Text $_.FullName
            if ($_.Name -eq 'SKILL.md' -and $_.DirectoryName -eq $src) { $t = Convert-Frontmatter $t $s $true }
            Write-Text $dst (Convert-Text $t $rel)
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
    $rel = "agents/$a.md"
    $t = Convert-Frontmatter (Read-Text $src) $a $false
    Write-Text (Join-Path $out "agents\$a.md") (Convert-Text $t $rel)
}

# --- agents que rodam neste chat e viram skill propria ---
foreach ($a in $asSkills) {
    $src = Join-Path $repo "agents\$a.md"
    if (-not (Test-Path $src)) { throw "Agent nao existe na fonte: $a" }
    if ($skills -contains $a) { throw "agentsAsSkills: ja existe skill com o nome $a" }
    $rel = "skills/$a/SKILL.md"
    $t = Convert-Frontmatter (Read-Text $src) $a $true
    Write-Text (Join-Path $out "skills\$a\SKILL.md") (Convert-Text $t $rel)
}

# --- agents que rodam neste chat e viram arquivo de uma skill ---
foreach ($c in $chat) {
    if ($skills -notcontains $c.skill) { throw "chatAgents: skill $($c.skill) nao esta no plugin" }
    $body = Get-Body (Read-Text (Join-Path $repo "agents\$($c.agent).md"))
    $rel = "skills/$($c.skill)/$($c.file)"
    Write-Text (Join-Path $out ($rel -replace '/', '\')) (Convert-Text $body $rel)

    $skillMd = Join-Path $out "skills\$($c.skill)\SKILL.md"
    $extra = "`r`n## Conducao neste chat`r`n`r`n" +
        'Antes de comecar, ler `${CLAUDE_SKILL_DIR}/' + $c.file + '`: traz a primeira acao, ' +
        "os gates e as perguntas de aprovacao de cada fase. Este fluxo roda neste chat; nao lancar como subagent.`r`n"
    Write-Text $skillMd ((Read-Text $skillMd).TrimEnd() + "`r`n" + $extra)
}

# --- rules levadas para dentro de uma skill ---
foreach ($r in $ruleNames) {
    if ($skills -notcontains $ruleInto) { throw "rules: skill $ruleInto nao esta no plugin" }
    $src = Join-Path $repo "rules\$r.mdc"
    if (-not (Test-Path $src)) { throw "Rule nao existe na fonte: $r" }
    $rel = "skills/$ruleInto/regras/$r.md"
    Write-Text (Join-Path $out ($rel -replace '/', '\')) (Convert-Text (Get-Body (Read-Text $src)) $rel)
}

# --- manifesto ---
$manifest = [ordered]@{ name = $def.name; version = $def.version; description = $def.description }
Write-Text (Join-Path $out '.claude-plugin\plugin.json') (($manifest | ConvertTo-Json) + "`n")

# --- README ---
$r = @()
$r += "# $($def.name)"
$r += ''
$r += $def.description
$r += ''
$r += '## Conteudo'
$r += ''
$r += '| Tipo | Nome no Claude Code |'
$r += '|------|---------------------|'
foreach ($s in ($skills + $asSkills)) { $r += "| Skill | ``/$($prefix):$s`` |" }
foreach ($a in $agents) { $r += "| Agent | ``$($prefix):$a`` |" }
$r += ''
if ($def.prerequisites) {
    $r += '## Pre-requisitos'
    $r += ''
    foreach ($p in $def.prerequisites) { $r += "- $p" }
    $r += ''
}
if ($cross.Count -gt 0) {
    $r += '## Itens de outros plugins CLAMED citados'
    $r += ''
    $r += 'Funcionam quando o plugin correspondente tambem esta ativado:'
    $r += ''
    foreach ($n in ($cross.Keys | Sort-Object)) { $r += "- ``$n``" }
    $r += ''
}
if ($external.Count -gt 0) {
    $r += '## Citacoes a itens que nao fazem parte de nenhum plugin'
    $r += ''
    $r += 'Os textos citam estas skills e agents, que nao sao distribuidos. A citacao fica sem efeito:'
    $r += ''
    foreach ($n in ($external.Keys | Sort-Object)) { $r += "- ``$n``" }
    $r += ''
}
$r += "Gerado por ``scripts/build-plugin.ps1 -Plugin $Plugin``. Nao editar aqui: alterar a fonte e montar de novo."
Write-Text (Join-Path $out 'README.md') (($r -join "`n") + "`n")

# --- checagens no que foi gerado ---
$errors = New-Object Collections.ArrayList
Get-ChildItem $out -Recurse -File -Filter *.md | ForEach-Object {
    $rel = $_.FullName.Substring($out.Length + 1)
    $t = Read-Text $_.FullName
    foreach ($hit in [regex]::Matches($t, '[A-Za-z]:\\Users\\[^\\<\s`]+')) { [void]$errors.Add("$rel : caminho de usuario fixo ($($hit.Value))") }
    foreach ($hit in [regex]::Matches($t, '~/\.(?:claude|cursor)/(?:skills|agents)/\S*|[a-z0-9-]+\.mdc')) { [void]$errors.Add("$rel : referencia que nao existe no plugin ($($hit.Value))") }
}

Write-Host ''
Write-Host "Plugin $($def.name) $($def.version) -> $out" -ForegroundColor Cyan
Write-Host "  skills: $($skills.Count + $asSkills.Count)   agents: $($agents.Count)   arquivos: $((Get-ChildItem $out -Recurse -File).Count)"
if ($cross.Count -gt 0) { Write-Host "  De outros plugins: $(($cross.Keys | Sort-Object) -join ', ')" }
if ($external.Count -gt 0) {
    Write-Host '  Citacoes a itens fora do plugin:' -ForegroundColor Yellow
    foreach ($n in ($external.Keys | Sort-Object)) { Write-Host "    $n  <- $(($external[$n] | Select-Object -Unique) -join ', ')" }
}
foreach ($w in $warnings) { Write-Host "  AVISO $w" -ForegroundColor Yellow }
if ($errors.Count -gt 0) {
    foreach ($e in $errors) { Write-Host "  ERRO $e" -ForegroundColor Red }
    throw "Plugin gerado com $($errors.Count) erro(s); corrigir a fonte ou a definicao e montar de novo."
}
Write-Host '  OK' -ForegroundColor Green
