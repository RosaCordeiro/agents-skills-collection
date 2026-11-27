---
name: agil
description: >-
  Ensina a usar o MCP do Ágil CLAMED (backlog, sprints, tarefas, horas,
  comentários e a documentação do Atlas): começar o dia, achar e ler itens,
  criar item a partir de chamado, mover status, lançar horas, consultar o
  Atlas e conduzir o card de uma entrega (4 tarefas, com a GMUD, e
  andamento) e registrar a release na GMUD. Escrita só com confirmação. Use quando o usuario pedir Ágil, backlog,
  sprint, meu dia, item do backlog, tarefa, apontar horas, lançar horas,
  comentar item, Atlas, ou /agil. Nao usar para abrir chamado no SoftDesk
  (skill softdesk) nem para desenhar ou implementar MCP (skill mcp).
claude-model: sonnet
---

# Ágil CLAMED via MCP

Responda em português. MCP do Ágil (no Claude Code as tools aparecem como `mcp__agil__<nome>`). Não invente nome de tool: use só as que a sessão listar. As permissões são as do dono do token (OAuth do próprio usuário): tudo que for gravado sai em nome dele e vale para a equipe.

Se as tools não estiverem disponíveis, o server pode precisar de autorização: o usuário autentica pelo `/mcp`. Não peça código, token nem URL de callback.

## Regra de escrita (obrigatória)

Leitura é livre. **Toda escrita** pede ok explícito do usuário na conversa, mostrando antes o que vai ser gravado:

| Escreve | Tools |
|---------|-------|
| Item | `criar_item_backlog`, `atualizar_item_backlog` |
| Tarefa | `criar_tarefa_item`, `atualizar_tarefa_item` |
| Horas | `registrar_apontamento_horas` |
| Comentário | `comentar_item` |
| Anexo | `registrar_anexo_item`, `remover_anexo_item` |
| GMUD | `criar_gmud_versao`, `atualizar_gmud_versao`, `criar_gmud_item`, `atualizar_gmud_item`, `criar_gmud_demanda`, `atualizar_gmud_demanda`, `remover_gmud_item`, `remover_gmud_demanda` |

Ler a GMUD (`listar_gmud_versoes`, `obter_gmud_versao`, `buscar_gmud_do_item_backlog`) é livre. O MCP não muda status de versão, não marca teste de item, não marca linha do checklist como concluída e não apaga versão: isso é feito na tela.

Antes de gravar, resumir em uma linha: **o quê, em qual item/tarefa, com quais valores**. Depois de gravar, conferir o retorno e devolver o id. Um ok vale para aquela ação, não para as seguintes.

**Exceção: autorização por entrega.** Quando a skill `entrega-autonoma` mostra a **lista completa** de ações no Ágil (seção 9, "Lista de ações") e o usuário a aprova de uma vez, essas ações valem para aquela entrega, sem novo ok a cada uma. Fora da lista a regra acima continua valendo. A autorização **não** cobre outros itens, atribuir a outras pessoas, menções, apontar horas nem anexos.

Atenção a efeitos colaterais:
- Definir `id_responsavel` (item ou tarefa de outra pessoa) **notifica** a pessoa, e para tarefa exige permissão própria.
- `comentar_item` e menções (`de_mencoes`, `de_objetivo_contexto`) **notificam**. Comente só o que vale a atenção de alguém (MR aberto, bloqueio, decisão).
- `de_chamados` e `de_tags` **substituem a lista inteira**: leia o item antes e reenvie a lista completa com o que mudou.
- `de_comentarios` da tarefa substitui o texto todo.
- `atualizar_item_backlog` é parcial: envie só os campos que mudam.

## Mapa das tools

| Preciso de | Tool |
|-----------|------|
| Panorama do dia (sprints, minhas tarefas, horas lançadas) | `meu_dia` |
| Valores válidos de produto | `listar_produtos` |
| Id de sprint | `listar_sprints` (filtro `squad`) |
| Id de pessoa (responsável, menção) | `listar_pessoas` |
| Status configurados | `listar_status_backlog` |
| Itens por produto/status/sprint/projeto | `listar_itens_backlog` |
| Item completo | `obter_item_backlog` |
| Tarefas, horas, comentários, anexos, histórico de um item | `listar_tarefas_item`, `listar_apontamentos_tarefa`, `listar_comentarios_item`, `listar_anexos_item`, `historico_item` |
| Documentação de domínio e integrações | `buscar_documentacao` → `ler_documentacao` |

## Fluxos

### 1. Começar o dia
`meu_dia`. Mostrar sprints em andamento, tarefas do usuário por status, esforço previsto e horas do dia. Sugerir o que pegar; não mover nada sem pedido.

### 2. Achar e entender um item
1. `listar_itens_backlog` com os filtros que o usuário deu (produto, status, sprint). A lista vem **resumida**: `campos_longos_preenchidos` diz quais campos longos existem. Se `truncado` for true, refinar filtro ou subir `limite`.
2. `obter_item_backlog` para objetivo/contexto, critérios de aceite e entregas esperadas.
3. `historico_item` se a pergunta for "quem mexeu / por que mudou".

**Do chamado para o card.** `listar_itens_backlog` não filtra por chamado nem pagina, e o filtro `status` devolveu HTTP 500 em 21/11/2026: para saber se um chamado já tem card, listar por `produto` (limite 200, uma chamada por vez) e procurar o número em `de_chamados` do resumo; `truncado: true` significa cobertura parcial daquele produto, não "sem card". A resposta de um produto grande passa de 100 KB: fazer essa varredura em um subagent que devolva só a tabela chamado → card. Para a fila inteira do SoftDesk, use a skill `triagem`.

### 3. Criar item (ex.: a partir de um chamado)
1. Obrigatórios: `de_titulo` e `nm_produto` (valor exato de `listar_produtos`). Sem `id_status` nasce em `backlog`.
2. Campos úteis: `id_tipo` (`melhoria`, `bug`, `chamado`), `de_chamados` (números), `de_objetivo_contexto` (HTML), `de_criterios_aceite`, `de_entregas_esperadas`, `id_sprint`, `id_responsavel`, `de_tags`.
3. Se vier de chamado do SoftDesk, ler o chamado antes (skill `softdesk` / tools do SoftDesk) e preencher título, contexto e `de_chamados` a partir dele, sem inventar.
4. Mostrar o rascunho, esperar o ok, criar, devolver o id.

### 4. Mover status
`atualizar_item_backlog` com `id_status`. Ao mover para **`impedimento`** ou **`cancelado`**, ou classificar como **`transbordo`**, enviar sempre `justificativa`: só nessas transições ela é gravada. Status válidos: `backlog`, `em_analise`, `pronto_para_sprint`, `nao_iniciado`, `em_andamento`, `impedimento`, `code_review`, `em_teste`, `entregue`, `pronto_para_deploy`, `concluido`, `cancelado`. Na dúvida, `listar_status_backlog`.

### 5. Tarefas
`listar_tarefas_item` mostra o que existe e traz o `id_backlog_tarefa`. `criar_tarefa_item` aceita `qt_esforco_previsto` em horas e nasce em `fazer`. A tarefa anda `fazer` → `fazendo` → `feito` por `atualizar_tarefa_item`.

### 6. Lançar horas
1. Achar a tarefa: `listar_tarefas_item` do item.
2. **Conferir duplicidade**: `listar_apontamentos_tarefa` antes de lançar, para não repetir o mesmo dia.
3. Confirmar com o usuário: tarefa, data (`AAAA-MM-DD`, pode ser retroativa), total de horas (aceita fração, ex.: `1.5`), e `dh_hora_inicio`/`dh_hora_fim` (`HH:MM`) se ele quiser.
4. `registrar_apontamento_horas`. Sai em nome do dono do token. Testado em 19/11/2026: o retorno traz `nr_chamado_softdesk` e `dh_enviado_softdesk` (vieram nulos num item sem chamado). Se o item tiver `de_chamados`, o apontamento **pode ser enviado ao chamado do SoftDesk**; avisar o usuário disso antes de lançar e conferir esses dois campos no retorno.
5. Não existe remover apontamento no MCP: um lançamento errado só se corrige pelo app.

### 7. Comentar
`comentar_item` com `id_backlog_item` e `de_texto`; `de_mencoes` recebe UUIDs de `listar_pessoas`; `id_resposta_a` responde a um comentário. Mostrar o texto antes de publicar.

### 8. Consultar o Atlas
Documentação de domínio e integrações (regras de negócio, fluxos, APIs).
1. `buscar_documentacao` com termos curtos; `publico` = `geral` ou `tecnico` para filtrar.
2. `ler_documentacao` com o `caminho` devolvido. Documento longo vem em partes: se `truncado` for true, chamar de novo com `a_partir_de` = `proximo_inicio`.
3. Conferir `verificado_em` e `ciclo_vida`: documento antigo pode estar defasado em relação ao código. Dizer isso ao usuário quando for relevante.

### 9. Card da entrega (usado pela `entrega-autonoma`)

Cada entrega tem **um card de desenvolvimento** no Ágil, com 4 tarefas, a última delas "GMUD", que fica aberta no encerramento. A GMUD da entrega é registrada na release do Ágil pelo MCP quando a sessão lista a tool `criar_gmud_versao`; sem ela, o texto vai para a tarefa GMUD (abaixo, "GMUD da entrega"). O orquestrador mostra a lista completa antes (abaixo, "Lista de ações") e só escreve depois do ok único do usuário.

**Achar o card (leitura).**
1. Se o usuário deu o id do item: `obter_item_backlog`.
2. Se deu número de chamado: `listar_itens_backlog` (com `produto`, se souber) e procurar o número em `de_chamados`. Se a listagem falhar ou não achar, pedir o id ao usuário ou propor criar.
3. Antes de criar, conferir o `ESTADO` da entrega (campo `agil`): se já há um id lá, não criar outro. Não existe apagar item.

**Produto.** `nm_produto` exato de `listar_produtos`: o nome do sistema da entrega (por exemplo `API Scanner`, `Portal SupplyChain`, `Supply Chain - WMS`). Sem nome igual, perguntar qual usar e registrar a resposta no `ESTADO`.

**Criar o card** (`criar_item_backlog`):
- título da entrega; `nm_produto`;
- `id_tipo`: `melhoria` (feature), `bug` (correção) ou `chamado` (veio de chamado, com `de_chamados`);
- `de_objetivo_contexto` (HTML curto): o pedido e o plano;
- `de_criterios_aceite`: os aceites da SPEC;
- `de_entregas_esperadas`: a seção 4-A do pacote (objetos que serão criados ou alterados);
- `id_status` = `em_analise`;
- **sem** responsável de outra pessoa e **sem** menções. Responsável: o próprio usuário, se o id dele for conhecido (`meu_dia`); senão, vazio.

**Tarefas** (`criar_tarefa_item`, nascem em `fazer`), com exatamente estes títulos:

| Tarefa | Cobre |
|--------|-------|
| Arquitetura | descoberta, especificação, desenho e pacote (Fases 1 a 5) |
| Desenvolvimento | implementação e revisão de código (Fases 6 e 7) |
| Validação | aceite, testes, revisão de testes, infográfico do resultado e teste em contexto novo (Fases 8 e 9) |
| GMUD | atualização do sistema (deploy e validação pós-deploy); **não** é feita pela entrega, só aberta e descrita (Fase 11); com o MCP de GMUD, aponta para a release |

**Andamento** (`atualizar_item_backlog` e `atualizar_tarefa_item`):

| Momento | Status do card | Tarefas |
|---------|----------------|---------|
| Fases 0-1: card achado ou criado | `em_analise` | Arquitetura `fazendo` |
| Fase 5: plano aprovado | `em_andamento` | Arquitetura `feito`; Desenvolvimento `fazendo` |
| Fase 7: revisão de código | `code_review` | Desenvolvimento `fazendo` |
| Fases 8-9: aceite, testes e resultado | `em_teste` | Desenvolvimento `feito`; Validação `fazendo` |
| Fase 11: encerramento aprovado | `pronto_para_deploy` | Validação `feito`; GMUD continua `fazer` |

- Impedimento real: `impedimento`, com `justificativa`. Entrega abandonada: `cancelado`, com `justificativa`.
- Card que já está adiante do previsto: nunca voltar status; só avançar.

**Comentários** (`comentar_item`, sem menções) só em marco: plano aprovado, MR aberto, impedimento, resultado validado e encerramento. Texto curto, com o que importa a quem acompanha.

**GMUD da entrega** (registrada ao encerrar, uma vez só, quando o card vai a `pronto_para_deploy`). A tarefa GMUD é criada junto das outras, em `fazer`, nos dois caminhos.

*Qual caminho.* Se a sessão lista a tool `criar_gmud_versao`, usar o caminho MCP. Se não lista, usar o caminho tarefa. Conferir de novo na hora de encerrar.

*No plano (Fase 1), com o caminho MCP:*
- `listar_gmud_versoes` com `produto` e `status` = `planejada` (leitura) e mostrar ao usuário as versões abertas.
- O usuário escolhe: entrar numa versão que já existe (qual) ou criar uma nova.
- Versão nova: perguntar a **data prevista** ao usuário. Nunca inventar a data. Sem data, não criar a versão: vale o caminho tarefa.
- As tools de GMUD só enxergam a sua coordenação de origem e as releases visíveis para as suas squads. Se o card ou o produto for de outra coordenação, avisar o usuário: a release tem de ser registrada na tela, e vale o caminho tarefa.

*Caminho MCP, ao encerrar:*
1. `buscar_gmud_do_item_backlog` com o id do card. Se voltar demanda do card na versão escolhida, não criar de novo; completar só o que faltar na demanda, com `atualizar_gmud_demanda`. Em item que esta entrega **não** criou (ids no `ESTADO`), não reenviar `de_descricao` sem antes ler (`obter_gmud_versao`), mostrar ao usuário o texto atual e o que mudaria, e só alterar com o ok explícito dele (`de_descricao` substitui o texto inteiro e não tem desfazer); em item que a entrega criou, pode usar `atualizar_gmud_item`. **Lista vazia não prova que o card está fora de release** (a busca só vê a sua coordenação de origem e as suas squads): antes de criar versão, consultar `listar_gmud_versoes` (por `produto` e por `q` com o título) e perguntar ao usuário se já existe release para este card.
2. Versão nova: `criar_gmud_versao` com `de_titulo`, `dh_prevista`, `nm_produto` (nunca vazio: sem produto, não enviar o campo) e `de_observacoes` com o texto da release em blocos rotulados, uma linha por bloco, nesta ordem: `Entrega do card <id>: <título>.` / `Resumo: ...` / `Retorno: ...` / `Objetos alterados: criados: ...; alterados: ...` / `Ordem de aplicação: 1) ...; 2) ...` / `Validação pós-deploy: 1) ...; 2) ...`. Bloco sem conteúdo: `não se aplica.`
3. Versão que já existe: **não** alterar `de_observacoes` (é da versão inteira e a gravação substitui o texto todo). Os mesmos blocos rotulados vão em `de_descricao` do item, depois da 1ª linha.
4. `criar_gmud_item` com `id_gmud_versao` e `de_descricao`. O item não tem título: a **1ª linha de `de_descricao` é o nome do item** (até 80 caracteres, não vazia e sem quebra de linha `\r`); depois de uma linha em branco vem a descrição da feature (ou os blocos do passo 3).
5. `criar_gmud_demanda` com `id_gmud_item`, `id_backlog_item` (o card), `nm_sistema`, `de_url_request` (só se houver o link do merge request, em http ou https; sem link, não enviar) e `de_chamados` (se houver chamado). Sem `de_titulo`: o título vem do card.
6. `obter_gmud_versao` para conferir item, demanda e textos. Anotar os ids no `ESTADO`.
7. Tarefa GMUD: `atualizar_tarefa_item` em `de_comentarios` com uma linha: `GMUD registrada na release "<título>" (versão <id>), item "<1ª linha da descrição do item>".` A tarefa **fica em `fazer`**.

*Texto.* Texto puro, sem HTML nem Markdown. As observações da versão aparecem na tela em linha corrida, por isso cada bloco começa pelo rótulo. A descrição do item mantém as quebras de linha.

*Nunca, na GMUD:* mudar status de versão; marcar teste de item; mexer no checklist da versão; apagar versão; apagar item ou demanda de outra entrega; enviar `id_status`, `de_motivo` ou `dh_execucao` na demanda; entrar numa versão que o usuário não escolheu; concluir de uma busca vazia que o card não tem release; reescrever a descrição de item que esta entrega não criou sem ler e sem o ok do usuário. A versão criada pelo MCP nasce sem checklist e não vai a homologação sem ele: a skill não mexe no checklist e avisa o usuário, que o preenche na tela.

*Falha no meio.* Se a versão foi criada e criar o item ou a demanda falhou (HTTP 403 ou outro erro): não insistir e não tentar apagar a versão (não existe tool para isso). Informar o usuário, com o id e o título da versão, que ela ficou vazia e pode ser cancelada ou reaproveitada na tela; anotar o id no `ESTADO`; seguir pelo caminho tarefa.

*Corrigir o que esta entrega criou.* Item ou demanda criados por esta entrega (ids no `ESTADO`) e gravados errados: corrigir com `atualizar_gmud_item` ou `atualizar_gmud_demanda`. Criados no lugar errado (outra versão ou outro item): `remover_gmud_demanda` ou `remover_gmud_item` e criar de novo, mostrando antes ao usuário o que será apagado; `remover_gmud_item` apaga também as demandas do item, os passos de cutover e as aprovações ligados a elas, e não tem desfazer. Só em versão que não foi aprovada nem publicada. Versão criada errada não se apaga pelo MCP: avisar o usuário, que a cancela na tela.

*Queda para o caminho tarefa.* Sem a tool `criar_gmud_versao`; sem data prevista informada; recusa por permissão (HTTP 403 ou 401); versão aprovada ou publicada (HTTP 409); card ou produto de outra coordenação (HTTP 403 "Fora da sua coordenação") ou versão não visível (HTTP 404); ou o usuário recusou a GMUD pelo MCP no plano. Avisar o motivo em uma linha e não insistir.

*Caminho tarefa:* `atualizar_tarefa_item` em `de_comentarios` (substitui o texto todo): resumo do que muda, lista dos objetos criados e alterados conferida no código (do infográfico do resultado), ordem de aplicação quando houver banco, checklist de deploy e de validação pós-deploy. A tarefa **fica em `fazer`**: quem controla a atualização do sistema a conduz e fecha. A entrega nunca a move.

Nos dois caminhos o card **não** vai a `concluido` pela entrega; fica em `pronto_para_deploy` até a GMUD ser feita.

**Vínculo com o chamado.** Quando há chamado no SoftDesk, o número vai em `de_chamados` do card desde a criação, e a atividade no chamado cita o id do card. Na Fase 10 a `entrega-autonoma` revisa o card (status, tarefas, comentários, textos) e o vínculo; se faltar o número em `de_chamados`, ler o item e reenviar a lista completa com o número acrescentado.

**Lista de ações** (mostrada junto da aprovação do plano, antes de qualquer escrita). Cada linha diz o quê, onde e com quais valores:
1. Card de desenvolvimento: usar o id X, ou criar (título, produto, tipo, status inicial).
2. As 4 tarefas (Arquitetura, Desenvolvimento, Validação, GMUD).
3. Cada mudança de status e em qual fase ocorre.
4. Em que momentos comenta, sem menções.
5. Encerramento do card (`pronto_para_deploy`) e GMUD. Com as tools de GMUD: a release (criar com título X, data prevista D e produto P, ou entrar na versão V escolhida pelo usuário), o item e a demanda ligada ao card, com o texto nos campos. Inclui corrigir item ou demanda que a própria entrega criou errado (atualizar, ou remover e criar de novo). Sem elas: a tarefa GMUD preenchida. Nos dois casos a tarefa GMUD fica aberta.
6. O que **não** fará: outros itens, atribuir a outras pessoas, menções, apontar horas e anexos, mover a tarefa GMUD, mudar status de versão de GMUD, marcar teste, mexer no checklist da versão, apagar na GMUD item ou demanda de outra entrega, status e data de execução da demanda.
7. Revisão dos registros na Fase 10 (leitura, e correção só do que está nesta lista).
8. Se há chamado no SoftDesk: o número vai em `de_chamados` do card (linha 1), e as atividades no chamado (marcos, resumo, o que não fará) são listadas pela `entrega-autonoma` na mesma aprovação (skill `softdesk`, "Chamado existente"). O Ágil não escreve no SoftDesk; cada MCP é chamado pelo orquestrador.

O usuário aprova a lista inteira ou recusa o Ágil (a entrega segue sem ele).

**Depois de cada escrita:** conferir o retorno, anotar no `ESTADO` (`agil: item <id>, tarefas <ids>, gmud: tarefa <id>; versao <id>, item <id>, demanda <id> (ou "caminho tarefa")`) e dizer no chat, em uma linha, o que foi feito. Erro do Ágil não trava a entrega: avisar, anotar a pendência e seguir. Nunca repetir uma criação sem conferir antes se ela já existe.

## Boas práticas

- Descobrir ids (sprint, pessoa, produto) pelas tools `listar_*`; não chutar nem reaproveitar de memória.
- Payload grande não vai inteiro para o chat: resumir em tabela (id, título, status, responsável).
- Apresentar item sempre com id (`id_backlog_item`), título, produto, status e sprint.
- Texto longo de item (`de_objetivo_contexto`) é HTML do editor rico.
- Erro de permissão: dizer qual ação falhou e que depende da permissão do usuário no Ágil; não tentar contornar.

## Fronteiras

| Pedido | Usar |
|--------|------|
| Abrir ou consultar chamado no SoftDesk | skill `softdesk` |
| Criar ou manter um MCP server | skill `mcp` |
| Entrega guiada com fases | skill do fluxo (`entrega-guiada`, `pb-entrega-guiada`) |
| Entrega autônoma com card, 4 tarefas e a GMUD (release pelo MCP ou tarefa) no Ágil | skill `entrega-autonoma` (usa a seção 9 desta skill) |
