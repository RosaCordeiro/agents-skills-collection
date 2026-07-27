---
name: teste-automatizado
description: >-
  Planeja e executa a suite de testes automatizados (unitario, integracao, e2e
  conforme o projeto) apos os testes de regra de negocio. Use na fase 6 do Dev
  All-in-One ou quando o usuario pedir pytest, jest, CI, cobertura, regressao.
---

# Teste automatizado

Fase **depois** de `teste-regra-negocio` e **antes** de documentacao geral.
Responda em portugues.

## Processo

1. Identificar o que o repo ja tem (framework, pastas, CI).
2. Garantir cobertura automatizada do que a mudanca tocou + regressao sensata.
3. Rodar a suite relevante; corrigir falhas introduzidas por esta branch.
4. Relatar: comandos, passou/falhou, gaps conscientes (N/A justificado).
5. **`AskQuestion`**: `Suite automatizada ok?`
   - `Sim, seguir para documentacao` | `Corrigir falhas` | `Outro (eu digito)`

## Limites

- Nao substituir VAL-xx / V-xx de negocio se ainda nao rodaram — volte a `teste-regra-negocio`.
- Nao inventar infra de teste gigante se o projeto e minimo; declare o recorte.
