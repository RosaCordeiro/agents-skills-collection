# ADR-008: Filtros de texto aplicados no cliente (nome do solicitante, título, prioridade e tipo)

- **Status:** aceito em 2026-11-19
- **Data:** 2026-11-19
- **Contexto:** O usuário pede em linguagem natural, como "meus chamados abertos pela Rosangela". O SoftDesk filtra por código (`pesq_cd_usuario` é "por convenção") e não há rota conhecida que descubra o código a partir do nome; o MCP oficial só busca usuário por código, login ou e-mail. Cada chamado lido já traz `nm_usuario`, `tt_chamado`, `ds_prioridade` e `ds_tipo_chamado`.

## Decisao

`softdesk_minha_fila` e `softdesk_pesquisar` aceitam `solicitante_nome`, `titulo_contem`, `prioridade_nome` e `tipo_nome`. O filtro é aplicado no cliente, na mesma leitura progressiva da fila (ADR-005), sem diferenciar maiúsculas e acentos, e todas as palavras pedidas precisam aparecer no campo. A resposta marca `filtro_texto_no_cliente: true`. Sem filtro de servidor que restrinja a pesquisa (como o atendente), a leitura cobre só os 3.000 chamados mais novos e marca `incompleto: true`.

## Alternativas consideradas

| Alternativa | Por que nao |
|-------------|-------------|
| Resolver o nome em código de solicitante e filtrar no servidor | Não há rota conhecida (Q-06); fica como melhoria quando for descoberta |
| Deixar o Claude filtrar a lista inteira no chat | Despejaria muitos títulos e nomes de pessoas no chat e gastaria contexto |
| Aceitar só filtros por código | Não atende ao uso real, que é por nome |

## Consequencias

- Positivas: pedidos por nome funcionam já no MVP; a lógica é pura e testável no domínio (`filtro-texto.ts`); nenhum dado novo é guardado.
- Negativas / divida: o filtro só enxerga os chamados lidos; na pesquisa ampla cobre apenas os 3.000 mais novos; nomes são dados pessoais que voltam ao chat quando o pedido os usa, então a skill limita o que mostra.

## Referencias

`docs/especificacoes/SPEC-001.md` RN-16, CA-23, VAL-25, VAL-26, Q-06; `docs/arquitetura/ARCH-001.md` §4, §6 F3 e F4, §7.1.
