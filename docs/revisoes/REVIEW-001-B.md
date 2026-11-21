# REVIEW-001-B — Lógica de negócio e aderência (revisor B)

| Campo | Valor |
|-------|-------|
| Branch | `feat/softdesk-local-mvp` (sem commit) |
| Data | 2026-11-19 |
| Base | SPEC-001 v0.8, ARCH-001 v0.6 (§6 F3–F6, §7.3–7.4, §16, §17), ADR-001..009, protótipo `probe-sessao.mjs` |
| Escopo | `src/core/domain/**`, casos de uso `listar-fila`, `pesquisar`, `obter-chamado`, `verificar-saude`, serviços `varredura`, `operacao`, `alerta-contrato`, `saude-automatica`, `src/infraestructure/softdesk/*`, `src/shared/**`, `src/cli-capturar-forma.ts` |
| Suíte | `jest test/unit test/integration`: 38 suítes, 624 ok, 1 pulado. `npm run build` ok |

Resumo: **0 BLOQUEANTE, 1 ALTO, 4 MÉDIO, 5 BAIXO, 6 NIT.** Nenhum bug que quebre o fluxo principal; os achados relevantes estão na calibragem do contrato dourado (alarme falso de deriva) e em pontos de aderência a RF-07 e §17.

## Achados

### 1. ALTO — Contrato dourado calibrado com 2 itens: risco alto de `aviso_deriva` falso em produção

- **Onde:** `src/infraestructure/softdesk/contrato-dourado.json` (campos `usado`: `nm_usuario`, `ds_prioridade`, `ds_tipo_chamado`, `da_chamado`, `ha_chamado`, `tt_chamado`, `ds_status`, `qtd_interacoes`, todos com um único tipo); `src/cli-capturar-forma.ts:35` (`LIMITE_CAPTURA = 10`).
- **Evidência:** o protótipo grava a forma só de `lista[0]` (`probe-sessao.mjs:208`, `forma(lista[0])`). As duas capturas (`forma-softdesk.json` e `-v2`) dão, portanto, **2 itens** no total. O próprio ARCH §17 já registra que as capturas mostraram campos que ora vêm nulos, ora texto. Com 2 amostras não dá para saber se `ds_tipo_chamado`, `ds_prioridade` ou `nm_usuario` vêm nulos em parte dos chamados (por exemplo status 0 "Novo (sem categoria)" ou um solicitante inativado).
- **Cenário de falha:** basta 1 item entre os 3.000 lidos com `ds_tipo_chamado: null` para que `conferirLista` o marque como `usado`. A varredura junta a deriva de todas as páginas (`varredura.ts:160`), e **toda** resposta da fila passa a sair com `aviso_deriva`, que a skill mostra em destaque antes de tudo (ARCH §11). Confirmado em teste descartável: `conferirLista([{...item, ds_tipo_chamado: null}])` devolve `usados: ['ds_tipo_chamado']`. Resultado: o usuário se acostuma com o alarme e a camada de mitigação (ADR-009) perde a função. O mesmo vale para os essenciais (`cd_atendente: [number]`): na captura sem filtro, o não atribuído veio como `0`, o que reduz o risco, mas um único `null` derrubaria a página inteira com `CONTRATO_ROTA_MUDOU` e um balão.
- **Correção sugerida:** antes de liberar, regerar o dourado com uma amostra real grande e variada: `LIMITE_CAPTURA` de 200, mais de uma página, uma pesquisa sem filtro de atendente (chamados novos e não atribuídos) e uma com status fechado. Fazer isso no fragmento 7 junto com a validação manual. Opcional: deixar a captura aceitar `--limite`.

### 2. MÉDIO — Saúde acusa `tipo_trocado` falso em campos "outro" que o dourado só conhece como `null`

- **Onde:** `src/infraestructure/softdesk/contrato.ts:267-287` (`diagnosticarLista` usa todas as marcas); `softdesk-http.gateway.ts:190-195`; `verificar-saude.use-case.ts:61`.
- **Evidência:** no dourado, `hr_fechamento_chamado`, `hr_resolucao_chamado`, `dt_termino_previsto_chamado`, `dt_tarefas_encerradas`, `hr_agendamento_*`, `hr_suspensao_chamado`, `flag_encaminhado` e outros têm `tipos: ["null"]`, porque vieram de chamados abertos. Teste descartável com um chamado encerrado (`hr_fechamento_chamado: '10:00'`): `diagnosticarLista` devolve `tipo_trocado: ["dt_termino_previsto_chamado","hr_fechamento_chamado","hr_resolucao_chamado"]`.
- **Cenário:** a saúde com sessão lê o chamado mais novo do atendente (`limite: 1`). Na captura v2, 19 dos 50 primeiros estavam fechados (14 com status 2 e 5 com status 6). Em boa parte das vezes, `softdesk_saude` vai responder `ok: true` com `deriva.tipo_trocado` cheio de nomes, sugerindo uma mudança que não houve. Isso atrapalha justamente a ferramenta de diagnóstico do roteiro "O SoftDesk mudou".
- **Correção:** tratar `["null"]` isolado como "tipo desconhecido" (não reportar troca, ou reportar à parte como "visto pela primeira vez com valor"). Outro caminho: a correção do achado 1 enriquece o dourado com chamados fechados.

### 3. MÉDIO — `capturar-forma --atualizar` aceita em silêncio troca de tipo de campo essencial ou usado e desliga a proteção

- **Onde:** `src/infraestructure/softdesk/forma.ts:222-231` (`unirNoDourado` acrescenta o tipo observado a qualquer campo, mantendo a marca); `src/cli-capturar-forma.ts:141-146`.
- **Cenário confirmado:** a forma observada traz `st_chamado: ['string']` e o usuário roda `--atualizar`. O dourado passa a ter `st_chamado: ['number','string']`, e `conferirLista` com `st_chamado: '1'` deixa de acusar o essencial. Depois disso, `fila.service.ts:72` descarta todo item cujo `st_chamado` não é número: a fila volta **vazia, sem erro e sem aviso**. Com um `usado` acontece o mesmo: `tt_chamado: ['string','number']` faz `paraBasico` devolver `titulo: null` e não sai `aviso_deriva`. O roteiro (ARCH §17 camada 7) manda ajustar o mapeamento antes, mas a CLI só avisa sobre campos novos.
- **Correção:** em `--atualizar`, recusar (ou exigir `--aceitar-troca-essencial`) a união de tipos em campos `essencial` e `usado`, e imprimir em destaque quais foram. No mínimo, avisar que o mapeamento de `chamado.ts` e `fila.service.ts` precisa aceitar o novo tipo.

### 4. MÉDIO — Deriva não notifica o Windows nem vai para `ultimo_alerta`; a saúde automática não registra o diagnóstico (RF-07, ARCH §17 camadas 4 e 5)

- **Onde:** `src/core/application/services/alerta-contrato.ts:59-72` (`avisoDeriva` só registra `warn`); `src/core/application/services/saude-automatica.ts:50-54` (registra só `modo` e `duracao_ms`).
- **Divergência:** SPEC RF-07 pede "notificar o Windows quando ocorrer `LAYOUT_LOGIN_MUDOU`, `CONTRATO_ROTA_MUDOU` **ou um aviso de deriva do contrato**". ARCH §17 camada 5 diz que o resultado da saúde automática "vai para o log e para `ultimo_alerta`". Hoje a deriva não gera balão nem `ultimo_alerta`, e a saúde automática descarta `deriva`/`aviso_deriva`. Só o erro de contrato chega ao `ultimo_alerta`.
- **Cenário:** um campo usado é renomeado e o primeiro login roda a saúde automática. Nada aparece em `softdesk_estado_sessao` e nenhum balão é exibido; o usuário só percebe se ler o envelope de uma consulta.
- **Correção:** em `avisoDeriva`, chamar `balao('DERIVA', …)` com o mesmo limite de 10 min e guardar um `ultimo_alerta` de deriva (ou um campo `ultima_deriva`). Na `SaudeAutomatica`, registrar `campos_deriva` (só nomes) quando `r.aviso_deriva` ou `r.dados.deriva` existirem. Combinar com o achado 2 para não notificar alarme falso.

### 5. MÉDIO — O prazo de 90 s não conta a espera na fila de varreduras; a resposta pode passar de 150 s e o MCP responde `SERVICO_INDISPONIVEL`

- **Onde:** `src/core/application/services/varredura.ts:83-85` e `134` (o temporizador só é armado dentro de `ler`, depois de `esperarVez`). O teste `consultas-controle.spec.ts:331` fixa esse comportamento.
- **Cenário:** dois chats pedem a fila com parâmetros diferentes (`inicio: 0` e `inicio: 50`). A segunda leitura espera até 90 s pela vez e depois lê por até 90 s: até 180 s. O cliente MCP corta em 150 s (`cliente-servico.ts:14`) e cai em `tipo: 'falha'`, e o MCP responde `SERVICO_INDISPONIVEL` ("não foi possível iniciar o serviço"), mensagem enganosa. RNF-05 fala em "prazo total de 90 s" por leitura, e a ARCH (§6 F3) não diz que a espera fica fora.
- **Correção:** armar o prazo na chegada do pedido (antes de `esperarVez`) e, na espera, rejeitar com `REDE`/`MENSAGEM_PRAZO`. Outra opção: limitar a espera a `prazo − margem`. Registrar a decisão na ARCH se a escolha atual for mantida.

### 6. BAIXO — Leitura compartilhada da fila não leva a sessão na chave: quem entra depois pode derrubar uma sessão nova e válida

- **Onde:** `src/core/application/useCases/listar-fila.use-case.ts:112` (chave = início, limite e textos); `exigir-sessao.ts:32-36`; a vigia da sessão só começa em `varredura.ts:138`, depois da vez.
- **Cenário:** a leitura L (sessão S1) está na fila de varreduras. S1 expira (por exemplo, numa pesquisa avulsa), o usuário entra (S2) e pede a mesma fila. O pedido B tem `atual = S2` e se junta a L (mesma chave). Quando L ganha a vez, `ler` vê `obter() !== S1` e lança `SESSAO_EXPIRADA`. No `exigirSessao` de B, `outra === atual` (S2): ele **descarta S2**, que é válida, e reabre a janela. A janela de tempo é estreita (até 90 s na fila), mas o efeito é um novo login sem motivo.
- **Correção:** incluir a identidade da sessão na chave (por exemplo, um `WeakMap<SessaoHttp, Map<chave, Leitura>>`), ou fazer a varredura lançar um erro interno distinto quando a sessão "caiu por fora", que o `exigirSessao` não trate como expiração da sessão atual.

### 7. BAIXO — `limite_pedido` de quem criou a leitura vaza para quem a compartilha

- **Onde:** `listar-fila.use-case.ts:112` (a chave usa `limite_aplicado`) e `:183-185` (`limite_pedido` vem do `pag` do criador).
- **Cenário:** A pede `limite: 500` e B pede `limite: 200` ao mesmo tempo. A chave é a mesma, e B recebe `limite_pedido: 500`.
- **Correção:** montar `inicio`, `limite_aplicado` e `limite_pedido` com o `pag` de cada chamador, fora da promessa compartilhada (ou pôr `limite_pedido` na chave).

### 8. BAIXO — Nomes de status não aceitam o texto que o próprio SoftDesk mostra

- **Onde:** `src/core/domain/entities/status.ts:13-28` e `:76`.
- **Evidência:** na captura v2, o `ds_status` do código 6 veio como "Fechado", mas o catálogo tem "Fechado por decurso de prazo". O código 0 é "Novo (sem categoria)". Pedidos naturais como `status: ["Fechado"]` ou `["Novo"]` dão `FILTRO_INVALIDO`, embora o usuário esteja copiando o que vê na tela ou no campo `status` da própria lista.
- **Correção:** aceitar apelidos (`ds_status` observado: "Fechado" → 6, "Novo" → 0), ou casar por prefixo único. Documentar em §16 A.3.

### 9. BAIXO — Aviso de deriva registrado em dobro e uma vez por página

- **Onde:** `softdesk-http.gateway.ts:185-189` (um `warn softdesk_deriva` a cada página) e `alerta-contrato.ts:63` (outro por operação).
- **Cenário:** com uma deriva real, cada leitura da fila gera até 16 `warn` iguais. Junto com o achado 1, o log enche de ruído.
- **Correção:** deixar só o log da operação (`alerta-contrato`) e tirar o do gateway, ou limitar o do gateway a uma vez por processo e por campo, como já se faz com campo novo.

### 10. BAIXO — Expiração em JSON 200 vira `CONTRATO_ROTA_MUDOU` (R2), sem sinal na evidência

- **Onde:** `contrato.ts:163-169`.
- **Observação:** o login do SoftDesk responde em JSON com `status` e `rota` (§16 A.1). É plausível que uma rota JSON com sessão vencida responda 200 `{status:false, rota:'/login'}`. Isso cai em `CONTRATO_ROTA_MUDOU` com destaque e balão. O risco já é conhecido (R2), mas a `evidencia` não mostra que o JSON tinha `status`/`rota`, e quem ler o log não consegue separar os casos.
- **Correção:** acrescentar à evidência só os **nomes** das chaves de topo quando não houver `lista`, ou já tratar JSON sem `lista` com `status === false` e `rota` terminando em `/login` como `SESSAO_EXPIRADA`, a confirmar no fragmento 7 (Q-02).

### 11. NIT — Código morto e casts frouxos

- `semaforo.ts:9,47`: `Espera.falhar` nunca é chamado.
- `softdesk-http.gateway.ts:183`: `throw ERRO_INTERNO` inalcançável. Dá para reorganizar para o TypeScript estreitar o tipo sem esse ramo.
- `softdesk-http.gateway.ts:341`: `campos as unknown as Parameters<…>`. O gateway contorna o tipo `CamposLog`; a lista de permissão do adaptador segura, mas o tipo deixa de proteger.
- `listar-fila.use-case.ts:120` (`undefined as unknown as Promise`) e `:182` (cast redundante de `itens`).

### 12. NIT — `diagnosticarLista` roda em toda página e é descartado na fila e na pesquisa

`softdesk-http.gateway.ts:190`: até 15 × 200 itens × ~70 campos por leitura, usado só pela saúde. Calcular só quando pedido (por exemplo, opção `diagnosticar` no filtro ou método separado).

### 13. NIT — `palavra_chave: ""` conta como filtro "não confirmado"

`filtro-pesquisa.ts:52-56`: string vazia é "usado". `filtros_nao_confirmados` traz `palavra_chave` sem filtro real. Tratar `''` como não usado.

### 14. NIT — Filtro de texto casa por substring, não por palavra

`filtro-texto.ts:71`: `prioridade_nome: "alta"` casa "Muito alta"; `solicitante_nome: "ana"` casa "Mariana". Aderente à letra de RN-16 ("todas as palavras pedidas precisam aparecer no campo"), mas vale registrar na skill, ou casar por início de palavra.

### 15. NIT — `GET /login` não segue redirecionamento para outra origem (o protótipo seguia)

`softdesk-http.gateway.ts:231-238`. É escolha segura, porque o jar não tem domínio. Se a produção redirecionar `/login` para outro host (SSO), o serviço acusa `LAYOUT_LOGIN_MUDOU` onde o protótipo funcionava. Conferir na validação manual (o protótipo registrou o `GET /login` direto?).

### 16. NIT — Comentário de teste contradiz a asserção

`test/integration/consultas-controle.spec.ts:335` fala em "3 páginas", mas a asserção é `paginas_lidas` 2 (400 itens / 200).

## Testes frouxos ou adaptados ao código (no escopo B)

| # | Teste | Problema |
|---|-------|----------|
| T1 | `test/simulador/dados.ts:15-30` (`montarItem`) e tudo o que o usa (`saude-diagnostico`, `consultas-*`, `forma.spec`) | O item do simulador é gerado **do próprio dourado** (primeiro tipo não nulo). Um chamado fechado sai com `hr_fechamento_chamado: null`. Nenhum teste consegue revelar alarme falso de deriva (achados 1 e 2): o simulador concorda com o contrato por construção. Sugestão: uma massa "realista" com chamados fechados (datas preenchidas) e usados nulos, e um teste que exija saúde sem deriva para ela. |
| T2 | `consultas-controle.spec.ts:331` | Fixa a escolha de não contar a espera no prazo (achado 5), que não está na SPEC nem na ARCH. O teste passaria do mesmo jeito se o prazo ficasse ilimitado na fila. |
| T3 | `forma.spec.ts:131-147` | Exige que `unirNoDourado` una `tt_chamado` (usado) com `number` sem nenhum aviso. Valida o comportamento do achado 3 em vez de protegê-lo. |
| T4 | `contrato.spec.ts:351` | Confirma que `compararItem` reporta desvios de "outro", mas nenhum teste confere que um chamado fechado típico **não** gera deriva na saúde. |
| T5 | (ausente) | Nenhum teste de compartilhamento de leitura com `limite_pedido` diferente (achado 7) nem com troca de sessão enquanto a leitura espera a vez (achado 6). |

## Conferido e correto

- **Fio do protótipo:** `GET /login` (até 5 saltos, mesma origem) → `POST /login` com `Content-Type`/`Accept: application/json`, `X-XSRF-TOKEN` com `decodeURIComponent` (com `try`), `Referer`, cookies do jar e o corpo `{lg_usuario, sh_usuario, tp_usuario, resposta:'', redirect_by_url:''}` idêntico. Parâmetros fixos de `/chamado/json` iguais aos do protótipo, na mesma ordem, com `start`/`limit` e listas `campo[]=` acrescentadas ao fim. Pesquisa sem `Accept`, como no protótipo.
- **Redirecionamento:** `redirect: 'manual'` em todas as chamadas. O `POST /login` e a pesquisa **nunca** seguem redirecionamento; só o `GET /login` segue, dentro da origem.
- **Cookies:** `Set-Cookie` guardado de toda resposta, inclusive nos saltos e nas pesquisas, escrevendo no mapa da sessão (renovação). Apaga com `Max-Age<=0`/`Expires` vencido. `toJSON`/`inspect` mascarados.
- **Classificação §7.4, na ordem:** 5xx → `REDE` primeiro; página de login ≠200 ou sem XSRF → `LAYOUT`; `POST` 401 → `CREDENCIAL`; não JSON ou sem `status` booleano → `LAYOUT`; `status:false` → `CREDENCIAL`; pesquisa 401/403 → `SESSAO_EXPIRADA`; 3xx com `Location` terminando em `/login` → `SESSAO_EXPIRADA`; o resto → `CONTRATO_ROTA_MUDOU`. Falha de `fetch` ou timeout de 20 s → `REDE`; cancelamento → `REDE` com a mensagem de cancelamento. Evidência sem corpo e sem query.
- **F3:** `proximo_inicio = posicao + indice + 1` ao fechar o limite (`null` se ≥ total); `posicao += lista.length`; fim por página curta ou `posicao >= total`; teto de 15 páginas → `incompleto` com `proximo_inicio = posicao`; deduplicação por `cd_chamado` dentro da chamada; defesa por `cd_atendente`; fechados {2,3,4,6}; `total_softdesk` da primeira página. Conferi os limites (limite fechando no último item, 15ª página esgotando o SoftDesk, `inicio` além do total) e não achei *off-by-one*.
- **Varredura:** uma por vez (FIFO), prazo com `REDE`/`MENSAGEM_PRAZO`, vigia da sessão, `cancelarTodas`, temporizadores limpos em `finally`, vez liberada em todo caminho. **Semáforo:** 2 vagas FIFO; a vaga volta em erro e em cancelamento; quem desiste na espera sai da fila; não achei vazamento.
- **Compartilhamento da fila:** leitura idêntica compartilhada; cancelada só quando todos desistem; tirada do mapa ao terminar; sem rejeição não tratada (os *handlers* ficam presos na promessa derivada do `finally`).
- **F4:** validação estrita antes da sessão (zero requisições em erro); `{1}` → `pesq_st_chamado[]=EM_ATENDIMENTO`, qualquer outro conjunto no cliente com `filtro_status_no_cliente`; filtros de texto no cliente; `total = treeview.total` antes do filtro; teto de 200 com `limite_pedido`/`limite_aplicado`; `proximo_inicio: null` sem filtro no cliente; `filtros_nao_confirmados` corretos.
- **F5:** pesquisa por código com `limite: 10` e igualdade exata; `NAO_ENCONTRADO`. **F6:** sem sessão só `GET /login`, sem abrir janela; com sessão, pesquisa mínima.
- **RN-14/F7:** `exigirSessao` descarta só se a sessão ainda é a mesma; as seguintes recebem `AGUARDANDO_LOGIN`; sem relogin nem repetição.
- **RN-16:** `normalizarTexto` (NFD, sem marcas, minúsculas, espaços), todas as palavras e todos os filtros (E); campo ausente não casa.
- **RN-17:** essencial → `CONTRATO_ROTA_MUDOU` com `campos`; usado → `null` em `paraBasico` e `aviso_deriva`; campo novo → `info` uma vez por processo; logs só com nomes.
- **Envelope §7.3:** `alerta` só nos dois códigos de destaque, `janela` só com sessão, `aviso_deriva` só com campos, `ERRO_INTERNO` sem texto da exceção. **Schemas:** `z.strictObject` em todas as entradas (`senha` extra → `FILTRO_INVALIDO`, só com nomes de campo).
- **Somente leitura (RN-01):** o gateway só toca `GET /login`, `POST /login` e `GET /chamado/json`.
