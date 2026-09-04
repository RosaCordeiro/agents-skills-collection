# Mapa das 10 fases — Entrega guiada

Referência rápida para quem usa o **Orquestrador de Entrega** (`desenvolvimento-pro`).

Cada fase termina com **`AskQuestion`**: você aprova antes de avançar.

| Fase | Nome | O que acontece | Você recebe / aprova | Artefato no repo |
|------|------|----------------|----------------------|------------------|
| **1** | **Descoberta** | Perguntas até fechar o entendimento do pedido | Resumo da Descoberta | (sem arquivo — entra no Contexto do SPEC/CORR) |
| **2** | **Especificação funcional** | Classifica feat ou fix, abre branch, escreve o pedido em linguagem de negócio | SPEC ou CORR completo, com pontos de investigação técnica | `docs/especificacoes/SPEC-*.md` ou `docs/correcoes/CORR-*.md` |
| **3** | **Desenho** | System design (subagent, 1× por entrega) | ARCH com dados, fluxos e API | `docs/arquitetura/ARCH-*.md` + `.ai/decisions/ADR-*.md` |
| **4** | **Código** | Implementação na branch | Código alinhado à spec e ao desenho | Código + `.ai/rules/` em greenfield |
| **5** | **Revisão** | Code review do produto (subagent readonly) | Achados de código | `REVIEW-*-resultado.md` |
| **6** | **Aceite de negócio** | Testes manuais VAL/V | Fluxos principais validados | Resultados no SPEC/CORR |
| **7** | **Testes automáticos** | Roda suite; corrige falhas da branch | Suite verde (com evidência) | Log/comandos no doc da entrega |
| **8** | **Revisão de testes** | Qualidade dos testes (subagent readonly) | Testes não mascaram bugs | `REVIEW-TESTES-*-resultado.md` |
| **9** | **Documentação** | README + **revisão dos docs das fases 2, 4 e 5** | Tudo que mudou refletido nos docs | README, SPEC/CORR, REVIEW, índice |
| **10** | **Encerramento** | Checklist Definition of Done | Entrega fechada | DoD ok |

**API/serviço TS ou Python (fase 4):** skill `clean-architecture` + `backend` — use cases, portas e adapters como no `api-integracao-syb-kafka`.

## Quem executa cada fase

| Fase | Executor | Model (primário → fallback) |
|------|----------|----------------------------|
| 1 | Orquestrador (Descoberta) | Sonnet **thinking-high** → Sonnet padrão → Grok medium (exceção pedida pelo usuário, para investigar melhor o pedido) |
| 2, 4, 6, 7, 9, 10 | Orquestrador | `claude-sonnet-5` → Grok medium → Composer |
| 3 | Subagent `arquitetura-pro` | Sonnet **thinking-high** → Sonnet padrão; **1× Task** se ARCH não existe |
| 5 | Subagent `review-pro` | Grok **medium** → Sonnet padrão |
| 8 | Subagent `review-testes-pro` | Grok **medium** → Sonnet padrão |

Detalhes e regras de fallback: [modelos.md](modelos.md)

## Loops de correção

Cada fase pode voltar para ajuste antes de seguir — a aprovação de uma fase não trava correções pontuais nela mesma.

| Após fase | Se pedir correção |
|-----------|-------------------|
| 1 Descoberta | `Ajustar entendimento` → repetir perguntas até novo Resumo aprovado |
| 2 Especificação | `Ajustar` → orquestrador reescreve o SPEC/CORR e revalida antes de nova aprovação |
| 5 Revisão | Orquestrador corrige **código** → re-Task `review-pro` |
| 7 Testes automáticos | Corrigir falhas → rodar suite de novo |
| 8 Revisão de testes | `Corrigir testes` → Fase 7 ou 8 de novo; `Corrigir código` → Fase 4/7 |

## Fase 9 — o que revisar dos docs anteriores

Tudo que foi mexido na entrega precisa estar coerente nos documentos:

| Origem | Documento | Conferir |
|--------|-------------|----------|
| **Fase 2** | SPEC/CORR | Status final, escopo entregue vs planejado, VAL/V, desvios justificados |
| **Fase 4** | README, API, env, `.ai/rules` | Comportamento **real** do código documentado para operação |
| **Fase 5** | REVIEW-* | Achados resolvidos ou débito aceito; veredito fechado |

Skill: `documentacao` (checklists R1–R10 + DOC-F2/F4/F5).

## Greenfield (projeto novo)

| Fase | Pasta `.ai` |
|------|-------------|
| 2 Especificação | `context/` |
| 3 Desenho | `decisions/` |
| 4 Código | `rules/` |
| 9 Documentação | `docs/indice.md` |

## Atalhos de fala

| Você diz | O orquestrador entende |
|----------|------------------------|
| `pro`, `entrega guiada`, `10 fases` | Fluxo completo |
| `revisão de testes`, `fase 8` | Revisão de testes |
| `simples`, `direto` | Sem fases |
