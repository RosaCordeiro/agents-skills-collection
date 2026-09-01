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

1. PB: `pbg_search` query `pedido_distribuidora` no `path` do sistema (ou `all: true`).
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

## MCP PBG — o que pedir

- Achar: `pbg_search` (`maxResults` ≤ 20).
- Ler: `pbg_read_object` com `startLine`/`endLine`.
- Validar compile: `pbg_compile` no objeto. Erro ORCA verbatim.
- Mudar: `pbg_apply_patch` (import+compile). Sem `pbg_build` sem pedido.
