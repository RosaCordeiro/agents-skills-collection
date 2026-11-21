# REVIEW-TESTES-001 — Revisão da qualidade dos testes automáticos (SoftDesk Local)

- **Data:** 2026-11-19
- **Escopo:** a suíte `test/` (42 arquivos, 690 testes e 1 pulado) comparada com a SPEC-001 v0.8 (VAL-01 a VAL-34, CA, RNF), com a ARCH-001 §10 e com a matriz `docs/aceite/ACEITE-001.md`.
- **Modo:** somente leitura sobre o código e os testes. As mutações rodaram numa **cópia** do repositório na pasta temporária da sessão (sem `node_modules`, ligada por junção), nunca no repositório original. Nenhum acesso ao SoftDesk real.
- **Como as mutações rodaram:** cada mutação passou por `tsc --noEmit` (a que não compila é descartada) e depois por `jest --runInBand --bail` na suíte inteira da cópia. Os e2e recompilam `dist/` no `beforeAll`, então também exercitam a mutação. "Pega por" é o primeiro teste que falhou: o `--bail` para no primeiro arquivo com falha, e outros testes podem pegar a mesma mutação.

## Resumo

| Item | Resultado |
|------|-----------|
| Suíte completa, 2 execuções (Windows) | 2 de 2 verdes: 690 passaram, 1 pulado, 0 falhas (~77 s cada) |
| Arquivos sensíveis a tempo, 12 voltas sob carga (`cliente-servico` + `consultas-controle`, em paralelo com a bateria de mutações) | 12 de 12 verdes (64 de 64 em cada volta) |
| Mutações aplicadas | 45 (todas compilaram) |
| Mortas | 42 |
| **Sobreviveram** | **3**: M32 (janela de login escutando em 0.0.0.0), M43 (espera de 10 s do MCP virando 60 s), M46 (token do REST fixo) |
| Achados | 0 BLOQUEANTE, 2 ALTO, 6 MÉDIO, 6 BAIXO |

No geral, a suíte é forte. Ela executa o código de verdade contra um SoftDesk simulado com estado, as asserções saem do resultado esperado pela SPEC (e não do que o código devolve) e os comportamentos críticos de regra e de segurança pedidos na revisão foram todos pegos. As falhas reais estão em três pontos de segurança e de operação sem asserção (bind da janela, token novo a cada início e prazo de 10 s do MCP) e em alguns testes que dependem de tempo de relógio ou do ambiente.

## 1. Execução real da suíte e flutuação

- Execução 1: `npx jest --runInBand`, 42 suítes verdes, 690 passaram, 1 pulado, 76,9 s.
- Execução 2: `npx jest --runInBand --json`, mesmo resultado, 76,8 s. O único pulado foi `integration/container-gateway.spec.ts` "resposta que nunca chega → REDE depois dos 20 s reais" (pulado de propósito, liga com `SOFTDESK_TESTE_LENTO=1`).
- Estresse: `test/unit/cliente-servico.spec.ts` + `test/integration/consultas-controle.spec.ts`, 12 voltas seguidas enquanto a bateria de mutações rodava na mesma máquina. Nenhuma falha. **A falha de `cliente-servico.spec.ts` vista em outra sessão não se repetiu.** Os candidatos mais prováveis estão no achado 3.
- Arquivos mais lentos: `e2e/scripts-ps1.spec.ts` (32 s), `e2e/mcp-processo.spec.ts` (12,5 s), `integration/consultas-controle.spec.ts` (6,2 s).

## 2. Achados

Severidades: **BLOQUEANTE** = teste adaptado ao bug ou comportamento crítico sem teste real; **ALTO**; **MÉDIO**; **BAIXO**.

### 1. ALTO — O teste que diz conferir o bind da janela de login não confere (mutação M32 sobreviveu)

- **Onde:** `test/integration/janela-login.spec.ts:272-281` ("o token tem 24 bytes ... o servidor escuta só em 127.0.0.1"); código em `src/infraestructure/login/janela-login.server.ts:160`.
- **Por que não pega:** a única asserção sobre o endereço é `new URL(u1).hostname === '127.0.0.1'` (linha 275), que é o texto que o próprio código monta em `enderecoDe` (linha 149). Com `server.listen(0, '0.0.0.0')` a URL continua dizendo 127.0.0.1 e a suíte inteira passa. O nome do teste promete a regra RN-10 ("escuta só em 127.0.0.1"), mas a asserção ecoa o código. A conferência de `Host` não compensa: quem está na rede envia `Host: 127.0.0.1:<porta>` à mão, e então só o token protege a janela onde se digita a senha.
- **Correção:** fazer como `rest-protecao.spec.ts:98-110` faz para o REST: guardar o `http.Server` da janela (um getter só de teste, ou `server.address()` exposto pela classe), conferir `address === '127.0.0.1'` e tentar conectar pela porta num IPv4 não interno, esperando recusa.

### 2. ALTO — Token do REST "gerado a cada início" sem asserção (mutação M46 sobreviveu)

- **Onde:** RNF-02 ("token local gerado a cada início do serviço"); `src/servico.ts:61`; o que existe hoje são `test/e2e/servico-processo.spec.ts:102` (só o formato `^[0-9a-f]{64}$`) e `test/e2e/mcp-processo.spec.ts:420` (só "diferente de um token velho específico").
- **Por que não pega:** um token fixo de 64 hex (`'cd'.repeat(32)`) passa em toda a suíte. Isso vira a autenticação do REST em constante pública, e qualquer programa local usaria a sessão do atendente (RNF-02).
- **Correção:** em `servico-processo.spec.ts`, subir o serviço duas vezes no mesmo diretório e exigir tokens diferentes. Também vale um unitário de `iniciarServico` que confira que o token vem de `crypto.randomBytes(32)`, ou que dois inícios dão tokens distintos.

### 3. MÉDIO — Limiares de tempo de relógio apertados (candidatos à falha esporádica)

- **Onde:**
  - `test/integration/consultas-controle.spec.ts:393`: `dur < 580` com prazo de 450 ms (folga de 130 ms);
  - `:502`: `< 300` depois de abortar aos 50 ms;
  - `:406`: `< 500`;
  - `:365`: `< 1500`;
  - `test/unit/cliente-servico.spec.ts:236-237`: janela de [1.100, 4.000] ms;
  - `:216`: `< 4000`;
  - `:225`: `< 2000`;
  - `:240-268`: o processo destacado tem até 5 s (`100 × 50 ms`, linha 258) para gravar `saida.json`. Se o Node demorar a subir (antivírus, disco, carga), `fs.readFileSync` lança ENOENT sem mensagem clara (linha 263). Este é o candidato mais provável à falha relatada em outra sessão.
- **Por que importa:** não deixam erro passar, mas falham sem erro no código em máquina carregada, e isso ensina a ignorar vermelho.
- **Correção:** no caso de `:240-268`, trocar a espera fixa por espera com prazo maior (15 s) e mensagem explícita. Nos prazos de varredura, medir a ordem de grandeza (por exemplo `dur < prazo + 400`) ou contar páginas lidas no lugar de milissegundos. Onde só se quer "não esperou a resposta lenta", comparar com o tempo do simulador lento (por exemplo `< 0,5 × lento`).

### 4. MÉDIO — e2e dependem de não haver um serviço real rodando a partir do mesmo `dist/`

- **Onde:** `test/e2e/mcp-processo.spec.ts:439-443` e `:448` usam `processosNode(SERVICO_JS)` (`test/simulador/mcp-apoio.ts:68-85`), que lista **todo** `node.exe` cuja linha de comando contém `<repo>\dist\servico.js`. O MCP registrado pelo usuário sobe o serviço real exatamente desse caminho.
- **Por que importa:** com o serviço do dia a dia rodando, "dois MCPs → uma só instância" e "nenhum processo fica rodando" falham sem erro no código. O `dormir(2_500)` da linha 439 também supõe que os perdedores da disputa saem em 2,5 s. Além disso, os `beforeAll` dos e2e rodam `tsc` e sobrescrevem o `dist/` que o serviço real e o MCP registrado usam.
- **Correção:** filtrar os processos pelo `SOFTDESK_LOCAL_DIR` temporário do teste (ou pelos pids que o próprio teste criou), e não só pelo caminho do script. Trocar o `dormir(2_500)` por espera ativa com prazo. Documentar no README que `npm test` recompila `dist/`, ou compilar os e2e num diretório de saída próprio.

### 5. MÉDIO — VAL-28 (sem encerramento por ociosidade) só exercita o relógio injetado

- **Onde:** `test/integration/rest-servico.spec.ts:159-184`.
- **Por que não pega:** o teste avança `RelogioTeste` em 90 dias, mas nada no serviço lê esse relógio para decidir ociosidade (`SessaoMemoriaStore` nem recebe relógio). Um encerramento por ociosidade de verdade seria um `setTimeout`/`setInterval` em `src/servico.ts` ou em `ServidorRest`, e não seria pego: o teste roda o REST no próprio processo e dura milissegundos. Hoje o teste só confirma que o código atual não usa o relógio injetado para expirar.
- **Correção:** com `jest.useFakeTimers({ doNotFake: ['nextTick'] })` sobre `iniciarServico` (ou o container + `ServidorRest`), avançar 24 h com `jest.advanceTimersByTime` e conferir que o servidor segue ouvindo e a sessão segue `AUTENTICADA`. Outra opção, mais barata: um teste que falha se `src/servico.ts` ou `src/presentation/rest/servidor.ts` criarem temporizador sem `unref` que encerre o processo.

### 6. MÉDIO — Prazo de 10 s do início automático pelo MCP sem asserção (mutação M43 sobreviveu)

- **Onde:** RN-15 e VAL-27 ("sem o serviço subir em 10 s, `SERVICO_INDISPONIVEL`"); `src/presentation/mcp/iniciar-servico.ts:15`.
- **Por que não pega:** os testes injetam `tempoMaxMs` (`cliente-servico.spec.ts:228-238`) ou `iniciar: async () => false` (`cli-entrar.spec.ts:29`). Nenhum confere o padrão de 10 s, e com 60 s a suíte passa. Também não há teste do caminho MCP → início real que falha → `SERVICO_INDISPONIVEL` com o `dist/mcp.js` de verdade.
- **Correção:** `expect(TEMPO_MAX_INICIO_MS).toBe(10_000)` (como já se faz com `TIMEOUT_PADRAO_MS` em `softdesk-http.gateway.login.spec.ts:186`) e um e2e com `SOFTDESK_LOCAL_*` apontando para um `servico.js` que sai na hora, exigindo `SERVICO_INDISPONIVEL` em até cerca de 11 s.

### 7. MÉDIO — Testes consagram uma tolerância a `null` que não está na SPEC (RN-17)

- **Onde:** `test/unit/contrato.spec.ts:305-324` (achado B-1 de revisão), contra `src/infraestructure/softdesk/contrato.ts:183-188`.
- **Por que importa:** a RN-17 diz que um campo usado que "faltar ou mudar de tipo" gera `aviso_deriva`. Pelo código, `null` em campo usado nunca é deriva, nem quando **todos** os itens vêm nulos. Se o SoftDesk passar a devolver `nm_usuario: null` em tudo (campo renomeado com o antigo mantido vazio), não há aviso e a fila mostra solicitante vazio em silêncio. Os testes documentam a decisão da revisão, não a regra escrita. Não é bug escondido, é uma divergência da SPEC sem registro nela.
- **Correção:** ou registrar a tolerância na SPEC (RN-17) e na ARCH §17, ou acrescentar a regra "campo usado nulo em 100% dos itens de uma página com N ≥ 20 → deriva", com teste.

### 8. MÉDIO — VAL-08 e VAL-16 passam por um caso de uso provisório nos testes que a matriz cita

- **Onde:** `test/integration/sessao-fluxo.spec.ts:15-16` (`consultar = c.exigirSessao(... c.gateway.pesquisar ...)`), usado em todo o grupo VAL-08 e VAL-16 (`:212-286`).
- **Por que importa:** a fila e a pesquisa reais passam pela `Varredura`, que tem um caminho próprio de sessão que caiu (`varredura.ts:147-185`). O caminho real **está** coberto em `consultas-controle.spec.ts:235-244` e `:467-478` e em `rest-servico.spec.ts:105-116`, mas a matriz cita só o provisório. Se o provisório for apagado ou a varredura mudar, a matriz perde o vínculo.
- **Correção:** trocar `consultar` por `c.listarFila.executar({})` (ou pela pesquisa e pelo chamado completo, num `it.each`) e citar os testes reais na matriz.

### 9. BAIXO — Varredura de senha no ambiente é tautológica e pula `logs/`

- **Onde:** `test/integration/rest-protecao.spec.ts:294-300`.
- **Por que não pega:** a senha só viaja no corpo da requisição, então `process.env` nunca a teria. O laço lê só os arquivos do primeiro nível de `s.dir` (`statSync().isFile()`, sem recursão), e por isso **não lê `logs/servico.log`**. Outros testes cobrem o log (`operacao-segredos.spec.ts`), então o efeito é só ruído.
- **Correção:** percorrer `s.dir` de forma recursiva (como `mcp-processo.spec.ts:309-316`) e remover a parte de `process.env`, ou trocá-la por uma conferência do ambiente do processo filho.

### 10. BAIXO — "Rede fora" do VAL-01 é simulada como HTTP 500

- **Onde:** `test/e2e/operacao-segredos.spec.ts:171`.
- **Por que importa:** o caminho de falha de conexão (`softdesk-http.gateway.ts:293-298`, `catch` do `fetch`) é outro ramo, e o VAL-01/RNF-01 pede "rede". Ele não é varrido em busca de senha. O ramo descarta a mensagem, então o risco é baixo.
- **Correção:** acrescentar um terceiro login com `SOFTDESK_LOCAL_BASE_URL` apontando para uma porta fechada.

### 11. BAIXO — A pesquisa só no servidor devolve `proximo_inicio: null` mesmo com mais páginas

- **Onde:** `test/integration/consultas-fila-pesquisa.spec.ts:44`.
- **Por que importa:** pela RN-09, `null` quer dizer "acabou". Na pesquisa sem filtro no cliente, `null` também quer dizer "não continuo sozinho", e quem chama precisa olhar `total` e `inicio`. O teste consagra essa leitura, que está na ARCH (§11) mas não na SPEC.
- **Correção:** registrar na SPEC (RN-09/RF-04), ou devolver `proximo_inicio = inicio + limite` quando `inicio + itens < total`.

### 12. BAIXO — Exceção ao CA-03 (5 min) testada, mas não refletida na SPEC

- **Onde:** `test/integration/janela-login.spec.ts:322` ("aos 5 min o login já enviado NÃO é derrubado", achado A-2).
- **Por que importa:** é uma decisão sensata, mas o CA-03 continua dizendo "janela com mais de 5 minutos → recusado".
- **Correção:** atualizar o CA-03 com a folga do login em andamento.

### 13. BAIXO — `sleep` fixo antes de agir sobre processo recém-lançado

- **Onde:** `test/e2e/scripts-ps1.spec.ts:210`, `:235`, `:258`, `:262`, `:276` e `:282` (`dormir(500)`).
- **Por que importa:** supõem que o `node`/PowerShell lançado já está de pé em 500 ms. Em máquina carregada, o `parar-servico.ps1` pode rodar antes de o processo existir.
- **Correção:** esperar ativamente pelo pid (`vivo(pid)` com prazo) ou pela linha de comando aparecer no `Get-CimInstance`.

### 14. BAIXO — Lacuna pequena em RN-16: pesquisa sem filtro de servidor restritivo

- **Onde:** RN-16 ("quando a pesquisa não tem filtro de servidor que a restrinja, como o atendente, a leitura cobre só os 3.000 mais novos e marca `incompleto: true`").
- **Por que importa:** o teste de teto (`consultas-fila-pesquisa.spec.ts:104-118`) sempre manda `atendente`. O caso que a RN cita (filtro de texto sem atendente) não tem teste próprio, embora use o mesmo mecanismo.
- **Correção:** `pesquisar({ solicitante_nome: 'x' })` contra uma massa de 3.200 itens, exigindo `incompleto: true`, 15 páginas e nenhum `pesq_cd_atendente[]` na requisição.

## 3. Mutações

Todas aplicadas na cópia; `tsc --noEmit` ok em todas; suíte completa com `--bail`.

| # | Mutação (comportamento quebrado) | Arquivo mutado | Resultado | Pega por (primeiro teste que falhou) |
|---|----------------------------------|----------------|-----------|--------------------------------------|
| M01 | Status 6 deixa de ser fechado (**fila inclui chamado fechado**) | `core/domain/entities/status.ts` | morta | `consultas-fila-pesquisa` VAL-12 "leituras repetidas com proximo_inicio..." |
| M02 | **Filtro de atendente ignorado** no cliente | `core/domain/services/fila.service.ts` | morta | `consultas-fila-pesquisa` "fila só do atendente configurado, mesmo se o servidor ignorar o filtro" |
| M03 | Fila não envia `pesq_cd_atendente[]` ao servidor | `listar-fila.use-case.ts` | morta | `consultas-fila-pesquisa` VAL-12 (total_softdesk) |
| M04 | **Host da janela não conferido** | `janela-login.server.ts` | morta | `janela-login` VAL-05 "Host diferente..." |
| M05 | **Token da janela reutilizável** (sem recusa "usado") | `janela-login.server.ts` | morta | `janela-login` VAL-05 "token reusado..." |
| M06 | **Senha em log** (campo permitido `motivo`) na janela | `janela-login.server.ts` | morta | `janela-login` "a senha nunca aparece em log..." |
| M07 | Usuário do login no log do gateway | `softdesk-http.gateway.ts` | morta | `janela-login` "a senha nunca aparece em log..." (confere usuário também) |
| M08 | **ECONNRESET reinicia o serviço** e repete o pedido | `mcp/cliente-servico.ts` | morta | `cliente-servico` "ECONNRESET no meio do pedido NÃO inicia outro serviço..." |
| M09 | **Campo essencial aceita null** | `softdesk/contrato.ts` | morta | `contrato` "essencial continua estrito: null em cd_atendente e st_chamado" |
| M10 | **Sem dedupe por `cd_chamado`** | `fila.service.ts` | morta | `consultas-fila-pesquisa` "chamado novo durante a leitura desloca a página..." |
| M11 | **`proximo_inicio` errado** (pula o resto da página) | `fila.service.ts` | morta | `consultas-fila-pesquisa` VAL-12 |
| M12 | `proximo_inicio` sem o +1 (repete item) | `fila.service.ts` | morta | `consultas-fila-pesquisa` VAL-12 |
| M13 | **Sessão expirada não abre a janela** | `exigir-sessao.ts` | morta | `consultas-controle` "sessão expirada no meio de uma consulta → SESSAO_EXPIRADA, janela aberta" |
| M14 | Sessão expirada não é descartada (segue usando a sessão morta) | `exigir-sessao.ts` | morta | `consultas-controle` (mesmo teste) |
| M15 | **Origin aceito** no REST | `rest/autenticacao.ts` | morta | `rest-protecao` VAL-11 "cabeçalho Origin presente → 403" |
| M16 | Origin de outro site aceito na janela | `janela-login.server.ts` | morta | `janela-login` VAL-05 "Origin de outro site no POST → 403" |
| M17 | Host do REST não conferido | `rest/autenticacao.ts` | morta | `rest-protecao` VAL-11 "Host errado → 403" |
| M18 | Só 500 exato vira REDE na pesquisa (502/503 não) | `contrato.ts` | morta | `contrato` "5xx → REDE, antes de qualquer outra regra" |
| M19 | Qualquer 3xx da pesquisa vira SESSAO_EXPIRADA | `contrato.ts` | morta | `contrato` "HTML 200, 404, 400, 204 e outros 3xx → CONTRATO_ROTA_MUDOU" |
| M20 | Login `status:false` vira LAYOUT_LOGIN_MUDOU | `contrato.ts` | morta | `janela-login` "falha status_falso → página só com o estado CREDENCIAL" |
| M21 | Teto de limite 200 → 500 | `filtro-pesquisa.ts` | morta | `consultas-controle` VAL-20 "limite acima de 200 na fila usa 200" |
| M22 | Teto de páginas 15 → 16 | `fila.service.ts` | morta | `consultas-fila-pesquisa` VAL-04 |
| M23 | Log de fim da operação não é escrito (RNF-06) | `operacao.ts` | morta | `consultas-controle` RNF-06 "started e success/failure com o mesmo correlation_id" |
| M24 | Varreduras não são serializadas | `varredura.ts` | morta | `consultas-controle` VAL-23 "duas leituras diferentes da fila ... pico 1" |
| M25 | Semáforo com 3 vagas | `softdesk-http.gateway.ts` | morta | `consultas-controle` VAL-23 "5 pedidos simultâneos ... pico <= 2" |
| M26 | Estouro do prazo da varredura sem a mensagem de prazo | `varredura.ts` | morta | `consultas-controle` RNF-05 "simulador lento e prazo reduzido → REDE com a mensagem de prazo" |
| M27 | Deriva de campo usado não chega ao caso de uso | `softdesk-http.gateway.ts` | morta | `consultas-controle` VAL-22 "com sessão, deriva de campo usado" |
| M28 | Filtro de texto diferencia acentos | `filtro-texto.ts` | morta | `consultas-fila-pesquisa` VAL-25 "rosangela casa os dois nomes" |
| M29 | Filtro de texto confere só a 1ª palavra | `filtro-texto.ts` | morta | `consultas-fila-pesquisa` "filtro com mais de uma palavra exige todas" |
| M30 | Janela vive 50 min | `janela-login.server.ts` | morta | `janela-login` VAL-05 "token vencido (relógio de teste)" |
| M31 | REST escuta em 0.0.0.0 | `rest/servidor.ts` | morta | `rest-protecao` VAL-11 "o servidor escuta só em 127.0.0.1" |
| **M32** | **Janela de login escuta em 0.0.0.0** | `janela-login.server.ts` | **SOBREVIVEU** | nenhum (achado 1) |
| M33 | Qualquer conjunto com status 1 manda EM_ATENDIMENTO ao servidor | `softdesk-http.gateway.ts` | morta | `softdesk-http.gateway.pesquisa` "status {1} vai ao servidor como EM_ATENDIMENTO; outros conjuntos, não" |
| M34 | Chamado completo pega o 1º item sem conferir `cd_chamado` | `obter-chamado.use-case.ts` | morta | `consultas-controle` VAL-20 "exige igualdade exata em cd_chamado" |
| M35 | Schema da fila não estrito (campo `senha` aceito em silêncio) | `entrada.schemas.ts` | morta | `e2e/mcp-processo` VAL-15 "tools/list ... schema estrito" |
| M36 | Janela não confere expiração na requisição | `janela-login.server.ts` | morta | `janela-login` VAL-05 "token vencido" |
| M37 | Falha de conexão vira SESSAO_EXPIRADA | `softdesk-http.gateway.ts` | morta | `softdesk-http.gateway.pesquisa` VAL-09 "resposta lenta além do prazo → REDE" |
| M38 | Campo novo logado em toda resposta | `softdesk-http.gateway.ts` | morta | `softdesk-http.gateway.contrato` VAL-31 "o nome vai ao log uma vez por processo" |
| M39 | `correlation_id` não anexado pelo adaptador real | `clamed-logger.adapter.ts` | morta | `consultas-controle` RNF-06 |
| M40 | Pesquisa só no servidor: total = tamanho da página | `pesquisar.use-case.ts` | morta | `consultas-fila-pesquisa` VAL-03 |
| M41 | Token da janela conferido só pelo tamanho | `janela-login.server.ts` | morta | `janela-login` VAL-05 "token errado, ausente ou de outro tamanho" |
| M42 | Fila não descarta fechados (`somenteAbertos: false`) | `listar-fila.use-case.ts` | morta | `e2e/mcp-processo` VAL-21 (contagem da fila) |
| **M43** | **Espera do MCP pelo serviço: 60 s em vez de 10 s** | `mcp/iniciar-servico.ts` | **SOBREVIVEU** | nenhum (achado 6) |
| **M46** | **Token do REST fixo (não muda a cada início)** | `servico.ts` | **SOBREVIVEU** | nenhum (achado 2) |
| M48 | Sem sessão, `AGUARDANDO_LOGIN` sem abrir a janela | `exigir-sessao.ts` | morta | `consultas-controle` VAL-20 "sem sessão, as consultas abrem a janela e devolvem AGUARDANDO_LOGIN" |

(Os números M44, M45 e M47 ficaram sem uso: o comportamento já tinha asserção direta, como `TIMEOUT_PADRAO_MS === 20_000` e `prazoVarreduraSegundos === 90`.)

## 4. Correções à matriz ACEITE-001

| Linha | Hoje | Reclassificar para | Motivo |
|-------|------|--------------------|--------|
| VAL-05 / CA-02 | COBERTO | **PARCIAL** | Host, token, reuso e vencimento estão bem cobertos (M04, M05, M30, M36, M41 mortas), mas a parte de RN-10 "escuta só em 127.0.0.1" não tem asserção real (M32 sobreviveu; achado 1). |
| RNF-02 | COBERTO | **PARCIAL** | Bind e 401 cobertos (M15, M17, M31 mortas), mas "token gerado a cada início" não tem teste (M46 sobreviveu; achado 2). |
| VAL-27 / CA-17 | COBERTO / PARCIAL | VAL-27 **PARCIAL** | O início automático e a instância única estão cobertos, mas o "`SERVICO_INDISPONIVEL` em 10 s" não: o padrão não é conferido e o caminho MCP real → início que falha não tem e2e (M43 sobreviveu; achado 6). |
| VAL-28 | COBERTO | **PARCIAL** | O teste só avança o relógio injetado, que nada no serviço usa para ociosidade; um temporizador real de encerramento não seria pego (achado 5). |
| CA-30 | PARCIAL ("só REST; a tool MCP não tem teste do envelope") | **COBERTO** | `e2e/mcp-processo.spec.ts:246-247` (dentro do VAL-21) chama `softdesk_atividades` pelo MCP, compara com o REST e exige `error.code === 'NAO_DISPONIVEL'`. A frase "não há teste do NAO_DISPONIVEL pela tool MCP" das linhas de VAL-33 e do resumo está errada. VAL-33 segue PARCIAL só pelo ramo "com a rota" (Q-07). |
| VAL-08 / VAL-16 | COBERTO, citando `sessao-fluxo.spec.ts` | COBERTO, **trocar as citações** | Os testes citados usam um caso de uso provisório (achado 8). Citar `consultas-controle.spec.ts:235` ("sessão expirada no meio de uma consulta"), `:467` ("sessão descartada durante a leitura") e `rest-servico.spec.ts:105` (401/403 pelo REST), que passam pela fila real. |
| VAL-01 / RNF-01 | COBERTO | COBERTO (observação) | O cenário "rede" é HTTP 500, não falha de conexão (achado 10). |
| VAL-15 | COBERTO | COBERTO (observação) | O trecho de `rest-protecao.spec.ts:294-300` citado é tautológico e não lê `logs/` (achado 9). A cobertura real vem do e2e do MCP e do schema estrito (M35 morta). |
| VAL-29 / CA-25 | COBERTO | COBERTO (observação) | Coberto para campo ausente ou tipo trocado; campo usado que passa a vir `null` em todos os itens não gera aviso, por decisão de revisão fora da SPEC (achado 7). |
| Resumo §5 | VAL 33 COBERTO / 1 PARCIAL; CA 26 / 2 PARCIAL; RNF 7 / 1 PARCIAL | VAL **30 COBERTO / 4 PARCIAL** (VAL-05, 27, 28, 33); CA **26 COBERTO / 2 PARCIAL** (CA-02 entra, CA-30 sai; CA-17 segue PARCIAL), 1 MANUAL, 1 NÃO COBERTO; RNF **6 COBERTO / 2 PARCIAL** (RNF-02, RNF-05), 1 MANUAL | Consequência das linhas acima. |

As demais linhas foram conferidas abrindo os testes, como a revisão pediu: VAL-02, 04, 06, 07, 09, 11, 12, 13, 14, 21, 23, 24, 29, 30, 31, 32 e RNF-06. Elas se sustentam, e as mutações correspondentes morreram.

## 5. Lacunas (comportamento da SPEC sem teste automático)

| Comportamento | Onde na SPEC | Situação |
|---------------|--------------|----------|
| Janela de login escuta só em 127.0.0.1 | RN-10, CA-02 | Sem asserção real (achado 1, M32) |
| Token do REST novo a cada início | RNF-02 | Sem teste (achado 2, M46) |
| `SERVICO_INDISPONIVEL` se o serviço não subir em 10 s, pelo MCP real | RN-15, VAL-27, CA-17 | Sem teste do padrão nem do e2e (achado 6, M43) |
| Serviço não encerra por ociosidade (temporizador real) | RN-15, VAL-28 | Só relógio injetado (achado 5) |
| Pesquisa sem filtro de servidor restritivo → 3.000 mais novos e `incompleto` | RN-16 | Só com atendente (achado 14) |
| Campo usado que passa a vir `null` em todos os itens | RN-17 | Testes consagram "nunca é deriva" (achado 7) |
| Falha de conexão no login sem vazar senha | RNF-01, VAL-01 | Só HTTP 500 (achado 10) |
| Atividades com a rota conhecida | RF-11, CA-29, VAL-33 | Depende de Q-07; sem código nem teste (já na matriz) |
| Timeout real de 20 s por chamada | RNF-05 | Pulado de propósito; a constante é conferida (`softdesk-http.gateway.login.spec.ts:186`) |
| Texto da skill quando o serviço não sobe | CA-16, CA-17 | Manual (já na matriz) |

## 6. O que está bom (para não mexer)

- **Simulador com estado real** (`test/simulador/softdesk-simulado.ts`): sessão por cookie, XSRF exigido no `POST /login`, paginação por `start`/`limit`, filtros de servidor, expiração por 302/401/403, deriva por campo e contador de pico. Os testes de integração exercitam o gateway HTTP de verdade, não dublês.
- **Guarda global de somente leitura** (`test/simulador/guarda-somente-leitura.ts`, `setupFilesAfterEnv`): o registro de todo simulador criado em qualquer arquivo é conferido contra as três rotas permitidas no `afterAll`. O VAL-10 vale para a suíte inteira, não só para um teste.
- **Asserções pelo valor que a SPEC pede, não por eco do código**: a fila é comparada com a lista calculada a partir da massa (`doAtendente(...).filter(abertoSpec)`), na ordem do SoftDesk (`consultas-fila-pesquisa.spec.ts:138-163`). O `proximo_inicio` é recalculado de forma independente (`:372-399` e `fila.service.spec.ts:102-108`), e o total é o do simulador.
- **Varredura de segredos com sentinelas aleatórias** e com os cookies emitidos pelo simulador. A busca cobre o log real (arquivo do `@clamed/logger`), stdout, stderr, respostas REST e MCP e o disco (`e2e/operacao-segredos.spec.ts:124-240`), e o teste confere que o log não está vazio (`:216-218`), para a busca não passar no vácuo.
- **Nenhum `try/catch` que engole falha em teste**: os três `catch {}` existentes estão em ajudantes de limpeza (`apoio.ts:73`, `mcp-apoio.ts:106`, `rest-apoio.ts:34`). O `capturarErro` (`apoio.ts:56-63`) falha o teste se nada for lançado.
- **Só dois `skip` condicionais**, ambos justificados: o caso dos 20 s reais (`integration/container-gateway.spec.ts:65`, liga com `SOFTDESK_TESTE_LENTO=1`) e um teste só de Windows (`unit/arquivo-descoberta.spec.ts:57`).
- **RNF-06 com o adaptador real** (`consultas-controle.spec.ts:506-620`): o `correlation_id` é conferido no objeto que o `ClamedLoggerAdapter` entrega ao destino, não no espião cru (M23 e M39 mortas).

## 7. Correções aplicadas (2026-11-19)

| Achado | Situação | O que foi feito |
|--------|----------|-----------------|
| 1 (ALTO) | Corrigido | `JanelaLoginServer.escutaEm()` (só leitura do `server.address()`); `janela-login.spec.ts` "RN-10: o servidor da janela escuta só em 127.0.0.1" confere o endereço real e que nenhuma interface IPv4 externa conecta. M32 agora falha. |
| 2 (ALTO) | Corrigido | `servico-processo.spec.ts` "RNF-02: o token do REST é novo a cada início": dois inícios no mesmo diretório, tokens diferentes. M46 agora falha. |
| 3 (MÉDIO) | Corrigido | Espera ativa de 15 s com mensagem em `cliente-servico.spec.ts` (saida.json); limites de tempo de `consultas-controle.spec.ts` e `cliente-servico.spec.ts` alargados, deixando a prova principal no código de erro e na contagem de páginas. |
| 4 (MÉDIO) | Corrigido | `mcp-processo.spec.ts` e `scripts-ps1.spec.ts` ignoram processos `dist/servico.js` que já existiam antes dos testes; `dormir(2_500)` e `dormir(500)` viraram espera ativa com prazo. Os testes seguem usando porta e diretório próprios. Continua valendo: os `beforeAll` dos e2e recompilam `dist/`. |
| 5 (MÉDIO) | Corrigido | Nada no serviço lê relógio para ociosidade; dois testes novos em `rest-servico.spec.ts` (24 h de temporizadores falsos sem pedidos, com o serviço de pé; trava estática contra temporizador novo em `src/`). Um temporizador de 1 h inserido em `servico.ts` falha os dois. |
| 6 (MÉDIO) | Corrigido | `TEMPO_MAX_INICIO_MS === 10_000` e e2e do `dist/mcp.js` real com a porta tomada por outro programa: `SERVICO_INDISPONIVEL` entre 9 e 25 s. M43 agora falha. |
| 7 (MÉDIO) | Decisão de projeto, comportamento mantido | Ver nota abaixo. |
| 8 (MÉDIO) | Corrigido na matriz | A matriz cita os testes da fila real (`consultas-controle.spec.ts`, `rest-servico.spec.ts`). |
| 9 (BAIXO) | Corrigido | Varredura recursiva da pasta do serviço (inclui `logs/`), sem a parte tautológica de `process.env`. |
| 13 (BAIXO) | Corrigido | `scripts-ps1.spec.ts`: espera ativa pelo processo aparecer na lista antes de agir (os `dormir(500)` depois de parar, que afirmam que algo NÃO aconteceu, ficaram). |
| 14 (BAIXO) | Corrigido | Teste novo de RN-16 sem atendente: 3.200 itens, 15 páginas, `incompleto`, sem `pesq_cd_atendente[]` na requisição. |
| 10, 11, 12 (BAIXO) | Adiados | 10 pede reorganizar o e2e (outro serviço com porta de SoftDesk fechada); 11 e 12 são textos da SPEC (RN-09/RF-04 e CA-03) que dependem de aprovação do usuário. |

**Tolerância a null: emenda aprovada pelo usuário em 2026-11-21 e já aplicada na SPEC-001 v0.9 (RN-17), ARCH-001 §17 e ADR-009.** A tolerância a `null` em campo usado (nunca é deriva) vem do achado B-1 de REVIEW-001-B; `test/unit/contrato.spec.ts` a documenta. Nenhum comportamento foi alterado.
