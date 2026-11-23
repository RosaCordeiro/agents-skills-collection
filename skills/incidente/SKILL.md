---
name: incidente
description: >-
  Modo incidente: cobre um incidente com o paliativo (contingencia) que faz a
  operacao voltar a andar, sem a correcao definitiva. Le o chamado, confirma o
  sintoma e a causa provavel, propoe o paliativo, aplica via ajuste so depois
  do ok e registra no chamado. A correcao definitiva e a causa raiz seguem
  separadas (correcao-erro, analista ou outro chamado). Use quando o usuario
  trouxer um incidente, paliativo, contingencia, workaround, "operacao parada",
  "resolve por ora", ou /incidente. Roda neste chat; nao lancar via Task.
claude-model: opus
claude-model-fallback: sonnet
---

# Incidente — cobrir com o paliativo

Responda em portugues, curto. Neste processo, **cobrir um incidente é entregar o paliativo**: algo que devolve a operacao ao ar agora. Nao e a correcao definitiva e nao e a investigacao de causa raiz; essas seguem em outro momento, com outro tipo de chamado.

Roda **neste chat**; nunca via Task.

## Limites

- Nao faz comunicado formal a operacao nem plano de retorno separado: nao fazem parte do processo. Uma linha "como desfazer" no registro do paliativo e boa pratica quando for trivial (por exemplo, o valor antigo de um dado ou o objeto travado), sem virar documento.
- Nao corrige a causa definitiva. Se o paliativo ja resolve de vez, dizer isso e deixar o usuario decidir se ainda abre causa raiz.
- Nao muda status nem encerra o chamado; isso e do usuario.

## Fluxo

1. **Entrada.** Com numero de chamado: ler o `dossie_chamado` (skill `softdesk`, "Vinculo leve com chamado") e resumir sintoma, impacto e o que ja foi tentado. Sem chamado, o relato do usuario e a fonte; nao criar chamado por conta propria.
2. **Sintoma e causa provavel.** Confirmar o que esta quebrado, desde quando e onde (sistema, tela, tabela, rotina). Cruzar com o codigo ou o banco **so em leitura** (PBG e homologacao no PB; leitura do repositorio fora dele). Separar **fato**, **hipotese** e **lacuna**. Uma pergunta por vez, so a que muda o paliativo.
3. **Paliativo.** Propor ate duas opcoes, com recomendacao, cada uma com: o que muda, onde, risco, o que **continua errado** e como desfazer (uma linha). Tipos usuais: ajuste de dado, patch minimo no objeto, desvio de regra por parametro, rotina manual da operacao, reprocesso. Preferir o que nao altera codigo; se alterar, o menor patch.
4. **Lista unica de aprovacao.** Mostrar numa mensagem: o paliativo escolhido, os arquivos ou objetos tocados (em PB, os que levam `svn lock`), o que **nao** sera feito, e a lista de atividades no chamado (marcos: paliativo definido; paliativo aplicado e validado) conforme a secao "Vinculo leve" da skill `softdesk`. Um `AskUserQuestion`: `Aprovar` | `Aprovar sem registrar no chamado` | `Ajustar`. Escrita em banco de producao nunca entra aqui sem pedido explicito do usuario e confirmacao propria.
5. **Aplicar.** Mudanca de codigo: skill `ajuste` (em PowerBuilder, `ajuste` do plugin PB: `svn lock` antes, sem commit, sem unlock, sem check-in). Fora disso, o usuario executa ou o passo e descrito para ele; verificar o resultado em leitura.
6. **Validar.** Mostrar a evidencia de que o sintoma sumiu (antes e depois). Se nao sumiu, dizer, nao registrar como resolvido.
7. **Registrar.** Atividade no chamado, dentro da lista aprovada: o que foi feito, onde, o que continua pendente, como desfazer. Card do Ágil so se o usuario citou o id (comentario com o mesmo texto, conforme skill `agil`).
8. **Encaminhar o definitivo.** Dizer em uma linha o proximo passo e deixar com o usuario: causa raiz (`analista`, chamado tipo causa raiz), correcao definitiva (`correcao-erro` e depois `entrega-autonoma` ou `ajuste`). Nao comecar sem pedido.

## Fronteiras

| Pedido | Usar |
|--------|------|
| Entender a causa sem corrigir | `analista` |
| Especificar a correcao definitiva | `correcao-erro` |
| Aplicar a mudanca pontual | `ajuste` |
| Correcao definitiva com plano e card | `entrega-autonoma` |
| Abrir chamado | `softdesk` |
