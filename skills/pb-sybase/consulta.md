# Relatório de consulta PB + Sybase

Usar este formato na resposta ao usuário (completo, sem pular fonte). Omitir seção só se a fonte não se aplica — e dizer por quê.

```markdown
## Escopo
- Pedido:
- Sistema PB (`path`):
- Objetos PB (nome / tipo / PBL):
- Tabelas homolog:
- Arquivos sybase-objects:

## PowerBuilder
- Tela / DW / evento:
- SQL embarcado (trecho curto):
- Colunas do DW ↔ intenção (retrieve / update):

## Sybase homolog (vivo)
- Login/db (`sybase_whoami` se útil):
- Colunas da tabela (tipo, nulo):
- Amostra (se pedida; poucas linhas):

## sybase-objects (Git)
- `Triggers/Insert/ti_*.sql`
- `Triggers/Update/tu_*.sql`
- `Triggers/Delete/td_*.sql`
- `Procedures/sp_*.sql`
- `Functions/*.sql`
- `View/vw_*.sql`
- O que cada um faz na gravação/leitura:

## Cruzamento
- DW vs tabela (coluna faltando / tipo diferente / nome diferente)
- PB grava → trigger dispara? efeito colateral
- Retrieve usa view/SP?
- Git vs vivo (se conferido)

## Achados
- [bloqueante|importante|nit] fato + evidência (objeto + trecho)

## Próximo passo
- Consulta encerrada / patch PB (`/pbg`) / editar sybase-objects / deploy DBA / teste de mesa
```

## Receitas de busca

Assunto `pedido_distribuidora` (exemplo):

1. PB: `pbg_search` query `pedido_distribuidora` no `path` do sistema (ou `all: true`). Ambiente Clamed: esse tool le o snapshot `.sr*`, que pode estar desatualizado frente a uma alteração já feita no PB/SVN — antes de concluir estado **atual**, ver skill `pbg` § Ambiente Clamed → Snapshot desatualizado.
2. Tabela: `sybase_describe_table` `pedido_distribuidora`.
3. Git (Grep no clone, não varrer 1000 arquivos):
   - `Triggers/Update/tu_pedido_distribuidora.sql`
   - `Triggers/Insert/ti_pedido_distribuidora.sql`
   - `Triggers/Delete/td_pedido_distribuidora.sql`
   - Procedures/Views/Functions com o nome da tabela no conteúdo.

Não dumpar trigger de 400 linhas: resumir regras (IF, raiserror, tabelas tocadas) e citar trechos curtos.

## MCP Sybase — o que pedir

- Estrutura: `sybase_describe_table`.
- Achar tabela: `sybase_list_tables` `nameContains`.
- Dado: um `SELECT` em `sybase_query_readonly`. Sem `SELECT INTO`, sem lote `;`, sem `EXEC`.
- SP/trigger **texto**: preferir o arquivo Git. `syscomments` na homolog é fallback (pode fragmentar).

## DataWindow: é atualizável (grava na tabela) ou só relatório?

`updatewhereclause=yes` em coluna **não** significa que a DW grava na tabela — é só a flag de "incluir esta coluna na cláusula WHERE/valores quando houver update", presente mesmo em DW puramente de consulta (herança do editor, coluna mapeada a `dbname` de tabela real).

O que realmente torna a DW atualizável é a cláusula `update="<tabela>"` dentro do bloco `table(...)` do `.srd`/`editsource`. Antes de tratar uma DW como update-capable (e daí concluir que ela gera INSERT/UPDATE/DELETE contra a tabela):

1. Ler a fonte inteira da DW (`pbg_read_object`, sem parar na primeira metade — o `table(column=...)` pode vir cedo, mas o `update="..."`/`updatetable=`/`key=yes` podem estar em outro trecho do mesmo bloco).
2. Procurar o **padrão** `update="` (com aspas) no texto — o valor entre aspas é o nome real da tabela alvo (ex.: `update="produto"`, `update="item_nf_transferencia"`), varia por DW; não é uma string fixa para copiar/colar, é o atributo que precisa ser localizado e depois lido. Se não achar nenhuma ocorrência de `update="`, a DW **não** grava em tabela nenhuma — é só apresentação/relatório, mesmo com `updatewhereclause=yes` espalhado nas colunas.
3. Só se achar `update="<tabela>"`: conferir se a tabela citada é a mesma do assunto da consulta (uma DW pode ter `update=` para outra tabela que não a que você está analisando) — aí sim vale investigar `key=yes` por coluna (as colunas-chave reais do WHERE de update) e cruzar com a PK dessa tabela.
4. Não presumir "é update-capable" só pela presença de `updatewhereclause=yes` — checar sempre o `update="..."` antes de reportar risco de INSERT/UPDATE/DELETE.

## MCP PBG — o que pedir

- Achar: `pbg_search` (`maxResults` ≤ 20).
- Ler: `pbg_read_object` com `startLine`/`endLine`.
- Validar compile: `pbg_compile` no objeto. Erro ORCA verbatim.
- Mudar: `pbg_apply_patch` (import+compile). Sem `pbg_build` sem pedido.
- Snapshot pode estar desatualizado (ambiente Clamed): antes de dar veredito sobre estado atual, comparar a data do `.srw`/`.srd` no SVN com a do snapshot em `.pbg/snapshots`; se o SVN for mais novo, ler direto de lá. Ver skill `pbg` § Ambiente Clamed → Snapshot desatualizado.











