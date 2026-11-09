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

Fases 3, 5 e 8 **via Task** com `model:` do primário. `review-pro` e `review-testes-pro` são **readonly**; `arquitetura-pro` só grava o ARCH e os ADRs, nunca código.

Agents: `arquitetura-pro`, `review-pro`, `review-testes-pro`.

**Nunca** Task dos orquestradores (`desenvolvimento-pro`, etc.).

<!-- claude-model -->
### Claude Code

No Claude Code vale o campo `claude-model` (o sync grava em `model:` no `~/.claude`). As tabelas acima valem para o Cursor.

| Fase | Skill / Task | Claude Code | Fallback |
|------|--------------|-------------|----------|
| Início | orquestrador (sessão) | `opus` | `sonnet` |
| 1 Descoberta | skill `descoberta` | `opus` | `sonnet` |
| 2 Especificação | skill `especificacao` / `correcao-erro` | `opus` | `sonnet` |
| 3 Desenho | Task `arquitetura-pro` | `fable` | `opus` → `sonnet` |
| 4 Código | skills `backend` / `frontend` / `abap` / `fiori` / `ui5` / `java` / `springboot` / `script` | `sonnet` | — |
| 5 Revisão | Task `review-pro` | `opus` | `sonnet` |
| 6 Aceite de negócio | skill `teste-regra-negocio` | `opus` | `sonnet` |
| 7 Testes automáticos | skill `teste-automatizado` | `sonnet` | — |
| 8 Revisão de testes | Task `review-testes-pro` | `opus` | `sonnet` |
| 9 Documentação | skill `documentacao` | `sonnet` | — |
| 10 Encerramento | orquestrador | `sonnet` | — |

**Como o modelo troca no Claude Code**

- O orquestrador roda neste chat: vale o modelo da sessão. Começar em `opus`.
- Fase com skill: a skill tem `model:` no frontmatter; ao invocá-la, o turno roda nesse modelo.
- Fase via Task: o subagent já tem `model:` no frontmatter; para `general-purpose`, passar `model` no Task.
- Fallback: se o modelo falhar ou não estiver disponível, relançar com o próximo da cadeia e anotar o modelo efetivo no artefato.
- As regras "nunca Opus" / "Opus só com pedido explícito" deste documento valem só no **Cursor**.

**Ferramentas no Claude Code**

- `AskQuestion` deste documento = ferramenta `AskUserQuestion`.
- Ao gravar ou atualizar SPEC/CORR, ARCH, REVIEW ou outro artefato da entrega, enviar o arquivo ao usuário (`SendUserFile`) em vez de só citar o caminho.

## Retomada

Antes da Fase 1, olhar a branch e `docs/` do repo. Se já houver artefatos
desta entrega (SPEC/CORR, ARCH, REVIEW-*, REVIEW-TESTES-*), dizer em que
fase a entrega parou e perguntar se retoma dali ou recomeça. Retomar não
pula a aprovação da fase em que parou.

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

AskQuestion: `Especificação ok — seguir para Desenho?`

### Fase 3 — Desenho

**Gate:** listar `docs/arquitetura/ARCH-*` da entrega. Se **já existe** → orquestrador **emenda** no chat; **não** Task `arquitetura-pro`. Se **não existe** → Task **uma vez**; ADRs.

AskQuestion: `Desenho ok — seguir para Código?`

### Fase 4 — Código

Skills de implementação; greenfield → `.ai/rules/`.

AskQuestion: `Código pronto — seguir para Revisão?`

### Fase 5 — Revisão (código)

Task `review-pro`; loop corrigir código → re-review.

AskQuestion: `Revisão ok — seguir para Aceite de negócio?` (+ `Corrigir achados`)

### Fase 6 — Aceite de negócio

`teste-regra-negocio` — VAL/V.

AskQuestion: `Aceite ok — seguir para Testes automáticos?`

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

AskQuestion: `Documentação ok — seguir para Encerramento?`

### Fase 10 — Encerramento

Antes do checklist, nos repositórios tocados, nesta ordem:

1. Skill `backstage-recursos` — dependências de infra novas/removidas.
2. Skill `backstage-catalog-info` — catalog-info.yaml, mkdocs.yml, docs/index.md.

Único pulo aceito: `backstage-recursos` detectar que está fora da rede Clamed
(ela mesma avisa e pula).

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
- [ ] Backstage: `backstage-recursos` + `backstage-catalog-info` (ou pulo registrado por falta de rede)
- [ ] WSL/Compose/secrets/lint conforme projeto
- [ ] **10 fases** aprovadas pelo dev
