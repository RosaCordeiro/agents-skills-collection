---
name: teste-regra-negocio
description: >-
  Executa e documenta testes de regra de negocio (VAL-xx / V-xx / Gherkin)
  apos o code review. Use na fase 5 do Dev All-in-One ou quando o usuario pedir
  validacao de RN, criterios de aceite de negocio, ou GWT manual/focado.
---

# Teste de regra de negocio

Fase **depois** do code review e **antes** da suite automatizada ampla.
Responda em portugues. Foque nas regras da especificacao aprovada (feat ou fix).
Se existir `REVIEW-*-resultado.md` com bloqueantes abertos, nao iniciar VAL/V — voltar ao `review`.

## Fontes

- **feat:** cenarios `VAL-xx` e criterios `CA-xx` em `docs/especificacoes/`
- **fix:** verificacoes `V-xx` em `docs/correcoes/`
- Code review da branch: `REVIEW-*-resultado.md` (contexto de debitos aceitos)

## Processo

1. Listar os cenarios obrigatorios do documento aprovado (MVP / severidade).
2. Executar cada um (manual, script focado ou teste pontual — o que o projeto ja tiver).
3. Registrar resultado: passou / falhou / bloqueado + evidencia curta.
4. Se falhar: **`AskQuestion`** — `Corrigir agora` | `Registrar debito e seguir` | `Outro (eu digito)`.
5. Atualizar o doc da especificação/correção com o resultado dos VAL/V.
6. **`AskQuestion`**: `Testes de regra de negocio ok?`
   - `Sim, seguir para testes automatizados` | `Ajustar` | `Outro (eu digito)`

## Nao fazer nesta fase

- Suite completa de regressao/CI (isso e `teste-automatizado`)
- Reescrever arquitetura ou ampliar escopo sem acordo

