---
name: review-testes
description: >-
  Revisao da qualidade dos testes automatizados apos a suite rodar: abrangencia,
  execucao real, anti-padrao de teste adaptado ao bug. Fase 8 da Entrega guiada.
  Use via subagent review-testes-pro apos teste-automatizado.
---

# Revisao de testes automatizados

Fase **8** da Entrega guiada — **depois** de `teste-automatizado` (Fase 7) e **antes** de `documentacao` (Fase 9).

Objetivo: garantir que os testes **protegem** o produto — nao que **escondem** defeitos.

No fluxo Pro: subagent **`review-testes-pro`** (`cursor-grok-4.6-medium` → Sonnet padrão; `readonly`). Orquestrador (`claude-sonnet-5`) grava `REVIEW-TESTES-*-resultado.md`. Mapa: `dev-all-in-one/modelos.md`.

## Quando aplicar

- Fase 8 do orquestrador, apos suite executada na Fase 7
- Pedido explicito de revisar qualidade dos testes da branch

## Entradas obrigatorias

1. SPEC/CORR + ARCH aprovados
2. Diff da branch (codigo **e** testes)
3. **Evidencia de execucao** da Fase 7: comando rodado, exit code, resumo pass/fail (nao inventar)
4. Lista de testes novos/alterados nesta entrega

## Processo

1. Confirmar que a suite **rodou de verdade** na Fase 7 (log, CI, output).
2. Mapear testes novos/alterados vs delta de produto e VAL/V da spec.
3. Percorrer checklist **RT1–RT12** (marcar `OK` / `FALHA` / `N/A`).
4. Listar achados com severidade + correcao sugerida (**nao aplicada** no subagent).
5. Artefato `REVIEW-TESTES-NNN-resultado.md` — corpo ao orquestrador; ele grava.
6. `HANDOFF_CORRECAO` com destino: `codigo` | `testes` | `ambos`.

## Checklist RT1–RT12

| # | Area | O que conferir |
|---|------|----------------|
| RT1 | Execucao real | Suite rodada nesta entrega; evidencia (comando + resultado); nao aceitar "deve passar" sem output |
| RT2 | Escopo vs spec | Testes cobrem RF/RN/CA/VAL principais da mudanca; gap consciente justificado |
| RT3 | Abrangencia | Alem do happy path: erros, validacao, bordas relevantes ao negocio |
| RT4 | Anti-mascara | Teste nao passa ignorando assert (`todo`, `skip` indevido, `only`, suite vazia) |
| RT5 | Anti-adaptacao ao bug | Expectativa **nao** foi enfraquecida para coincidir com comportamento errado do produto |
| RT6 | Anti-mock excessivo | Mocks/stubs nao substituem a regra que deveria ser testada (ex.: mockar o proprio SUT) |
| RT7 | Assertivas significativas | Verifica estado/saida/efeito observavel; evitar `toBeTruthy()` generico sem checar valor |
| RT8 | Nomes e legibilidade | Describe/it descrevem comportamento de negocio ou contrato |
| RT9 | Determinismo | Sem flakiness obvia (race, sleep fixo, ordem de execucao, clock nao controlado) |
| RT10 | Padrao do repo | Framework, pastas, helpers e convencoes do projeto respeitados |
| RT11 | Testes de regressao | Bug corrigido na branch tem teste que falharia antes do fix |
| RT12 | Debitos | Gaps documentados no artefato com motivo e plano (nao silenciar) |

**Gate bloqueante:** RT1 `FALHA` (suite nao rodou) ou RT5 `FALHA` (teste adaptado ao erro) → **nao** seguir para Documentacao ate corrigir ou usuario aceitar debito explicito.

## Sinais de "teste adaptado ao erro" (RT5)

Marcar `FALHA` se encontrar:

- Assert alterado de valor correto para valor que o bug produz
- Remocao de caso que falhava apos a implementacao errada
- Snapshot atualizado "no escuro" sem validar semantica
- `expect` trocado por comentario ou assert sempre verdadeiro
- Teste passa porque mock retorna o que o codigo errado espera, sem exercitar integracao prometida na spec

## Formato de saida (chat)

```markdown
## Veredito
- Pronto para documentacao / Corrigir testes / Corrigir codigo / Bloqueado

## Evidencia de execucao (Fase 7)
- Comando: …
- Resultado: …

## Achados
- [bloqueante|importante|sugestao] arquivo — problema e correcao sugerida (destino: codigo|testes)

## Checklist
| # | Status | Nota |
| RT1 | … | … |

## HANDOFF_CORRECAO
- [bloqueante] path — o que mudar (destino: testes|codigo)
```

Modelo do artefato: [modelo-resultado.md](modelo-resultado.md).

## Loop com o orquestrador

1. Task `review-testes-pro` → achados + corpo do REVIEW-TESTES
2. Orquestrador grava arquivo
3. `AskQuestion`: `Revisao de testes ok?`
   - `Sim, seguir para Documentacao`
   - `Corrigir testes` → orquestrador ajusta testes → re-Task ou volta Fase 7
   - `Corrigir codigo` → orquestrador ajusta produto → Fase 7 de novo
   - `Outro (eu digito)`
4. So avancar para Fase 9 com veredito ok ou debitos aceitos

## O que nao fazer

- Aprovar sem evidencia de execucao (RT1)
- Aceitar teste que so valida implementacao interna fragil sem valor de negocio
- Corrigir testes/codigo no subagent (readonly)
- Substituir Fase 6 (aceite manual de RN)
