---
name: modelagem-dados
description: >-
  Modelagem e tipagem de banco (Postgres prioritário): UUID padrão em PKs/FKs,
  VARCHAR com limites, TEXT só para texto longo. Use ao criar/alterar schema,
  migrations, ARCH/SPEC de dados, ou quando o agent Pro/Simples/backend tratar
  de banco Postgres.
---

# Modelagem de dados (Postgres)

Consulte esta skill **sempre** que o trabalho tocar schema, migrations, ERD,
colunas novas ou revisão de tipos em **PostgreSQL** (e ao documentar decisões
de dados em SPEC/ARCH).

## Princípios

1. **PK / FK = `uuid`** — padrão do projeto. Não use `TEXT`/`VARCHAR` para id.
   - Geração: app (`crypto.randomUUID()` / `uuid` lib) **ou** `gen_random_uuid()` (extensão `pgcrypto`).
   - FKs tipadas como `uuid` referenciando a PK.
2. **Códigos, nomes, status, e-mails, matrículas** → **`varchar(n)`** com `n` explícito e CHECK quando o domínio for fechado.
3. **`TEXT`** só para conteúdo longo de verdade: descrição, observação, corpo Markdown, XML/JSON documental grande, log textual.
4. **Boolean / timestamptz / numeric / integer** — usar o tipo nativo adequado; datas com timezone → `timestamptz`.
5. **Campos ajustáveis** — limites `n` e CHECKs são decisões de produto: documentar na SPEC/ARCH; podem ser alterados por migration futura sem mudar o princípio (uuid / varchar / text).
6. **Sem seed de domínio de negócio** salvo pedido explícito — usuários cadastram; seed só referência (perfis, telas, Admin bootstrap).

## Limites sugeridos (ajustáveis)

| Uso | Tipo sugerido |
|-----|----------------|
| PK / FK | `uuid` |
| Nome curto / título | `varchar(120)` |
| Código / key | `varchar(40)`–`varchar(64)` |
| Status / enum textual | `varchar(20)`–`varchar(40)` + CHECK |
| Matrícula | `varchar(10)` |
| E-mail | `varchar(255)` |
| Descrição / observação | `TEXT` |
| Hash senha / token hash | `varchar(255)` ou `TEXT` se necessário |

Valores de `n` podem ser negociados na SPEC; o importante é **não** deixar “TEXT livre” em atributos estruturados.

## Migrations

- Preferir migrations SQL versionadas, idempotentes quando possível.
- Mudança TEXT→uuid: plano add coluna → backfill → swap FKs → drop; **não** inventar dados de negócio.
- Se houver dados demo legados sem valor: preferir **truncar/recriar tabelas vazias** na feat a pedido do usuário, em vez de migração cosmética de seed.

## Fora de escopo desta skill

- Sybase/ASE (usar padrões ABAP/SQL do projeto Sybase).
- MongoDB (documentos — outra skill se existir).

