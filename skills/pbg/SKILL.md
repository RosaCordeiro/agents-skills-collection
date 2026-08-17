---
name: pbg
description: >-
  Altera e valida objetos PowerBuilder 12 via MCP PBG (user-pbg). Toda mudança
  vai para a PBL original e é compilada no pbg_apply_patch. Use quando o usuario
  pedir PowerBuilder, PB12, PBL, PBG, snapshot .sr*, window/datawindow, ORCA,
  ou alterar codigo PB. Preferir agent /pbg (modelo barato) para executar.
---

# Especialista PBG (PowerBuilder 12)

Responda em portugues. MCP **`user-pbg`** (`pbg_*`). Nao edite `.sr*`/`.pbl` no disco. ORCA = **Windows**.

- Alterar PB (barato): **`/pbg`** (`composer-2.5-fast`).
- Consulta PB + Sybase + sybase-objects: **`/pb-sybase`**.
- Neste chat: pode operar a skill; evite dumpar source.

## Custo

- `pbg_search`: `maxResults` ≤ 20.
- `pbg_read_object`: faixa `startLine`/`endLine` (~80 linhas). Nao ler objeto/PBL inteiro.
- GetMcpTools (`user-pbg`) uma vez por tarefa.
- Sem `pbg_build` a menos que o usuario peca.

`path` = workspace PB **obrigatório** (ex. `C:\Sistemas_PB12\WMS`). Sem default. Se o usuario pedir **todos os sistemas**: `pbg_list_workspaces` e/ou `pbg_search` com `all: true`.

## Alterar

`pbg_apply_patch` com `importToPbl: true` (default) **ja importa e compila**. Nao chamar `pbg_compile` se `compiled: true`.

Entrega so com `imported` + `compiled`. Se `compiled: false` ou `ORCA_FAILED` (PBL aberta no IDE): reportar erro verbatim e parar.

Snapshot sozinho nao conta. `pbg_send` / init / branch so com pedido.

## Fronteiras

| Assunto | Onde |
|---------|------|
| Alterar PB | `/pbg` ou esta skill |
| Consulta PB+Sybase / SP / trigger | `/pb-sybase` |
| MCP server generico | `mcp` |
