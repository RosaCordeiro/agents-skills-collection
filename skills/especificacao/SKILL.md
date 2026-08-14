---
description: >-
  Porta de entrada da fase de especificacao: classifica feat vs fix, abre a
  branch (feat/ ou fix/), e grava o documento no modelo correto. Em stack
  Node.js herda @clamed/logger + light-node-metrics se o projeto ja usa; so
  pergunta no greenfield. Use na fase 1 do Dev All-in-One, quando o usuario pedir
  especificação, RN, BRD/FRD, ou antes de arquitetura — inclusive pedidos
  ambíguos (feat ou bug).
---

# Especificacao (entrada feat | fix)

Especialista em **classificar** o pedido e gravar requisitos por escrito.
Nao implemente codigo de produto aqui. Responda em portugues.

## Processo obrigatorio (ordem)

### 1. Classificar: feat ou fix

Se o tipo **nao** estiver explícito, use **`AskQuestion`**:

- Prompt: `Isto e uma feature (feat) ou uma correcao (fix)?`
- Opcoes: `Feat — regra/comportamento novo` | `Fix — bug, incidente, hotfix` | `Outro (eu digito)`

| Tipo | Skill + modelo | Branch | Destino do arquivo |
|------|----------------|--------|--------------------|
| **feat** | esta skill + [modelo-feat.md](modelo-feat.md) | `feat/<slug>` | `docs/especificacoes/` (ou path do projeto) |
| **fix** | skill `correcao-erro` + [modelo-fix.md](../correcao-erro/modelo-fix.md) | `fix/<slug>` | `docs/correcoes/` (ou path do projeto) |

Se for **fix**, apos classificar e abrir a branch, **transferir** o restante para `correcao-erro` (ler o SKILL.md dela e seguir).

### 2. Abrir a branch **antes** de gravar o doc

A especificacao altera regras de negocio (feat) ou docs de issue/erro (fix) — a branch existe desde o inicio.

1. Definir `<slug>` curto (kebab-case) a partir do titulo.
2. A partir da branch base do projeto (`main`/`master`/`develop`, conforme o repo):
   - `git checkout -b feat/<slug>` ou `git checkout -b fix/<slug>`
3. Se a branch ja existir, fazer checkout nela.
4. Registrar o nome da branch no documento (campo Branch).

Nao pedira commit ainda a menos que o usuario peça — mas a branch e obrigatoria.

### 3. Gate Node.js — logger e métricas

Se o trabalho for (ou o projeto alvo for) **Node.js / TypeScript no Node** (API Express/Fastify/Nest, worker, CLI Node, monorepo `apps/api` Node, etc.):

#### 3.1 Projeto que **ja usa** observabilidade Clamed (padrao)

Detectar no repo (qualquer um basta): dependencia/`import` de `@clamed/logger` ou `light-node-metrics`; mencao em SPEC/ARCH anterior aprovada; `GET /metrics` ou setup em `observability/`.

**Nesse caso:**

1. **Nao perguntar** de novo a cada feat/fix.
2. **Herdar automaticamente:** manter `@clamed/logger` **e** `light-node-metrics` na entrega.
3. Registrar no doc: *“Observabilidade: herdada do projeto (logger + light-node-metrics).”* em Premissas / Assumptions.
4. Nao colocar logger/metrics em “Fora de escopo” so porque a feat nao e sobre obs.
5. Se a feat **tocar logs** (novos fluxos, correlacao, eventos): citar aderencia a skill `logger` (`event`, `correlation_id`, keywords) na RNF/observabilidade.

#### 3.2 Greenfield Node (ainda **nao** usa)

So se **nao** houver evidencia de uso no projeto:

1. **`AskQuestion`** (uma pergunta; maximo um `AskQuestion` por mensagem):
   - Prompt: `Neste Node.js novo, incluir @clamed/logger e light-node-metrics?`
   - Opcoes: `Sim — logger + light-node-metrics` | `So @clamed/logger` | `So light-node-metrics` | `Nao — nenhum neste MVP` | `Outro (eu digito)`
2. Registrar a decisao; incluir no escopo ou em fora de escopo conforme a resposta.
3. Nao aprovar a spec sem essa decisao (greenfield apenas).

#### 3.3 Stack nao-Node

Gate **N/A** — nao perguntar.

### 4. Redigir (somente feat neste skill)

1. Seguir [modelo-feat.md](modelo-feat.md) — todos os blocos (`N/A` + motivo se nao aplicar).
2. Destacar assumptions explicitamente (incluir observabilidade herdada ou decisao greenfield).
3. Validar com [validacao.md](validacao.md); corrigir FAILs antes de pedir aprovacao.
4. Gravar o arquivo **na branch** (ex.: `docs/especificacoes/SPEC-001.md`).
5. Apresentar: resumo + path + branch + resultado da validacao.
6. **`AskQuestion`**: `A especificacao feat esta correta e completa?`
   - `Sim, seguir para arquitetura` | `Ajustar` | `Outro (eu digito)`
7. Apos aprovacao: `Status: aprovado` no doc. **Proxima fase = arquitetura** (nao codigo).

## Relacao com correcao de erro

Bugs, incidentes e hotfixes **nao** usam [modelo-feat.md](modelo-feat.md).
Usar `correcao-erro` + [modelo-fix.md](../correcao-erro/modelo-fix.md).

## Qualidade (feat)

- Linguagem de negocio; termos tecnicos so em RNF ou notas
- Requisitos atomicos, testaveis, nao ambiguos
- IDs: `RN-xx`, `RF-xx`, `RNF-xx`, `US-xx`, `CA-xx`, `VAL-xx`
- Fora de escopo claro; rastreabilidade US → RF/RN → CA
- Stack Node: observabilidade **herdada** se o projeto ja usa; so perguntar em greenfield (§3)
