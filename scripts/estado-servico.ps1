<#
.SYNOPSIS
  Mostra o estado do servico softdesk-local: GET /v1/servico e GET /v1/sessao.
.DESCRIPTION
  Nao imprime o token. Codigos de saida: 0 quando conseguiu consultar ou constatou que esta parado;
  1 se o arquivo existe mas o servico nao responde.
#>
[CmdletBinding()]
param([string]$Diretorio)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_comum.ps1')

$Diretorio = Resolve-DiretorioServico -Diretorio $Diretorio
$desc = Read-Descoberta -Diretorio $Diretorio
if ($null -eq $desc) {
    Write-Host 'Servico: parado (nao ha arquivo de descoberta).'
    exit 0
}
$servico = Invoke-ServicoRest -Descoberta $desc -Caminho '/v1/servico'
if ($null -eq $servico) {
    Write-Host ('Servico: nao responde (arquivo aponta para pid {0}, porta {1}). Use "npm run servico:parar" para limpar.' -f $desc.pid, $desc.porta)
    exit 1
}
Write-Host 'Servico:'
$servico.dados | ConvertTo-Json -Depth 6
$sessao = Invoke-ServicoRest -Descoberta $desc -Caminho '/v1/sessao'
Write-Host 'Sessao:'
if ($null -eq $sessao) { Write-Host '(sem resposta)' } else { $sessao.dados | ConvertTo-Json -Depth 6 }
exit 0
