# Modelos por fase e agent

Referência canônica — **não usar `inherit`** como instrução; sempre o slug primário + cadeia de fallback.

## Entrega guiada (9 fases)

| Fase | Executor | Primário | Fallback 1 | Fallback 2 | Opus |
|------|----------|----------|------------|------------|------|
| 1, 3, 5, 6, 8, 9 | Orquestrador (`desenvolvimento-pro`) | `claude-sonnet-5-thinking-high` | `cursor-grok-4.5-high-fast` | `composer-2.5-fast` | só pedido explícito no chat |
| 2 | Task `arquitetura-pro` | `claude-sonnet-5-thinking-high` | `cursor-grok-4.5-high-fast` | `composer-2.5-fast` | só pedido explícito |
| 4 | Task `review-pro` | `cursor-grok-4.5-high-fast` | `claude-sonnet-5-thinking-high` | — | **nunca** |
| 7 | Task `review-testes-pro` | `cursor-grok-4.5-high-fast` | `claude-sonnet-5-thinking-high` | — | **nunca** |

### Regras de fallback

1. **Primário indisponível** (rate-limit, erro, sem tokens): usar o próximo da cadeia.
2. **Anotar** o model efetivo no artefato da fase (`ARCH`, `REVIEW-*`, `REVIEW-TESTES-*`, SPEC).
3. **Reviews (4 e 7):** nunca subir para Opus; Grok → Sonnet e parar.
4. **Orquestrador e arquitetura:** Opus (`claude-opus-5-thinking-high`) só se o usuário pedir explicitamente neste chat.
5. Ao lançar Task de subagent, passar `model:` do primário; se falhar, relançar com fallback documentado.

## Agents de desenvolvimento (chat, não Task)

| Agent | Papel | Primário | Fallback 1 | Fallback 2 |
|-------|-------|----------|------------|------------|
| `desenvolvimento` | Portal — só roteia Pro vs Simples | `composer-2.5-fast` | `claude-sonnet-5-thinking-high` | — |
| `desenvolvimento-pro` | Orquestrador 9 fases | `claude-sonnet-5-thinking-high` | `cursor-grok-4.5-high-fast` | `composer-2.5-fast` |
| `desenvolvimento-simples` | Implementação sem fases | `claude-sonnet-5-thinking-high` | `cursor-grok-4.5-high-fast` | `composer-2.5-fast` |

## Outros agents

| Agent | Primário | Fallback 1 | Fallback 2 |
|-------|----------|------------|------------|
| `auditor` | `claude-sonnet-5-thinking-high` | `cursor-grok-4.5-high-fast` | `composer-2.5-fast` |
| `pb-sybase` | `claude-sonnet-5-thinking-high` | `cursor-grok-4.5-high-fast` | `composer-2.5-fast` |
| `teste-mesa-sybase` | `claude-sonnet-5-thinking-high` | `cursor-grok-4.5-high-fast` | — |
| `softdesk` | `composer-2.5-fast` | `claude-sonnet-5-thinking-high` | — |
| `pbg` | `composer-2.5-fast` | — | — |

## Pool no Cursor (referência)

| Slug | Pool típico |
|------|-------------|
| `claude-sonnet-5-thinking-high` | Other Models |
| `cursor-grok-4.5-high-fast` | Cursor Models |
| `composer-2.5-fast` | Cursor Models |
