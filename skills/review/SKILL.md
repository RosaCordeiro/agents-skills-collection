---
name: review
description: >-
  Code review da mudanca na branch: qualidade, seguranca, aderencia a
  especificacao/design; checklist de pontos obrigatorios e artefato
  REVIEW-*-resultado.md.   Use na fase 4 da Entrega guiada (apos Código,
  antes do Aceite de negocio), ou em pedido explicito de code review/PR.
---

# Code review

Revise em portugues. Seja direto: achados primeiro, depois riscos e follow-ups.
Nesta fase **nao** execute a suite completa nem feche documentacao final —
isso vem nas fases `teste-regra-negocio`, `teste-automatizado` e `documentacao`.

## Quando aplicar

- Fase 4 da Entrega guiada (após Código) — via subagent **`review-pro`**
- Pedido explicito de review / PR

No fluxo Pro o orquestrador **deve** lançar Task `review-pro` (`cursor-grok-4.6-medium` → `claude-sonnet-5`; nunca Opus). Correções no orquestrador (Sonnet padrão). Mapa: `dev-all-in-one/modelos.md`.

## Processo

1. Levantar o delta: `git diff` da branch vs base + SPEC/CORR + DESIGN aprovados.
2. Percorrer **todos** os pontos CR1–CR16 abaixo (marcar `OK` / `FALHA` / `N/A` com motivo).
3. Listar achados com severidade (formato abaixo) + sugestao de correcao (**nao aplicada**).
4. Artefato `REVIEW-*-resultado.md`:
   - Subagent `review-pro` (`readonly`): devolver o **corpo completo** do markdown ao orquestrador (ele grava).
   - Chat direto (sem Pro): gravar o arquivo voce mesmo.
5. **Nunca** corrigir codigo na fase de review do `review-pro`. Correcoes = orquestrador / agent de implementacao.
6. Se subagent `review-pro`: devolver resumo + `HANDOFF_CORRECAO` se houver itens a corrigir (**sem** `AskQuestion`).
   Se chat direto: **`AskQuestion`** — prompt: `Code review ok?`
   - `Sim, seguir para teste de regra de negocio` | `Corrigir achados` | `Outro (eu digito)`
   - Em chat direto, “Corrigir achados” pode ser feito no mesmo chat **depois** do review; no fluxo Pro, só o orquestrador (`desenvolvimento-pro`, Sonnet) corrige.

## Pontos obrigatorios a revisar

Para **cada** item aplicavel: `OK` | `FALHA` (achado com severidade) | `N/A` (motivo em uma linha).
Nao marcar `OK` sem ter olhado o trecho relevante do diff.

| # | Area | O que conferir |
|---|------|----------------|
| CR1 | Branch / escopo | Branch `feat/` ou `fix/` correta; diff alinhado ao documento aprovado; sem scope creep |
| CR2 | Aderencia SPEC/DESIGN | Comportamentos, contratos, regras e limites do MVP presentes; nada contradizendo CA/VAL/V |
| CR3 | Corretude | Logica, edge cases, estados invalidos, races obvias; retornos/erros coerentes |
| CR4 | Seguranca — secrets | Sem credenciais, tokens, `.env` real ou chaves no codigo/diff |
| CR5 | Seguranca — auth/dados | Authz/authn, exposicao de PII, IDs internos; endpoints sem bypass |
| CR6 | Seguranca — injecao | SQL/Sybase parametrizado; XSS/HTML; path traversal; command injection em scripts |
| CR7 | API / contratos | Breaking changes conscientes; status HTTP; validacao de input; mensagens de erro estaveis |
| CR8 | Dados / migrations | Schema, FKs, defaults, backfill; migrations idempotentes/seguras; tipagem (UUID, VARCHAR) |
| CR9 | Observabilidade | Logger/metrics do projeto usados quando ja for padrao; sem `console.log` de ruido em prod path |
| CR10 | Erros / resiliencia | Falhas tratadas; sem engolir exception; timeouts/retries so se o design pedir |
| CR11 | Qualidade | Legibilidade; funcoes focadas; sem codigo morto/comentado grande; sem complexidade gratuita. **TS/Python API:** violacao de camadas (`clean-architecture`) — SQL/HTTP em controller ou use case injetando adapter concreto = FALHA |
| CR12 | Testes na mudanca | Cobertura minima do que mudou (unit/integracao) ou gap consciente justificado |
| CR13 | Lint / types | Lint e typecheck do projeto ok se existirem (rodar o que o repo ja usa) |
| CR14 | Docker / ops | Ports/volumes/env expostos demais; Compose coerente com a mudanca |
| CR15 | Paths / runtime | Scripts Linux sem path Windows; WSL/Compose respeitados; sem forcar troca de stack |
| CR16 | SAP (se aplicavel) | Fronteiras `fiori` / `ui5` / `abap` respeitadas; sem misturar com frontend/backend genericos |

Detalhes e exemplos por ponto: [checklist-detalhado.md](checklist-detalhado.md).

**Gate:** qualquer `FALHA` em CR4–CR6 ou achado **bloqueante** em CR1–CR3/CR7–CR8 impede seguir para teste de RN ate corrigir ou o usuario aceitar debito explicito.

## Formato de saida (chat)

```markdown
## Veredito
- Pronto para testes de RN / Quase / Bloqueado (uma linha)

## Achados
- [Severidade] arquivo — problema e correcao sugerida

## Checklist review
| # | Status | Nota |
|---|--------|------|
| CR1 | OK/FALHA/N/A | … |
| … | … | … |

## Riscos
- ...

## Artefato
- path do REVIEW-*-resultado.md

## Proximos passos
- ...
```

Severidades: **bloqueante** | **importante** | **nit**

## Documentar o review (obrigatorio)

O resultado do review **deve** existir em arquivo antes do `AskQuestion` de aprovacao
(espelha `VAL-*-resultado` / `TEST-*-resultado`).

- Fluxo Pro: `review-pro` entrega o markdown; **orquestrador grava** o arquivo.
- Fora do Pro: quem revisa grava o arquivo.

### Onde gravar

| Tipo | Path |
|------|------|
| feat (SPEC-NNN) | `docs/especificacoes/REVIEW-NNN-resultado.md` |
| fix (CORR-NNN) | `docs/correcoes/REVIEW-NNN-resultado.md` |
| review avulso sem SPEC/CORR | `docs/especificacoes/REVIEW-avulso-YYYYMMDD-resultado.md` (ou pasta `docs/` que o projeto ja use) |

Usar o **mesmo NNN** da SPEC/CORR da branch. Se o path `docs/especificacoes` (ou `correcoes`) nao existir, criar so o necessario ou perguntar onde o projeto guarda docs de fase.

Modelo completo: [modelo-resultado.md](modelo-resultado.md).

### Conteudo minimo do artefato

1. Cabecalho com data, branch, alvo (SPEC/CORR + versao), revisor (agent), escopo do diff.
2. Tabela CR1–CR16 com status e nota curta.
3. Achados (mesmo texto do chat, ou referencia).
4. Debitos aceitos (nao-bloqueantes) com dono/contexto se houver.
5. Veredito e proxima fase sugerida.

Nao substituir o artefato por “so comentei no chat”. Se re-rodar o review apos correcoes do orquestrador, **atualizar** o mesmo `REVIEW-NNN-resultado.md` (historico curto no rodape se util).

## Handoff de correcao (fluxo Pro)

Quando houver achados a corrigir (ou o usuario pedir fix), o `review-pro` devolve:

```text
HANDOFF_CORRECAO
- [severidade] path — mudanca sugerida
```

O orquestrador `desenvolvimento-pro` (Sonnet) aplica o codigo e **reabre** o `review-pro`.
O agent de review **nao** gasta turno implementando.

## Foco extra (stack frequente)

- Injecao SQL / queries inseguras (Postgres, Sybase)
- Auth e exposicao de dados (Mongo e APIs)
- Ports/volumes Docker expostos demais
- MCP/RAG: secrets, read-only default, escopo, citacao
- `@clamed/logger` / light-node-metrics quando o projeto Node ja usa (padrao: skill `logger` — keywords, `event`, `correlation_id`)

## Ao terminar

Garantir checklist preenchido + artefato (gravado ou corpo devolvido ao orquestrador).
- Subagent `review-pro`: resumo + markdown do REVIEW + `HANDOFF_CORRECAO` se preciso — **zero** edicao de codigo.
- Chat direto: **`AskQuestion`**: `Code review ok?`
  - `Sim, seguir para teste de regra de negocio` | `Corrigir achados` | `Outro (eu digito)`

