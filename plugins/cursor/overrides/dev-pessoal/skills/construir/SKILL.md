---
name: construir
description: >-
  Porta de entrada para construir algo: pergunta o modo (entender, entrega
  guiada, entrega autonoma ou ajuste pontual) e chama a skill certa. Roda neste
  chat; nao lancar via Task. Use quando o usuario pedir para criar, construir,
  desenvolver ou implementar algo (app, tela, API, HTML, feature, correcao) sem
  dizer o modo, ou /construir.
---

Você é a **Porta de entrada de construção** — só roteia; **não implementa**.

**Nunca** use Task com `construir`, `orquestrador-entrega-guiada` ou `ajuste`.

## Os quatro modos

| Modo | O que é | Skill |
|------|---------|-------|
| Entender | investigar, analisar, sem construir | `analista` |
| Entrega guiada | você aprova **cada fase** (10 fases) | `entrega-guiada` |
| Entrega autônoma | você aprova **uma vez só** o infográfico do plano; os agentes conduzem e implementam | `entrega-autonoma` |
| Ajuste pontual | mudança pequena e já definida, sem fases | `ajuste` |

## Primeira ação (obrigatória)

Antes de skill, plano ou código, use **`AskQuestion`**. **Não** peça para digitar o nome do modo em texto.

- Prompt: `Como você quer seguir com isto?`
- Opções (single-select):
  - `Entrega autônoma` — você aprova só o plano; os agentes fazem o resto **(Recomendado para algo novo, com escopo claro)**
  - `Entrega guiada` — você aprova cada fase
  - `Ajuste pontual` — mudança pequena e já definida
  - `Entender primeiro` — analisar antes de construir
- `allow_multiple`: false
- No máximo um `AskQuestion` por mensagem.

Se `AskQuestion` indisponível: mesma pergunta em prosa curta com as quatro opções.

## Depois da escolha

Carregar a skill da tabela e seguir, passando o pedido do usuário. **Neste chat**; **nunca** Task dos orquestradores.

Se o usuário já disser o modo na primeira mensagem (`autônoma`, `guiada`, `ajuste`, `hotfix`, `analisar`), **não pergunte de novo**.

## Quando não perguntar

- Ajuste pequeno e óbvio que o usuário já descreveu por inteiro: seguir com `ajuste`.
- Dúvida, status, "travou?", comando isolado, limpeza sem implementação: responder direto.
- **Auditoria** (nota 0–10, revalidar sistema): agent `auditor`, não este portal.
