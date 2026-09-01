---
name: teste-automatizado
description: >-
  Fase 6 da Entrega guiada: executa suite do projeto e registra evidencia
  para a Revisao de testes (Fase 7). Use apos aceite de negocio.
---

# Teste automatizado (Fase 6)

**Depois** de `teste-regra-negocio` (Fase 5). **Antes** de `review-testes` (Fase 7).

Responda em português.

## Processo

1. Identificar framework, pastas e CI do repo.
2. Cobrir o delta da branch + regressão sensata.
3. **Rodar** a suite relevante — não inventar resultado.
4. Registrar **evidência** (obrigatório para Fase 7):
   - Comando exato
   - Exit code
   - Resumo pass / fail / skip
   - Path do log ou trecho relevante
5. Corrigir falhas **introduzidas por esta branch** (não mascarar com teste fraco).
6. **`AskQuestion`**: `Testes automáticos ok — seguir para Revisão de testes?`
   - `Sim, seguir` | `Corrigir falhas` | `Outro (eu digito)`

## Limites

- Não substituir VAL/V da Fase 5.
- Não enfraquecer assert para “passar” — isso será barrado na Fase 7 (RT5).
- Não inventar infra de teste gigante em projeto mínimo; declare recorte.

## Handoff para Fase 7

Incluir na mensagem de fechamento ou no doc da entrega a **evidência de execução** — o subagent `review-testes-pro` exige isso (RT1).
