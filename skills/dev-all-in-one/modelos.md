# Modelos por fase e agent

Referência canônica — **não usar `inherit`**. Sempre slug primário + fallback.

## Nomenclatura (evitar confusão)

| Nome na UI / slug | O que é | Custo |
|-------------------|---------|-------|
| **`claude-sonnet-5`** | Sonnet 5 **padrão** (trabalho do dia) | Médio |
| **`claude-sonnet-5-thinking-high`** | Sonnet com **raciocínio estendido** explícito | Alto (tokens internos) |
| **`cursor-grok-4.6-medium`** | Grok qualidade média | Baixo |
| **`cursor-grok-4.5-high-fast`** | Grok "high + fast" | Baixo-médio (evitar como padrão) |
| **`composer-2.5-fast`** | Composer | Muito baixo |

**Sonnet não usa `high-fast`** — isso é Grok. O que pesava no Sonnet era o **`thinking-high`** em tudo (orquestrador, código, spec).

## Política do time

| Camada | Slug | Quando |
|--------|------|--------|
| **Sonnet trabalho** | `claude-sonnet-5` | Orquestrador, simples, spec, código, pb-sybase, fallbacks leves |
| **Sonnet design** | `claude-sonnet-5-thinking-high` | `arquitetura-pro` (1× ARCH), `auditor` e **Descoberta** (Fase 1 — exceção pedida pelo usuário) |
| **Grok review** | `cursor-grok-4.6-medium` | `review-pro`, `review-testes-pro` |
| **Composer** | `composer-2.5-fast` | PBG, portal, monitor |

**Thinking-high** só com pedido explícito fora de ARCH/auditor — Descoberta (Fase 1) é essa exceção, registrada pelo usuário para investigar melhor o pedido e chegar a soluções melhores. **Opus** só pedido explícito no chat.

## Entrega guiada (10 fases)

| Fase | Executor | Primário | Fallback 1 | Fallback 2 |
|------|----------|----------|------------|------------|
| 1 | Orquestrador (Descoberta) | `claude-sonnet-5-thinking-high` | `claude-sonnet-5` | `cursor-grok-4.6-medium` |
| 2, 4, 6, 7, 9, 10 | Orquestrador | `claude-sonnet-5` | `cursor-grok-4.6-medium` | `composer-2.5-fast` |
| 3 | Task `arquitetura-pro` | `claude-sonnet-5-thinking-high` | `claude-sonnet-5` | `composer-2.5-fast` |
| 5 | Task `review-pro` | `cursor-grok-4.6-medium` | `claude-sonnet-5` | — |
| 8 | Task `review-testes-pro` | `cursor-grok-4.6-medium` | `claude-sonnet-5` | — |

### Regras de fallback

1. Primário indisponível → próximo da cadeia; anotar model efetivo no artefato.
2. Reviews **nunca** Opus nem `thinking-high` por padrão.
3. ARCH: **1× Task** por entrega; amend no orquestrador (`custo-subagent.mdc`).
4. Opus só pedido explícito.
5. Fase 1 (Descoberta) em `thinking-high` é exceção fixa do time (não precisa reconfirmar a cada entrega) — as demais fases do orquestrador continuam em Sonnet padrão.

## Agents (chat)

| Agent | Primário | Fallback |
|-------|----------|----------|
| `desenvolvimento-pro` | `claude-sonnet-5` | Grok medium → Composer |
| `desenvolvimento-simples` | `claude-sonnet-5` | Grok medium → Composer |
| `desenvolvimento` (portal) | `composer-2.5-fast` | `claude-sonnet-5` |
| `arquitetura-pro` | `claude-sonnet-5-thinking-high` | `claude-sonnet-5` |
| `review-pro` / `review-testes-pro` | `cursor-grok-4.6-medium` | `claude-sonnet-5` |
| `auditor` | `claude-sonnet-5-thinking-high` | Grok medium → Composer |
| `pb-sybase` / `teste-mesa-sybase` | `claude-sonnet-5` | Grok medium |
| `pb-desenvolvimento-pro` | `claude-sonnet-5` (Fase 2/4 `thinking-high`) | Grok medium |
| `monitor-uso-ia` / `softdesk` / `pbg` | `composer-2.5-fast` | `claude-sonnet-5` |

## Pool no Cursor

| Slug | Pool típico |
|------|-------------|
| `claude-sonnet-5` | Other Models |
| `claude-sonnet-5-thinking-high` | Other Models |
| `cursor-grok-4.6-medium` | Cursor Models |
| `composer-2.5-fast` | Cursor Models |
