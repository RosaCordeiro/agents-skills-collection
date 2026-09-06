---
name: correcao-erro
description: >-
  Especificacao de FIX: entendimento fiel, causa raiz, justificativa e modelo
  proprio (modelo-fix). Use apos classificar como fix na fase de especificacao,
  ou quando o usuario reportar bug, erro, falha, regressao, hotfix, incidente,
  traceback, ou pedir investigacao+fix documentada.
---

# Correcao de erro (especificacao FIX)

Especialista em documentar **fix** com entendimento fiel e justificativa.
Nao chute. Nao implemente codigo de produto nesta fase.
Responda em portugues.

## Pre-requisitos (orquestrador / especificacao)

1. Tipo classificado como **fix** (AskQuestion se ambiguo).
2. Branch **`fix/<slug>`** ja criada (ou criar agora, antes de gravar o doc).
3. Usar obrigatoriamente [modelo-fix.md](modelo-fix.md) — nao o modelo feat.

## Principio

1. **Fatos primeiro** — evidencias (log, erro, arquivo, commit, reproducao).
2. **Causa raiz** — sintoma vs causa (evitar remendo).
3. **Justificativa** — por que esta correcao e a certa; o que foi descartado **e por que** (o leitor do CORR nao viu o chat).
4. **Verificacao** — V-xx para as fases de teste posteriores (nao executar codigo de produto aqui).
5. **Documento autocontido** — mesma regra da skill `especificacao` §5: o CORR se sustenta sozinho; sem *“como combinamos”* nem conclusao sem o porquê.

## Processo

1. Confirmar/criar branch `fix/<slug>` e registrar no doc.
2. Coletar evidencias (pedir so o critico que faltar; freeform ok para logs).
3. Redigir com [modelo-fix.md](modelo-fix.md).
4. Validar com [validacao.md](validacao.md); corrigir FAILs antes de aprovar.
5. Gravar em `docs/correcoes/` (ex.: `docs/correcoes/CORR-001.md`) **na branch**.
6. **`AskQuestion`**: `O entendimento e a justificativa do fix estao ok?`
   - `Sim, seguir para arquitetura` | `Ajustar entendimento` | `Outro (eu digito)`
7. Apos aprovacao: `Status: entendimento aprovado`. **Proxima fase = arquitetura** — nao pular para implementacao.

A implementacao so ocorre na fase **Desenvolvimento** do `dev-all-in-one`, apos arquitetura aprovada.

## Relacao com outras skills

| Situacao | Skill |
|----------|--------|
| Fix / incidente / hotfix | **esta** (`correcao-erro` + modelo-fix) |
| Feature / regra nova | `especificacao` + modelo-feat |
| Orquestracao completa | `dev-all-in-one` |

Hotfix ainda exige este documento — pode ser curto, mas **nunca** sem causa e justificativa.

## Proibicoes

- Inventar causa sem evidencia
- Corrigir sintoma e chamar de causa raiz sem prova
- Ampliar escopo para refactor nao relacionado
- Marcar aprovado sem confirmacao
- Ir direto para codigo pulando arquitetura (exceto pedido explicito de emergencia pelo usuario — registrar o desvio)
