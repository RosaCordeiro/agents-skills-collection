---
name: dev-all-in-one
description: >-
  Orquestrador de Entrega (9 fases): requisitos, desenho, codigo, revisao,
  aceite, testes, revisao de testes, documentacao, encerramento. Use com
  desenvolvimento-pro / entrega guiada / pro / all-in-one.
---

# Orquestrador de Entrega (9 fases)

Conduz o desenvolvimento até o **Encerramento** (DoD), com aprovação em cada etapa.

**Mapa visual:** [fases.md](fases.md)

Responda em português. Prefira WSL/Linux e Docker.

## As 9 fases (ordem obrigatória)

| # | Nome | Skill / agent | Artefato principal |
|---|------|---------------|-------------------|
| 1 | **Requisitos** | `especificacao` / `correcao-erro` | SPEC/CORR + branch |
| 2 | **Desenho** | Task `arquitetura-pro` | ARCH + ADR |
| 3 | **Código** | `frontend` / `backend` / … | código |
| 4 | **Revisão** | Task `review-pro` | REVIEW-* |
| 5 | **Aceite de negócio** | `teste-regra-negocio` | VAL/V |
| 6 | **Testes automáticos** | `teste-automatizado` | suite (com evidência) |
| 7 | **Revisão de testes** | Task `review-testes-pro` | REVIEW-TESTES-* |
| 8 | **Documentação** | `documentacao` | README + docs F1/F3/F4 |
| 9 | **Encerramento** | DoD | entrega fechada |

Anuncie: **“Fase N — Nome”** + entrega + aprovação esperada.

## Modelos por fase

Referência: [modelos.md](modelos.md)

| Fase | Executor | Primário | Fallback |
|------|----------|----------|----------|
| 1, 3, 5, 6, 8, 9 | orquestrador | `claude-sonnet-5` | `cursor-grok-4.6-medium` → `composer-2.5-fast` |
| 2 Desenho | Task `arquitetura-pro` | `claude-sonnet-5-thinking-high` | Sonnet → Composer |
| 4 Revisão código | Task `review-pro` | `cursor-grok-4.6-medium` | `claude-sonnet-5` |
| 7 Revisão testes | Task `review-testes-pro` | `cursor-grok-4.6-medium` | `claude-sonnet-5` |

Fases 2, 4 e 7 **via Task** com `model:` do primário. Subagents são **readonly**.

Agents: `arquitetura-pro`, `review-pro`, `review-testes-pro`.

**Nunca** Task dos orquestradores (`desenvolvimento-pro`, etc.).

---

### Fase 1 — Requisitos

`especificacao` / `correcao-erro`; branch; greenfield → `.ai/context/`.

### Fase 2 — Desenho

**Gate:** listar `docs/arquitetura/ARCH-*` da entrega. Se **já existe** → orquestrador **emenda** no chat; **não** Task `arquitetura-pro`. Se **não existe** → Task **uma vez**; ADRs.

### Fase 3 — Código

Skills de implementação; greenfield → `.ai/rules/`.

### Fase 4 — Revisão (código)

Task `review-pro`; loop corrigir código → re-review.

### Fase 5 — Aceite de negócio

`teste-regra-negocio` — VAL/V.

### Fase 6 — Testes automáticos

`teste-automatizado` — **rodar suite**; registrar comando + resultado (evidência para Fase 7).

AskQuestion: `Testes automáticos ok — seguir para Revisão de testes?`

### Fase 7 — Revisão de testes

Task `review-testes-pro` + skill `review-testes` (RT1–RT12).

**Foco:** abrangência, execução real, **teste não adaptado ao bug** (RT5 bloqueante).

Orquestrador grava `REVIEW-TESTES-*-resultado.md`.

**Loop** — AskQuestion `Revisão de testes ok?`

- `Sim, seguir para Documentação`
- `Corrigir testes` → orquestrador ajusta testes → **re-Task** `review-testes-pro` (e rodar suite na Fase 6 se necessário)
- `Corrigir código` → orquestrador ajusta produto → voltar **Fase 6** (rodar suite) → Fase 7 de novo
- `Outro (eu digito)`

### Fase 8 — Documentação

Skill `documentacao` — README R1–R10 **e** revisão obrigatória dos docs das fases **1, 3 e 4** (DOC-F1/F3/F4): SPEC/CORR, operação do código, fechamento do REVIEW.

Sincronizar `.ai/docs/indice.md`.

### Fase 9 — Encerramento

Checklist DoD; AskQuestion `DoD completo — encerrar?`

---

## Routing

| Situação | Skill / Task |
|----------|----------------|
| Revisão código | Task `review-pro` + `review` |
| Revisão testes | Task `review-testes-pro` + `review-testes` |
| Docs + sync F1/F3/F4 | `documentacao` |
| Demais | ver tabela de fases |

## Definition of Done (Fase 9)

- [ ] Requisitos (SPEC/CORR) + branch
- [ ] `.ai/` greenfield
- [ ] Desenho (ARCH)
- [ ] Revisão código (`REVIEW-*`) sem bloqueantes
- [ ] Aceite negócio (VAL/V)
- [ ] Testes automáticos executados
- [ ] Revisão testes (`REVIEW-TESTES-*`) sem RT5 bloqueante
- [ ] Documentação: README + **DOC-F1/F3/F4** (spec, código, review alinhados)
- [ ] WSL/Compose/secrets/lint conforme projeto
- [ ] **9 fases** aprovadas pelo dev

