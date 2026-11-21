# REVIEW-001-A — Segurança e bordas do processo

- **Revisor:** A (somente leitura)
- **Data:** 2026-11-19
- **Branch:** `feat/softdesk-local-mvp` (sem commit)
- **Base:** SPEC-001 v0.8, ARCH-001 v0.6, ADR-001..009, `.ai/rules/desenvolvimento.md`
- **Escopo:** `login/*`, `sessao/*`, `descoberta/*`, `presentation/rest/*`, `presentation/mcp/*`, `servico.ts`, `mcp.ts`, `cli-*.ts`, `scripts/*.ps1`, `notificador-windows.ts`, `logger/*`, `config/*`, `exigir-sessao.ts`, `entrar` e `estado-sessao`
- **Suíte:** `npm test` = 42 suítes, 655 passaram, 1 pulado; `tsc --noEmit` sem erro

## Resumo

| Severidade | Qtde |
|------------|------|
| BLOQUEANTE | 0 |
| ALTO | 1 |
| MÉDIO | 4 |
| BAIXO | 4 |
| NIT | 3 |

---

## Achados

### 1. ALTO — A conta passada ao `icacls` nunca é válida em máquina de domínio: a ACL da pasta nunca é restringida

- **Arquivo:** `src/infraestructure/descoberta/arquivo-descoberta.ts:37`
- **Código:** `return dominio ? \`${dominio}\${usuario}\` : usuario;`
- **Problema:** dentro de template literal, `\$` escapa o cifrão. `\${usuario}` vira o texto literal `${usuario}`, sem interpolar. Com `USERDOMAIN=CLAMED`, `contaAtual()` devolve `CLAMED${usuario}`. Conferido com `node -e` (`DOM${u}`).
- **Cenário:** em toda estação da Clamed (conta de domínio), o `icacls <pasta> /inheritance:r /grant:r CLAMED${usuario}:(OI)(CI)F` falha com "Não foi feito mapeamento entre os nomes de conta e as identificações de segurança" (rc 52). Testei numa pasta do scratchpad: o `icacls` falha sem mexer em nada, a ACL herdada continua e o arquivo é gravado. Resultado: o controle de RNF-02 / ARCH §7.2 nunca é aplicado, e a cada início sai só um `warn` com `motivo: acl`. Hoje o risco é contido porque `%LOCALAPPDATA%` herda usuário + SYSTEM + Administradores. Mas com `SOFTDESK_LOCAL_DIR` apontando para uma pasta com `Users:(R)` herdado (ex.: `C:\temp\...`), outro usuário da máquina lê o token e usa a sessão do SoftDesk pelo REST.
- **Por que os testes não pegaram:** `test/unit/arquivo-descoberta.spec.ts` testa só `argumentosIcacls` com a conta `'U'` injetada; `contaAtual` não tem teste e `servico` roda com `restringirAcl: false`.
- **Correção:** `` `${dominio}\\${usuario}` `` (ou `path.win32.join`/concatenação `dominio + '\\' + usuario`). Teste unitário de `contaAtual({ USERDOMAIN: 'CLAMED', USERNAME: 'x' })` === `'CLAMED\\x'`. Em vez do nome, pode-se usar o SID: `*S-1-5-...` obtido de `whoami /user`, que não depende de domínio.

### 2. MÉDIO — O vencimento da janela derruba um login já enviado e em andamento

- **Arquivo:** `src/infraestructure/login/janela-login.server.ts:185-191` (`expirar`) e `:334-353` (`tratarEntrar`)
- **Problema:** `expirar` não olha `j.usado`. O ARCH §6 F1 diz `AGUARDANDO_LOGIN --> SEM_SESSAO: 5 min sem uso`; depois do `POST` válido a janela está "em uso" (`AUTENTICANDO`).
- **Cenário:** a pessoa envia o formulário aos 4 min 55 s e o SoftDesk demora (timeout de 20 s). Aos 5 min, `expirar` faz três coisas: passa o estado para `SEM_SESSAO`, resolve `TEMPO` para quem espera (o `entrar` devolve `AGUARDANDO_LOGIN` com `janela.aberta: false`) e chama `closeAllConnections()`, que derruba o socket do `POST`. O navegador mostra "conexão redefinida", sem a página de erro. Quando `autenticar` volta com sucesso, `j.encerrada` está verdadeiro, então o código responde 410 num socket morto e descarta a sessão recém-criada. Os cookies desse objeto também não são limpos: `sessaoHttp.cookies.clear()` só roda dentro de `descartar`. A pessoa digitou a senha certa e precisa repetir tudo.
- **Variante:** se o vencimento ocorrer durante `lerCorpo`, não há nova checagem de `j.encerrada` antes de `j.usado = true` e de `autenticar`. A senha pode ser enviada ao SoftDesk com a janela já encerrada; o resultado é descartado, mas o login no SoftDesk acontece.
- **Correção:** em `expirar`, se `j.usado && !j.concluida`, não encerrar. Adiar até o fim do `tratarEntrar` (que já fecha a janela) ou rearmar o prazo para o timeout do gateway mais uma folga. Checar `j.encerrada` logo depois de `await this.lerCorpo(req)`. No ramo `j.encerrada` com `sessaoHttp`, chamar `sessaoHttp.cookies.clear()`.

### 3. MÉDIO — O MCP repete o pedido (e ressuscita o serviço) depois de `ECONNRESET`

- **Arquivo:** `src/presentation/mcp/cliente-servico.ts:55-58` e `:105`
- **Problema:** `ECONNRESET` é tratado como "recusada": o cliente chama `iniciarUmaVez()` e **repete o mesmo pedido**. O ARCH §6 F9 prevê o início automático só para arquivo ausente, conexão recusada ou 401. O RNF-05 / RN-14 dizem "nenhuma repetição automática". Reset com o pedido já entregue não é "serviço parado".
- **Cenário:** o Claude tem uma `softdesk_pesquisar` em andamento (aguardando o SoftDesk, até 20 s) e o usuário roda `npm run servico:parar`. `ServidorRest.parar()` chama `closeAllConnections()` depois de 2 s e o MCP recebe `ECONNRESET`. Ele sobe um serviço novo, sem sessão, e reenvia a pesquisa. O serviço novo responde `AGUARDANDO_LOGIN` e **abre uma janela de login no navegador** logo depois de a pessoa ter parado o serviço. O mesmo vale para crash no meio de `POST /v1/sessao/entrar`: o pedido é reenviado e abre outra janela.
- **Correção:** tratar `ECONNRESET` (e qualquer erro depois de a conexão ter sido aceita) como `falha`, e responder `SERVICO_INDISPONIVEL` sem repetir. Iniciar e repetir só em `ECONNREFUSED`, arquivo ausente ou 401.

### 4. MÉDIO — `esperaLoginSegundos` aceito até 280, mas o MCP corta em 150 s e responde `SERVICO_INDISPONIVEL`

- **Arquivo:** `src/infraestructure/config/carregar-config.ts:91` (`inteiro(1, 280)`); `src/presentation/mcp/cliente-servico.ts:14,100` (`TIMEOUT_PADRAO_MS = 150_000`); `src/mcp.ts:22-25`
- **Problema:** o ARCH §8.2 permite de 1 a 280 s e o §14 F6 pede "timeout acima de 120 s por causa da espera de `softdesk_entrar`". Com espera configurada acima de 150 s, o `AbortSignal.timeout` do MCP dispara primeiro. Esse erro cai em `tipo: 'falha'` e o MCP devolve `SERVICO_INDISPONIVEL` ("Não foi possível iniciar ou alcançar o serviço local"), embora o serviço esteja de pé e a janela aberta. O mesmo vale para `npm run entrar` (mesmo cliente). A descrição da tool também fixa "espera até 2 minutos".
- **Cenário:** `config.json` com `"esperaLoginSegundos": 200`. `softdesk_entrar` termina com `SERVICO_INDISPONIVEL` aos 150 s; a skill orienta olhar o log, mas não há erro no log.
- **Correção:** derivar o timeout do MCP de forma que fique sempre acima da espera. Uma opção é usar `max(150 s, 280 s + 10 s)` como padrão. Outra é o `GET /v1/servico` informar `espera_login_s`. Também dá para baixar o teto da configuração para 140. Documentar `SOFTDESK_LOCAL_MCP_TIMEOUT_S` (achado 11).

### 5. MÉDIO — O serviço iniciado pelo MCP herda o diretório de trabalho do MCP (pasta do projeto do usuário) para sempre

- **Arquivo:** `src/presentation/mcp/iniciar-servico.ts:64-69` (o `spawn` sem `cwd`)
- **Problema:** o processo do serviço é destacado, de longa duração e sem encerramento por ociosidade (RN-15). Ele herda o `cwd` do MCP, que o Claude Code inicia na pasta do projeto aberto naquele momento. Há duas consequências:
  - No Windows, o diretório atual de um processo fica com handle aberto, então a pasta (ou worktree) onde o Claude estava na primeira chamada de tool **não pode ser apagada nem renomeada** enquanto o serviço viver. Isso afeta, por exemplo, `git worktree remove` e a movimentação de repositórios prevista no CLAUDE.md.
  - O `@clamed/logger` lê `process.cwd()/package.json` (`readHostPackageJson`) para `app_name` e `version`. Com isso os logs do serviço saem com o nome e a versão **do projeto em que o usuário estava**, e não `softdesk-local`. O `scripts/iniciar-servico.ps1` não tem o problema porque usa `-WorkingDirectory $raiz`.
- **Correção:** `spawn(..., { cwd: path.resolve(__dirname, '..', '..', '..'), ... })`, isto é, a raiz do pacote, igual ao script.

### 6. BAIXO — O serviço destacado herda todo o ambiente do MCP (inclusive credenciais de outros MCPs)

- **Arquivo:** `src/presentation/mcp/iniciar-servico.ts:68` (`env: opcoes.env ?? process.env`); `scripts/iniciar-servico.ps1:82`
- **Problema:** o ambiente do Claude Code costuma ter variáveis como `SOFTDESK_SENHA`/`SOFTDESK_USUARIO` (do MCP oficial antigo) e outros tokens. O serviço não as lê (RN-02 respeitado), mas passa a carregá-las num processo que vive indefinidamente e é independente do Claude. Isso amplia a exposição: o ambiente do processo pode ser lido por qualquer processo do mesmo usuário.
- **Correção:** montar um ambiente mínimo para o filho: `SystemRoot`, `PATH`, `LOCALAPPDATA`, `USERPROFILE`, `USERNAME`, `USERDOMAIN`, `TEMP`/`TMP`, `SOFTDESK_LOCAL_*`, `LOG_LEVEL`, `PREFIX_LOGGER`, `AMBIENTE`, `NODE_EXTRA_CA_CERTS`.

### 7. BAIXO — `parar-servico.ps1`: conferência do pid frágil nos dois sentidos

- **Arquivo:** `scripts/parar-servico.ps1:160-169`
- **Problema e cenários:**
  - **Falso negativo:** serviço iniciado por `npm run servico` (`node dist/servico.js`, com barra normal) e travado. A linha de comando não contém `dist\servico.js`, então o script diz que o pid "pertence a outro programa", **apaga o arquivo de descoberta** e deixa o processo com a porta. A partir daí todo MCP tenta subir outra instância, perde a porta e responde `SERVICO_INDISPONIVEL` até alguém matar o processo à mão.
  - **Falso positivo:** a busca é por substring. Se o pid foi reaproveitado por outro programa Node cujo caminho também termina em `dist\servico.js`, esse programa é encerrado.
- **Correção:** normalizar barras e comparar com o caminho absoluto de `dist\servico.js` deste pacote. Comparar também `CreationDate` do processo com `iniciado_em` do arquivo (tolerância de alguns segundos). Não apagar o arquivo quando a conferência for inconclusiva.

### 8. BAIXO — Consulta durante `AUTENTICANDO` volta o estado para `AGUARDANDO_LOGIN`

- **Arquivo:** `src/infraestructure/sessao/sessao-memoria.store.ts:38-41`; chamado por `janela-login.server.ts:84` (reaproveitar)
- **Problema:** `marcarAguardando` só protege `AUTENTICADA`. Durante a autenticação, a janela ainda conta como aberta (`concluida` falso). Por isso qualquer `exigirSessao` ou `entrar` a reaproveita e chama `marcarAguardando()`, que troca `AUTENTICANDO` por `AGUARDANDO_LOGIN`. Essa transição não existe no diagrama do ARCH §6 F1. `softdesk_estado_sessao` passa a dizer "aguardando login" enquanto o login está em curso, e a janela é anunciada como aberta com um token que já foi consumido.
- **Correção:** `if (this.atual === 'AUTENTICADA' || this.atual === 'AUTENTICANDO') return;`.

### 9. BAIXO — Abrir o navegador não tem prazo: uma trava em `cmd /c start` trava toda abertura de janela

- **Arquivo:** `src/infraestructure/login/abridor-navegador.windows.ts:10` (`execFile` sem `timeout`); `janela-login.server.ts:88-92,174`
- **Problema:** `abrir()` aguarda `abridor.abrir` sem limite. Se o `cmd` não terminar, a promessa `abrindo` fica pendente para sempre. A janela vence aos 5 min, mas `abrirOuReaproveitar` continua devolvendo a mesma promessa pendente. Todo `entrar` e toda consulta sem sessão ficam pendurados até reiniciar o serviço; o MCP corta aos 150 s com `SERVICO_INDISPONIVEL`.
- **Correção:** `timeout: 10_000` no `execFile` e um `Promise.race` com prazo em `abrir()`.

### 10. NIT — Arquivo de descoberta gravado sem atomicidade

- **Arquivo:** `src/infraestructure/descoberta/arquivo-descoberta.ts:82`
- `writeFileSync` trunca e depois escreve. Um MCP que leia nesse intervalo recebe `null` e tenta subir outra instância, que perde a porta e sai sozinha. Não chega a ser falha, mas gera processo e log à toa. Correção: gravar em `servico.json.tmp` e fazer `renameSync`.

### 11. NIT — `SOFTDESK_LOCAL_MCP_TIMEOUT_S` não está no ARCH §8.2

- **Arquivo:** `src/mcp.ts:22-25`
- Variável nova, fora da tabela de configuração e do README previsto. Documentar junto com o achado 4.

### 12. NIT — Token da janela aparece na linha de comando de `cmd.exe` e do navegador

- **Arquivo:** `src/infraestructure/login/abridor-navegador.windows.ts:23`
- A URL com `?t=<token>` fica visível, por alguns instantes, na linha de comando de processos do mesmo usuário (WMI). O risco é aceitável: o token é de uso único, vive 5 min e o mesmo usuário já lê o arquivo de descoberta. Fica registrado para constar no ARCH como risco aceito.

---

## Itens já conhecidos (não reportados como novos)

| Item | Agrava algo? |
|------|--------------|
| Páginas de erro da janela sem formulário (mock tem) | Não. |
| Host/token errado não fecha a janela | Não. A janela continua com vida de 5 min e token de 48 hex com `timingSafeEqual`; adivinhar o token por força bruta não é viável. |
| Log started/fim do `entrar` pelo REST sem o mesmo `correlation_id` | Não. |
| SIGINT/SIGTERM sem teste no Windows | Pouco. Como o serviço sobe destacado e sem console, na prática a parada no Windows é pela rota ou por logoff/desligamento (sem limpeza). O arquivo de descoberta fica velho, mas o F9 já lida com isso (`ECONNREFUSED` leva a um novo início). Junto com o achado 7, um serviço travado pode ficar sem caminho de parada pelo script. |

---

## O que foi conferido e está correto

- **Senha:** só existe como variável local de `tratarEntrar`. É zerada no `finally`, não entra em estado, erro, log nem página. No `CREDENCIAL`, a mensagem do SoftDesk é trocada pela fixa. O usuário fica só no `ResumoSessao` e não vai para log.
- **Logger:** lista de permissão de campos, só valores primitivos, query string cortada, sem `message`/`stack`. O `correlation_id` vem só do contexto. O cabeçalho `X-Correlation-Id` só é aceito se for UUID, o que impede injeção no log e no cabeçalho de resposta.
- **Janela de login:**
  - escuta em `127.0.0.1:0`; token de 24 bytes comparado com `timingSafeEqual`; `Host` exato e `Origin` igual à própria janela;
  - corpo limitado a 4 KB, inclusive com `Content-Length` mentiroso; campos limitados a 256;
  - consumo do token sem corrida: checagem e marcação no mesmo tick, depois do `await`;
  - cabeçalhos e CSP iguais ao ARCH §6 F1, com nonce novo por resposta; escape de todo texto dinâmico; página sem URL externa; `Connection: close`;
  - recursos liberados: o temporizador é cancelado em `encerrar` e as conexões são fechadas.
- **Abertura do navegador:** a URL é validada por regex estrita antes do `execFile('cmd', ['/c','start','',url])`, então não há texto livre no shell.
- **Notificador:** `execFile` com textos fixos sem aspas simples, cifrão nem crase; não há injeção no PowerShell. Falhas viram `warn` sem a mensagem da exceção.
- **REST:**
  - bind em `127.0.0.1` com `exclusive`; `Host` exato; qualquer `Origin` dá 403. Isso barra DNS rebinding e páginas web: um GET simples de outro site chega sem `Origin`, mas sem token, e recebe 401;
  - token comparado via SHA-256 + `timingSafeEqual`, sem vazar o tamanho; autenticação feita antes do roteamento e da leitura do corpo;
  - corpo de até 16 KB; erro de JSON sem eco do conteúdo; última barreira responde 500 fixo;
  - o endereço da janela só sai em `GET /v1/sessao/janela` (ADR-007); as tools MCP não o expõem.
- **Estado e entrar:** sem senha, cookie, token ou endereço; `entrar` não abre janela com sessão `AUTENTICADA`; `exigirSessao` reaproveita a janela (nunca abre duas, graças a `abrindo`). A expiração concorrente é tratada por identidade (`outra === atual`).
- **Sessão:** só em memória; `descartar` limpa os cookies; não há expiração por ociosidade (RN-15), só quando o SoftDesk a rejeita.
- **Início e parada:**
  - a porta é ocupada antes de gravar a descoberta, então quem perde a disputa não toca no arquivo; a falha ao gravar libera a porta;
  - a parada é idempotente e fecha janela, varredura, sessão, arquivo e porta, com `closeAllConnections` em 2 s;
  - `/v1/servico/parar` responde e só então para.
- **MCP:**
  - stdout só com o protocolo: o MCP não carrega o logger e o filho usa `stdio: 'ignore'`;
  - início compartilhado por MCP; a última leitura cobre o caso em que outra instância vence a disputa;
  - erros fora do envelope viram `SERVICO_INDISPONIVEL` sem detalhe; schemas estritos, com `senha` recusada.
- **Configuração:** baseUrl só `https` (ou http local), sem credenciais nem caminho; mensagens de erro citam só a chave e a regra, nunca o valor.
- **CLI e scripts:**
  - `cli-entrar` imprime o endereço só no terminal e só quando o navegador não abriu; `capturar-forma` não loga e fecha a janela no `finally`;
  - os scripts não imprimem o token.
