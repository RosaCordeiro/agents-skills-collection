---
name: especificacao
description: >-
  Porta de entrada da fase de especificacao: classifica feat vs fix, abre a
  branch (feat/ ou fix/), e grava o documento no modelo correto. Em stack
  Node.js pergunta e registra decisao sobre @clamed/logger e light-node-metrics
  antes de aprovar. Use na fase 1 do Dev All-in-One, quando o usuario pedir
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

### 3. Gate Node.js — logger e métricas (obrigatorio se stack Node)

Se o trabalho for (ou o projeto alvo for) **Node.js / TypeScript no Node** (API Express/Fastify/Nest, worker, CLI Node, monorepo `apps/api` Node, etc.):

1. **Antes** de fechar escopo/RFs de observabilidade e **antes** de pedir aprovacao da spec, usar **`AskQuestion`** (uma pergunta; maximo um `AskQuestion` por mensagem):

   - Prompt: `Neste Node.js, incluir @clamed/logger e light-node-metrics?`
   - Opcoes (single-select):
     - `Sim — logger + light-node-metrics`
     - `So @clamed/logger`
     - `So light-node-metrics`
     - `Nao — nenhum neste MVP`
     - `Outro (eu digito)`

2. **Nao avancar** (nao marcar spec completa / nao pedir “seguir para arquitetura”) enquanto a resposta estiver pendente.
3. Registrar a decisao no documento:
   - Em **Premissas / dependencias** e/ou **Assumptions** (ex.: A-xx).
   - Se **Sim** ou so um dos pacotes: incluir no **escopo** (RF/RNF) o que couber (logs estruturados; `GET /metrics` Prometheus via `light-node-metrics`; pacotes no Verdaccio Clamed).
   - Se **Nao**: colocar explicitamente em **Fora de escopo** e nao assumir logger/metrics na arquitetura seguinte.
4. Se a stack **nao** for Node (Go, Python, ABAP, UI5 puro sem API Node nova, etc.): este gate e **N/A** — nao perguntar.

Se ainda nao estiver claro se e Node: perguntar a stack primeiro; so entao aplicar este gate.

### 4. Redigir (somente feat neste skill)

1. Seguir [modelo-feat.md](modelo-feat.md) — todos os blocos (`N/A` + motivo se nao aplicar).
2. Destacar assumptions explicitamente (incluir decisao do gate Node, se aplicavel).
3. Validar com [validacao.md](validacao.md); corrigir FAILs antes de pedir aprovacao.
4. Gravar o arquivo **na branch** (ex.: `docs/especificacoes/SPEC-001.md`).
5. Apresentar: resumo + path + branch + resultado da validacao.
6. **`AskQuestion`**: `A especificacao feat esta correta e completa?`
   - `Sim, seguir para arquitetura` | `Ajustar` | `Outro (eu digito)`
7. Apos aprovacao: `Status: aprovado` no doc. **Proxima fase = arquitetura** (nao codigo).
   - Se o gate Node se aplica e ainda nao foi decidido: **bloquear** este passo — voltar ao §3.

## Relacao com correcao de erro

Bugs, incidentes e hotfixes **nao** usam [modelo-feat.md](modelo-feat.md).
Usar `correcao-erro` + [modelo-fix.md](../correcao-erro/modelo-fix.md).

## Qualidade (feat)

- Linguagem de negocio; termos tecnicos so em RNF ou notas
- Requisitos atomicos, testaveis, nao ambiguos
- IDs: `RN-xx`, `RF-xx`, `RNF-xx`, `US-xx`, `CA-xx`, `VAL-xx`
- Fora de escopo claro; rastreabilidade US → RF/RN → CA
- Stack Node: decisao explicita sobre `@clamed/logger` / `light-node-metrics` (gate §3) registrada no doc
