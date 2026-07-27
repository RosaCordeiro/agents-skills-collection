---
name: documentacao
description: >-
  Fecha a entrega documentando o que mudou: revisao obrigatoria do README,
  --help, changelog curto, atualizacao final dos docs de especificacao/correcao.
  Use na fase 7 do Dev All-in-One ou quando o usuario pedir documentacao,
  README, help, runbook.
---

# Documentacao

Fase final do fluxo Pro (apos testes automatizados).
Responda em portugues. Sem inventar docs que ninguem vai ler — mas **nao** trate o README como “uma linha no CHANGELOG”: revise de ponta a ponta o que a entrega alterou na operacao.

## Escopo tipico

- **README** (ou `--help` em CLI) em portugues — revisao completa vs a mudanca
- Status final no SPEC/CORR (verificado, resultados VAL/V)
- `CHANGELOG.md` curto se o projeto ja tiver
- Indice de docs (`docs/especificacoes`, `docs/arquitetura`, `docs/correcoes`) alinhado ao que existe
- Notas de operacao/runbook so se o projeto ja tiver ou o usuario pedir
- Sem secrets

## Processo obrigatorio

### 1. Levantar o delta

1. Ler o README atual (inteiro, nao so o trecho obvio).
2. Diff da branch / SPEC+DESIGN+CORR aprovados: endpoints, env, UI, Docker, observabilidade, comportamentos de fila/ops, paths de teste.
3. Listar mentalmente (ou em bullets curtos na resposta) **o que o README ainda nao cobre** da entrega.

### 2. Revisao obrigatoria do README (checklist)

Para **cada** item: `OK` (ja estava certo) | `ATUALIZADO` (voce corrigiu agora) | `N/A` (motivo em uma linha).

Nao pular itens com “minimo necessario” se a entrega tocou aquela area.

| # | Area | Conferir no README |
|---|------|--------------------|
| R1 | Como subir / dev | Comandos Compose e/ou local ainda funcionam apos a mudanca |
| R2 | Endpoints / CLI | Rotas, flags ou subcomandos **novos ou alterados** documentados (metodo, path, auth se houver) |
| R3 | Variaveis de ambiente | Vars novas ou com default relevante; apontar `.env.example` se existir; tabela ou lista coerente com o codigo |
| R4 | UI / operadores | Telas, botoes, fluxos novos (ex. pausar, filtros) — o operador encontra no README |
| R5 | Comportamento operacional | Regras que mudam suporte (fila, rate limit, erros tipicos, UF, 656, etc.) se a entrega as alterou |
| R6 | Observabilidade | Se a entrega ou o projeto Node usa logger/`/metrics`: como ver logs, URL de metricas, nomes das metricas de negocio relevantes — **nao** so “tem metrics” |
| R7 | Testes | Como rodar suite e VAL/V novos da entrega |
| R8 | Indice de docs | Links/tabela para SPEC/DESIGN/CORR desta entrega (e nao omitir docs ja existentes que a tabela citava pela metade) |
| R9 | CHANGELOG | Entrada curta do que entrou, se o repo tiver `CHANGELOG.md` |
| R10 | Mentiras / stale | Remover ou corrigir instrucoes obsoletas (paths, contagens de teste, “ainda nao existe”) |

**Gate:** se R2–R6 aplicaveis tiverem lacuna e voce so atualizou status do SPEC — **FAIL**. Voltar e editar o README antes do `AskQuestion`.

### 3. Atualizar SPEC/CORR

- Status final (ex. verificado), historico de revisao, resultados VAL/V se ainda nao estiverem no doc.

### 4. Apresentar ao usuario

Na mensagem de fechamento da fase, mostrar:

1. Resumo do que mudou no README (bullets).
2. Checklist R1–R10 com `OK` / `ATUALIZADO` / `N/A`.
3. Paths tocados (`README.md`, SPEC, CHANGELOG, …).

### 5. Aprovacao

**`AskQuestion`**: `Documentacao ok?`

- `Sim, seguir para Definition of Done` | `Ajustar docs` | `Outro (eu digito)`

Se o usuario pedir ajuste: priorizar README incompleto antes de DoD.

## O que nao fazer

- Atualizar so o SPEC e dizer que a documentacao fechou
- Acrescentar so uma linha generica no README (“ver SPEC-00x”) sem endpoints/env/ops
- Documentar secrets ou colar tokens
- Criar runbook longo nao pedido se o README ja cobre o suficiente apos a revisao
