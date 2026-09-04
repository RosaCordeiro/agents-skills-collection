---
name: dev-all-in-one
description: >-
  Orquestrador de Entrega (10 fases): descoberta, especificacao, desenho,
  codigo, revisao, aceite, testes, revisao de testes, docs, encerramento.
  Use com desenvolvimento-pro / entrega guiada / pro / all-in-one.
---

# Orquestrador de Entrega (10 fases)

Conduz o desenvolvimento até o **Encerramento** (DoD), com aprovação em cada etapa.

**Mapa visual:** [fases.md](fases.md)

Responda em português. Prefira WSL/Linux e Docker.

## As 10 fases (ordem obrigatória)

| # | Nome | Skill / agent | Artefato principal |
|---|------|---------------|-------------------|
| 1 | **Descoberta** | `descoberta` | Resumo da Descoberta aprovado |
| 2 | **Especificação funcional** | `especificacao` / `correcao-erro` | SPEC/CORR + branch |
| 3 | **Desenho** | Task `arquitetura-pro` | ARCH + ADR |
| 4 | **Código** | `frontend` / `backend` / … | código |
| 5 | **Revisão** | Task `review-pro` | REVIEW-* |
| 6 | **Aceite de negócio** | `teste-regra-negocio` | VAL/V |
| 7 | **Testes automáticos** | `teste-automatizado` | suite (com evidência) |
| 8 | **Revisão de testes** | Task `review-testes-pro` | REVIEW-TESTES-* |
| 9 | **Documentação** | `documentacao` | README + docs F2/F4/F5 |
| 10 | **Encerramento** | DoD | entrega fechada |

Anuncie: **"Fase N — Nome"** + entrega + aprovação esperada. Cada fase pode
gerar correção antes de avançar — a aprovação da fase anterior não impede
voltar e ajustar se surgir algo novo (ver loops por fase abaixo).

## Modelos por fase

Referência: [modelos.md](modelos.md)

| Fase | Executor | Primário | Fallback |
|------|----------|----------|----------|
| 1 Descoberta | orquestrador | `claude-sonnet-5-thinking-high` | `claude-sonnet-5` → Grok medium |
| 2, 4, 6, 7, 9, 10 | orquestrador | `claude-sonnet-5` | `cursor-grok-4.6-medium` → `composer-2.5-fast` |
| 3 Desenho | Task `arquitetura-pro` | `claude-sonnet-5-thinking-high` | Sonnet → Composer |
| 5 Revisão código | Task `review-pro` | `cursor-grok-4.6-medium` | `claude-sonnet-5` |
| 8 Revisão testes | Task `review-testes-pro` | `cursor-grok-4.6-medium` | `claude-sonnet-5` |

Fase 1 (Descoberta) usa **thinking-high** por pedido explícito do time — para investigar melhor o pedido e chegar a soluções melhores antes de redigir a spec. Isso é exceção fixa (não precisa reconfirmar por entrega); as demais fases do orquestrador seguem em Sonnet padrão.

Fases 3, 5 e 8 **via Task** com `model:` do primário. Subagents são **readonly**.

Agents: `arquitetura-pro`, `review-pro`, `review-testes-pro`.

**Nunca** Task dos orquestradores (`desenvolvimento-pro`, etc.).

---

### Fase 1 — Descoberta

Skill `descoberta`: perguntas objetivas até fechar o entendimento do pedido
(objetivo, atores, gatilho, escopo, restrições). **Sem** branch, **sem**
documento de spec ainda — só o Resumo da Descoberta aprovado pelo usuário.

AskQuestion: `Este é exatamente o entendimento do que você quer?`

### Fase 2 — Especificação funcional

`especificacao` / `correcao-erro`, a partir do Resumo da Descoberta aprovado;
branch; greenfield → `.ai/context/`. A especificação é escrita em linguagem
que o usuário entenda e inclui os **pontos de investigação técnica** que o
analista precisa checar no código/banco antes do desenho (§14 do
`modelo-feat.md`).

### Fase 3 — Desenho

**Gate:** listar `docs/arquitetura/ARCH-*` da entrega. Se **já existe** → orquestrador **emenda** no chat; **não** Task `arquitetura-pro`. Se **não existe** → Task **uma vez**; ADRs.

### Fase 4 — Código

Skills de implementação; greenfield → `.ai/rules/`.

### Fase 5 — Revisão (código)

Task `review-pro`; loop corrigir código → re-review.

### Fase 6 — Aceite de negócio

`teste-regra-negocio` — VAL/V.

### Fase 7 — Testes automáticos

`teste-automatizado` — **rodar suite**; registrar comando + resultado (evidência para Fase 8).

AskQuestion: `Testes automáticos ok — seguir para Revisão de testes?`

### Fase 8 — Revisão de testes

Task `review-testes-pro` + skill `review-testes` (RT1–RT12).

**Foco:** abrangência, execução real, **teste não adaptado ao bug** (RT5 bloqueante).

Orquestrador grava `REVIEW-TESTES-*-resultado.md`.

**Loop** — AskQuestion `Revisão de testes ok?`

- `Sim, seguir para Documentação`
- `Corrigir testes` → orquestrador ajusta testes → **re-Task** `review-testes-pro` (e rodar suite na Fase 7 se necessário)
- `Corrigir código` → orquestrador ajusta produto → voltar **Fase 7** (rodar suite) → Fase 8 de novo
- `Outro (eu digito)`

### Fase 9 — Documentação

Skill `documentacao` — README R1–R10 **e** revisão obrigatória dos docs das fases **2, 4 e 5** (DOC-F2/F4/F5): SPEC/CORR, operação do código, fechamento do REVIEW.

Sincronizar `.ai/docs/indice.md`.

### Fase 10 — Encerramento

Checklist DoD; AskQuestion `DoD completo — encerrar?`

---

## Routing

| Situação | Skill / Task |
|----------|----------------|
| Descoberta / entendimento do pedido | `descoberta` |
| Revisão código | Task `review-pro` + `review` |
| Revisão testes | Task `review-testes-pro` + `review-testes` |
| Docs + sync F2/F4/F5 | `documentacao` |
| Demais | ver tabela de fases |

## Definition of Done (Fase 10)

- [ ] Descoberta — Resumo aprovado
- [ ] Especificação (SPEC/CORR) + branch, com pontos de investigação técnica
- [ ] `.ai/` greenfield
- [ ] Desenho (ARCH)
- [ ] Revisão código (`REVIEW-*`) sem bloqueantes
- [ ] Aceite negócio (VAL/V)
- [ ] Testes automáticos executados
- [ ] Revisão testes (`REVIEW-TESTES-*`) sem RT5 bloqueante
- [ ] Documentação: README + **DOC-F2/F4/F5** (spec, código, review alinhados)
- [ ] WSL/Compose/secrets/lint conforme projeto
- [ ] **10 fases** aprovadas pelo dev
