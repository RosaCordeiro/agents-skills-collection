---
name: clean-architecture
description: >-
  Clean Architecture com toque hexagonal (ports/adapters) para APIs e servicos
  TypeScript e Python. Referencia api-integracao-syb-kafka. Use com backend,
  script e arquitetura em servicos Node/Python; nao para SAP, PB ou Fiori.
---

# Clean Architecture + hexagonal (padrao Clamed)

Responda em portugues. Padrao **obrigatorio** em APIs e servicos **TypeScript** e **Python** novos (greenfield) e em features que tocam nucleo de negocio em repos existentes — salvo o repo ja documentar outro padrao em `.ai/rules/desenvolvimento.md`.

**Referencia canonica:** `api-integracao-syb-kafka` e `api-orquestra-integracao-sybase-kafka` (`01-PROJECTS/ACTIVE/`).

Detalhes por linguagem: [typescript.md](typescript.md) | [python.md](python.md)

## Ideia

| Conceito | Onde fica |
|----------|-----------|
| **Entidades / regras puras** | `core/domain` |
| **Casos de uso** (orquestram o fluxo) | `core/application/useCases` |
| **Portas** (interfaces que o dominio precisa) | `core/domain` (`*.repository.ts`, servicos de dominio) |
| **Adaptadores** (DB, Kafka, HTTP, fila) | `infraestructure/` |
| **Entrada** (REST, worker, cron) | `presentation/` + `application/workers` |
| **Composicao (DI)** | `shared/container/` |

Dependencias apontam **para dentro**: `presentation` → `application` → `domain` ← `infraestructure` (implementa portas).

```text
presentation ──► application (use cases) ──► domain (entities, ports, domain services)
                                                    ▲
infraestructure (adapters) ─────────────────────────┘
```

## Estrutura de pastas (TypeScript — padrao)

```text
src/
  core/
    domain/
      entities/              # entidades + interfaces de repositorio (portas)
      services/              # logica de dominio pura (grafo, validacoes, mapas)
    application/
      useCases/              # <acao>.use-case.ts — 1 fluxo por arquivo
      workers/               # consumers, jobs que chamam use cases
      services/              # orquestracao de longa duracao (ex.: pool de workers)
  infraestructure/           # grafia do time (com "e" duplo) — manter consistencia
    db/<vendor>/             # adapters de repositorio
    kafka/ | http/ | ...
  presentation/
    controllers/
    routes/
  shared/
    container/               # bindings DI (tsyringe)
    errors/
    providers/
    singletons/
```

Python: mesma logica em [python.md](python.md) (`core/`, `infrastructure/`, `presentation/`, `shared/`).

## Regras obrigatorias

### 1. Use case

- Um arquivo por fluxo: `processar-integracao-syb-kafka.use-case.ts`
- Classe `@injectable()`; metodo `execute(...)` (ou nome claro da acao)
- Injeta **portas** (`IIntegracaoRepository`), nunca classe concreta de `infraestructure`
- Orquestra dominio + portas; **nao** monta SQL, HTTP ou JSON de wire aqui

### 2. Porta (repository / gateway)

- Interface no dominio: `core/domain/entities/integracao.repository.ts` ou subpasta por agregado (`logExportacao/`)
- Prefixo `I` + nome do papel: `IIntegracaoRepository`, `IExportacaoMetaRepository`
- Metodos expressam **intencao de negocio**, nao detalhe de driver (`buscarDados`, `atualizarIntegracaoEnviadaKafka`)

### 3. Adapter

- Implementacao em `infraestructure/db/sybase/integracao.repository.ts`
- `implements IIntegracaoRepository`
- SQL, Kafka, HTTP client, parsing de protocolo **so aqui**

### 4. Presentation

- Controllers/routes **finos**: validar entrada HTTP, chamar use case, mapear resposta/erro
- Sem regra de negocio nem acesso direto a DB

### 5. Workers / cron

- Ficam em `application/workers` (ou `jobs/` na raiz se ja existir no repo)
- Resolvem use cases via container; loop/retry/backoff pode ficar no worker, regra de negocio no use case/domain

### 6. DI (TypeScript)

- `shared/container/repositories/*.ts` registra adapter → token
- `shared/container/index.ts` importa todos os bindings
- Entrypoint importa `@/shared/container` antes de resolver use cases

### 7. Erros de dominio

- Erros de negocio permanentes vs transientes em `shared/errors/` (ex.: `PermanentIntegrationError`)
- Use case propaga; adapter traduz falha de infra quando necessario

## O que evitar

| Anti-padrao | Faca |
|-------------|------|
| SQL no controller ou use case | Mover para adapter |
| Use case chamando `axios`/`kafkajs` direto | Porta + adapter |
| Interface de repositorio em `infraestructure` | Porta no `domain` |
| God service com 10 responsabilidades | Dividir use cases |
| Pular camadas “porque e MVP” | Minimo: use case + porta + adapter |

## Excecao pragmatica (repos legados)

Se o repo **ja** usa outra estrutura documentada em `.ai/rules/desenvolvimento.md`, seguir o repo. Em refatoracao grande, migrar incrementalmente para este padrao (feature por feature).

Tipos/DTOs de wire podem viver no adapter **desde que** o dominio nao dependa de framework — preferir tipos de dominio/entidade no core; aceitar vazamento pontual de DTO de mensagem (como `TKafkaMessage`) se ja for padrao do repo; em codigo novo preferir mapear no adapter.

## Testes

| Camada | O que testar |
|--------|----------------|
| `domain/services` | Unit puro, sem mock |
| `useCases` | Mock das portas (`I*Repository`) |
| `infraestructure` | Integracao / SQL com fixture ou testcontainer quando couber |
| `presentation` | Rota fina + use case mockado |

## Integracao com outras skills

| Skill | Uso |
|-------|-----|
| `backend` | Implementacao TS/Node/Go* — ler esta skill antes de codar (*Go: mesma ideia de camadas, adaptar naming) |
| `script` | CLI Python/TS com regra de negocio → mesmas camadas em miniatura |
| `arquitetura` | ARCH deve nomear use cases, portas e adapters previstos |
| `projeto-ai` | `rules/desenvolvimento.md` aponta para este padrao |
| `review` | Checar violacoes de camada (CR) |

## Checklist (gate antes de fechar feature)

- [ ] Novo fluxo tem use case dedicado
- [ ] Persistencia/mensageria/API externa atras de porta + adapter
- [ ] Controller/worker fino
- [ ] Binding no container (TS) ou modulo de DI (Python)
- [ ] Teste de dominio ou use case com porta mockada
- [ ] `.ai/rules/desenvolvimento.md` atualizado se convencao local divergir

