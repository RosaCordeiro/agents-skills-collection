param(
    [string]$Evento = 'stop',
    [string]$TextoB64 = ''
)
# Voz do Lico. Modos: stop (le a linha falada da ultima resposta), aviso (Notification), falar (interno).
# Silenciar: crie o arquivo MUDO ao lado deste script. Voltar: apague o arquivo.

$ErrorActionPreference = 'SilentlyContinue'
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path

function Chiar {
    # "iip!" de lontra: dois pios curtos gerados na hora (sem arquivo de audio)
    $taxa = 22050
    $amostras = New-Object System.Collections.Generic.List[int16]
    foreach ($faixa in @(@(900, 2300), @(1100, 2700))) {
        $n = [int]($taxa * 0.11)
        $fase = 0.0
        for ($i = 0; $i -lt $n; $i++) {
            $f = $faixa[0] + ($faixa[1] - $faixa[0]) * ($i / $n)
            $fase += 2 * [Math]::PI * $f / $taxa
            $env = [Math]::Sin([Math]::PI * $i / $n)
            $amostras.Add([int16](9000 * $env * [Math]::Sin($fase)))
        }
        for ($i = 0; $i -lt [int]($taxa * 0.05); $i++) { $amostras.Add([int16]0) }
    }
    $dados = New-Object byte[] ($amostras.Count * 2)
    [Buffer]::BlockCopy($amostras.ToArray(), 0, $dados, 0, $dados.Length)
    $ms = New-Object IO.MemoryStream
    $w = New-Object IO.BinaryWriter($ms)
    $w.Write([Text.Encoding]::ASCII.GetBytes('RIFF')); $w.Write([int](36 + $dados.Length))
    $w.Write([Text.Encoding]::ASCII.GetBytes('WAVEfmt ')); $w.Write([int]16)
    $w.Write([int16]1); $w.Write([int16]1); $w.Write([int]$taxa); $w.Write([int]($taxa * 2))
    $w.Write([int16]2); $w.Write([int16]16)
    $w.Write([Text.Encoding]::ASCII.GetBytes('data')); $w.Write([int]$dados.Length); $w.Write($dados)
    $w.Flush(); $ms.Position = 0
    $sp = New-Object System.Media.SoundPlayer($ms)
    $sp.PlaySync()
}

function Falar([string]$texto) {
    Chiar
    Add-Type -AssemblyName System.Speech
    $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $s.SelectVoice('Microsoft Maria Desktop')
    $s.Volume = 90
    $s.Rate = 3   # -10 a 10; 0 e o normal da Maria
    $t = [System.Security.SecurityElement]::Escape($texto)
    # Tom mais agudo e ritmo um pouco mais rapido: voz de lontra esperta
    # Humor: animado e agudinho; mais baixo e calmo quando o assunto e erro
    $tom = '+70%'; $ritmo = '+15%'
    if ($texto -match '(?i)erro|falh|quebr|problema|bug|cuidado|atencao|atenção') { $tom = '+25%'; $ritmo = '+5%' }
    $ssml = "<speak version='1.0' xml:lang='pt-BR' xmlns='http://www.w3.org/2001/10/synthesis'><prosody pitch='$tom' rate='$ritmo'>$t</prosody></speak>"
    $s.SpeakSsml($ssml)
}

if ($Evento -eq 'falar') {
    $txt = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TextoB64))
    Falar $txt
    exit 0
}

if (Test-Path (Join-Path $aqui 'MUDO')) { exit 0 }

function Disparar([string]$texto) {
    if ([string]::IsNullOrWhiteSpace($texto)) { return }
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($texto))
    Start-Process -WindowStyle Hidden -FilePath 'powershell.exe' -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", 'falar', $b64)
}

[Console]::InputEncoding = [Text.Encoding]::UTF8
$entrada = [Console]::In.ReadToEnd()
$json = $null
try { $json = $entrada | ConvertFrom-Json } catch {}

if ($Evento -eq 'aviso') {
    $frases = @(
        'Ei, irmão. Preciso de você aqui.',
        'Psiu. Estou esperando uma decisão sua.',
        'Chegou a sua vez. Pode olhar a tela?'
    )
    Disparar ($frases | Get-Random)
    exit 0
}

# stop: pega a ultima linha falada (comeca com o emoji de alto-falante)
$marca = [regex]::Escape([char]::ConvertFromUtf32(0x1F50A))
$texto = $null
if ($json -and $json.last_assistant_message) { $texto = [string]$json.last_assistant_message }
if (-not $texto -and $json -and $json.transcript_path -and (Test-Path $json.transcript_path)) {
    $ultimas = Get-Content $json.transcript_path -Encoding UTF8 -Tail 40
    [array]::Reverse($ultimas)
    foreach ($linha in $ultimas) {
        try {
            $o = $linha | ConvertFrom-Json
            if ($o.type -eq 'assistant') {
                $partes = $o.message.content | Where-Object { $_.type -eq 'text' } | ForEach-Object { $_.text }
                if ($partes) { $texto = ($partes -join "`n"); break }
            }
        } catch {}
    }
}
if (-not $texto) { exit 0 }

$achados = [regex]::Matches($texto, "(?m)^\s*$marca\s*(.+?)\s*$")
if ($achados.Count -eq 0) { exit 0 }
$fala = $achados[$achados.Count - 1].Groups[1].Value
$fala = $fala -replace '[*_`#>]', ''
if ($fala.Length -gt 300) { $fala = $fala.Substring(0, 300) }
Disparar $fala
exit 0
