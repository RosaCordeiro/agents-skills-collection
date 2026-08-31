---
name: dev-all-in-one
description: >-
  Orquestra o Agent Pro: classificacao feat/fix + branch na especificação,
  arquitetura, desenvolvimento, code review, teste de RN, teste automatizado e
  documentacao. Use quando o usuario escolher Pro, pedir all-in-one / orquestrador
  completo, ou fluxo consultivo completo.
---

# Dev All-in-One

Orquestrador pessoal. Responda em portugues. Prefira WSL/Linux e Docker; evite Windows nativo.

## Perguntas com seletor

Sempre que a decisao tiver **opcoes fixas** (tipo feat/fix, aprovar fase, proximo passo):

- Usar o tool **`AskQuestion`** (UI clicavel do Cursor).
- Nao pedir "responda sim/nao" nem listas numeradas para digitar.
- No maximo um `AskQuestion` por mensagem; labels curtos.
- Opcional: `Outro (eu digito)`.
- Se `AskQuestion` nao existir no turno, prosa curta com as mesmas opcoes.

Avance **somente** apos o usuario confirmar cada fase. Tipico no fim:
`Seguir para a proxima fase` | `Ajustar esta fase` | `Outro (eu digito)`.

## Modelos por fase (custo x independencia)

Objetivo: design forte; review independente e barato; implementacao no model padrao do chat.

| Fase | Executor | Model | Motivo |
|------|----------|-------|--------|
| 1 Spec, 3 Dev, 5–8 | orquestrador Pro (`inherit`) | model do chat | velocidade / custo diario |
| 2 Arquitetura | subagent `arquitetura-pro` | `claude-sonnet-5-thinking-high` | design separado do implementador; **nao** Opus por padrao |
| 4 Code review | subagent `review-pro` (**readonly**) | `cursor-grok-4.5-high-fast` | pool Cursor + model ≠ autor; **nao programa**; fallback Sonnet |

**Obrigatorio:** fases 2 e 4 via tool **Task** (nao rodar a skill inline no mesmo model do dev).
Passar `model` explicito na Task. Aprovacao da fase (`AskQuestion`) fica no orquestrador apos o retorno do subagent.

**Nunca** Task `desenvolvimento-pro` / `desenvolvimento` / `desenvolvimento-simples` — o Pro e o Simples rodam neste chat.

Agents: `~/.cursor/agents/arquitetura-pro.md`, `~/.cursor/agents/review-pro.md`.

## Fases (ordem obrigatoria)

```text
1. Especificacao (feat|fix + branch + modelo)
2. Arquitetura
3. Desenvolvimento
4. Code review
5. Teste de regra de negocio
6. Teste automatizado
7. Documentacao
8. Definition of Done (gate final — checklist abaixo)
```

### 1. Especificacao

- **Sempre** passar pela skill `especificacao` primeiro (ela classifica feat vs fix).
- Se ambiguo: AskQuestion `Feat` | `Fix`.
- **Abrir branch na hora** (`feat/<slug>` ou `fix/<slug>`) — docs de RN/issue entram nessa branch.
- **Greenfield:** criar `.ai/` (`projeto-ai`) com `context/` preenchido antes de aprovar a spec.
- **feat** → [modelo-feat.md](../especificacao/modelo-feat.md) via `especificacao`
- **fix** → [modelo-fix.md](../correcao-erro/modelo-fix.md) via `correcao-erro`
- Documento **aprovado** = fonte da verdade. So entao fase 2.

### 2. Arquitetura / system design

- **Task** → `arquitetura-pro` + model `claude-sonnet-5-thinking-high` (skill `arquitetura`).
- Decisoes fechadas do design → `.ai/decisions/ADR-*.md` (`projeto-ai`).
- **Uma vez por entrega.** Se `ARCH-NNN.md` ja existe na branch: emendar neste orquestrador. Relancar so se o usuario pedir redo ou a Task falhou sem artefato.
- **Nao** passar Opus. So usar `claude-opus-5-thinking-high` se o usuario pedir Opus neste chat.
- Design completo (contexto, componentes, dados, fluxos, infra, riscos, MVP).
- Orquestrador resume + **`AskQuestion`** de aprovacao. Aguardar antes de codar produto.

### 3. Desenvolvimento

- Skills especialistas conforme o pedaco: `frontend`, `backend`, `script`, `rag`, `mcp`, `pbg`, `fiori`, `ui5`, `abap`.
- Executar **no orquestrador** (`inherit`) — nao Opus.
- Seguir spec + design aprovados. Codigo legivel; sem over-engineering.
- Trabalhar **na branch ja aberta** na fase 1 (nao reabrir discussao de branch aqui, salvo desvio justificado).
- **Greenfield:** pasta `.ai/` obrigatoria (`projeto-ai`) — estrutura criada na fase 1; `rules/desenvolvimento.md` preenchido nesta fase.
- Ainda **nao** e a fase de suite ampliada nem de doc final.

### 4. Code review

- **Task** → `review-pro` + model `cursor-grok-4.5-high-fast` (skill `review`, CR1–CR16).
- `review-pro` e **readonly**: **nao programa**; devolve achados + corpo do REVIEW em texto.
- Orquestrador **grava** `REVIEW-NNN-resultado.md` e anota o model usado.
- Fallback de model: `claude-sonnet-5-thinking-high` se Grok indisponivel.
- Orquestrador resume + **`AskQuestion`**.
- Se usuario pedir **Corrigir achados** (ou fix em texto): corrigir **no `inherit`**, depois **re-Task** `review-pro`. Nunca mandar o review-pro codar.

### 5. Teste de regra de negocio

- Skill `teste-regra-negocio`.
- Executar VAL-xx (feat) ou V-xx (fix) / criterios de aceite de negocio.
- Registrar resultados no doc da branch.

### 6. Teste automatizado

- Skill `teste-automatizado`.
- Suite do projeto (unit/integracao/e2e/CI conforme existir) + regressao da mudanca.

### 7. Documentacao

- Skill `documentacao` (ler o SKILL.md — **revisao obrigatoria do README**, checklist R1–R10).
- Sincronizar `.ai/docs/indice.md` e `.ai/README.md` com paths reais (`projeto-ai`).
- Nao aceitar “so atualizei o status do SPEC”: endpoints, env, ops, observabilidade e indice de docs devem refletir a entrega quando aplicavel.
- README/`--help`, CHANGELOG se existir, status final SPEC/CORR.

### 8. Definition of Done (gate final)

- Percorrer o checklist **Definition of Done** abaixo com o usuario.
- Marcar `N/A` so com motivo (ex.: SAP on-prem sem Compose).
- **`AskQuestion`**: `DoD completo — podemos encerrar?`
  - `Sim, encerrar` | `Falta item — voltar` | `Outro (eu digito)`
- So encerra a entrega Pro com DoD ok (ou N/A justificados).

## Routing

| Situacao | Skill |
|----------|--------|
| Classificar feat/fix, spec feat, abrir branch | `especificacao` |
| Spec fix (causa, evidencia, justificativa) | `correcao-erro` |
| System design, ADRs, MVP, C++ desktop | Task `arquitetura-pro` + skill `arquitetura` |
| Vue/React UI | `frontend` |
| API/DB/Docker servicos | `backend` |
| CLI/shell/automacao | `script` |
| RAG | `rag` |
| MCP | `mcp` |
| Fiori Launchpad | `fiori` |
| UI5 | `ui5` |
| ABAP/CDS/RAP | `abap` |
| PowerBuilder 12 / PBL / PBG | `pbg` |
| Code review | Task `review-pro` + skill `review` |
| VAL/V / aceite de negocio | `teste-regra-negocio` |
| Suite automatizada | `teste-automatizado` |
| README/help/fechamento docs | `documentacao` |
| Pasta `.ai` (greenfield / manutencao) | `projeto-ai` |

Leia `~/.cursor/skills/<nome>/SKILL.md` antes de executar o papel correspondente.

## Stack preferida

- Runtime: WSL/Linux, Docker, Docker Compose
- DB: Postgres, Sybase, MongoDB
- Linguagens: JS/TS, Go, Python, ABAP; C++ via `arquitetura`; PowerBuilder 12 via `pbg` (import PBL + compile)
- SAP: `fiori` + `ui5` + `abap` (nao misturar com frontend/backend genericos)

## Definition of Done (padrao)

Ate o usuario definir outro DoD. Usar como **fase 8** (gate final) apos a documentacao:

- [ ] Especificacao escrita e aprovada (feat → `modelo-feat` / fix → `modelo-fix`; branch `feat/` ou `fix/` criada na fase 1)
- [ ] Pasta `.ai/` completa em greenfield (`context`, `rules`, `decisions`, `docs`) — skill `projeto-ai`
- [ ] System design aprovado
- [ ] Testes de regra de negocio cobrindo os fluxos principais da especificacao (VAL-xx / V-xx)
- [ ] Testes automatizados mais amplos apos o desenvolvimento (quando fizer sentido no projeto)
- [ ] Documentacao geral em dia: **README revisado** (checklist R1–R10 da skill `documentacao`: endpoints/env/ops/observabilidade/indice quando a entrega tocar) + status final do SPEC/CORR; CHANGELOG se o repo tiver
- [ ] Roda em WSL/Linux (ou N/A justificado, ex.: so SAP on-prem)
- [ ] Compose sobe servicos quando aplicavel (N/A se nao houver)
- [ ] Sem secrets no codigo
- [ ] Lint/typecheck ok se o projeto ja tiver
- [ ] Code review sem bloqueantes abertos (`REVIEW-*-resultado.md` gravado)
- [ ] Fases consultivas aprovadas pelo usuario (1–8)
