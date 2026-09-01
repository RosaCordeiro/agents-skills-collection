# Receitas de busca — mapeador de dados mestres

## Schema (Sybase homolog)

```
sybase_describe_table  → tabela
sybase_query_readonly  → FKs, amostra, tabelas de domínio
```

Nome da tabela no ASE costuma ser **minúscula** (`filial`, não `FILIAL`).

## Gravação no PowerBuilder

Buscar em `C:\Sistemas_PB12` (snapshots `.pbg` se MCP falhar):

| Evidência | Padrão Grep | Significado |
|-----------|-------------|-------------|
| DW atualiza tabela | `update="nome_tabela"` em `*.srd` | Tela que persiste na tabela |
| Coluna gravável | `update=yes.*dbname="tabela.coluna"` | Campo editável na tela |
| Domínio dropdown | `values="` na mesma linha `dbname="tabela.coluna"` | Valores S/N, redes, etc. |
| SQL direto | `update nome_tabela set` ou `UPDATE nome_tabela SET` em `*.srw` `*.sru` | Gravação fora do DW |
| Insert explícito | `insert into nome_tabela` | Inclusão programática |

Priorizar janelas `w_*cadastro*`, `w_*manutencao*`, `dw_*cadastro*`.

Para cada DW com `update="tabela"`:
1. Ler `table(column=...` — listar colunas com `update=yes`.
2. Ler título da window (`string title =` no `.srw`).
3. Anotar `values=` e `initial=` por coluna `id_*`.

## Uso no PowerBuilder

| Evidência | Padrão Grep | Classificar uso |
|-----------|-------------|-----------------|
| Leitura | `from nome_tabela` / `JOIN nome_tabela` | Retrieve, filtro, join |
| Coluna específica | `tabela.coluna` ou `f.coluna` | Detalhar por campo |
| User object | `uo_*` com SELECT da tabela | Camada reutilizada (ex. `uo_filial`) |
| Só exibição | `updatewhereclause=yes` sem `update=yes` | **Uso**, não gravação |

Limitar a consumidores representativos por **função**:
- Seleção de filial (login, filtros)
- NF / fiscal (`uo_nota_fiscal`, FI*, RL*)
- WMS / estoque / pedido
- Integração / exportação (EL*, GE509, Kafka)

## Banco versionado (sybase-objects)

```
Triggers/Insert/ti_<tabela>.sql
Triggers/Update/tu_<tabela>.sql
Triggers/Delete/td_<tabela>.sql
View/vw_<tabela>.sql ou vw_* com JOIN na tabela
Procedures/ — Grep nome da tabela
```

Resumir trigger: tabelas tocadas, `int_controle`, histórico, validações — não colar 400 linhas.

## Tabelas de domínio comuns

| Padrão | Exemplo |
|--------|---------|
| FK numérica | `cd_cidade` → `cidade`; `cd_regiao` → `regiao` |
| `id_*` char(1) | Quase sempre `S`/`N`; confirmar `values=` no DW |
| Código tabela | `id_bloqueia_pedido_psico` → `tipo_bloqueia_pedido_psico` |
| Parâmetro por filial | `parametro_loja` (`cd_parametro` + `vl_parametro`) — **não** é coluna da tabela mestre |

## Ordem de trabalho sugerida

1. Schema completo (lista de colunas).
2. Achar **todas** as telas com `update="tabela"` → mapa de gravação.
3. Por coluna sem `update=yes` em nenhuma tela → marcar **sem tela PB**; buscar `UPDATE` solto.
4. Por coluna (ou grupo): top usos + por quê.
5. Triggers Git.
6. Montar saída em [modelo-saida.md](modelo-saida.md).
