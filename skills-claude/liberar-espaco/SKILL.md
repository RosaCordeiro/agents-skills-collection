---
name: liberar-espaco
description: >-
  Diagnostica e libera espaco no C: Windows + WSL Ubuntu + Docker no WSL.
  Use when the user says HD lotado, disco cheio, liberar espaco, C: sem espaco,
  WSL vhdx grande, ext4.vhdx, compactar WSL, docker images ocupando disco,
  ou /liberar-espaco.
---

# Liberar espaco (C: + WSL + Docker)

Responda em portugues. Medir primeiro; apagar so depois de confirmar. Nao e desenvolvimento — nao perguntar Pro/Simples.

Maquina Clamed (995670.CLAMED):

| Item | Valor |
|------|--------|
| Distro | `Ubuntu` (WSL2) |
| Usuario Linux | `cordeiro` |
| VHDX | `C:\Users\995670.CLAMED\AppData\Local\wsl\Ubuntu\ext4.vhdx` (achar `*.vhdx` se mudou) |
| Backup | `U:\wsl-backup-ubuntu\` (alternativa: `M:`) |
| Docker | **dentro do Ubuntu**, nao Docker Desktop |
| Projetos Windows | `C:\Users\995670.CLAMED\Desenvolvimentos` (costuma ser pequeno, ~2–3 GB) |

## Execucao

- Windows: PowerShell. WSL: `wsl -d Ubuntu <cmd>` **direto** — nunca `bash -lc '...'`.
- Nao varrer perfis de **outros** usuarios em `C:\Users`.
- Nao mexer em `pagefile.sys`, `hiberfil.sys`, `C:\Sistemas_PB12`, `C:\SVN` sem pedido.

## 1. Diagnostico

Medir em paralelo:

```powershell
Get-PSDrive C | Select-Object @{N='FreeGB';E={[math]::Round($_.Free/1GB,2)}}, @{N='UsedGB';E={[math]::Round($_.Used/1GB,2)}}
Get-ChildItem "$env:LOCALAPPDATA\wsl" -Recurse -Filter "*.vhdx" -ErrorAction SilentlyContinue |
  Select-Object FullName, @{N='SizeGB';E={[math]::Round($_.Length/1GB,2)}}
```

```text
wsl -l -v
wsl -d Ubuntu df -h /
wsl -d Ubuntu docker system df
wsl -d Ubuntu -u root du -x -h --max-depth=1 /
wsl -d Ubuntu du -h --max-depth=1 /home/cordeiro
```

Windows (FSO / `dir`) nos suspeitos: `AppData\Local\wsl`, `AppData\Local\Temp`, `AppData\Local\npm-cache`, `AppData\Roaming\Cursor`, `AppData\Local\insomnia`, `AppData\Local\Programs`.

Se `wsl` falhar com **falha catastrofica** / `getpwnam` / `E_UNEXPECTED`: disco C: lotou e o Ubuntu quebrou. Liberar cache Windows primeiro, `wsl --shutdown`, so depois reentrar.

## 2. O que costuma lotar (esta maquina)

Ordem tipica:

1. **VHDX do WSL** (dezenas de GB). Por dentro: Docker em `/var/lib/containerd` (snapshotter overlayfs) + `/var/lib/docker` + `/home/cordeiro`.
2. `pagefile.sys` (~29 GB) — nao apagar.
3. Temp Windows (instaladores `vscode-stable-user-x64*`, `cursor-sandbox-cache`, swap `.vhdx` do WSL em Temp).
4. Cursor `state.vscdb`, Insomnia versoes antigas, npm-cache.
5. `Desenvolvimentos` **nao** e o vilao.

O VHDX **so cresce**. `docker prune` libera por *dentro*; o arquivo no C: nao encolhe ate compactar ou recriar.

## 3. Limpezas (pedir confirmacao)

Usar **AskQuestion** (um por turno) antes de destrutivo. Relatar tamanhos no prompt.

**Seguro (Windows), depois de mostrar o que e:**

- `npm cache clean --force`
- Temp: `cursor-sandbox-cache`, pastas `vscode-stable-user-x64*` leftover (pode estar locked)
- Swap WSL em Temp **so apos** `wsl --shutdown`

**Docker (WSL) — padrao desta maquina quando o usuario pedir enxugar:**

```text
wsl -d Ubuntu docker builder prune -af
wsl -d Ubuntu docker images
wsl -d Ubuntu docker ps -a
```

Alvos recorrentes (so se o usuario confirmar / pedir):

- `enclavex-backstage*` + pasta `/home/cordeiro/enclavex-backstage`
- copias `xml-translog` **exceto** `xml-translog-app:latest` se ainda houver container
- Kafka local: `apache/kafka`, `kafbat/kafka-ui` + containers `kafka-dev-*` (recria quando precisar)
- `load6c-*` / `load6o-*` (teste de carga)
- `docker image prune -af` = imagens sem container (stopped container **segura** a imagem)
- volumes orfaos: `docker volume prune` **so com pedido** (pode ter dado de Postgres)

Para apagar imagem em uso: `docker rm -f <container>` antes do `rmi`.

**Nao apagar sem pedido:** imagens das APIs Kafka Clamed, `clamed.dev`, `mcp-softdesk`, `prepara-me`, `monitor-agendador-pb`, `postgres:13/16` se ainda houver container.

## 4. Encolher o VHDX no C:

Depois de limpar por dentro:

### A) Compact (precisa admin)

```text
wsl --shutdown
```

Confirmar Ubuntu `Stopped` e o `.vhdx` destravado. Depois:

```text
diskpart /s script
  select vdisk file="<caminho>\ext4.vhdx"
  attach vdisk readonly
  compact vdisk
  detach vdisk
```

`Optimize-VHD` so existe com modulo Hyper-V. `wsl --manage Ubuntu --set-sparse true` nesta maquina recusa (risco de corrupcao) — **nao** usar `--allow-unsafe` sem pedido explicito.

Se `wsl --shutdown` travar: nao matar `wslservice` sem admin. Pedir reboot.

### B) Backup + recriar (quando compact falha / sem admin)

C: quase cheio nao cabe o tar. Exportar para **U:** (ou M:).

```text
wsl --shutdown
wsl --export Ubuntu U:\wsl-backup-ubuntu\ubuntu-AAAA-MM-DD.tar --format tar
```

Avisos `pax format cannot archive sockets` sao ok.

**So depois de:** exit 0 + tar com tamanho coerente (~uso interno, nao o VHDX cheio):

```text
wsl --unregister Ubuntu
wsl --import Ubuntu C:\Users\995670.CLAMED\AppData\Local\wsl\Ubuntu U:\wsl-backup-ubuntu\ubuntu-AAAA-MM-DD.tar --version 2
wsl --manage Ubuntu --set-default-user cordeiro
wsl -d Ubuntu -e whoami
wsl -d Ubuntu df -h /
```

Import em PC com **16 GB RAM** pode falhar com memoria insuficiente e **nao registrar** a distro mesmo com exit 0. Conferir `wsl -l -v` **antes** de apagar o tar. Se distro sumiu: o tar ainda vale; repetir o import.

Apagar o `.tar` **somente** quando Ubuntu lista, `whoami` = `cordeiro`, `df -h /` ok.

## 5. Relatorio

Antes/depois: C: livres, tamanho do VHDX, `df -h /`, `docker system df`. Dizer o que ficou de proposito.
