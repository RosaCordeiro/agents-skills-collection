# REVIEW-003: modo `todas` (fila, pesquisa, REST e MCP)

| Campo | Valor |
|-------|-------|
| Data | 2026-11-21 |
| Revisor | Claude (subagente revisor, somente leitura) |
| Escopo | SPEC-001 v0.10 (RN-05, RN-09, RF-03/04, CA-31..34, VAL-35..37), ARCH-001 v0.8 (F3, F4, §7.1, §8.3) |
| Arquivos | `src/shared/schemas/entrada.schemas.ts`, `src/core/domain/services/fila.service.ts`, `src/core/application/services/varredura.ts`, `src/core/application/useCases/listar-fila.use-case.ts`, `src/core/application/useCases/pesquisar.use-case.ts`, `src/shared/container/index.ts`, `src/presentation/rest/controllers/fila.controller.ts`, `src/presentation/mcp/tools.ts`, `src/infraestructure/logger/clamed-logger.adapter.ts`, `test/integration/consultas-todas.spec.ts`, `test/e2e/todas-mcp.spec.ts`, skill `softdesk/SKILL.md` (seção Todas) |
| Suíte | Cópia na scratchpad: `tsc --noEmit` limpo; `jest --runInBand` 44 suítes, 734 passaram, 1 pulado |

## Resultado

Nenhum achado BLOQUEANTE. Um ALTO (tamanho da resposta no MCP), dois MÉDIOS e alguns BAIXOS. O modo sem `todas` ficou igual ao de antes, e as regras centrais (`proximo_inicio`, prazo, tetos, mutex) estão certas e cobertas por testes que falham quando a regra é quebrada.

## Achados

### A-01 ALTO: 1000 itens não cabem numa resposta de tool MCP

- **Onde:** `src/core/domain/services/fila.service.ts:17` (`MAX_ITENS_TODAS = 1000`), `src/core/application/useCases/listar-fila.use-case.ts:220`, `src/core/application/useCases/pesquisar.use-case.ts:135`, `src/presentation/mcp/tools.ts:56,64`.
- **Cenário:** medido na cópia, com o simulador: `GET /v1/fila?todas=true` com 1200 abertas deu 1000 itens e **264 KB** de JSON. Os títulos do simulador são curtos ("Chamado fictício N"); com títulos reais a resposta passa de 300 KB, uns 80k a 120k tokens. Mesmo 450 itens (o caso de VAL-35) dão uns 120 KB. O cliente do Claude Code tem um teto de saída por tool MCP (25k tokens por padrão, `MAX_MCP_OUTPUT_TOKENS`); acima disso a resposta é cortada, recusada ou desviada para arquivo, conforme a versão. Não conferi o comportamento no cliente real. O risco: o pedido principal ("mostrar todas") quebra ou ocupa boa parte do contexto. Além disso, títulos e nomes de solicitante de até 1000 chamados entram no contexto do modelo de qualquer jeito, antes de a skill poder "oferecer resumo" (norma de IA, item de dados pessoais).
- **Correção (escolher uma):**
  1. teto de itens próprio para o MCP, por tamanho e não só por quantidade: o serviço mede o JSON e para com `parada_por: 'tamanho'` quando passa de uns 60–80 KB, com `proximo_inicio` correto;
  2. projeção compacta no modo `todas` (sem `solicitante`, `hora_abertura`, `interacoes`, `cd_atendente`, a menos que um filtro de texto use o campo);
  3. baixar `MAX_ITENS_TODAS` para uns 200–300.
  Em qualquer caso, testar no cliente MCP real com a fila de produção antes de liberar, e acrescentar um teste e2e que meça o tamanho do envelope.

### A-02 MÉDIO: uma varredura `todas` longa faz os pedidos concorrentes darem `REDE` sem parcial

- **Onde:** `src/core/application/services/varredura.ts:86-94` (o prazo é armado na chegada e vale também para a espera da vez).
- **Cenário:** uma fila `todas` que leva até 90 s segura o mutex. Uma pesquisa (ou fila sem `todas`) que chega durante esse tempo espera a vez e estoura o próprio prazo de 90 s antes de ler a primeira página. Resultado: `REDE` "A leitura excedeu o tempo.", mesmo quando ela também é `todas`, já que nenhuma página foi lida. Antes, a fila parava em 50 itens (normalmente 1 página) e a espera era curta; agora o modo `todas` lê até 15 páginas de propósito, e esse caso fica provável quando o SoftDesk está lento.
- **Correção:** registrar o comportamento na SPEC (RNF-04/RN-09) e na skill ("se vier REDE logo depois de um `todas`, repetir"), ou dar à espera pela vez uma mensagem própria (por exemplo `mensagem: 'Outra leitura longa em andamento.'`) para o chamador não confundir com SoftDesk lento. Opcional: teste de dois pedidos `todas` com prazo curto.

### A-03 MÉDIO: a skill manda "oferecer resumo" depois que os dados já chegaram, e não diz o que é volume grande

- **Onde:** `03-LIBRARIES/INTERNAL/agents-skills-collection-import/skills/softdesk/SKILL.md:110`.
- **Cenário:** com `todas: true` o modelo já recebe até 1000 títulos e nomes. "Com volume grande, oferecer resumo" não evita esse volume, só evita repassá-lo ao chat, e "grande" não tem número. A linha 112 (pesquisa com `filtro_status_no_cliente`: "continuar com `proximo_inicio` até vir `null`") contradiz a linha 110 (`todas` incompleto: continuar "só se o usuário pedir").
- **Correção:** definir um limite (por exemplo, acima de 50 itens mostrar contagem por status e prioridade e perguntar antes de listar); antes de chamar `todas`, quando o pedido não tiver filtro, perguntar se basta a contagem; deixar claro na linha 112 que a regra de continuar até `null` não vale no modo `todas`. Alinhar com A-01.

### A-04 BAIXO: `incompleto: true` falso quando o 1000º item é o último real mas `total` mudou durante a leitura

- **Onde:** `src/core/domain/services/fila.service.ts:113-120`.
- **Cenário:** `total` é o `treeview.total` da **primeira** página. Se chamados saem da consulta durante a leitura (fechados ou reatribuídos), o total guardado fica maior que o real. Quando o teto de itens coincide com o último item de uma página curta (`pagina.lista.length < tamanho`, ou seja, fim real), a conta `proximo >= total` dá falso: a resposta vem `incompleto: true`, `parada_por: 'itens'` e uma continuação que volta vazia. Nenhum item se perde nem se repete; o problema é só o aviso falso.
- **Correção:** no ramo do teto, também tratar como fim `indice === pagina.lista.length - 1 && pagina.lista.length < tamanho`.

### A-05 BAIXO: continuar com `proximo_inicio` entre chamadas só não repete itens se a lista não mudar

- **Onde:** `fila.service.ts:115`, CA-33 ("continuar completa sem repetidos").
- **Cenário:** a continuação é por posição e não guarda estado. Chamado novo que entra no topo entre a 1ª e a 2ª chamada empurra a lista: a 2ª repete o último item da 1ª. Dentro de uma chamada, `vistos` resolve; entre chamadas, não. Isso já valia para o modo por partes e a skill já manda "descartar repetidos por código" (linha 108), mas a seção Todas não repete a instrução, e CA-33 promete "sem repetidos" sem essa ressalva.
- **Correção:** na seção Todas da skill, "ao continuar, descartar repetidos por código"; em CA-33, "com a lista estável".

### A-06 BAIXO: teste frouxo e asserções redundantes

- `test/integration/consultas-todas.spec.ts:522`: `expect(requisicoesDepois).toBeGreaterThan(requisicoesAntes - 1)` é sempre verdadeiro (contador nunca diminui). Trocar por `expect(requisicoesDepois - requisicoesAntes).toBe(requisicoesAntes)` (o `todas=false` faz as mesmas requisições que omitir).
- `consultas-todas.spec.ts:349`: `not.toEqual(expect.arrayContaining(['todas']))` é redundante com a linha 350 (inofensivo).
- Os testes de prazo (`:238-268`, `lento: 120` contra prazo 300 ms) dependem de tempo; numa máquina lenta `paginas_lidas` pode ser 0 (vira REDE) ou 5 (termina sem prazo). Considerar folgas maiores (`lento: 200`, prazo 500, massa maior).

### A-07 BAIXO: lacunas de teste (não são bugs)

- Pesquisa `todas` **sem nenhum filtro** (o caminho deixa de ser "uma página no servidor" e passa a ser a varredura de até 15 páginas do SoftDesk inteiro): nenhum teste.
- Compartilhamento: nenhum teste prova que dois `todas` idênticos e simultâneos se juntam (uma só leitura) nem que `todas` e sem `todas` com o mesmo `inicio` não se juntam. Hoje o segundo caso está garantido por `limite` (null contra número) estar na chave; o `todas` na chave é redundante, mas é uma defesa barata.
- Log da pesquisa `todas` (só a fila é conferida no teste de log).
- Tamanho do envelope no MCP (A-01).

## Mutações (cópia em scratchpad, original intacto)

Rodadas contra `test/integration/consultas-todas.spec.ts` (30 testes):

| # | Mutação | Resultado |
|---|---------|-----------|
| M1 | `proximo = posicao + indice` (off-by-one no teto de itens) | **Pega**: 4 falhas (continuação fila/pesquisa/REST repete item; teto no fim) |
| M2 | `paradaPorPrazo` sem a guarda `!params.todas` (parcial também sem `todas`) | **Pega**: "sem todas o prazo estourado continua sendo REDE" |
| M3 | `paradaPorPrazo` sem `paginasLidas === 0` (parcial vazio antes da 1ª página) | **Pega**: "prazo vencido ANTES de qualquer página... REDE" |
| M4 | `catch` da leitura sem o ramo de parcial por prazo (só o caminho entre páginas) | **Pega**: prazo fila e pesquisa |
| M5 (extra) | teto de itens marca `incompleto` mesmo com `proximoInicio` nulo | **Pega**: "chegar exatamente ao teto... NÃO é incompleto" |
| M6 (extra) | chave de compartilhamento sem `limite` e sem `todas` | Passa na suíte do `todas`; **pega** em `consultas-controle`/`sessao-fluxo` (2 falhas). Só tirar `todas` é redundante (ver A-07) |

## Conferido e correto

- **Sem `todas` nada muda:** `paradaPorPrazo` só age com `params.todas`; prazo sem `todas` continua `REDE` "leitura excedeu o tempo" (M2 provou o teste); `limite` padrão 50 e teto 200 seguem `normalizarPaginacao`; campos novos (`todas`, `itens_devolvidos`, `teto_itens`, `parada_por`) só entram no envelope com `todas`; `todas:false` dá dados e requisições iguais a omitir (caso de uso, REST e MCP).
- **`proximo_inicio` no parcial:** teto de itens = posição do item seguinte ao último aceito (`posicao + indice + 1`); teto de páginas e prazo = `posicao` depois da última página **completa**. Uma página abortada no meio não conta, então nada se perde nem se repete (M1 e o teste de prazo com `paginas_lidas * 200`).
- **Prazo:** parcial só com pelo menos 1 página lida, sessão íntegra e prazo realmente vencido (`estourou && !sinalExterno.aborted`); cancelamento externo continua erro (testado). O `setTimeout` do prazo e o `setInterval` do vigia são limpos no `finally` também no retorno parcial; os dois têm `unref`.
- **Mutex e vaga:** `vez.liberar()` no `finally` interno; o retorno parcial sai pelo `try`, então libera. A vaga do semáforo do gateway é liberada pelo `semaforo.executar`, e o abort vira `cancelada()` (`REDE`) em `naVaga` e em `requisitar`, que é exatamente o que o ramo de parcial do `catch` espera. `emAndamento` volta a 0 depois do prazo e do cancelamento (testado); pico de 1 requisição com fila e pesquisa `todas` juntas (testado).
- **Teto de 1000 no fim exato:** `proximo >= total` dá `null` e não `incompleto` (M5).
- **Filtros com `todas`:** atendente (servidor e defesa no cliente), `somenteAbertos`, `statusAceitos` e filtros de texto passam por `aceita()` igual ao modo por partes; testados na fila e na pesquisa.
- **Schema:** `z.boolean().optional()` em `schemaFila` e `schemaPesquisa`; `superRefine` recusa `todas:true` + `limite` com campos `['todas','limite']`; `todas:false` + `limite` passa; texto, número, nulo e lista recusados sem chamar o SoftDesk.
- **Query REST:** só `'true'`/`'false'` viram booleano; `TRUE`, `1`, vazio e repetido (`todas=true&todas=true`, que vira lista) caem no schema e dão 400 `FILTRO_INVALIDO` (testado). O MCP serializa `todas` com `String(v)`, coerente com o controller.
- **tools/list:** `todas` boolean só nas duas tools, `additionalProperties: false` mantido, descrição cita os tetos e a recusa com `limite`; paridade MCP×REST testada com `todas`, com `inicio` e sem `todas`.
- **Logs:** `camposFim` acrescenta só `todas` e `parada_por` (ambos na lista de permissão); nenhum título, nome ou valor de filtro (testado na fila). `filtros_usados` continua só com nomes; `todas` não aparece nele porque é retirado antes (`pesquisar.use-case.ts:87`).
- **Container:** `maxPaginasTodas` e `maxItensTodas` vão para os dois casos de uso, com padrão 15 e 1000.
