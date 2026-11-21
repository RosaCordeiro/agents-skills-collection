# ACEITE-001 — Matriz de aceite do SoftDesk Local (SPEC-001 v0.10 / ARCH-001 v0.8)

- **Data:** 2026-11-21 (matriz criada em 2026-11-19; reconferida em 2026-11-21 após a emenda)
- **Emenda de 2026-11-21 (SPEC v0.9, ARCH v0.7, ADR-009):** só registrou a tolerância a `null` em campo usado (RN-17). **Não alterou comportamento nem testes**: o código já tinha a tolerância desde a correção do achado B-1. Os 697 testes foram executados com o código atual; a matriz continua descrevendo a versão que será validada.
- **Ajuste de 2026-11-21 (SPEC v0.10, ARCH v0.8, ADR-005; emendado após a REVIEW-003 com teto de 300 itens e parada por tamanho de 60.000 bytes):** modo `todas` na fila e na pesquisa (pedido do usuário depois da validação em produção). Acrescenta VAL-35 a VAL-37 e CA-31 a CA-34; não altera o comportamento sem `todas`.
- **Última execução (após o modo `todas` e a correção da REVIEW-003):** `npm run build` ok; `npx jest --runInBand` (2 rodadas seguidas): **45 suítes passaram, 751 testes passaram, 1 pulado, 0 falhas**, com o serviço real do usuário rodando (o teste de processos o ignora).
- **Execução anterior (antes do modo `todas`):** `npm run build` ok; `npx jest --runInBand` (2 rodadas seguidas): **42 suítes passaram, 697 testes passaram, 1 pulado, 0 falhas** (~90 s, Windows, PowerShell); depois, a correção de `Origin: null` da janela de login levou a 698.
- **Único teste pulado (`integration/container-gateway.spec.ts`, "resposta que nunca chega → REDE depois dos 20 s reais"; lento por desenho, o mesmo cenário roda com prazo reduzido em VAL-09) e como rodá-lo (opcional):** `$env:SOFTDESK_TESTE_LENTO='1'; npm test` (PowerShell; variável lida em `test/integration/container-gateway.spec.ts`).
- **Como ler:** a coluna "Testes" cita o arquivo e o trecho do nome do `it`. Os nomes foram tirados da lista de aprovados da execução acima e os testes de maior risco (VAL-01/10/19, VAL-03, VAL-28 e os da REVIEW-002) foram abertos e lidos. Os demais foram conferidos pelo nome completo e pelo agrupamento (`describe`), não linha a linha. Onde isso limita a certeza, a observação diz.
- **Status:** COBERTO (teste automático cobre o critério inteiro), PARCIAL (falta parte, dita na linha), MANUAL (só se valida em produção ou à mão), NÃO COBERTO.
- Resultado de todo teste citado: **passou**, salvo o pulado acima.
- **Revisão dos testes (REVIEW-TESTES-001):** as linhas VAL-05, VAL-08, VAL-16, VAL-27, VAL-28, RNF-02, CA-02 e CA-30 foram reclassificadas e os testes que faltavam foram escritos; as mutações que sobreviveram (janela em 0.0.0.0, token do REST fixo, prazo do MCP de 60 s) agora são pegas. Observações que seguem valendo: o cenário "rede" do VAL-01 é HTTP 500 e não falha de conexão (REVIEW-TESTES-001 achado 10); VAL-29/CA-25 toleram `null` em campo usado por decisão do usuário, já registrada na SPEC v0.9 (RN-17) em 2026-11-21 (achado 7). A tabela de todos os achados das revisões está na seção 6.

## 1. VAL-01 a VAL-37

| VAL | Critério (resumo) | Arquivo(s) e testes | Status |
|-----|-------------------|---------------------|--------|
| VAL-01 | Senha e cookies ausentes de log, stdout/stderr, respostas e arquivos (sucesso, senha errada, rede) | `e2e/operacao-segredos.spec.ts` "login certo, senha errada e rede fora: nenhuma senha, cookie, título, nome ou usuário em log, stdout, stderr, respostas ou arquivos" (lido: 3 logins pelo MCP, varre cookies emitidos pelo simulador); `integration/janela-login.spec.ts` "a senha nunca aparece em log, resposta, estado, resumo ou erro"; `integration/sessao-fluxo.spec.ts` "nenhuma senha, usuário, cookie ou token de janela em log ao longo do fluxo completo"; `integration/rest-servico.spec.ts` "senha sentinela, cookies do simulador e token da janela fora de respostas" | COBERTO |
| VAL-02 | Fila só do atendente 393 e só abertos | `unit/fila.service.spec.ts` "uma leitura grande devolve só os abertos do atendente", "descarta item de outro atendente e de status fechado mesmo que o servidor os devolva"; `integration/consultas-fila-pesquisa.spec.ts` "VAL-12 ... fila só do atendente configurado, mesmo se o servidor ignorar o filtro" | COBERTO |
| VAL-03 | Pesquisa paginada: total do SoftDesk, sem repetidos, limite 500 vira 200 | `integration/consultas-fila-pesquisa.spec.ts` "limite 500 → limite_aplicado 200 (e 200 vai ao servidor); página 2 sem repetidos; total do simulador" (lido: confere `limit=200` na requisição, páginas 1 e 2 disjuntas e totais); "limite padrão é 50..." | COBERTO |
| VAL-04 | Mais de 15 páginas só de abertos: `incompleto: true` e `proximo_inicio` | `integration/consultas-fila-pesquisa.spec.ts` "mais de 3.000 chamados sem abertos nas 15 primeiras páginas → incompleto, proximo_inicio e 15 ..."; "a pesquisa por status no cliente também marca incompleto ao cobrir só 3.000"; `unit/fila.service.spec.ts` "VAL-04 unit: 15 páginas lidas sem juntar o limite → incompleto..." | COBERTO |
| VAL-05 | Janela protegida: Host, token, token reusado, token vencido | `integration/janela-login.spec.ts` (grupo "VAL-05: proteções da janela", 11 testes): Host errado GET e POST, Origin, token errado/ausente/de outro tamanho, token reusado, vencido (GET e POST), temporizador de 5 min sem requisição, corpo > 4 KB (com e sem Content-Length); RN-10 "o servidor da janela escuta só em 127.0.0.1" (endereço real do socket, via `escutaEm()`, e nenhuma interface IPv4 externa conecta; a mutação janela em 0.0.0.0 agora falha) | COBERTO |
| VAL-06 | Login mudou: sem XSRF e login em HTML → `LAYOUT_LOGIN_MUDOU` | `unit/contrato.spec.ts` (grupo `classificarLogin`, 22 casos); `integration/softdesk-http.gateway.login.spec.ts` "página de login sem XSRF-TOKEN → LAYOUT_LOGIN_MUDOU ... sem tentar o POST", "resposta HTML ao POST /login → LAYOUT_LOGIN_MUDOU", redirecionamentos (5 saltos, outra origem não seguida); `integration/janela-login.spec.ts` "falha html → página só com o estado LAYOUT_LOGIN_MUDOU" | COBERTO |
| VAL-07 | Rota mudou: JSON sem `lista` → `CONTRATO_ROTA_MUDOU` | `unit/contrato.spec.ts` (grupo `classificarPesquisa`, 18 casos); `integration/softdesk-http.gateway.pesquisa.spec.ts` "sem_lista", "sem_total", "resposta HTML", "a quebra de contrato nunca derruba a sessão: o jar fica intacto" | COBERTO |
| VAL-08 | Sessão expirada: `SESSAO_EXPIRADA`, janela abre, sem repetição | `integration/consultas-controle.spec.ts` "sessão expirada no meio de uma consulta → SESSAO_EXPIRADA, janela aberta" (:235) e "sessão descartada durante a leitura" (:469), que passam pela fila real (`Varredura`); `integration/rest-servico.spec.ts` 401/403 pelo REST (:107); `integration/sessao-fluxo.spec.ts` (caso de uso provisório, só apoio: variantes 401 e 403, "duas consultas simultâneas sobre sessão expirada abrem uma só janela"); `integration/softdesk-http.gateway.pesquisa.spec.ts` "redirecionamento para /login → SESSAO_EXPIRADA, sem seguir o redirecionamento" | COBERTO |
| VAL-09 | HTTP 500 e timeout → `REDE` | `integration/softdesk-http.gateway.pesquisa.spec.ts` "HTTP 500 → REDE", "resposta lenta além do prazo (reduzido por parâmetro) → REDE, sem esperar a resposta", "servidor fora do ar → REDE", cancelamento; `integration/softdesk-http.gateway.login.spec.ts` (500 no GET e no POST, conexão recusada); `integration/container-gateway.spec.ts` "o prazo da chamada é reduzido pelo container". O caso dos 20 s reais está pulado (ver RNF-05) | COBERTO |
| VAL-10 | Somente leitura: só GET /login, POST /login, GET /chamado/json | `e2e/operacao-segredos.spec.ts` (lido: compara o registro do simulador com `ROTAS_PERMITIDAS`); `e2e/servico-processo.spec.ts` "só GET /login ao SoftDesk (RN-01)"; `integration/softdesk-http.gateway.pesquisa.spec.ts` "a sequência login → pesquisas só toca as três rotas, com os métodos certos"; `integration/simulador.spec.ts` "só tem três rotas; qualquer outra responde 404 e fica registrada" | COBERTO |
| VAL-11 | REST sem token → 401 (e proteções) | `integration/rest-protecao.spec.ts` (grupo "VAL-11", 15 testes): sem token, errado (mesmo tamanho, curto, longo, vazio), não Bearer, Host errado, Origin, sem CORS, bind só em 127.0.0.1, corpo > 16 KB | COBERTO |
| VAL-12 | Fila por partes: todos os abertos, sem repetidos e sem fechados | `integration/consultas-fila-pesquisa.spec.ts` "leituras repetidas com proximo_inicio devolvem todos os abertos, s...", "chamado novo durante a leitura desloca a página: o repetido é de..."; `unit/fila.service.spec.ts` "continuar com proximo_inicio até null traz todos os abertos, sem repetidos nem fechados (CA-05)" | COBERTO |
| VAL-13 | `CREDENCIAL` (status falso, 401) e `SESSAO_EXPIRADA` (401, 403) | `integration/rest-servico.spec.ts` (4 testes "VAL-13 (REST)"); `integration/softdesk-http.gateway.login.spec.ts` "status falso → CREDENCIAL, sem destaque, mensagem fixa", "HTTP 401 no POST → CREDENCIAL"; `integration/softdesk-http.gateway.pesquisa.spec.ts` 401 e 403 → `SESSAO_EXPIRADA` | COBERTO |
| VAL-14 | Janela única; "entrar" sem digitar → `AGUARDANDO_LOGIN` com a janela aberta | `integration/sessao-fluxo.spec.ts` (grupo "VAL-14", 4 testes): duas consultas seguidas (abridor chamado uma vez), simultâneas, "entrar com espera reduzida", consulta e entrar juntos. A espera de 120 s é reduzida por parâmetro | COBERTO |
| VAL-15 | Nenhuma tool/rota aceita senha; campo extra rejeitado; nada gravado | `e2e/mcp-processo.spec.ts` "tools/list traz as sete tools, schema estrito e nenhum campo de credencial", campo `senha` extra nas 7 tools → `FILTRO_INVALIDO` sem chamar o serviço, "varredura de vazamento da senha ... ambiente, arquivos da pasta, saídas e stderr do MCP"; `integration/rest-protecao.spec.ts` "campo senha no corpo ou na query é recusado", "os schemas de entrada não têm campo de credencial", "o ambiente do processo e a pasta do serviço não guardam a senha de teste"; `unit/entrada.schemas.spec.ts` | COBERTO |
| VAL-16 | Senha não retida: sem novo `POST /login` após expirar; janela abre | `integration/consultas-controle.spec.ts` "sessão expirada no meio de uma consulta → SESSAO_EXPIRADA, janela aberta" (:235) e "sessão descartada durante a leitura" (:469) e `integration/rest-servico.spec.ts` (:107), pela fila real; `integration/sessao-fluxo.spec.ts` "após expirarSessao(): nenhum POST /login novo; a janela fica aberta", "as consultas seguintes não fazem login sozinhas, mesmo depois de muitas tentativas" (caso de uso provisório, só apoio); `integration/softdesk-http.gateway.pesquisa.spec.ts` "sessão derrubada pelo servidor ... nenhum POST /login" (3 variantes) | COBERTO |
| VAL-17 | Fila só com os 11 campos de RN-06; completo igual ao registro | `integration/consultas-fila-pesquisa.spec.ts` "cada item da fila tem só os 11 campos de RN-06, com os valores do registro", "chamado completo é igual ao registro do simulador (sem remodelar, ~66 campos)", "fila de chamado fechado do próprio atendente: o chamado completo o encontra"; `unit/chamado.spec.ts` | COBERTO |
| VAL-18 | Configuração: outro atendente e outra base URL passam a valer | `unit/config.spec.ts` (41 testes: precedência env > arquivo > padrão, faixas, schema estrito, baseUrl, diretório); `integration/rest-servico.spec.ts` "dois serviços com outro atendente e outra base URL usam cada um os seus valores" | COBERTO |
| VAL-19 | Nada em disco e logs limpos; em disco só `servico.json`, `config.json`, `logs/` | `e2e/operacao-segredos.spec.ts` (lido: lista a pasta, exige só esses três nomes, varre título, nome de pessoa, usuário, cookies e token do REST em log/stdout/stderr/arquivos); `e2e/servico-processo.spec.ts` "o diretório só tem servico.json e logs/; nenhum token em log, stdout ou stderr" | COBERTO |
| VAL-20 | `FILTRO_INVALIDO` antes de chamar o SoftDesk; `NAO_ENCONTRADO` | `integration/consultas-controle.spec.ts` (17 testes "VAL-20": limite 0/negativo/texto, início negativo, filtro vazio, atendente fora de lista, campo desconhecido, status inválido, código em texto/ausente/zero, campo `senha`, "código inexistente → NAO_ENCONTRADO", igualdade exata em `cd_chamado`), todos com zero requisições ao SoftDesk; `unit/entrada.schemas.spec.ts` | COBERTO |
| VAL-21 | Paridade MCP x REST; login de uma porta vale na outra | `e2e/mcp-processo.spec.ts` "login pelo MCP; todas as consultas devolvem o mesmo envelope no REST e no MCP (menos correlation_id)", "login pelo REST vale no MCP (sem segundo login)", "sem sessão, uma tool de consulta devolve o envelope de sessão (AGUARDANDO_LOGIN)" | COBERTO |
| VAL-22 | Saúde sem sessão: OK e `LAYOUT_LOGIN_MUDOU`, sem pedir senha | `integration/consultas-controle.spec.ts` "saúde sem sessão e simulador normal → ok, modo login, só GET /login e nenhuma janela", "saúde sem sessão e login sem XSRF → LAYOUT_LOGIN_MUDOU com destaque, alerta ...", saúde com sessão (pesquisa mínima, rota quebrada, deriva); `integration/rest-servico.spec.ts` "GET /v1/saude sem sessão confere a página de login, sem abrir janela" | COBERTO |
| VAL-23 | 5 pedidos simultâneos: no máximo 2 conexões, 1 leitura de fila por vez | `integration/consultas-controle.spec.ts` "5 pedidos simultâneos (3 filas e 2 pesquisas), simulador lento → pico ...", "duas leituras diferentes da fila ao mesmo tempo não se sobrepõem", "leitura terminada não é reaproveitada"; `integration/softdesk-http.gateway.pesquisa.spec.ts` "cinco pesquisas ao mesmo tempo com o servidor lento nunca passam de 2 simultâneas"; `unit/semaforo.spec.ts` (9) | COBERTO |
| VAL-24 | Status filtrado no cliente (ex. "Aguardando solicitante") | `integration/consultas-fila-pesquisa.spec.ts` (5 testes "VAL-24": só itens 8 juntando o limite, continuação com `proximo_inicio` até 130 itens, status {1} vai ao servidor e {1,8} não, status fora do catálogo → `FILTRO_INVALIDO`); `unit/fila.service.spec.ts` "VAL-24 unit" | COBERTO |
| VAL-25 | Filtro por nome do solicitante, sem maiúsculas e acentos | `integration/consultas-fila-pesquisa.spec.ts` "fila: "rosangela" casa os dois nomes ...", "proximo_inicio coerente", "pesquisa: mesmo filtro, marca filtro_texto_no_cliente"; `unit/filtro-texto.spec.ts` ""rosangela" casa "Rosângela Alves" e "ROSANGELA Souza", não "Rogério Lima""; `unit/fila.service.spec.ts` "VAL-25 e VAL-26 unit" | COBERTO |
| VAL-26 | Filtros de texto combinados | `integration/consultas-fila-pesquisa.spec.ts` "pesquisa: solicitante_nome + titulo_contem + status juntos", "fila: solicitante_nome + titulo_contem juntos", "prioridade_nome e tipo_nome também filtram"; `unit/filtro-texto.spec.ts` "VAL-26 unit: vários filtros juntos exigem todos" | COBERTO |
| VAL-27 | Início automático do serviço; dois MCPs, uma instância; `SERVICO_INDISPONIVEL` em 10 s | `e2e/mcp-processo.spec.ts` "serviço parado → o MCP o inicia ... (detached, sobrevive ao MCP)", "arquivo de descoberta velho ... o MCP inicia o serviço e responde", "dois MCPs ao mesmo tempo com o serviço parado → uma só instância viva"; `unit/cliente-servico.spec.ts` "executável inexistente: falha logo", "caminho do serviço inexistente: falha logo", "serviço que sobe mas nunca grava a descoberta: desiste no tempo máximo configurado", "com o serviço já respondendo, não lança outro processo", "RN-15 / VAL-27: o prazo padrão do início automático é de 10 s" (`TEMPO_MAX_INICIO_MS`); `e2e/mcp-processo.spec.ts` "RN-15 / VAL-27: serviço que não sobe (porta tomada por outro programa) → SERVICO_INDISPONIVEL em cerca de 10 s, pelo dist/mcp.js real" (a mutação 10 s → 60 s agora falha); `integration/cli-entrar.spec.ts` "serviço indisponível: código 1 com SERVICO_INDISPONIVEL e a orientação" | COBERTO |
| VAL-28 | Sem encerramento por ociosidade | `integration/rest-servico.spec.ts` (grupo "VAL-28"): "24 h de temporizadores avançados sem nenhum pedido: o serviço não pára sozinho e segue respondendo" (temporizadores falsos desde antes do início do serviço, 48 h avançadas, nenhum temporizador pendente, serviço de pé e respondendo) e "trava estática: temporizadores no código de produção ficam só nos arquivos revisados" (falha se aparecer `setTimeout`/`setInterval` novo em `src/`); o teste antigo do relógio injetado (90 dias) segue, mas só confirma que nada usa esse relógio para expirar a sessão. A prova é por ausência de temporizador de ociosidade; um temporizador inserido em `servico.ts` agora falha os dois testes | COBERTO |
| VAL-29 | Campo usado ausente: nulo, `aviso_deriva` com o nome, log só com o nome | `integration/softdesk-http.gateway.contrato.spec.ts` "sem nm_usuario → itens com o campo nulo, deriva com o nome", "tipo trocado", "a deriva é avisada em toda resposta", "o nome do campo aparece uma vez por resposta"; `integration/consultas-controle.spec.ts` "campo usado ausente: i..." (por caso de uso); `unit/contrato.spec.ts` (grupo `conferirItem`, casos "VAL-29") | COBERTO |
| VAL-30 | Campo essencial ausente ou de outro tipo → `CONTRATO_ROTA_MUDOU` com os nomes | `integration/softdesk-http.gateway.contrato.spec.ts` "sem cd_atendente → CONTRATO_ROTA_MUDOU com o nome do c...", "st_chamado em texto", "vários essenciais juntos", "essencial junto de usado: o erro vence", "o log do erro leva só os nomes (campos_deriva)"; `unit/contrato.spec.ts` "VAL-30"; `integration/rest-servico.spec.ts` "envelope de erro de contrato traz destaque e o bloco alerta" | COBERTO |
| VAL-31 | Campo novo: resposta normal, nome no log uma vez, sem valores | `integration/softdesk-http.gateway.contrato.spec.ts` "resposta normal; o nome vai ao log uma vez por processo; nenhum valor no log", "um segundo campo novo depois é logado; o primeiro não se repete"; `unit/contrato.spec.ts` "VAL-31: campo novo → só em novos" | COBERTO |
| VAL-32 | Captura e diferença: novos, ausentes, tipo trocado; só nomes e tipos | `integration/capturar-forma.spec.ts` (7 testes: igual ao dourado, simulador alterado, essencial ausente, `--atualizar` com troca de tipo → saída 3, página de 200 itens, união dos tipos, senha errada); `unit/forma.spec.ts` (16); `integration/saude-diagnostico.spec.ts` (7, inclui o da REVIEW-002 sobre campo "outro"); `integration/consultas-controle.spec.ts` "saúde com sessão, deriva de campo usado → ok com deriva só com nomes" | COBERTO |
| VAL-33 | Atividades: com a rota, lista de leitura; sem a rota, `NAO_DISPONIVEL` com orientação | `integration/rest-protecao.spec.ts` "GET /v1/chamados/{codigo}/atividades → 501 NAO_DISPONIVEL com a orientação do MCP oficial (stub do fragmento 9)"; `e2e/mcp-processo.spec.ts` só testa o campo `senha` extra em `softdesk_atividades`. `e2e/mcp-processo.spec.ts:254-255` (dentro do VAL-21) chama `softdesk_atividades` pelo MCP, compara com o REST e exige `error.code === 'NAO_DISPONIVEL'`. **Falta:** a rota de atividades não foi descoberta (Q-07), então o ramo "com a rota" não existe no código nem no simulador | PARCIAL |
| VAL-34 | Janela de login sem recurso externo | `unit/pagina.spec.ts` grupo "VAL-34" (15 testes): 5 estados sem URL, fonte, folha ou script externo; logo em data URI idêntico a `assets/logo-clamed.png`; script só no estado de entrada com nonce, sem rede; `script-src` só com nonce; `integration/janela-login.spec.ts` "GET devolve os cabeçalhos exigidos e a CSP exata com o nonce da própria página", "o nonce muda a cada resposta" | COBERTO |
| VAL-35 | Todas devolve tudo (fila e pesquisa, 3 páginas ou mais, sem repetidos nem fechados) | `integration/consultas-todas.spec.ts` grupo "VAL-35" (5 testes: fila com 450 abertas em 5 páginas, fila com filtro de texto, pesquisa por atendente passando dos 200, pesquisa com status no cliente, pesquisa com texto) e "VAL-35 REST" (fila e pesquisa pelo REST) | COBERTO |
| VAL-36 | Teto de itens (300), teto de páginas, parada por tamanho (60.000 bytes) e prazo viram `incompleto` com `proximo_inicio` e `parada_por`; continuar completa sem repetidos | `integration/consultas-todas.spec.ts` grupo "VAL-36" (11 testes: teto de itens na fila e na pesquisa, teto exatamente no fim não é incompleto, teto de páginas na fila e na pesquisa, prazo na fila e na pesquisa, prazo antes da 1ª página segue `REDE`, cancelamento é erro, fila e pesquisa `todas` juntas com pico 1) e "VAL-36 REST" (continuar com `?inicio=`); grupo "teto real de 300 itens, parada por tamanho e encadeamento" (fila com 700 abertas e tetos reais encadeada até `null`: todas, sem repetidos, cada resposta até 60.000 bytes); `unit/fila-todas.spec.ts` (6, inclui fim real e item maior que o limite) | COBERTO |
| VAL-37 | Sem `todas` nada muda; `todas` inválido e `todas` com `limite` → `FILTRO_INVALIDO` sem requisições; `tools/list`; paridade MCP x REST | `integration/consultas-todas.spec.ts` grupo "VAL-37" (envelope sem campos novos, `todas: false` igual a omitir, prazo estourado sem `todas` segue `REDE`, teto de 15 páginas sem `todas`, 4 entradas inválidas, `todas` + `limite`, `inicio`, log sem dado pessoal) e "VAL-37 REST"; `e2e/todas-mcp.spec.ts` (`tools/list` expõe `todas`, 4 entradas inválidas pelo MCP sem iniciar o serviço, paridade MCP x REST com várias páginas) | COBERTO |

## 2. Critérios de aceite (CA)

Cada CA remete aos VAL acima; só os que têm teste próprio ou parte manual estão detalhados.

| CA | Critério (resumo) | Testes | Status |
|----|-------------------|--------|--------|
| CA-01 | Sem sessão, "entrar" abre janela; após login, estado autenticada sem credenciais | `integration/sessao-fluxo.spec.ts` "abre a janela, espera o login e devolve o estado autenticado sem credenciais"; `integration/janela-login.spec.ts` "sucesso: página "Pronto", sessão autenticada, janela encerrada e um único POST /login". Navegador real e login real: ver a seção 4 | COBERTO (login real: MANUAL) |
| CA-02 | Host ou token errado → recusa | VAL-05 | COBERTO |
| CA-03 | Janela com mais de 5 min ou já usada → recusa | VAL-05 (vencido, reusado); `integration/janela-login.spec.ts` "aos 5 min o login já enviado NÃO é derrubado" (exceção deliberada, A-2) | COBERTO |
| CA-04 | Fila: só atendente 393 e status abertos, campos de RN-06 | VAL-02, VAL-17 | COBERTO |
| CA-05 | Fila por partes, sem repetidos nem fechados | VAL-12 | COBERTO |
| CA-06 | 15 páginas e ainda há itens → `incompleto` | VAL-04 | COBERTO |
| CA-07 | Pesquisa por atendente e status EM_ATENDIMENTO | `integration/consultas-fila-pesquisa.spec.ts` "status exatamente {1}, por código ou por nome, vai ao s..."; `integration/softdesk-http.gateway.pesquisa.spec.ts` "status {1} vai ao servidor como EM_ATENDIMENTO" | COBERTO |
| CA-08 | Limite acima de 200 usa 200 e informa | VAL-03; `unit/montar-query.spec.ts` "limite acima de 200 sai como 200 (CA-08)"; `unit/filtro-pesquisa.spec.ts` | COBERTO |
| CA-09 | Filtro "por convenção" é indicado | `unit/filtro-pesquisa.spec.ts` (grupo `filtrosNaoConfirmados`, 5); `integration/consultas-fila-pesquisa.spec.ts` "filtros_nao_confirmados lista só nomes fora do conjunto confirmado (CA-09)" | COBERTO |
| CA-10 | Chamado completo sem remodelar | VAL-17 | COBERTO |
| CA-11 | Código inexistente → `NAO_ENCONTRADO` | VAL-20 | COBERTO |
| CA-12 | Sem XSRF no login ou saúde → `LAYOUT_LOGIN_MUDOU` destacado | VAL-06, VAL-22 | COBERTO |
| CA-13 | Pesquisa sem `lista`/`total` → `CONTRATO_ROTA_MUDOU` destacado | VAL-07 | COBERTO |
| CA-14 | Redirecionamento para /login → `SESSAO_EXPIRADA` e janela abre | VAL-08 | COBERTO |
| CA-15 | HTTP 5xx ou conexão → `REDE`, nunca `SESSAO_EXPIRADA` | VAL-09; `unit/contrato.spec.ts` "5xx → REDE, antes de qualquer outra regra" | COBERTO |
| CA-16 | Skill usa o serviço local e não pede senha | Skill `/softdesk` é documento (fragmento 8), sem teste automático; a parte de não haver campo de senha nas tools é VAL-15 | MANUAL |
| CA-17 | MCP não inicia o serviço → aviso e onde ver o log | VAL-27 cobre `SERVICO_INDISPONIVEL` e a orientação em `cli-entrar`; o texto que a skill mostra ao usuário não tem teste | PARCIAL (texto da skill: MANUAL) |
| CA-18 | Página seguinte sem repetidos; total real | VAL-03 | COBERTO |
| CA-19 | Saúde sem sessão confere só a página de login | VAL-22 | COBERTO |
| CA-20 | Falha de layout/rota fica em log sem dado pessoal | `unit/alerta-contrato.spec.ts` (14); `integration/softdesk-http.gateway.contrato.spec.ts` "o log do erro leva só os nomes dos campos"; VAL-19 | COBERTO |
| CA-21 | Mesmo pedido por MCP e REST, mesmo conteúdo | VAL-21 | COBERTO |
| CA-22 | Status diferente de EM_ATENDIMENTO filtrado no cliente | VAL-24 | COBERTO |
| CA-23 | Filtro por nome do solicitante | VAL-25 | COBERTO |
| CA-24 | Serviço sobe sozinho; dois MCPs, uma instância | VAL-27. Com o MCP real dentro do WSL: seção 4 | COBERTO (WSL: MANUAL) |
| CA-25 | Campo usado ausente → nulo, `aviso_deriva`, log só com o nome | VAL-29 | COBERTO |
| CA-26 | Campo essencial ausente → `CONTRATO_ROTA_MUDOU` com nomes | VAL-30 | COBERTO |
| CA-27 | Campo novo: normal, nome no log uma vez | VAL-31 | COBERTO |
| CA-28 | Captura e saúde mostram diferença de nomes e tipos | VAL-32 | COBERTO |
| CA-31 | Fila com `todas: true` devolve todos os abertos | VAL-35 | COBERTO |
| CA-32 | Pesquisa com `todas: true` devolve todos os que casam | VAL-35 | COBERTO |
| CA-33 | Teto ou prazo → parcial com `incompleto`, `proximo_inicio`, `parada_por`; continuar completa | VAL-36 | COBERTO |
| CA-34 | Sem `todas` nada muda; `todas` inválido ou com `limite` → `FILTRO_INVALIDO` | VAL-37 | COBERTO |
| CA-29 | Atividades com a rota conhecida: lista só de leitura | Nenhum teste: a rota não foi descoberta (Q-07) e o código é um stub | NÃO COBERTO |
| CA-30 | Rota de atividades não descoberta → `NAO_DISPONIVEL` com orientação | `integration/rest-protecao.spec.ts` "GET /v1/chamados/{codigo}/atividades → 501 NAO_DISPONIVEL ..." (REST); `e2e/mcp-processo.spec.ts:254-255` (tool MCP `softdesk_atividades`, mesmo envelope, `error.code === 'NAO_DISPONIVEL'`) | COBERTO |

## 3. Requisitos não funcionais (RNF)

| RNF | Critério (resumo) | Testes | Status |
|-----|-------------------|--------|--------|
| RNF-01 | Senha e cookies nunca em log, resposta, erro ou argumento | VAL-01 | COBERTO |
| RNF-02 | REST só em 127.0.0.1 e com token | VAL-11 (inclui "o servidor escuta só em 127.0.0.1"); `unit/rest-autenticacao-roteador.spec.ts` (8); `e2e/servico-processo.spec.ts` "RNF-02: o token do REST é novo a cada início do serviço" (dois inícios no mesmo diretório, tokens de 64 hex diferentes; a mutação com token fixo agora falha) | COBERTO |
| RNF-03 | Página de 50 em até 5 s; leitura da fila em até 30 s | Nenhum teste automático: a meta é medida em produção (Q-04) | MANUAL |
| RNF-04 | Máx. 2 requisições simultâneas e 1 leitura de fila por vez | VAL-23 | COBERTO |
| RNF-05 | Timeout de 20 s, sem repetição; varredura com prazo total, estouro é `REDE` | `integration/consultas-controle.spec.ts` (grupo "RNF-05: prazo total da varredura", 5 testes, prazo reduzido); VAL-09 e VAL-16 (sem repetição) com prazo reduzido. O caso com os 20 s reais está pulado (`container-gateway.spec.ts`) | PARCIAL (os 20 s reais não rodam na suíte) |
| RNF-06 | Log de início e de fim com o mesmo `correlation_id` | `integration/consultas-controle.spec.ts` (grupo "RNF-06 e §8.3", 4 testes); `integration/rest-servico.spec.ts` (2 testes "RNF-06 (REST)"); `unit/clamed-logger.adapter.spec.ts` (15, lista de permissão de campos). Pelo MCP o `correlation_id` é conferido indiretamente em VAL-21 | COBERTO |
| RNF-07 | Roda no Windows com Node >= 20; MCP no WSL alcança o serviço | A suíte inteira passa no Windows (esta execução); o MCP dentro do WSL é a seção 4 | COBERTO (WSL: MANUAL) |
| RNF-08 | Simulador gerado do contrato dourado; todos os VAL rodam contra ele | `integration/simulador.spec.ts` (10), incl. "o item é derivado do contrato dourado e confere com ele"; todos os VAL acima | COBERTO |
| RNF-09 | Janela segue o protótipo; CSS e imagens embutidos, sem recurso externo | VAL-34. A comparação visual com `MOCK-login-softdesk-local.html` não é automática | COBERTO (aparência: MANUAL) |

## 4. Validação manual em produção (fora da suíte)

Depende do usuário, no SoftDesk real, rede Clamed. **Esta é a mesma lista do folheto do resultado (seção 6), na mesma ordem.** O roteiro passo a passo está no folheto (seção 7) e no README.

1. **Login real** pela janela no navegador (CA-01, CA-16): usuário e perfil reais (atendente = perfil `A`), página "Pronto".
2. **Fila real do 393** conferida contra a tela do SoftDesk (conteúdo e contagem).
3. **Tempos (Q-04 / RNF-03):** página de 50 e leitura de 15 páginas, medidas pelo `duracao_ms` do log.
4. **Expiração da sessão (Q-02):** observar quanto tempo a sessão real dura e se o `SESSAO_EXPIRADA` aparece como esperado.
5. **Navegador oculto (R4):** conferir que a janela abre no navegador padrão e o endereço manual (`npm run entrar`) funciona quando não abre.
6. **MCP no WSL (R9 / RNF-07 / CA-24):** critério de sucesso: `softdesk_minha_fila` responde pelo Claude Code do WSL, sem novo login; se falhar, anotar a mensagem exata e trazer ao Claude da entrega (abra o Claude Code na pasta `C:\Users\<usuario>\Desenvolvimentos` e peça "retome a entrega SoftDesk Local lendo Projetos\Especificações\SoftDesk API MCP\ESTADO-softdesk-mcp.md"). Opcional para aprovar; pendente de validação se o usuário usa o WSL.
7. **Balão real do Windows (RF-07):** **não validável em produção** (não dá para provocar uma mudança no SoftDesk real sem alterá-lo, e não há comando para subir o simulador de teste à mão); coberto só por teste com executor falso (`test/unit/notificador-windows.spec.ts`).
8. **Aparência da janela (RNF-09):** comparar com o protótipo aprovado (`docs/prototipos/MOCK-login-softdesk-local.html`); em produção só os estados "entrada" e "login aceito" se comparam.
9. **Estação com inspeção TLS:** se a estação usa inspeção de certificado, conferir que o serviço iniciado pelo MCP e pelo script fala com o SoftDesk (a CA vem por `NODE_EXTRA_CA_CERTS`; o ambiente preserva a CA e o proxy).
10. **Contrato dourado:** refazer com amostra maior (`npm run capturar-forma`, depois `-- --atualizar`); hoje veio de 2 amostras. `NOVO` e `AUSENTE` em campo `outro` são esperados; `TIPO` ou saída 3 em campo essencial/usado: parar e trazer ao Claude da entrega. Antes do `--atualizar`, copiar `contrato-dourado.json` (ex.: para `$env:TEMP`) e restaurar se `npm test` falhar (sem commit não há outro jeito de desfazer). A captura lê só os 200 mais novos do atendente configurado, de qualquer status (não atribuídos não entram).
11. **Skill `/softdesk` (CA-16, CA-17) — pós-aprovação, fora do critério de aprovação:** só vale depois de sincronizada; depois de aprovar, o usuário pede a sincronização e então valida. Com o serviço parado, pedir a fila: esperado, o MCP o sobe e responde `AGUARDANDO_LOGIN`. Com a porta 47821 ocupada por outro programa: esperado `SERVICO_INDISPONIVEL`, e a skill repassa a `error.acao` (ver o log em `%LOCALAPPDATA%\softdesk-local\logs` e tentar `npm run servico`). O serviço funciona sem a skill, pelas tools `softdesk_*`.
12. **Atividades (VAL-33 / CA-29, Q-07):** descobrir a rota de atividades (o usuário copia da aba Rede só o caminho e os nomes dos parâmetros); o ramo "com a rota" será uma **nova entrega**. Hoje é stub (`NAO_DISPONIVEL`).

**Critério de aprovação:** o usuário aprova o resultado depois de executar os passos do roteiro e anotar o que passou e o que falhou. Cada item conta assim: **passou**, **não validável (aceito)** ou **bloqueia** (se falhar; falha com ressalva = o usuário decide). Balão (7): não validável, aceito. Atividades (12): esperado `NAO_DISPONIVEL` = passou. WSL (6): opcional para aprovar. Skill (11): pós-aprovação, fora do critério. Os demais (1 a 5, 8, 9, 10): bloqueiam se falharem. Só então decide se pede o commit, a sincronização da skill `/softdesk` e o registro no Backstage; nada disso é feito sem pedido dele.

## 5. Resumo

| Grupo | Total | COBERTO | PARCIAL | MANUAL | NÃO COBERTO |
|-------|-------|---------|---------|--------|-------------|
| VAL-01 a VAL-37 | 37 | 36 | 1 (VAL-33) | 0 | 0 |
| CA-01 a CA-34 | 34 | 31 (CA-01 e CA-24 com parte manual) | 1 (CA-17) | 1 (CA-16) | 1 (CA-29) |
| RNF-01 a RNF-09 | 9 | 7 (RNF-07 e RNF-09 com parte manual) | 1 (RNF-05) | 1 (RNF-03) | 0 |

Contagem exata dos CA: COBERTO 31 (CA-01 a CA-15, CA-18 a CA-28, CA-30 a CA-34), PARCIAL 1 (CA-17), MANUAL 1 (CA-16), NÃO COBERTO 1 (CA-29).
Contagem exata dos RNF: COBERTO 7 (RNF-01, 02, 04, 06, 07, 08, 09), PARCIAL 1 (RNF-05), MANUAL 1 (RNF-03).

**PARCIAL ou NÃO COBERTO que pedem ação:**

- **VAL-33 / CA-29 (atividades):** a rota de atividades ainda não foi descoberta; o `NAO_DISPONIVEL` está testado no REST e na tool MCP (CA-30 COBERTO). Falta só o ramo "com a rota" (depende de Q-07).
- **CA-17:** o texto que a skill mostra quando o serviço não sobe não tem teste.
- **RNF-05:** o timeout de 20 s reais está pulado de propósito; roda só se alguém o habilitar.

**Limites desta matriz:** os testes marcados como "lido" foram abertos; os demais foram aceitos pelo nome completo e pelo agrupamento. Nenhum VAL foi marcado COBERTO sem pelo menos um teste citado e aprovado na execução acima.

## 6. Achados das revisões: o que foi feito e onde está o teste

Conferido em 2026-11-21 lendo o código e os testes (não só as notas das revisões). Situação: **corrigido**, **aceito** (decisão registrada, sem mudar código) ou **adiado** (consciente, fora desta entrega). Teste citado pelo nome do `it` (os números de linha mudaram durante as correções).

### REVIEW-001-A (segurança e bordas): 1 alto, 4 médios, 4 baixos, 3 NIT

| Achado | Situação | Onde está o teste |
|--------|----------|-------------------|
| A-1 ALTO: conta do `icacls` (`CLAMED${usuario}`) | Corrigido: `contaAtual()` em `arquivo-descoberta.ts` devolve `DOMINIO\usuario` | `unit/arquivo-descoberta.spec.ts` "contaAtual: com domínio vira DOMINIO-barra-usuario..." e "icacls REAL numa pasta temporária termina com sucesso..." (só Windows) |
| A-2 MÉDIO: vencimento derruba login em andamento | Corrigido: folga de login em andamento (3 x timeout do gateway + 10 s) e `AbortSignal` ao fechar a janela | `integration/janela-login.spec.ts` "aos 5 min o login já enviado NÃO é derrubado...", "se o login nunca concluir, a folga encerra a janela...", "achado 1 da REVIEW-002: a janela passa um AbortSignal..." |
| A-3 MÉDIO: `ECONNRESET` repete o pedido | Corrigido: só `ECONNREFUSED`, arquivo ausente ou 401 iniciam e repetem | `unit/cliente-servico.spec.ts` "ECONNRESET no meio do pedido NÃO inicia outro serviço nem repete o pedido..." |
| A-4 MÉDIO: espera de login até 280 s x timeout do MCP de 150 s | Corrigido: timeout padrão do MCP 310 s (documentado no README) | `unit/cliente-servico.spec.ts` "o timeout padrão (310 s) fica acima do teto de 280 s..." |
| A-5 MÉDIO: serviço herda o diretório de trabalho do MCP | Corrigido: `cwd` na raiz do pacote | `unit/cliente-servico.spec.ts` "o serviço sobe com cwd na pasta do repo do serviço... (A-5, A-6)" |
| A-6 BAIXO: serviço herda todo o ambiente | Corrigido no MCP e no `iniciar-servico.ps1` (lista de permissão; `NODE_OPTIONS` sem `--require`, `--import`, `--loader` e `--inspect`; `SystemDrive` incluído) | `unit/cliente-servico.spec.ts` "ambienteMinimo..." (3 testes); `e2e/scripts-ps1.spec.ts` "REVIEW-002 achado 2: iniciar-servico.ps1 passa ao serviço só a lista de permissão..." |
| A-7 BAIXO: conferência do pid em `parar-servico.ps1` | Corrigido: barras normalizadas, `CreationDate` x `iniciado_em`, linha ilegível sai com 1 sem apagar. Resta o NIT 5 da REVIEW-002 | `e2e/scripts-ps1.spec.ts` "parar serviço travado iniciado com barra normal... (A-7)" |
| A-8 BAIXO: `AUTENTICANDO` volta a `AGUARDANDO_LOGIN` | Corrigido | `unit/sessao-memoria.store.spec.ts` "marcarAguardando durante AUTENTICANDO não volta o estado para AGUARDANDO_LOGIN" |
| A-9 BAIXO: abrir o navegador sem prazo | Corrigido: `PRAZO_ABRIR_MS` de 10 s em `abridor-navegador.windows.ts` | `unit/abridor-navegador.windows.spec.ts` "comando que nunca termina: devolve false após o prazo e passa timeout ao execFile (achado A-9)" |
| A-10 NIT: descoberta gravada sem atomicidade | Corrigido: grava `.tmp` e faz `renameSync` | `unit/arquivo-descoberta.spec.ts` "grava de forma atômica..." |
| A-11 NIT: `SOFTDESK_LOCAL_MCP_TIMEOUT_S` sem documento | Corrigido: está na tabela de configuração do README | (documento, sem teste) |
| A-12 NIT: token da janela na linha de comando | Aceito: risco registrado no README ("Segurança em uma página") | (decisão, sem teste) |

### REVIEW-001-B (lógica de negócio): 1 alto, 4 médios, 5 baixos, 6 NIT

| Achado | Situação | Onde está o teste |
|--------|----------|-------------------|
| B-1 ALTO: dourado de 2 amostras, alarme falso de deriva | Corrigido no código: tolerância a `null` em campo usado (RN-17, emenda de 21/11) e captura de 200 itens. **O dourado em si continua de 2 amostras**: refazer é o item 10 da seção 4 | `unit/contrato.spec.ts` "tolerância a null por desenho..." e "essencial continua estrito..."; `integration/capturar-forma.spec.ts` (página de 200 itens) |
| B-2 MÉDIO: saúde acusa `tipo_trocado` falso | Corrigido (`tipoAceito`) | `unit/contrato.spec.ts` "saúde: chamado fechado (...) NÃO gera tipo_trocado (B-2)", "tipoAceito..." |
| B-3 MÉDIO: `--atualizar` aceita troca de tipo crítica | Corrigido: recusa, saída 3, exige `--aceitar-troca-de-tipo` | `unit/forma.spec.ts` "troca de tipo em campo usado/essencial NÃO é regravada sem aceitar..."; `integration/capturar-forma.spec.ts` "--atualizar com troca de tipo em campo usado: avisa, NÃO regrava o campo e sai com 3... (B-3)" |
| B-4 MÉDIO: deriva sem balão nem `ultimo_alerta` | Corrigido | `unit/alerta-contrato.spec.ts` "deriva (RF-07, B-4)..."; `integration/consultas-controle.spec.ts` "deriva em respostas de pesquisa e fila... (B-4)"; `integration/saude-diagnostico.spec.ts` "saúde automática após o 1º login (B-4)..." |
| B-5 MÉDIO: prazo de 90 s não contava a espera | Corrigido: o prazo conta desde a chegada do pedido | `integration/consultas-controle.spec.ts` "o prazo conta DESDE a chegada do pedido... (achado B-5)" |
| B-6 BAIXO: leitura compartilhada sem a sessão na chave | Corrigido | `integration/consultas-controle.spec.ts` "sessão nova não se junta a uma leitura da sessão antiga... (B-6)" |
| B-7 BAIXO: `limite_pedido` vaza entre chamadores | Corrigido | `integration/consultas-controle.spec.ts` "leitura compartilhada devolve o limite_pedido de CADA chamador (B-7)" |
| B-8 BAIXO: status "Fechado" e "Novo" recusados | **Adiado**: só o nome do catálogo (ex. "Fechado por decurso de prazo") ou o código valem; `["Fechado"]` dá `FILTRO_INVALIDO` | Sem teste do apelido (não existe) |
| B-9 BAIXO: aviso de deriva em dobro e por página | **Adiado**: ainda há um `warn` por página no gateway e outro por operação | Sem teste |
| B-10 BAIXO: expiração em JSON 200 vira `CONTRATO_ROTA_MUDOU` | **Adiado**: só se mede em produção (Q-02, item 4 da seção 4); `CONTRATO_ROTA_MUDOU` logo após uma queda é um dado a anotar | Sem teste |
| B-11 NIT: código morto e casts | **Adiado**: casts e ramo inalcançável seguem em `listar-fila.use-case.ts` e `softdesk-http.gateway.ts` | Sem teste |
| B-12 NIT: diagnóstico em toda página | Corrigido: só roda quando pedido (`diagnosticar`, usado pela saúde) | Indireto: `integration/saude-diagnostico.spec.ts` |
| B-13 NIT: `palavra_chave` vazia | Corrigido | `unit/filtro-pesquisa.spec.ts` "palavra_chave vazia ou só com espaços não conta como filtro não confirmado (B-13)" |
| B-14 NIT: filtro por substring | **Adiado** (é a letra da RN-16) | Sem teste novo |
| B-15 NIT: `GET /login` não segue redirecionamento de outra origem | **Adiado**: conferir no login real (item 1 da seção 4) | O comportamento seguro tem teste em `integration/softdesk-http.gateway.login.spec.ts` (outra origem não seguida) |
| B-16 NIT: comentário de teste contraditório | Corrigido | `integration/consultas-controle.spec.ts` (o comentário agora fala em 2 páginas) |
| T1 a T5 (testes frouxos do B) | T2, T3, T4 e T5 corrigidos junto de B-5, B-3, B-2, B-6 e B-7. **T1 segue**: o item do simulador é derivado do próprio dourado (`test/simulador/dados.ts`) | ver B-2, B-3, B-5, B-6 e B-7 |

### REVIEW-002 (re-revisão): 0 alto, 0 médio, 3 baixos, 5 NIT

| Achado | Situação | Onde está o teste |
|--------|----------|-------------------|
| 1 BAIXO: folga de 30 s fixa, senha pode sair com a janela fechada | Corrigido (folga derivada do timeout; `AbortSignal`) | `integration/janela-login.spec.ts` "achado 1 da REVIEW-002..." (2 testes) |
| 2 BAIXO: script de início passa o ambiente inteiro; `NODE_OPTIONS` | Corrigido: script com a mesma lista de permissão; CA por `NODE_EXTRA_CA_CERTS` documentada no README; `NODE_OPTIONS` segue filtrado | `e2e/scripts-ps1.spec.ts` "REVIEW-002 achado 2..."; `unit/cliente-servico.spec.ts` "ambienteMinimo (REVIEW-002 achado 2)..." |
| 3 BAIXO: balão por campo `outro` | Corrigido: `outro` só vai para o log | `integration/saude-diagnostico.spec.ts` "REVIEW-002 achado 3: deriva só de campo "outro" vai para o log, sem balão nem ultimo_alerta..." |
| 4 a 8 NIT | **Ficaram**: `ultimo_alerta` preso no último erro de contrato (4); conferência do pid ainda por trecho do caminho (5); janela anunciada aberta durante a folga (6); captura lê uma página só do atendente (7); mensagem "atualizado" antes do aviso de troca recusada (8) | Sem teste novo |

### REVIEW-TESTES-001: 2 altos, 6 médios, 6 baixos; 45 mutações, 3 sobreviveram

| Achado | Situação | Onde está o teste |
|--------|----------|-------------------|
| 1 ALTO: bind da janela (M32) | Corrigido | `integration/janela-login.spec.ts` "RN-10: o servidor da janela escuta só em 127.0.0.1" |
| 2 ALTO: token do REST novo a cada início (M46) | Corrigido | `e2e/servico-processo.spec.ts` "RNF-02: o token do REST é novo a cada início" |
| 3 MÉDIO: limiares de tempo apertados | Corrigido (prazos alargados; espera ativa de 15 s) | `unit/cliente-servico.spec.ts`, `integration/consultas-controle.spec.ts` |
| 4 MÉDIO: e2e x serviço real do mesmo `dist/` | Corrigido (ignoram processos já existentes; espera ativa). Segue valendo: os e2e recompilam `dist/` | `e2e/mcp-processo.spec.ts`, `e2e/scripts-ps1.spec.ts` |
| 5 MÉDIO: VAL-28 só pelo relógio injetado | Corrigido | `integration/rest-servico.spec.ts` grupo "VAL-28" (2 testes) |
| 6 MÉDIO: prazo de 10 s do MCP (M43) | Corrigido | `unit/cliente-servico.spec.ts` "RN-15 / VAL-27..."; `e2e/mcp-processo.spec.ts` "...SERVICO_INDISPONIVEL em cerca de 10 s..." |
| 7 MÉDIO: tolerância a `null` fora da SPEC | **Virou decisão do usuário**: aprovada e registrada na SPEC v0.9 (RN-17), ARCH §17 e ADR-009 em 2026-11-21; comportamento mantido | `unit/contrato.spec.ts` "tolerância a null por desenho..." |
| 8 MÉDIO: VAL-08 e VAL-16 por caso de uso provisório | Corrigido na matriz (cita os testes da fila real) | `integration/consultas-controle.spec.ts`, `integration/rest-servico.spec.ts` |
| 9 BAIXO: varredura de senha tautológica | Corrigido | `integration/rest-protecao.spec.ts` |
| 10 BAIXO: "rede fora" é HTTP 500 | **Adiado** | Sem teste novo |
| 11 BAIXO: `proximo_inicio: null` na pesquisa só no servidor | **Adiado** (texto da SPEC depende do usuário) | Sem teste novo |
| 12 BAIXO: CA-03 sem a folga | **Adiado** (texto da SPEC depende do usuário) | O comportamento tem teste: "aos 5 min o login já enviado NÃO é derrubado" |
| 13 BAIXO: `sleep` fixo | Corrigido | `e2e/scripts-ps1.spec.ts` |
| 14 BAIXO: RN-16 sem atendente | Corrigido | `integration/consultas-fila-pesquisa.spec.ts` (3.200 itens, 15 páginas, `incompleto`) |

Resumo dos "médios dos testes": **cinco corrigidos e um que virou decisão do usuário** (a tolerância a `null`, achado 7).
