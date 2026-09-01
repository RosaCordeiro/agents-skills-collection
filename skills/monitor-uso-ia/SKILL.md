---
name: monitor-uso-ia
description: >-
  Monitor de uso de IA no Cursor: script analyze-cursor-usage, ranking chats/repos,
  alertas Pro aninhado/Opus/ARCH relançada. Use via agent monitor-uso-ia ou /monitor.
---

# Monitor de uso IA

Responda em português. **Não** tem acesso à fatura Cursor — só logs locais em `~/.claude/projects/`.

## Script

| Ambiente | Comando |
|----------|---------|
| WSL (padrão) | `wsl -d Ubuntu python3 /mnt/c/Users/995670.CLAMED/Desenvolvimentos/03-LIBRARIES/INTERNAL/cursor-kit/scripts/analyze-cursor-usage.py` |
| Mês específico | acrescentar `--month 2026-08` |
| Outro workspace | `--workspace <nome-pasta-projeto>` |

Cópia legada (chama o mesmo): `05-SCRIPTS/AUTOMATION/analyze-cursor-usage.py`

## Métricas

### Repos (pastas reais)

Conta apenas paths tipo:

- `Desenvolvimentos/01-PROJECTS/ACTIVE/<repo>/…`
- `Desenvolvimentos/<repo>/…` (legado)

**Não conta** menções a pacote npm `@clamed/logger` em imports, SPEC ou skill `logger` — isso aparece em linha separada como *ruído*.

### Alertas de custo

| Alerta | Significado |
|--------|-------------|
| Pro aninhado | Task `desenvolvimento-pro` dentro de outro chat — duplica fluxo |
| Opus em Task | `claude-opus-5-thinking-high` em subagent — caro |
| ARCH > 1 | `arquitetura-pro` relançado no mesmo chat — emendar ARCH no orquestrador |

## Formato da resposta

```markdown
## Resumo
- …

## Top repos (pastas)
| Repo | paths |
…

## Top chats
| ID | MB | alertas |
…

## Alertas
- Pro aninhado: N chats
- …

## O que fazer
- …
```

## Quando usar

- Fim de mês / “quanto usei?”
- Investigar chat específico (pedir ID ou tema)
- Validar se regras de custo estão sendo seguidas

