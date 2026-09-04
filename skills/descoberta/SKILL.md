---
name: descoberta
description: >-
  Fase 1 do Dev All-in-One: descoberta do pedido antes de qualquer redacao de
  especificacao. Faz perguntas objetivas ate o agente entender exatamente o
  que o usuario quer (objetivo, atores, gatilho, escopo, restricoes) e so
  avanca apos o usuario aprovar o entendimento. Use no inicio de qualquer
  feat ou fix guiada, antes de especificacao/correcao-erro.
---

# Descoberta (entendimento do pedido)

Fase **antes** da Especificação Funcional. Aqui você garante que entendeu
exatamente o que o usuário quer — **antes** de escrever qualquer documento
formal. Responda em português.

Não redija RN/RF/US/CA aqui (isso é `especificacao` / `correcao-erro`).
Não abra branch nem grave SPEC/CORR nesta fase. Não desenhe solução técnica
(isso é `arquitetura`).

**Model:** `claude-sonnet-5-thinking-high` (exceção fixa do time só para esta
fase — mais poder de investigação para achar os problemas certos e enxergar
melhores soluções antes de comprometer o resto da entrega a um entendimento
raso). Fallback: `claude-sonnet-5` → Grok medium. Ver `dev-all-in-one/modelos.md`.

## Por que existe

Escrever a especificação completa (ou o desenho) direto em cima de um pedido
mal entendido gera retrabalho grande — reescrever documento validado custa
caro. A Descoberta é barata (perguntas, sem documento extenso); fechar o
entendimento antes evita reescrever a spec inteira depois.

## Processo

1. Ler o pedido original do usuário (verbatim, sem parafrasear ainda).
2. Levantar, com o que já foi dito + perguntas objetivas (`AskQuestion`, uma
   pergunta por vez, opções fixas quando der):
   - **Objetivo de negócio**: que problema isso resolve; por que agora.
   - **Atores / quem usa**: perfis, sistemas envolvidos (interno, cliente,
     integração).
   - **Gatilho**: quando isso acontece (tela, evento, job, chamado).
   - **O que muda**: comportamento esperado, em termos de negócio (não de
     implementação).
   - **O que fica de fora**: limites conhecidos desta entrega (perguntar
     mesmo que o usuário não tenha pensado nisso ainda).
   - **Restrições conhecidas**: prazo, sistemas legados envolvidos (ex.
     PowerBuilder/Sybase, SAP), dependências externas.
   - **ROI / benefício esperado** *(opcional — tentar, sem bloquear)*: ganho
     de negócio (tempo, custo, risco, receita, conformidade), mesmo que
     estimado ou qualitativo. Se o usuário não souber quantificar ou achar
     prematuro, registrar `N/A` (ainda não estimado) e seguir — é
     interessante ter, mas **não** é gate de aprovação da Descoberta.
3. **Não perguntar o que já foi respondido.** Se o pedido já veio completo,
   pule direto para o resumo.
4. Regra de parada: só continuar perguntando enquanto a resposta **mudaria**
   o resultado da especificação. Não interrogar por completude formal.
5. Escrever o **Resumo da Descoberta** (curto — não é a spec):

   ```markdown
   ## Resumo da Descoberta

   - **Pedido original:** ...
   - **Objetivo de negócio:** ...
   - **Atores / sistemas envolvidos:** ...
   - **Gatilho:** ...
   - **O que muda (esperado):** ...
   - **Fora de escopo (conhecido até aqui):** ...
   - **Restrições / dependências:** ...
   - **ROI / benefício esperado:** ... (ou `N/A — ainda não estimado`)
   - **Classificação preliminar:** feat | fix (confirmar na Especificação)
   ```

6. **`AskQuestion`**: `Este é exatamente o entendimento do que você quer?`
   - `Sim, seguir para Especificação` | `Ajustar entendimento` | `Outro (eu digito)`
7. Só após aprovação: o Resumo aprovado vira a base da seção de Contexto da
   Especificação (Fase 2) — não fica preso ao chat, entra no documento.

## Não fazer aqui

- Não escrever RN/RF/US/CA — isso é `especificacao`.
- Não abrir branch — isso é `especificacao` / `correcao-erro` (Fase 2).
- Não desenhar solução técnica — isso é `arquitetura` (Fase 3).
- Não perguntar sobre stack/observabilidade (gate Node, greenfield `.ai/`) —
  isso é `especificacao` §3/§4.

## Encaminhamento

Após aprovação: **Fase 2 — Especificação Funcional** (`especificacao` para
feat, `correcao-erro` para fix), usando o Resumo aprovado como ponto de
partida — a especificação **não** reabre a interrogação já fechada aqui,
só aprofunda em RN/RF/US/CA e nos gates próprios da fase.
