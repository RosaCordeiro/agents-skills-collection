---
name: pb-sybase
description: >-
  Consulta cruzada PowerBuilder 12 (MCP user-pbg) + Sybase ASE homolog
  (MCP user-sybase-hmg) + sybase-objects. Especifica chamado/tela WMS-PB
  (Markdown, mock HTML, DOCX por último). Use when the user asks PB+Sybase,
  tela vs tabela, spec/chamado SoftDesk, mock PowerBuilder, DOCX de spec,
  consultar homolog, legado Clamed, ou /pb-sybase. Tela/PBL/DW nova: skill
  pb-criar-objeto (herdar genérica, ícone + PBSCC). Qualquer alteração de
  objeto de banco também vai para sybase-objects. Preferir agent /pb-sybase.
---

# PB + Sybase (consulta e especificação)

Responda em português. PB e Sybase **andam juntos**: tela/DW no PB, tabela/trigger/SP no ASE, fonte versionada em **sybase-objects**.

Agents:

- Consulta / cruzamento / **spec pequena de chamado PB** (MD → mock → DOCX), sem fases: **`/pb-sybase`**.
- **Pedido grande** que precisa de descoberta guiada + arquitetura (separar Cadastro de Funcionamento, multi-sistema/banco) + uma spec por fragmento: **`/pb-desenvolvimento-pro`** (skill `pb-dev-all-in-one`). Também não implementa — só especifica e desenha.
- **Tela/PBL/DW nova** (herdar genérica, ícone **+** no PBSCC): skill [`pb-criar-objeto`](../pb-criar-objeto/SKILL.md) — fora deste agent, decisão separada do usuário depois da spec aprovada.
- Só patch barato de PB (objeto **já existente**): **`/pbg`**.
- Teste de mesa de trigger/SP: **`/teste-mesa-sybase`**.

Não existe mais `/pbg-validacao`. Compile/leitura PB entra neste fluxo (`pbg_compile`).

Dois modos (pelo pedido):

| Pedido | Entrega | Detalhe |
|--------|---------|---------|
| Como grava / qual coluna / trigger | Relatório | [consulta.md](consulta.md) |
| Spec, chamado, tela nova, mock, DOCX para outro dev | Pipeline | [especificacao.md](especificacao.md) |

Se o usuário pedir as duas coisas, consultar primeiro; só então redigir o MD.

## Fontes (obrigatório cruzar)

| Fonte | O que é verdade | Como |
|-------|-----------------|------|
| MCP `user-pbg` | Source da tela/DW/objeto PB | `pbg_search`, `pbg_read_object` (trecho) |
| MCP `user-sybase-hmg` | Schema e dados **vivos** na homolog | `sybase_describe_table`, `sybase_query_readonly`, `sybase_list_tables`, `sybase_whoami` |
| Disco `sybase-objects` | Fonte versionada de SP/trigger/function/view | Grep/Read no clone local |

Não inventar coluna, tipo, PK ou regra. Se não achou nas três fontes, dizer o que faltou.

### Paths

- PB workspace (PBG/ORCA): Windows absoluto, **sem default** (ex. `C:\Sistemas_PB12\WMS`). “Todos”: `pbg_list_workspaces` e/ou `pbg_search` `all: true`.
- SVN legado PB: `.srw`/`.srd` em `C:\SVN\Sistemas_PB12\<Sistema>\Bibliotecas\` — fonte que o Tortoise diffa; **não** substitui o workspace PBG. Objeto `w_foo` → `w_foo.srw`. Checkout SCC = `svn lock` quando `scc.ini` usa `lock.strategy=lock`.
- SQL versionado: clone local de `sybase-objects` (pasta onde cada dev clonou o remote abaixo)
- Remote: `http://10.0.4.67/clamed/sybase-objects`

Pasta real do repo (não a do README):

```
sybase-objects/
  Functions/                 # 1 arquivo = 1 function
  Procedures/                # sp_*.sql (alguns sem prefixo)
  Triggers/Insert/           # ti_<tabela>.sql
  Triggers/Update/           # tu_<tabela>.sql
  Triggers/Delete/           # td_<tabela>.sql
  View/                      # vw_*.sql  (nome da pasta é View, não Views)
  Publicações/
```

Tabela **não** tem `CREATE TABLE` neste repo. Schema de tabela = MCP Sybase.

## Consulta (passo a passo)

1. **Nomear o assunto**: tela PB, tabela, SP, trigger, “como grava X”.
2. **PB** (se houver tela/DW): `GetMcpTools` `user-pbg` uma vez. `pbg_search` `maxResults` ≤ 20. `pbg_read_object` só faixa ~80 linhas. Extrair SQL embarcado, `UPDATE`/`INSERT`, nomes de coluna do DW.
3. **Tabela viva**: `GetMcpTools` `user-sybase-hmg` uma vez. `sybase_describe_table`. Amostra só com `SELECT` (`sybase_query_readonly`, `maxRows` baixo).
4. **Objetos SQL versionados**: Grep no clone (`ti_`, `tu_`, `td_`, `sp_`, `vw_`, nome da tabela). Ler o arquivo inteiro da SP/trigger se for o alvo; não listar o repo inteiro.
5. **Cruzar** e entregar no formato de [consulta.md](consulta.md):
   - coluna do DW ↔ coluna da tabela
   - INSERT/UPDATE do PB ↔ trigger `ti_`/`tu_`/`td_`
   - retrieve DW ↔ view/`sp_`
   - divergência git vs homolog (se der para ver)

Custo PB: sem `pbg_build` sem pedido; sem dump de PBL.

Sybase MCP: **somente leitura**. Recusa INSERT/UPDATE/DELETE/EXEC. Não usar o MCP para “aplicar” DDL.

## Alterar objeto de banco (mesmo 1 linha)

O MCP **não** grava no ASE. A sincronização é o Git:

1. Achar o `.sql` em `sybase-objects` (criar arquivo se o objeto for novo, na pasta certa).
2. Editar o SQL **no repo**, por menor que seja a mudança.
3. Manter o estilo do arquivo (`go`, `drop`/`create` ou `create or replace trigger`).
4. Não commitar/push sem pedido.
5. Dizer com clareza: o ASE homolog **não** foi alterado; falta o DBA/deploy aplicar o script.

Se a mudança for **tabela** (coluna nova, tipo): alterar via MCP é proibido. Documentar o DDL proposto e atualizar no repo **todo objeto SQL afetado** (trigger/view/SP). Não fingir que a coluna já existe na homolog até o `sybase_describe_table` mostrar.

## Este agent não altera PB

`pb-sybase` (e `pb-desenvolvimento-pro`) **não implementam código PB**, por
enquanto — nem objeto novo, nem patch de objeto existente, mesmo se o
usuário pedir explicitamente no meio do chat. Ao final da spec aprovada,
indicar (sem executar):

- **Objeto novo** (PBL, janela herdada, DW, tela WSxxx) → skill
  **`pb-criar-objeto`**, em outro agent/chat.
- **Objeto já existente** (patch) → **`/pbg`**, em outro agent/chat.

Se o patch/tela **depende** de coluna/SP nova: documentar na spec o SQL
proposto no `sybase-objects` (+ aviso de deploy) e a ordem de subida — a
edição em si fica para quem rodar `/pbg`/`pb-criar-objeto` depois.

## Fronteiras

| Assunto | Onde |
|---------|------|
| Consulta PB+Sybase+SQL versionado | `/pb-sybase` ou esta skill |
| Spec pequena/chamado/mock/DOCX de tela PB, sem fases | `/pb-sybase` + [especificacao.md](especificacao.md) |
| Pedido grande: descoberta + arquitetura (fragmentação) + spec por fragmento | `/pb-desenvolvimento-pro` (skill `pb-dev-all-in-one`) |
| Criar PBL/janela/DW nova (ícone + SCC) | skill `pb-criar-objeto` — **fora** deste agent |
| Patch PB barato, objeto já conhecido | `/pbg` — **fora** deste agent |
| Teste de mesa trigger/SP | `/teste-mesa-sybase` |
| Spec feat/fix de produto Node (Agent Pro) | skill `especificacao` (não esta) |
| MCP genérico | skill `mcp` |








