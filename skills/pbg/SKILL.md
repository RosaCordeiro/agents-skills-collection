---
name: pbg
description: >-
  Altera e valida objetos PowerBuilder 12 via MCP PBG (user-pbg). Toda mudança
  vai para a PBL original e é compilada no pbg_apply_patch. Legado Clamed: PB em
  C:\Sistemas_PB12 + SVN nativo em C:\SVN\Sistemas_PB12 (checklist PB+SVN).
  Use quando o usuario pedir PowerBuilder, PB12, PBL, PBG, snapshot .sr*, window/datawindow,
  ORCA, Tortoise/SVN PB, ou alterar codigo PB. Preferir agent /pbg (modelo barato).
---

# Especialista PBG (PowerBuilder 12)

Responda em portugues. MCP **`user-pbg`** (`pbg_*`). Nao edite `.pbl` no disco. No workspace PBG, nao edite snapshot `.sr*` a mao — use `pbg_apply_patch` ou CLI `pbg import`. **Excecao legado Clamed:** o `.srw` em `C:\SVN\Sistemas_PB12\...\Bibliotecas\` e fonte SVN nativa PB; ver secao abaixo. ORCA = **Windows**.

- Alterar PB (barato): **`/pbg`** (`composer-2.5-fast`).
- Consulta PB + Sybase + sybase-objects: **`/pb-sybase`**.
- Objeto/PBL/tela **nova**: skill **`pb-criar-objeto`** (via `/pb-sybase`).
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

## Ambiente Clamed (PB + SVN legado)

Duas pastas — **nao confundir**:

| Pasta | Uso |
|-------|-----|
| `C:\Sistemas_PB12\<Sistema>` | PBG/ORCA: `.pbg/`, `.pbl`, `pbg_apply_patch`, `pbg import`, `pbg compile` |
| `C:\SVN\Sistemas_PB12\<Sistema>\Bibliotecas\` | SVN nativo PB: `.srw`/`.srd` versionados; Tortoise Show diff |

- `C:\Sistemas_PB12` **nao** e working copy SVN.
- **MCP:** `PBG_WORKSPACE` = pasta PBG (ex. `C:\Sistemas_PB12\WMS`), **nunca** a raiz `C:\SVN\Sistemas_PB12`.
- Mapeamento: objeto `w_foo` → `C:\SVN\Sistemas_PB12\<Sistema>\Bibliotecas\w_foo.srw`.

### Alteracao que precisa PB + SVN (checklist)

Quando o usuario pedir alteracao visivel no PB **e** no Tortoise/SVN:

1. `pbg_read_object` — achar o trecho (ex.: `string title = ...`).
2. **PB:** `pbg_apply_patch` no workspace PBG (`C:\Sistemas_PB12\<Sistema>`) **ou** CLI `pbg import` + `pbg compile` se MCP falhar.
3. **SVN:** mesma alteracao no `.srw` espelho em `C:\SVN\Sistemas_PB12\<Sistema>\Bibliotecas\`.
4. Se Tortoise nao mostrar diff/checkout: `svn lock` no `.srw` (`scc.ini` → `lock.strategy=lock`; checkout SCC = lock).
5. Confirmar com `svn status` / `svn diff` no `.srw`. **Nao** commitar sem pedido.

Patch so no PBG → PB ok, SVN vazio. So no `.srw` SVN → Tortoise ok, PB pode nao refletir sem import/compile.

### Anti-enrolacao

- Pedido simples (titulo, label, 1 linha): **nao** investigar MCP/arch/init/schemas.
- Se MCP falhar (`NOT_INITIALIZED`, `MCP_WORKSPACE_MISMATCH`): ir direto ao CLI no path PBG (`-p C:\Sistemas_PB12\<Sistema>`).
- Maximo ~4 passos antes de reportar bloqueio (PBL aberta, ORCA, lock de outro usuario).
- Nao criar scripts temporarios se `pbg import`/`pbg compile` bastam.

## Fronteiras

| Assunto | Onde |
|---------|------|
| Alterar PB (objeto já existente) | `/pbg` ou esta skill |
| Criar PBL/janela/DW nova | skill `pb-criar-objeto` (`/pb-sybase`) |
| Consulta PB+Sybase / spec/chamado/mock/DOCX | `/pb-sybase` |
| MCP server generico | `mcp` |
