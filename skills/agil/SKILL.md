---
name: agil
description: >-
  Ensina a usar o MCP do Ágil CLAMED (backlog, sprints, tarefas, horas,
  comentários e a documentação do Atlas): começar o dia, achar e ler itens,
  criar item a partir de chamado, mover status, lançar horas, consultar o
  Atlas e conduzir o card de uma entrega (4 tarefas, com a GMUD, e
  andamento). Escrita só com confirmação. Use quando o usuario pedir Ágil, backlog,
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

Cada entrega tem **um card de desenvolvimento** no Ágil, com 4 tarefas, a última delas "GMUD", que fica aberta no encerramento (não existe card nem módulo de GMUD ainda). O orquestrador mostra a lista completa antes (abaixo, "Lista de ações") e só escreve depois do ok único do usuário.

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
| GMUD | atualização do sistema (deploy e validação pós-deploy); **não** é feita pela entrega, só aberta e descrita (Fase 11) |

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

**Tarefa GMUD** (criada junto das outras, em `fazer`; preenchida ao encerrar, uma vez só, quando o card vai a `pronto_para_deploy`):
- `atualizar_tarefa_item` em `de_comentarios` (substitui o texto todo): resumo do que muda, lista dos objetos criados e alterados conferida no código (do infográfico do resultado), ordem de aplicação quando houver banco, checklist de deploy e de validação pós-deploy.
- A tarefa **fica em `fazer`**: quem controla a atualização do sistema a conduz e fecha. A entrega nunca a move.
- O card **não** vai a `concluido` pela entrega; fica em `pronto_para_deploy` até a GMUD ser feita.
- Quando existir um módulo de GMUD no Ágil, trocar **só esta subseção**.

**Lista de ações** (mostrada junto da aprovação do plano, antes de qualquer escrita). Cada linha diz o quê, onde e com quais valores:
1. Card de desenvolvimento: usar o id X, ou criar (título, produto, tipo, status inicial).
2. As 4 tarefas (Arquitetura, Desenvolvimento, Validação, GMUD).
3. Cada mudança de status e em qual fase ocorre.
4. Em que momentos comenta, sem menções.
5. Encerramento do card (`pronto_para_deploy`) e preenchimento da tarefa GMUD, que fica aberta.
6. O que **não** fará: outros itens, atribuir a outras pessoas, menções, apontar horas e anexos, mover a tarefa GMUD.
7. Se há chamado no SoftDesk: o número vai em `de_chamados` do card (linha 1), e as atividades no chamado (marcos, resumo, o que não fará) são listadas pela `entrega-autonoma` na mesma aprovação (skill `softdesk`, "Chamado existente"). O Ágil não escreve no SoftDesk; cada MCP é chamado pelo orquestrador.

O usuário aprova a lista inteira ou recusa o Ágil (a entrega segue sem ele).

**Depois de cada escrita:** conferir o retorno, anotar no `ESTADO` (`agil: item <id>, tarefas <ids>, gmud <id da tarefa>`) e dizer no chat, em uma linha, o que foi feito. Erro do Ágil não trava a entrega: avisar, anotar a pendência e seguir. Nunca repetir uma criação sem conferir antes se ela já existe.

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
| Entrega autônoma com card, 4 tarefas (com GMUD) no Ágil | skill `entrega-autonoma` (usa a seção 9 desta skill) |
