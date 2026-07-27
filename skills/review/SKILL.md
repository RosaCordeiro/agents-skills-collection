---
name: review
description: >-
  Code review da mudanca na branch: qualidade, seguranca, aderencia a
  especificacao/design. Use na fase 4 do Dev All-in-One (apos desenvolvimento,
  antes dos testes de regra de negocio), ou em pedido explicito de code review/PR.
---

# Code review

Revise em portugues. Seja direto: achados primeiro, depois riscos e follow-ups.
Nesta fase **nao** execute a suite completa nem feche documentacao final —
isso vem nas fases `teste-regra-negocio`, `teste-automatizado` e `documentacao`.

## Quando aplicar

- Fase 4 do Dev All-in-One (apos desenvolvimento)
- Pedido explicito de review / PR

## Formato de saida

```markdown
## Veredito
- Pronto para testes de RN / Quase / Bloqueado (uma linha)

## Achados
- [Severidade] arquivo — problema e correcao sugerida

## Checklist review
- [ ] item ... (ok/falha)

## Riscos
- ...

## Proximos passos
- ...
```

Severidades: **bloqueante** | **importante** | **nit**

## Checklist desta fase

- [ ] Mudanca na branch `feat/` ou `fix/` correta
- [ ] Aderencia a SPEC/CORR + design aprovados
- [ ] Sem secrets; auth/dados/SQL seguros
- [ ] Lint/typecheck ok se existirem
- [ ] Codigo legivel (sem complexidade gratuita)
- [ ] Sem scope creep vs documento aprovado
- [ ] Paths Windows nao vazando para scripts Linux (quando aplicavel)
- [ ] SAP: fronteiras `fiori`/`ui5`/`abap` respeitadas (se aplicavel)

## Foco

- Injecao SQL / queries inseguras (Postgres, Sybase)
- Auth e exposicao de dados (Mongo e APIs)
- Ports/volumes Docker expostos demais
- Codigo morto / complexidade desnecessaria nesta mudanca
- MCP/RAG: secrets, read-only default, escopo, citacao

## Ao terminar

**`AskQuestion`** — prompt: `Code review ok?`
- `Sim, seguir para teste de regra de negocio` | `Corrigir achados` | `Outro (eu digito)`
