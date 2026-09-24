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

### Snapshot desatualizado (checar antes de analisar ou concluir)

`pbg_search`/`pbg_read_object` leem **so** o snapshot `.sr*` em `.pbg/snapshots` do workspace PBG — **nao** o `.pbl`, **nao** o SVN, e **nao** `.pbg/temp`. Esse snapshot so e regravado por `pbg_send` (export + snapshot + commit). Rodar `pbg_status` **nao** atualiza `.pbg/snapshots` — ele so exporta a PBL via ORCA para uma pasta separada (`.pbg/<exportFolder>`, tipicamente `.pbg/temp`, valor lido de `.pbg/config.json`, campo `exportFolder` — nao presumir o caminho fixo). Ou seja: depois de `pbg_status`, `pbg_read_object` continua devolvendo o conteudo **antigo** ate alguem rodar `pbg_send`.

**Padrao para "avalia"/"revisa"/"verifica meu ajuste" em objeto Clamed: nao perguntar como proceder, so fazer.** O usuario nao quer commitar nem exportar manual so pra uma revisao. Fluxo automatico, sem pedir permissao:

1. `pbg_status` no workspace (reexporta a `.pbl` via ORCA — nao precisa que o usuario tenha feito nada antes).
2. Ler o export fresco em `.pbg\<exportFolder>\<snapshotSubfolder>\<objeto>.<ext>` (achar `exportFolder` em `.pbg\config.json`).
3. Comparar (`diff`) esse export contra o `.srd`/`.srw` **atual** do SVN (`C:\SVN\Sistemas_PB12\<Sistema>\Bibliotecas\<objeto>.<ext>`) — essa e a base de comparacao padrao, nao o `.pbg/snapshots` (que fica desatualizado por dias).
4. Reportar: o que esta na `.pbl` (fonte real de trabalho) vs o que esta no SVN (o que outros devs/CI enxergam) — nomeando exatamente as diferencas. Se SVN e `.pbl` baterem, dizer isso tambem (nao so reportar quando ha diferenca).
5. So sugerir commit/`pbg_send`/export manual se o usuario perguntar como fazer o SVN acompanhar — nunca como pre-requisito pra revisar.

Antes de dar veredito sobre o estado **atual** de um objeto Clamed (ex.: "o campo esta truncado", "a tela nao foi ajustada", "ainda nao mudou", "verifica meu ajuste"):

1. `ls -la` no `.srw`/`.srd` do SVN (`C:\SVN\Sistemas_PB12\<Sistema>\Bibliotecas\`) **e** no snapshot (`.pbg\snapshots\...`) — comparar datas. Cuidado: um `svn lock`/checkout recente **nao** significa conteudo novo — conferir `svn status`/`svn info` (`Schedule: normal` = sem alteracao local ainda; so o lock foi feito).
2. Se o SVN for mais recente que o snapshot **e** o conteudo relevante realmente mudou (nao só timestamp): ler/Grep o `.srw`/`.srd` do SVN direto — e a fonte mais fresca do estado real do objeto ali.
3. Se a alteracao ainda nao chegou nem ao SVN (só na `.pbl`, ex. `.pbl` com mtime mais novo que o `.srw`/snapshot): rodar `pbg_status` (isso ja exporta a PBL via ORCA) e depois **ler o export fresco direto do filesystem** — nao esperar o MCP mostrar, ele não alcança essa pasta:
   - Achar o `exportFolder` em `<workspace>\.pbg\config.json` (ex. `.pbg/temp`).
   - `Read`/`Grep` em `<workspace>\<exportFolder>\<snapshotSubfolder>\<objeto>.<ext>` (mesma estrutura de subpasta do `.pbg/snapshots`, ex. `Bibliotecas-ws021\dw_foo.srd`).
   - Opcional: `diff` esse arquivo contra o `.pbg/snapshots` correspondente para isolar so o que mudou.
   - Isso **nao** precisa de commit/push — é so leitura de arquivo. So peça para o usuario rodar `pbg_send` (ou exportar manualmente no PB) se essa pasta de export nao existir/nao tiver o objeto.
4. Nunca concluir "nao foi alterado" so pelo snapshot sem checar a data — snapshot velho parece objeto velho. E nunca pular direto para pedir commit/export manual ao usuario sem antes checar se o export ja esta em `.pbg/<exportFolder>` — na pratica, um `pbg_status` anterior (seu ou de outra sessao) pode ja ter deixado o dado ali.
5. Biblioteca comum (ex. `Comuns\Bibliotecas`) replicada em varios workspaces PBG: cada `.pbg/snapshots/Comuns-Bibliotecas-*` e uma copia independente, que pode desatualizar em ritmos diferentes por sistema. O SVN tem **uma unica** copia em `C:\SVN\Sistemas_PB12\Comuns\Bibliotecas\` — essa e a referencia mais confiavel.

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
| Criar PBL/janela/DW nova | skill `pb-criar-objeto` (fora do `/pb-sybase`) |
| Consulta PB+Sybase / spec pequena/chamado/mock/DOCX | `/pb-sybase` |
| Pedido grande: descoberta + arquitetura (fragmentação) + spec por fragmento | `/pb-desenvolvimento-pro` (não implementa) |
| MCP server generico | `mcp` |











