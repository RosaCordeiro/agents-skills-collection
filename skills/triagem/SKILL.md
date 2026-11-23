---
name: triagem
description: >-
  Triagem da fila do SoftDesk cruzada com o Ágil: le a fila do atendente pelo
  servico local (MCP softdesk-local), procura o card de cada chamado no Ágil
  (campo de_chamados) e mostra uma tabela com a acao sugerida (criar card, abrir
  a entrega, perguntar sobre impedimento). So le; qualquer escrita so com um ok
  unico sobre a lista de acoes. Use quando o usuario pedir triagem da fila, o
  que da minha fila tem card, chamados sem card, proximo chamado, o que pegar
  da fila, ou /triagem. Nao usar para abrir chamado (skill softdesk), conduzir
  uma entrega (entrega-autonoma) nem para so listar a fila (skill softdesk,
  "Consulta pelo servico local").
claude-model: sonnet
---

# Triagem da fila: SoftDesk × Ágil

Responda em português. Esta skill **só lê** até o ok único da lista de ações. Desenho aprovado em 2026-11-21: `Projetos/Especificações/Triagem Fila SoftDesk Agil/DESENHO-triagem-fila.md`.

## Pré-condições

1. MCP **`softdesk-local`** conectado e com sessão (se a resposta for `AGUARDANDO_LOGIN` ou `SESSAO_EXPIRADA`, seguir a tabela da skill `softdesk`, seção "Consulta pelo serviço local": `softdesk_entrar`, login só na janela do navegador, nunca senha no chat).
2. MCP **`agil`** disponível.
3. Faltou um dos dois: dizer qual falta e **parar**. Não tentar plano B que escreva.

## Fluxo

1. **Ler a fila.** `softdesk_minha_fila` com `todas: true` (sem `limite`), encadeando `inicio` = `proximo_inicio` até vir `null` (até 5 blocos por pedido, como na skill `softdesk`). Guardar só código, título, status do SoftDesk e prioridade. Se `incompleto`, dizer que a fila não foi lida inteira.
2. **Achar os cards no Ágil, num agente separado.** Cada resposta de `listar_itens_backlog` é muito verbosa (de 3 KB a 110 KB por produto, medido em 21/11/2026), então esta etapa roda em um subagent `general-purpose` (`sonnet`), só leitura, que devolve **só a tabela compacta** `chamado | id_backlog_item | id_status | nm_produto`; a conversa principal nunca recebe os itens crus. O agente recebe os números dos chamados da fila e a lista de produtos, chama `listar_itens_backlog` **uma vez por vez, em sequência**, com `limite` 200, **um produto por chamada e sem filtro de status**, e procura cada número em `de_chamados`.
   - **Não filtrar por status:** o filtro `status` de `listar_itens_backlog` devolveu HTTP 500 em 21/11/2026 (mesmo com `limite` 3). `produto` e `sprint_id` funcionam. Não há filtro por chamado, nem paginação.
   - **Produtos:** valores exatos de `listar_produtos`. Usar a lista de produtos da triagem do perfil do usuário (`~/.claude/softdesk-perfil.md`, linha "Produtos do Ágil na triagem"); se não houver, perguntar uma vez quais produtos olhar e oferecer gravar a lista no perfil (só com o ok dele). No teste de 21/11/2026 foram 23 produtos, 23 chamadas, nenhuma truncada.
   - **Teto:** no máximo 25 chamadas ao Ágil por triagem; uma que falhar com HTTP 500 pode ser repetida uma vez, sem insistir.
   - **Cobertura completa** quando nenhum produto vier com `truncado: true` (o `total` igual ao `exibindo`). Produto truncado = **cobertura parcial** daquele produto (refinar por `sprint_id`). Concluídos e cancelados entram naturalmente, porque não há filtro de status.
   - **Limites que o agente deve declarar:** só valem os produtos consultados; itens arquivados podem não aparecer; a busca olha só o campo `de_chamados`, então um chamado citado apenas no título ou no texto de um card não é achado.
3. **Cruzar.** O número do chamado aparece em `de_chamados` de algum item (comparar como número). Mais de um card pode citar o mesmo chamado: mostrar todos.
4. **Classificar** cada chamado:

| Situação | Significado | Ação sugerida |
|----------|-------------|---------------|
| Sem card | Nenhum card dos produtos consultados cita o chamado e a cobertura foi completa | Criar card (skill `agil`, seção 3) ou abrir a entrega |
| Card andando | Card em status aberto | Nada; abrir a entrega se ainda não começou |
| Card em `impedimento` | Parado | Mostrar o impedimento e perguntar o que fazer |
| Card em `pronto_para_deploy` | Espera a GMUD | Lembrar da GMUD aberta |
| Card concluído ou cancelado e chamado ainda aberto | Inconsistência | Perguntar: reabrir, fechar o chamado ou lançar atividade |
| Cobertura parcial | O produto do card veio truncado | **Não** afirmar "sem card"; sugerir refinar por `sprint_id` |

5. **Mostrar** uma tabela compacta, ordenada por prioridade e com "sem card" primeiro: chamado, título, status do SoftDesk, prioridade, card (id, status, sprint) e ação sugerida; depois um resumo (quantos sem card, andando, parados, parciais). Só esses campos; solicitante só se o pedido o usar (título e nome de pessoa são dados pessoais; limitar volume, norma de IA da Clamed).
6. **Agir só com ok.** Montar **uma lista única** de ações propostas e perguntar com `AskUserQuestion`: `Aprovar lista` | `Ajustar` | `Só olhar`. Ações possíveis, cada uma pela skill dona:

| Ação | Skill e regra |
|------|---------------|
| Criar card | `agil`, seção 3: `nm_produto` exato de `listar_produtos` (se não houver produto óbvio, perguntar), `de_chamados` com o número, texto lido do chamado sem inventar |
| Comentar no card | `agil`, seção 7: mostrar o texto antes |
| Lançar atividade no chamado | `softdesk`, "Vínculo leve com chamado": HTML, sem status nem tempo |
| Abrir a entrega do chamado | `construir` / `entrega-autonoma` com o número; não perguntar o modo de novo se o usuário já o disse |

Nunca, sem pedido explícito: mudar status do chamado ou do card, apontar horas, fechar ou reabrir chamado, criar chamado.

## Erros e limites

| Situação | O que fazer |
|----------|-------------|
| `error.destaque: true` ou `aviso_deriva` do `softdesk-local` | Mostrar o alerta em destaque antes de qualquer outro texto (regra da skill `softdesk`); sem a fila, a triagem não segue |
| `SERVICO_INDISPONIVEL` | Repassar `error.acao`; parar |
| MCP do Ágil indisponível ou erro | Dizer e parar; não repetir em laço |
| Muitas chamadas | Sempre em sequência e num agente; no máximo 25 ao Ágil; a API do SoftDesk limita 60 por minuto |

## Fronteiras

| Assunto | Onde |
|---------|------|
| Só listar a fila ou pesquisar por filtro ou nome | skill `softdesk`, "Consulta pelo serviço local" |
| Abrir chamado, ler dossiê, lançar atividade | skill `softdesk` |
| Criar ou mover card, horas, comentários | skill `agil` |
| Conduzir a entrega do chamado escolhido | `construir` → `entrega-autonoma` |
| Triagem de várias filas ou de outra pessoa | fora do escopo; o serviço local mostra só a fila do atendente configurado |

## Checklist

- [ ] Fila lida pelo `softdesk-local` e `proximo_inicio` seguido até `null` (ou `incompleto` avisado)
- [ ] Cards procurados por produto, num agente, em sequência, no máximo 25 chamadas ao Ágil, sem filtro de status
- [ ] Produto truncado virou "cobertura parcial", nunca "sem card"
- [ ] Nada escrito antes do ok da lista única
