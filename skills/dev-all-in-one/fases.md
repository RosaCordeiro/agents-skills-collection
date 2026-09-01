# Mapa das 9 fases — Entrega guiada

Referência rápida para quem usa o **Orquestrador de Entrega** (`desenvolvimento-pro`).

Cada fase termina com **`AskQuestion`**: você aprova antes de avançar.

| Fase | Nome | O que acontece | Você recebe / aprova | Artefato no repo |
|------|------|----------------|----------------------|------------------|
| **1** | **Requisitos** | Classifica feat ou fix, abre branch, escreve o pedido | SPEC ou CORR completo | `docs/especificacoes/SPEC-*.md` ou `docs/correcoes/CORR-*.md` |
| **2** | **Desenho** | System design (subagent, 1× por entrega) | ARCH com dados, fluxos e API | `docs/arquitetura/ARCH-*.md` + `.ai/decisions/ADR-*.md` |
| **3** | **Código** | Implementação na branch | Código alinhado à spec e ao desenho | Código + `.ai/rules/` em greenfield |
| **4** | **Revisão** | Code review do produto (subagent readonly) | Achados de código | `REVIEW-*-resultado.md` |
| **5** | **Aceite de negócio** | Testes manuais VAL/V | Fluxos principais validados | Resultados no SPEC/CORR |
| **6** | **Testes automáticos** | Roda suite; corrige falhas da branch | Suite verde (com evidência) | Log/comandos no doc da entrega |
| **7** | **Revisão de testes** | Qualidade dos testes (subagent readonly) | Testes não mascaram bugs | `REVIEW-TESTES-*-resultado.md` |
| **8** | **Documentação** | README + **revisão dos docs das fases 1, 3 e 4** | Tudo que mudou refletido nos docs | README, SPEC/CORR, REVIEW, índice |
| **9** | **Encerramento** | Checklist Definition of Done | Entrega fechada | DoD ok |

**API/serviço TS ou Python (fase 3):** skill `clean-architecture` + `backend` — use cases, portas e adapters como no `api-integracao-syb-kafka`.

## Quem executa cada fase

| Fase | Executor | Model (primário → fallback) |
|------|----------|----------------------------|
| 1, 3, 5, 6, 8, 9 | Orquestrador | `claude-sonnet-5` → Grok medium → Composer |
| 2 | Subagent `arquitetura-pro` | Sonnet **thinking-high** → Sonnet padrão; **1× Task** se ARCH não existe |
| 4 | Subagent `review-pro` | Grok **medium** → Sonnet padrão |
| 7 | Subagent `review-testes-pro` | Grok **medium** → Sonnet padrão |

Detalhes e regras de fallback: [modelos.md](modelos.md)

## Loops de correção

| Após fase | Se pedir correção |
|-----------|-------------------|
| 4 Revisão | Orquestrador corrige **código** → re-Task `review-pro` |
| 6 Testes automáticos | Corrigir falhas → rodar suite de novo |
| 7 Revisão de testes | `Corrigir testes` → Fase 6 ou 7 de novo; `Corrigir código` → Fase 3/6 |

## Fase 8 — o que revisar dos docs anteriores

Tudo que foi mexido na entrega precisa estar coerente nos documentos:

| Origem | Documento | Conferir |
|--------|-------------|----------|
| **Fase 1** | SPEC/CORR | Status final, escopo entregue vs planejado, VAL/V, desvios justificados |
| **Fase 3** | README, API, env, `.ai/rules` | Comportamento **real** do código documentado para operação |
| **Fase 4** | REVIEW-* | Achados resolvidos ou débito aceito; veredito fechado |

Skill: `documentacao` (checklists R1–R10 + DOC-F1/F3/F4).

## Greenfield (projeto novo)

| Fase | Pasta `.ai` |
|------|-------------|
| 1 Requisitos | `context/` |
| 2 Desenho | `decisions/` |
| 3 Código | `rules/` |
| 8 Documentação | `docs/indice.md` |

## Atalhos de fala

| Você diz | O orquestrador entende |
|----------|------------------------|
| `pro`, `entrega guiada`, `9 fases` | Fluxo completo |
| `revisão de testes`, `fase 7` | Revisão de testes |
| `simples`, `direto` | Sem fases |

