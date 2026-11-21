# Funcoes comuns dos scripts do servico (softdesk-local). So ASCII: o Windows PowerShell 5.1 le
# arquivo sem BOM como ANSI. Nenhuma funcao imprime o token do arquivo de descoberta.

function Resolve-DiretorioServico {
    param([string]$Diretorio)
    if ($Diretorio) { return $Diretorio }
    if ($env:SOFTDESK_LOCAL_DIR) { return $env:SOFTDESK_LOCAL_DIR }
    $base = $env:LOCALAPPDATA
    if (-not $base) { $base = Join-Path $HOME 'AppData\Local' }
    return (Join-Path $base 'softdesk-local')
}

# Devolve @{ porta; token; pid; iniciado_em } ($null no iniciado_em se ilegivel) ou $null se o arquivo nao existe ou esta fora do formato.
function Read-Descoberta {
    param([string]$Diretorio)
    $arquivo = Join-Path $Diretorio 'servico.json'
    if (-not (Test-Path -LiteralPath $arquivo)) { return $null }
    try {
        $d = Get-Content -LiteralPath $arquivo -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($null -eq $d.porta -or -not $d.token -or $null -eq $d.pid) { return $null }
        $ini = $null
        try {
            $texto = Get-Content -LiteralPath $arquivo -Raw -Encoding UTF8
            $m = [regex]::Match($texto, '"iniciado_em"\s*:\s*"([^"]+)"')
            if ($m.Success) {
                $ini = [DateTimeOffset]::Parse($m.Groups[1].Value, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)
            }
        } catch { $ini = $null }
        return @{ porta = [int]$d.porta; token = [string]$d.token; pid = [int]$d.pid; iniciado_em = $ini }
    } catch {
        return $null
    }
}

# Chama o REST local com o token. Devolve o objeto do envelope ou $null se nao respondeu.
function Invoke-ServicoRest {
    param($Descoberta, [string]$Caminho, [string]$Metodo = 'GET', [int]$TimeoutSec = 3)
    try {
        $cabecalhos = @{ Authorization = ('Bearer ' + $Descoberta.token) }
        return Invoke-RestMethod -Uri ('http://127.0.0.1:{0}{1}' -f $Descoberta.porta, $Caminho) `
            -Method $Metodo -Headers $cabecalhos -TimeoutSec $TimeoutSec -UseBasicParsing
    } catch {
        return $null
    }
}

function Test-ServicoResponde {
    param($Descoberta)
    if ($null -eq $Descoberta) { return $false }
    $r = Invoke-ServicoRest -Descoberta $Descoberta -Caminho '/v1/servico'
    return ($null -ne $r -and $r.success -eq $true)
}
