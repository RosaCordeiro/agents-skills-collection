# Varredura por coluna

## PowerBuilder — todos os sistemas

Raiz: `C:\Sistemas_PB12\`

```
rg "filial\.<coluna>|f\.<coluna>" --glob "*.srw" --glob "*.sru" --glob "*.srd" --glob "*.srf"
rg "<coluna>" --glob "**/.pbg/snapshots/**" 
```

Por ocorrência, classificar:

| Padrão | Classificação | Agrupar como |
|--------|---------------|--------------|
| `update=yes` + `dbname="filial.col"` | Gravação | Cadastro |
| `UPDATE filial SET col` | Gravação | Parâmetro / rotina |
| `SELECT` / `JOIN` / `WHERE` col | Leitura | Processo de negócio do objeto pai |
| Só em comentário | Ignorar | — |

Mapear pasta → **nome amigável do sistema**:

| Pasta PB | Nome usuário |
|----------|----------------|
| Gestao_Filiais | Gestão de Filiais |
| WMS | WMS (armazém / CD) |
| Fiscal | Fiscal |
| Retaguarda_Loja | Retaguarda Loja (PDV) |
| Retaguarda_Operacional | Retaguarda Operacional (distribuição) |
| Exportacao | Exportação / integrações |
| Compras | Compras |
| Contas_Receber | Contas a Receber |
| Troca_Dados_Loja | Troca de dados com a loja |

Título da tela: grep `string title =` no `.srw` pai do DW.

## sybase-objects

```
rg "<coluna>" 02-KNOWLEDGE/SYBASE/sybase-objects/Triggers/
rg "<coluna>" 02-KNOWLEDGE/SYBASE/sybase-objects/View/
rg "<coluna>" 02-KNOWLEDGE/SYBASE/sybase-objects/Procedures/
rg "<coluna>" 02-KNOWLEDGE/SYBASE/sybase-objects/Functions/
```

Resumir trigger/SP em linguagem usuário: “quando muda X, o banco também …”.

## Homolog (opcional)

Amostra de valores distintos (poucas linhas):

```sql
SELECT DISTINCT <coluna>, COUNT(*) FROM filial GROUP BY <coluna>
```

Só se ajudar a explicar domínio — não obrigatório.
