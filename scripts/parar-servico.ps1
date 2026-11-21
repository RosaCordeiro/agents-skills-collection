<#
.SYNOPSIS
  Para o servico softdesk-local.
.DESCRIPTION
  POST /v1/servico/parar com o token do arquivo de descoberta. Se o servico nao responder, encerra o
  pid do arquivo SO depois de conferir que a linha de comando do processo contem dist\servico.js
  (o pid pode ter sido reaproveitado por outro programa; esse nunca e encerrado).
  A conferencia aceita barras normais ou invertidas e recusa processo criado DEPOIS do iniciado_em do
  arquivo (pid reaproveitado). Se a linha de comando for ilegivel, nada e encerrado nem apagado (saida 1).
  Codigos de saida: 0 parado ou ja parado; 1 nao foi possivel parar.
#>
[CmdletBinding()]
param(
    [string]$Diretorio,
    [int]$TempoMaxSegundos = 5
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_comum.ps1')

$Diretorio = Resolve-DiretorioServico -Diretorio $Diretorio
$arquivo = Join-Path $Diretorio 'servico.json'

function Remove-DescobertaAntiga {
    Remove-Item -LiteralPath $arquivo -Force -ErrorAction SilentlyContinue
}

$desc = Read-Descoberta -Diretorio $Diretorio
if ($null -eq $desc) {
    Write-Host 'O servico nao esta rodando (nao ha arquivo de descoberta).'
    exit 0
}

# 1. Parada educada pela rota.
$resposta = Invoke-ServicoRest -Descoberta $desc -Caminho '/v1/servico/parar' -Metodo 'POST' -TimeoutSec 5
if ($null -ne $resposta) {
    $fim = (Get-Date).AddSeconds($TempoMaxSegundos)
    while ((Get-Date) -lt $fim) {
        if (-not (Get-Process -Id $desc.pid -ErrorAction SilentlyContinue)) { break }
        Start-Sleep -Milliseconds 100
    }
    if (Get-Process -Id $desc.pid -ErrorAction SilentlyContinue) {
        Write-Host ('O servico recebeu o pedido de parada mas o processo {0} ainda existe.' -f $desc.pid)
        exit 1
    }
    Write-Host 'Servico parado.'
    exit 0
}

# 2. Nao respondeu: confere o processo antes de encerrar qualquer coisa.
$proc = Get-CimInstance Win32_Process -Filter ('ProcessId = {0}' -f $desc.pid) -ErrorAction SilentlyContinue
if ($null -eq $proc) {
    Remove-DescobertaAntiga
    Write-Host 'O servico ja nao existia (arquivo de descoberta antigo removido).'
    exit 0
}
$linha = [string]$proc.CommandLine
if ([string]::IsNullOrWhiteSpace($linha)) {
    Write-Host ('Nao foi possivel ler a linha de comando do processo {0}; nada foi encerrado nem apagado.' -f $desc.pid)
    exit 1
}
# Normaliza barras: "node dist/servico.js" (npm run servico) tambem e o servico.
$linhaNorm = $linha.ToLowerInvariant().Replace('/', '\')
# Pid reaproveitado: o processo atual nasceu DEPOIS de o servico gravar o arquivo (folga de 15 s).
$reaproveitado = $false
if ($null -ne $desc.iniciado_em -and $null -ne $proc.CreationDate) {
    if ($proc.CreationDate.ToUniversalTime() -gt $desc.iniciado_em.UtcDateTime.AddSeconds(15)) { $reaproveitado = $true }
}
if ((-not $reaproveitado) -and $linhaNorm.Contains('dist\servico.js')) {
    Stop-Process -Id $desc.pid -Force
    Start-Sleep -Milliseconds 300
    Remove-DescobertaAntiga
    Write-Host ('O servico nao respondeu; o processo {0} foi encerrado.' -f $desc.pid)
    exit 0
}
Remove-DescobertaAntiga
Write-Host ('O pid {0} do arquivo de descoberta pertence a outro programa (nao e o servico); nada foi encerrado e o arquivo antigo foi removido.' -f $desc.pid)
exit 0
