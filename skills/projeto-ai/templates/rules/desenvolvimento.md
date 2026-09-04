# Regras de desenvolvimento (local)

## Branch e commits

<!-- feat/<slug>, fix/<slug>; mensagens; quando pedir commit -->

## Estrutura e naming

### API/servico TypeScript ou Python

Seguir skill global **`clean-architecture`** (`~/.claude/skills/clean-architecture/SKILL.md`). Referencia: `api-integracao-syb-kafka`.

```text
src/
  core/domain/          # entidades, portas (I*Repository), domain services
  core/application/     # useCases, workers
  infraestructure/      # adapters (db, kafka, http) — grafia do time
  presentation/         # controllers, routes
  shared/container/     # DI (TS: tsyringe)
```

- Um use case por fluxo; controllers/workers finos
- SQL e clientes externos so em `infraestructure/`

### Outros (frontend, PB, SAP, bash glue)

<!-- pastas, modulos, prefixos de tabela, pacotes ABAP, PBL, etc. -->

## Testes

<!-- como rodar; cobertura minima esperada; use cases com porta mockada -->

## Logs e erros

<!-- padrao de log, correlation_id, mensagens de negocio; shared/errors/ -->

## Migrations / transportes

<!-- como versionar schema ou objetos SAP/PB -->

## Proibicoes locais

<!-- ex.: nao commitar .env, nao alterar PBL X sem spec -->








