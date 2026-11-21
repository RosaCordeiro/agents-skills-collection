<#
.SYNOPSIS
  Inicia o servico softdesk-local em segundo plano (opcional: o MCP ja o inicia sozinho).
.DESCRIPTION
  Se GET /v1/servico responde, avisa que ja roda. Senao, Start-Process node dist\servico.js
  (janela oculta) e espera o arquivo de descoberta e a resposta do servico por ate 10 s.
  Codigos de saida: 0 rodando; 1 nao iniciou.
#>
[CmdletBinding()]
param(
    [string]$Diretorio,
    [string]$Servico,
    [int]$TempoMaxSegundos = 10
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_comum.ps1')

$raiz = Split-Path -Parent $PSScriptRoot
if (-not $Servico) { $Servico = Join-Path $raiz 'dist\servico.js' }
$Diretorio = Resolve-DiretorioServico -Diretorio $Diretorio

$desc = Read-Descoberta -Diretorio $Diretorio
if (Test-ServicoResponde -Descoberta $desc) {
    Write-Host ('O servico ja esta rodando (pid {0}, porta {1}).' -f $desc.pid, $desc.porta)
    exit 0
}

if (-not (Test-Path -LiteralPath $Servico)) {
    Write-Host 'Nao achei dist\servico.js. Rode "npm run build" na pasta do projeto antes.'
    exit 1
}
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host 'Nao achei o node no PATH (precisa do Node 20 ou mais novo).'
    exit 1
}

# O servico herda so a lista de permissao (mesma de src\presentation\mcp\iniciar-servico.ts): nada de
# credenciais do terminal (SOFTDESK_SENHA etc.) nem tokens de outros programas. O ambiente do proprio
# script e restringido so durante o Start-Process e restaurado em seguida.
$permitidos = @(
    'SystemRoot', 'SystemDrive', 'windir', 'ComSpec', 'PATHEXT', 'PATH', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE', 'USERNAME',
    'USERDOMAIN', 'HOMEDRIVE', 'HOMEPATH', 'TEMP', 'TMP', 'ProgramData', 'ProgramFiles', 'ProgramFiles(x86)',
    'LOG_LEVEL', 'PREFIX_LOGGER', 'AMBIENTE', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
    'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'NODE_OPTIONS'
)
function Test-NomePermitido {
    param([string]$Nome)
    if ($Nome.StartsWith('SOFTDESK_LOCAL_', [StringComparison]::OrdinalIgnoreCase)) { return $true }
    foreach ($p in $permitidos) { if ($Nome -ieq $p) { return $true } }
    return $false
}
# NODE_OPTIONS segue (CA corporativa via --use-openssl-ca / --use-system-ca), sem opcoes que carregam codigo.
function Get-NodeOptionsSeguro {
    param([string]$Valor)
    $partes = @($Valor -split '\s+' | Where-Object { $_ -ne '' })
    $saida = New-Object System.Collections.Generic.List[string]
    $proibida = '^(-r|--require|--import|--loader|--experimental-loader|--env-file|--inspect(-brk|-wait)?|--eval|-e|--print|-p)(=|$)'
    for ($i = 0; $i -lt $partes.Count; $i++) {
        $p = $partes[$i]
        if ($p -match $proibida) {
            if (($p -notmatch '=') -and ($p -notmatch '^--inspect') -and ($i + 1 -lt $partes.Count)) { $i++ }
            continue
        }
        $saida.Add($p)
    }
    return ($saida -join ' ')
}
$guardado = @{}
foreach ($par in [Environment]::GetEnvironmentVariables('Process').GetEnumerator()) {
    $guardado[[string]$par.Key] = [string]$par.Value
}
try {
    foreach ($nome in $guardado.Keys) {
        if (-not (Test-NomePermitido -Nome $nome)) {
            [Environment]::SetEnvironmentVariable($nome, $null, 'Process')
        } elseif ($nome -ieq 'NODE_OPTIONS') {
            $seguro = Get-NodeOptionsSeguro -Valor $guardado[$nome]
            if ($seguro -eq '') { $seguro = $null }
            [Environment]::SetEnvironmentVariable($nome, $seguro, 'Process')
        }
    }
    $processo = Start-Process -FilePath $node.Source -ArgumentList ('"{0}"' -f $Servico) `
        -WindowStyle Hidden -WorkingDirectory $raiz -PassThru
} finally {
    foreach ($nome in $guardado.Keys) {
        [Environment]::SetEnvironmentVariable($nome, $guardado[$nome], 'Process')
    }
}

$fim = (Get-Date).AddSeconds($TempoMaxSegundos)
while ((Get-Date) -lt $fim) {
    $desc = Read-Descoberta -Diretorio $Diretorio
    if ($desc -and (Test-ServicoResponde -Descoberta $desc)) {
        Write-Host ('Servico iniciado (pid {0}, porta {1}).' -f $desc.pid, $desc.porta)
        exit 0
    }
    if ($processo.HasExited) {
        # Outra instancia pode ter ganho a disputa pela porta: se ela responde, esta tudo certo.
        Start-Sleep -Milliseconds 300
        $desc = Read-Descoberta -Diretorio $Diretorio
        if ($desc -and (Test-ServicoResponde -Descoberta $desc)) {
            Write-Host ('O servico ja esta rodando (pid {0}, porta {1}).' -f $desc.pid, $desc.porta)
            exit 0
        }
        Write-Host 'O servico saiu logo ao iniciar (porta em uso por outro programa ou configuracao invalida). Veja a pasta logs\ do servico.'
        exit 1
    }
    Start-Sleep -Milliseconds 200
}
Write-Host ('O servico nao respondeu em {0} s. Veja a pasta logs\ do servico.' -f $TempoMaxSegundos)
exit 1
