---
name: documentacao
description: >-
  Fase 8 da Entrega guiada: README, sync dos docs das fases 1 (SPEC/CORR),
  3 (codigo/ops) e 4 (REVIEW), changelog e indice. Use apos revisao de testes.
---

# Documentação (Fase 8)

**Depois** de Revisão de testes (Fase 7). **Antes** do Encerramento (Fase 9).

Tudo que foi **mexido** na entrega precisa estar refletido nos documentos — não só o README.

## Escopo

- README / `--help` (checklist R1–R10)
- **Revisão dos docs das fases 1, 3 e 4** (checklist DOC-F1/F3/F4 abaixo)
- CHANGELOG se existir
- `.ai/docs/indice.md`
- Sem secrets

## Processo obrigatorio

### 1. Levantar o delta

1. Ler README inteiro.
2. Diff da branch + SPEC/CORR + ARCH + REVIEW + REVIEW-TESTES.
3. Listar o que ainda não está documentado.

### 2. Revisão obrigatória — docs das fases anteriores

**Gate:** não fechar Fase 8 só atualizando README se SPEC, REVIEW ou operação do código estiverem desatualizados.

#### DOC-F1 — Documentos da Fase 1 (Requisitos)

Artefato: `SPEC-*.md` ou `CORR-*.md`.

| Item | Conferir |
|------|----------|
| Status final (ex. verificado, entregue) | |
| Escopo **entregue** vs planejado — desvios com motivo | |
| Resultados VAL/V da Fase 5 registrados | |
| RN/CA que mudaram durante o dev — texto atualizado | |
| Branch e links para ARCH, REVIEW, REVIEW-TESTES | |

#### DOC-F3 — Documentação do que o Código faz (Fase 3)

Tudo alterado no **código** deve aparecer na documentação de operação:

| Item | Conferir |
|------|----------|
| README: como subir, endpoints, env, UI, ops (R1–R6) | |
| `.env.example` alinhado ao código | |
| `.ai/rules/desenvolvimento.md` se convencoes mudaram | |
| Comentários de módulo / OpenAPI / `--help` se o projeto usa | |

#### DOC-F4 — Documentos da Fase 4 (Revisão de código)

Artefato: `REVIEW-*-resultado.md`.

| Item | Conferir |
|------|----------|
| Achados bloqueantes: resolvidos ou débito aceito explícito | |
| Veredito final no REVIEW (fechado) | |
| Referência cruzada no SPEC/CORR se houve mudança de escopo por review | |

Opcional mas recomendado: citar no SPEC que `REVIEW-TESTES-*` foi aprovado na Fase 7.

### 3. Revisão obrigatória do README (R1–R10)

Para cada item: `OK` | `ATUALIZADO` | `N/A` (motivo).

| # | Area | Conferir |
|---|------|----------|
| R1 | Como subir / dev | |
| R2 | Endpoints / CLI | |
| R3 | Variáveis de ambiente | |
| R4 | UI / operadores | |
| R5 | Comportamento operacional | |
| R6 | Observabilidade | |
| R7 | Testes (suite + VAL/V + como rodar) | |
| R8 | Indice de docs + `.ai/docs/indice.md` | |
| R9 | CHANGELOG | |
| R10 | Sem instruções obsoletas | |

**Gate:** R2–R6 aplicáveis sem lacuna; DOC-F1/F3/F4 sem `FALHA` pendente.

### 4. Sincronizar `.ai/docs/`

`indice.md` com links reais (SPEC, ARCH, CORR, REVIEW, REVIEW-TESTES, README).

### 5. Apresentar ao dev

1. Resumo das mudanças em README e docs F1/F3/F4.
2. Tabelas R1–R10 e DOC-F1/F3/F4 com status.
3. Paths tocados.

### 6. Aprovação

**`AskQuestion`**: `Documentação ok — seguir para Encerramento?`

- `Sim, seguir` | `Ajustar docs` | `Outro (eu digito)`

## O que não fazer

- Atualizar só status do SPEC sem revisar conteúdo vs entrega real
- Deixar REVIEW com achados “em aberto” sem nota de débito
- README genérico “ver SPEC” sem endpoints/env/ops
- Pular DOC-F3 quando o código mudou comportamento visível
