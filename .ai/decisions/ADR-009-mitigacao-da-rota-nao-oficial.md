# ADR-009: Mitigação do risco da rota não oficial: contrato dourado, deriva por campo e recuperação rápida

- **Status:** aceito em 2026-11-19
- **Data:** 2026-11-19
- **Contexto:** `/login` e `/chamado/json` não são oficiais e podem mudar sem aviso (R1). O usuário aceita o risco, mas pediu foco na mitigação. Uma mudança parcial (um campo renomeado ou removido) é mais provável do que a quebra total, e as capturas reais mostraram campos que ora vêm nulos, ora texto.

## Decisao

Oito camadas (ARCH-001 §17): isolamento num único adaptador; **contrato dourado** (campos com o conjunto de tipos observados e marca essencial, usado ou outro) gerado de captura real; conferência por campo a cada resposta (essencial → `CONTRATO_ROTA_MUDOU` com os nomes; usado ausente ou de outro tipo → campo nulo e `aviso_deriva`, mas `null` em campo usado é aceito e não gera aviso (emenda de 2026-11-21, revisão B-1: um único `null` real geraria alarme falso); essenciais continuam sem poder ser `null`; campo novo → só log); aviso destacado igual em MCP e REST, com notificação do Windows; verificação de saúde com diagnóstico de deriva, rodada também após o primeiro login de cada início do serviço; comando `npm run capturar-forma` que mostra a diferença e regrava o dourado; roteiro "O SoftDesk mudou" no README; e plano B de uso pelo MCP oficial enquanto o serviço está em alerta. O log e a captura guardam só nomes e tipos de campos, nunca valores.

## Alternativas consideradas

| Alternativa | Por que nao |
|-------------|-------------|
| Validar só `lista` e `treeview.total` (versão anterior) | Pegaria a quebra total, mas deixaria passar um campo renomeado, que quebraria a fila e os filtros em silêncio |
| Falhar com erro em qualquer diferença de campo | Geraria alarme falso com campos que ora vêm nulos e com campos novos inofensivos |
| Trocar a rota web pela API oficial (`api.php`) | A API oficial usa credencial de serviço e não filtra por atendente; não resolve a fila |
| Teste automático contra produção | Exigiria credencial guardada; o comando de captura, rodado pelo usuário, cumpre o papel |

## Consequencias

- Positivas: a quebra é percebida na primeira resposta afetada e descrita por nome de campo; a recuperação cabe em um comando, um ajuste e `npm test`; mudanças inofensivas não incomodam.
- Negativas / divida: o dourado precisa ser mantido (é regravado pelo comando de captura); a conferência por campo custa um pouco de processamento por resposta; o plano B depende de a skill ser atualizada (fragmento 8).

## Referencias

`docs/arquitetura/ARCH-001.md` §17; `docs/especificacoes/SPEC-001.md` RN-17, RF-12, CA-25 a CA-28, VAL-29 a VAL-32.
