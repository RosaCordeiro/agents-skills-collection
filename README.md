# softdesk-local

Serviço **local** (só no computador do atendente) que consulta chamados do SoftDesk usando a **sessão web do próprio usuário**. Ele entrega a **fila do atendente** e a **pesquisa avançada**, que o MCP oficial do SoftDesk não tem, por duas portas sobre o mesmo núcleo: **MCP** (para o Claude Code e a skill `/softdesk`) e **REST em `127.0.0.1`**.

Documentos: [SPEC-001](docs/especificacoes/SPEC-001.md) · [ARCH-001](docs/arquitetura/ARCH-001.md) · decisões em [`.ai/decisions`](.ai/decisions).

## O que ele NÃO faz

- **Não escreve no SoftDesk.** Só `GET /login`, `POST /login` e `GET /chamado/json`. Registrar atividade, editar e criar continuam no MCP oficial.
- **Não guarda senha.** A senha é digitada numa janela de login que o serviço abre no navegador; ela vive só durante o `POST` ao SoftDesk e não vai para disco, log, resposta, variável de ambiente nem para o chat. Nenhuma tool pede usuário ou senha.
- **Não renova a sessão sozinho.** Sem senha guardada não há relogin automático: quando o SoftDesk derruba a sessão, a janela de login abre de novo e você entra de novo.
- **Não é um serviço do Windows nem sobe com o computador** (veja "Início automático", opcional).
- **Não espelha chamados em banco** e não acessa o banco do SoftDesk.
- **Não funciona sem o Windows.** O serviço roda só no Windows (abre o navegador do usuário e escuta em `127.0.0.1` do Windows).
- **Não garante a rota do SoftDesk.** `/login` e `/chamado/json` não são rotas oficiais e podem mudar sem aviso; o serviço percebe a mudança e avisa (veja "O SoftDesk mudou").
- Textos (títulos, nomes de pessoas) são dados pessoais: não vão para log nem para arquivo. O que o Claude mostra no chat segue a norma de uso de IA da Clamed (SIN-NOR-000021).

## Pré-requisitos

- Windows com PowerShell e **Node.js 20 ou mais novo**.
- Rede da Clamed (ou VPN) para acessar o SoftDesk e o registro npm interno.
- Registro npm interno para `@clamed/logger`: o `.npmrc` do projeto aponta `@clamed` para `https://verdaccio.clamed.com.br/` (sem token; só a rede Clamed).
- Login pessoal no SoftDesk.

## Instalar e compilar

```powershell
cd C:\Users\<usuario>\Desenvolvimentos\01-PROJECTS\ACTIVE\softdesk-local
npm install
npm run build
npm test        # opcional: a suíte roda só contra um SoftDesk simulado, nunca na produção
```

- `npm install` termina sem erro (aviso de vulnerabilidade ou de pacote antigo não impede). Precisa da rede ou da VPN da Clamed por causa do registro `verdaccio` do `@clamed/logger`: sem VPN o `npm install` falha ao baixar o `@clamed/logger` (erro de rede ou de pacote não encontrado; o texto exato não foi registrado); conecte à VPN e repita.
- `npm run build` termina sem mensagem de erro e cria/atualiza a pasta `dist`.
- **Ordem ao testar:** `npm test` e os testes ponta a ponta **recompilam a pasta `dist`**, que é a mesma que o MCP registrado e o serviço usam. Por isso: (1) pare o serviço (`npm run servico:parar`); (2) `npm run build`; (3) `npm test` (cerca de 90 s; esperado: 42 suítes, 697 testes passando e 1 pulado); (4) deixe o MCP subir o serviço de novo no próximo pedido.
- **Teste lento (opcional):** o único teste pulado espera 20 s reais por uma resposta que nunca chega. Para rodá-lo: `$env:SOFTDESK_TESTE_LENTO='1'; npm test` (PowerShell; a variável vale só naquele terminal). Não é obrigatório para liberar: o mesmo cenário roda com prazo reduzido (VAL-09), e a constante de 20 s é conferida em outro teste.

## Iniciar, parar e ver o estado

O MCP **inicia o serviço sozinho** quando ele está parado; iniciar à mão é opcional.

| Comando | O que faz |
|---------|-----------|
| `npm run servico:iniciar` | Se o serviço já responde, avisa. Senão sobe `node dist\servico.js` em segundo plano (janela oculta) e espera ele responder por até 10 s. |
| `npm run servico:estado` | Mostra o serviço (`versao`, `pid`, `iniciado_em`) e a sessão (estado, janela de login, último alerta). Nunca mostra o token. |
| `npm run servico:parar` | Pede a parada pela rota local. Se o serviço não responder, encerra o `pid` do arquivo de descoberta **só depois de conferir que o processo é o `dist\servico.js`** (o número pode ter sido reaproveitado por outro programa; esse nunca é encerrado). |
| `npm run servico` | Roda em primeiro plano, para desenvolver. |
| `npm run entrar` | Pede o login (veja "Como entrar"). |
| `npm run capturar-forma` | Recuperação quando o SoftDesk muda (veja "O SoftDesk mudou"). |

Só pode existir **uma** instância por usuário: a porta fixa (47821) garante isso. Uma segunda instância sai com "já existe um serviço rodando ou a porta está em uso".

Os scripts são `scripts\*.ps1` e usam só ASCII nas mensagens (o Windows PowerShell 5.1 lê script sem BOM como ANSI).

## Registrar o MCP no Claude Code

Não há segredo no registro. **Windows:**

```powershell
claude mcp add softdesk-local --scope user -- node C:\Users\<usuario>\Desenvolvimentos\01-PROJECTS\ACTIVE\softdesk-local\dist\mcp.js
```

ou, no `~/.claude.json`:

```json
{ "mcpServers": { "softdesk-local": {
    "command": "node",
    "args": ["C:\\Users\\<usuario>\\Desenvolvimentos\\01-PROJECTS\\ACTIVE\\softdesk-local\\dist\\mcp.js"] } } }
```

**Claude Code no WSL** (o serviço continua só no Windows): registre o MCP como `node.exe` com o **caminho do Windows**, para o processo MCP rodar no Windows pela interoperabilidade do WSL, onde o serviço escuta e onde fica `%LOCALAPPDATA%`:

```bash
claude mcp add softdesk-local --scope user -- node.exe 'C:\Users\<usuario>\Desenvolvimentos\01-PROJECTS\ACTIVE\softdesk-local\dist\mcp.js'
```

> **Não testado.** Este caminho para o WSL está no desenho (ARCH-001 §8.1, risco R9) mas ainda não foi validado numa máquina real. **Opcional para aprovar a entrega; fica pendente de validação se você usa o WSL. Critério de sucesso:** no Claude Code do WSL, `softdesk_minha_fila` responde **sem novo login**, usando a sessão do serviço que já está de pé no Windows. Se falhar, anote a mensagem exata e traga a o Claude da entrega (abra o Claude Code na pasta `C:\Users\<usuario>\Desenvolvimentos` e peça "retome a entrega SoftDesk Local lendo Projetos\Especificações\SoftDesk API MCP\ESTADO-softdesk-mcp.md") (não há outro responsável nomeado); não improvise com token ou porta (o plano B exige rever a regra de escutar só em `127.0.0.1`).

**Conferir o registro.** Rode `claude mcp list` num terminal: `softdesk-local` deve aparecer na lista. O Claude Code só carrega o MCP ao **abrir uma sessão nova**: depois de registrar (ou de mover a pasta e registrar de novo), feche e abra o Claude Code. Se as tools `softdesk_*` não aparecerem na sessão nova, o registro não foi carregado. Se o comando `claude` não existir no PATH, use a forma por `~/.claude.json` acima. Se o app desktop do Claude Code lê o mesmo `~/.claude.json` do terminal **não foi confirmado** (A-05): se o app não mostrar as tools, avise o Claude da entrega (abra o Claude Code na pasta `C:\Users\<usuario>\Desenvolvimentos` e peça "retome a entrega SoftDesk Local lendo Projetos\Especificações\SoftDesk API MCP\ESTADO-softdesk-mcp.md") com o que aparece na tela.

> **Mover a pasta do repositório exige atualizar o registro.** O caminho de `dist\mcp.js` fica gravado em `~/.claude.json`. Depois de mover ou renomear a pasta: `claude mcp remove softdesk-local --scope user` e registrar de novo com o caminho novo (e rodar `npm run build` se a pasta `dist` não foi junto).

O MCP expõe sete tools: `softdesk_entrar`, `softdesk_estado_sessao`, `softdesk_minha_fila`, `softdesk_pesquisar`, `softdesk_chamado_completo`, `softdesk_atividades`, `softdesk_saude`. Contrato completo no ARCH-001 §7.1 e §11.

**Ver todas de uma vez (`todas`).** `softdesk_minha_fila` e `softdesk_pesquisar` devolvem 50 itens por vez (até 200 com `limite`). Com `todas: true` o próprio serviço lê as páginas até o fim e devolve tudo o que casa, sem `limite`. Proteções por resposta: no máximo 15 páginas lidas, 300 itens, 60.000 bytes (60 KB) de JSON dos itens e 90 s; ao atingir uma delas a resposta vem com `incompleto: true`, `parada_por` (`paginas`, `itens`, `tamanho` ou `prazo`) e `proximo_inicio` para continuar com `inicio`. Como a fila pode passar de 300 abertos, a skill `/softdesk` encadeia as chamadas com `proximo_inicio` até ele vir `null` (até 5 blocos por pedido). A continuação só evita repetidos se a lista não mudar entre as chamadas (a skill descarta repetidos por código). **Limitação:** um `todas` longo (até 90 s) ocupa a vez da varredura; outros pedidos que chegarem nesse tempo esperam e podem receber `REDE` (é só repetir). Depois de atualizar o código, reinicie o serviço em segundo plano (`npm run servico:parar`; o MCP o sobe de novo no próximo pedido). Nunca vem erro nem resultado parcial sem aviso. `todas: true` junto de `limite` é recusado (`FILTRO_INVALIDO`); `inicio`, os filtros de texto, de status e de atendente funcionam junto. Sem `todas` nada muda. A resposta do modo `todas` acrescenta `todas`, `itens_devolvidos` e `teto_itens`, e traz `limite_pedido` e `limite_aplicado` nulos.

- MCP: `softdesk_minha_fila` com `{ "todas": true }`; `softdesk_pesquisar` com `{ "atendente": [393], "todas": true }`.
- REST (com o token do arquivo de descoberta): `GET /v1/fila?todas=true` (a query aceita `true` ou `false`); `POST /v1/chamados/pesquisa` com corpo `{ "atendente": [393], "todas": true }` (booleano JSON).
- Continuar depois de um teto: repetir com `inicio` igual ao `proximo_inicio` recebido, por exemplo `GET /v1/fila?todas=true&inicio=3000`.

Cuidado com o volume no chat: títulos e nomes de pessoas são dados pessoais (norma de IA da Clamed); com muitas linhas, peça um resumo ou a contagem em vez de listar tudo.

## Configurar

Não há segredo de configuração e não há `.env`. Precedência: **variável de ambiente > `%LOCALAPPDATA%\softdesk-local\config.json` (opcional) > padrão**. Lida no início do serviço: mudar exige reiniciar (`npm run servico:parar`; o MCP o sobe de novo). Chave desconhecida ou valor fora da regra impede o início, com mensagem que cita só a chave.

| Chave (`config.json`) | Variável | Padrão | Regra |
|-----------------------|----------|--------|-------|
| `baseUrl` | `SOFTDESK_LOCAL_BASE_URL` | `https://helpdesk.clamed.com.br` | `https`, exceto `127.0.0.1`/`localhost` |
| `cdAtendente` | `SOFTDESK_LOCAL_CD_ATENDENTE` | `393` | inteiro > 0 |
| `perfilPadrao` | `SOFTDESK_LOCAL_PERFIL_PADRAO` | `A` | `A`, `U` ou `T` |
| `esperaLoginSegundos` | `SOFTDESK_LOCAL_ESPERA_LOGIN_S` | `120` | 1 a 280 |
| `porta` | `SOFTDESK_LOCAL_PORTA` | `47821` | 1024 a 65535 |
| `prazoVarreduraSegundos` | `SOFTDESK_LOCAL_PRAZO_VARREDURA_S` | `90` | 20 a 300 |
| `notificarWindows` | `SOFTDESK_LOCAL_NOTIFICAR` | `true` | `true` ou `false` (balão do Windows quando o SoftDesk muda) |
| `nivelLog` | `LOG_LEVEL` | `info` | níveis do logger |
| (pasta) | `SOFTDESK_LOCAL_DIR` | `%LOCALAPPDATA%\softdesk-local` | usada pelo serviço, pelo MCP e pelos scripts |
| (MCP) | `SOFTDESK_LOCAL_MCP_TIMEOUT_S` | `310` | segundos > 0; prazo do MCP por chamada ao serviço. O padrão fica acima do teto de 280 s de `esperaLoginSegundos`: se você baixar este valor, mantenha-o acima da espera de login, senão o MCP corta antes e responde `SERVICO_INDISPONIVEL` |

Exemplo de `config.json` (só o que difere do padrão):

```json
{ "cdAtendente": 393, "notificarWindows": false }
```

**Perfil de login:** `A` = atendente, `U` = solicitante, `T` = técnico (fonte: `pesquisa_avancada/core/domain/entities.py:14` do `mcp-softdesk`). O atendente usa `A`, que é o padrão. O serviço não restringe o perfil: o resultado é o que o SoftDesk devolver para o perfil escolhido (decisão do usuário).

**Código do atendente:** `cdAtendente` (padrão 393) é o código do atendente dono da fila; o login não o informa. Quem for testar com outro atendente muda `cdAtendente` no `config.json` ou em `SOFTDESK_LOCAL_CD_ATENDENTE` e reinicia o serviço.

## Como entrar

1. Peça qualquer consulta ao Claude (por exemplo "minha fila") ou rode `npm run entrar`. Sem sessão, o serviço abre uma **janela de login local** no navegador padrão e a consulta responde **na hora** com `AGUARDANDO_LOGIN` (não fica esperando). Só a tool `softdesk_entrar` (e `npm run entrar`) espera pelo login, por até 120 s (`esperaLoginSegundos`).
2. Digite usuário, senha e perfil **na janela** (nunca no chat nem no terminal; perfil `A` para atendente). O endereço da janela tem um token de uso único e vale 5 minutos. Ao aceitar, a janela mostra "Pronto".
3. Se o Claude respondeu `AGUARDANDO_LOGIN`, entre na janela e **repita o pedido** (a resposta orienta o Claude a repetir; se ele não repetir, peça de novo). Se a janela não abrir em cerca de 15 s, rode `npm run entrar`: ele imprime o endereço **no terminal** quando o navegador não abriu (é o único lugar onde ele aparece: nunca em log, arquivo, MCP ou chat). Cole-o no navegador.
4. A sessão continua até o SoftDesk derrubá-la; aí a janela abre de novo.

## Códigos de erro e o que fazer

O envelope de erro traz `error.code`, `error.message` e `error.acao` (texto fixo, sem dado pessoal). Códigos com `destaque: true` também trazem o bloco `alerta`.

| Código | O que significa | O que fazer |
|--------|-----------------|-------------|
| `AGUARDANDO_LOGIN` | Não há sessão; a janela de login abriu (ou já estava aberta). | Entre na janela e repita o pedido. Navegador não abriu: `npm run entrar`. |
| `SESSAO_EXPIRADA` | O SoftDesk derrubou a sessão. | Entre de novo na janela que abriu e repita o pedido. |
| `CREDENCIAL` | O SoftDesk recusou o login. | Confira usuário, senha e perfil; entre de novo. |
| `REDE` | Falha de conexão, tempo esgotado, erro 5xx ou prazo da varredura. | Confira a rede ou a VPN da Clamed e tente mais tarde. |
| `LAYOUT_LOGIN_MUDOU` (**destaque**) | A página ou a resposta de login do SoftDesk mudou. Não é senha nem sessão. | Siga o roteiro "O SoftDesk mudou". |
| `CONTRATO_ROTA_MUDOU` (**destaque**) | A rota de pesquisa mudou (ou um campo essencial sumiu). | Siga o roteiro "O SoftDesk mudou". Enquanto isso use o MCP oficial. |
| `NAO_ENCONTRADO` | Chamado inexistente ou fora da visibilidade da sessão. | Confira o código. |
| `FILTRO_INVALIDO` | Entrada inválida (inclui campo extra, por exemplo `senha`). | Corrija os campos indicados. Nada foi enviado ao SoftDesk. |
| `NAO_AUTORIZADO` | REST sem token, token errado, `Host` ou `Origin` recusados. | Use o MCP ou os comandos `npm run`, que leem o arquivo de descoberta. |
| `SERVICO_INDISPONIVEL` | Só no MCP: não conseguiu iniciar ou alcançar o serviço em 10 s. | Veja `%LOCALAPPDATA%\softdesk-local\logs`, rode `npm run servico:estado` e `npm run servico:iniciar`; porta em uso por outro programa? mude `porta`. |
| `ERRO_INTERNO` | Exceção não prevista. | Procure o `correlation_id` da resposta no log. |
| `NAO_DISPONIVEL` | Atividades pedidas; a rota ainda não foi descoberta (Q-07). | Use o MCP oficial (`dossie_chamado`). |

Além dos erros, uma resposta de **sucesso** pode trazer `aviso_deriva` (um campo usado, como `nm_usuario`, faltou ou mudou de tipo). Os dados chegam, com aquele campo nulo; trate como aviso para o roteiro abaixo. `null` num campo usado ou secundário **nunca** é deriva (um chamado sem tipo entre milhares não dispara alarme); só campo ausente ou com outro tipo, e campo essencial nulo ou de tipo trocado. A deriva também gera log `softdesk_deriva` (só nomes), `ultimo_alerta` com código `DERIVA` e um balão do Windows (no máximo um a cada 10 minutos).

## O SoftDesk mudou

O SoftDesk pode mudar a rota ou o formato a qualquer momento. O serviço **percebe cedo** (erro `LAYOUT_LOGIN_MUDOU` ou `CONTRATO_ROTA_MUDOU`, `aviso_deriva`, balão do Windows, alerta em `softdesk_estado_sessao` e `softdesk_saude`) e este roteiro leva a **recuperar em minutos**:

1. **Rodar a captura:** `npm run capturar-forma`. Ela abre uma janela de login **própria** (entre de novo; não usa a sessão do serviço), faz **uma** pesquisa de até 200 itens (uma página) e grava `forma-atual.json` na raiz do projeto (ignorado pelo git; **só nomes de campos e tipos, nunca valores**). A pesquisa é sempre a mesma: os 200 chamados **mais novos do atendente configurado (`cdAtendente`), de qualquer status** (abertos e fechados que estiverem entre eles). Não há parâmetro de limite, de status nem de atendente na linha de comando (`src/cli-capturar-forma.ts`, `LIMITE_CAPTURA = 200`).
2. **Ler a diferença** que ela imprime contra o contrato dourado, por escopo (`login`, `pesquisa.topo`, `pesquisa.treeview`, `pesquisa.item`): `NOVO` (campo que o contrato não conhece), `AUSENTE` (campo do contrato que não veio) e `TIPO` (tipo observado fora do conjunto do contrato).
3. **Ajustar o mapeamento** em `src/infraestructure/softdesk/contrato.ts` e `src/infraestructure/softdesk/softdesk-http.gateway.ts` (únicos arquivos que conhecem a rota e os campos do SoftDesk) e em `ChamadoBasico` (`src/core/domain/entities/chamado.ts`) se o campo renomeado for um dos 11 básicos.
4. **Atualizar o dourado:** `npm run capturar-forma -- --atualizar`. Regrava `src/infraestructure/softdesk/contrato-dourado.json` **unindo** os tipos observados com os que já existiam (nada é removido; campo novo entra como `outro`, promova a `usado` ou `essencial` no arquivo se o código passar a depender dele; `null` observado entra no conjunto). **Troca de tipo em campo `essencial` ou `usado`** não é regravada: o comando imprime `ATENCAO`/`TROCA`, **sai com código 3** e deixa o campo como estava. Primeiro ajuste o mapeamento (passo 3) e só então rode `npm run capturar-forma -- --atualizar --aceitar-troca-de-tipo`.

   > **Primeiro uso real (refazer o dourado):** o dourado inicial foi gerado de apenas 2 amostras. Procedimento verdadeiro com o que a captura faz hoje: rode `npm run capturar-forma` (200 mais novos do atendente configurado, todos os status), leia o diff, depois `npm run capturar-forma -- --atualizar` (une os tipos: nada é removido; cada rodada só acrescenta) e revise as marcas no `contrato-dourado.json`. **Chamados não atribuídos não entram** (o filtro de atendente os exclui), e fechados só entram se estiverem entre os 200 mais novos do atendente. Para ampliar a amostra, dá para repetir com outro código de atendente apenas naquele terminal (`$env:SOFTDESK_LOCAL_CD_ATENDENTE='<codigo>'; npm run capturar-forma -- --atualizar`, e depois `Remove-Item Env:SOFTDESK_LOCAL_CD_ATENDENTE`); **não foi confirmado** que o perfil do atendente enxerga chamados de outro atendente. O que sobra de lacuna é contido pela tolerância a `null` (RN-17): campo usado ou secundário `null` nunca gera alarme. **O que esperar do diff:** NOVO e AUSENTE em campos de marca outro são esperados. TIPO, ou saída com código 3 (TROCA/ATENCAO), em campo essencial ou usado: pare e traga a o Claude da entrega (abra o Claude Code na pasta `C:\Users\<usuario>\Desenvolvimentos` e peça "retome a entrega SoftDesk Local lendo Projetos\Especificações\SoftDesk API MCP\ESTADO-softdesk-mcp.md"); não use --aceitar-troca-de-tipo sem ajustar o mapeamento (passo 3). **Antes de --atualizar**, copie o dourado (Copy-Item src\infraestructure\softdesk\contrato-dourado.json $env:TEMP\contrato-dourado.bak.json) e restaure-o (Copy-Item $env:TEMP\contrato-dourado.bak.json src\infraestructure\softdesk\contrato-dourado.json -Force) se o 
pm test falhar: sem commit, não há outro jeito de desfazer.
5. **Parar, compilar e testar, nesta ordem:** `npm run servico:parar` (os testes recompilam a pasta `dist` do serviço), `npm run build` e `npm test` (o simulador dos testes é gerado do dourado).
6. **Deixar o serviço subir de novo:** não rode nada; o MCP o sobe no próximo pedido (ou `npm run servico:iniciar`).

Enquanto o serviço está quebrado, a skill `/softdesk` mostra o alerta e oferece o MCP oficial para o que ele cobre (chamados que o usuário abriu, leitura por código e `dossie_chamado`). Essa orientação só vale depois que a skill for sincronizada (hoje está editada só na fonte da biblioteca); sem a skill, o serviço funciona do mesmo jeito pelas tools `softdesk_*`, e o alerta chega no envelope da resposta, no log e no balão.

## Atividades de um chamado (Q-07)

`softdesk_atividades` responde `NAO_DISPONIVEL` até a rota web que lista as atividades ser descoberta. Para descobrir: no SoftDesk, abra as atividades de um chamado, abra as ferramentas do navegador (aba Rede) e copie **só o caminho da rota e os nomes dos parâmetros** (nunca cookies, tokens, cabeçalhos nem o conteúdo). Com isso, o ramo "com a rota" (VAL-33, CA-29) será uma **nova entrega**; esta entrega não o implementa.

## Estação com inspeção de certificado (TLS)

Algumas estações da Clamed passam o tráfego por um equipamento que troca o certificado (inspeção TLS). Sintoma provável: o serviço responde `REDE` ao falar com o SoftDesk mesmo com a rede/VPN funcionando e com o SoftDesk abrindo no navegador, e o log traz `softdesk_rede` (o texto da falha não é registrado). Isso **não foi observado** numa estação real nesta entrega. Para resolver, aponte a CA corporativa por `NODE_EXTRA_CA_CERTS`: o arquivo `.pem` da CA corporativa se pede ao time de TI ou à Segurança da Informação (csi@clamed.com.br). Defina a variável de forma permanente no Windows com `setx NODE_EXTRA_CA_CERTS "<caminho do .pem>"`, abra um terminal e um Claude Code novos (o MCP repassa a variável ao serviço), rode `npm run servico:parar` para o MCP subir o serviço de novo com a variável e repita o pedido. Não use `NODE_OPTIONS` para código: `--require`, `--import`, `--loader` e `--inspect` são removidos.

## Balão do Windows

O balão (`notificarWindows`) não pode ser provocado contra o SoftDesk real sem alterá-lo, e não há comando nem script para subir o simulador de teste à mão (o simulador é código de teste em `test/simulador`, usado só pelos testes). **Não validável em produção; coberto só por teste com executor falso** (`test/unit/notificador-windows.spec.ts`).

## Onde ficam os logs

`%LOCALAPPDATA%\softdesk-local\logs\servico.log` (14 arquivos, 14 dias). Na pasta `%LOCALAPPDATA%\softdesk-local` só existem `servico.json` (arquivo de descoberta: porta, token e pid, apagado na parada), `config.json` (opcional) e `logs\`.

Logs só têm código de chamado e tipo de erro. **Nunca:** senha, usuário, cookie, token, endereço da janela, título, nome de pessoa, valor de filtro, corpo ou cabeçalho de resposta, mensagem de exceção.

Cada operação gera um log de início e um de fim com o mesmo `correlation_id` (o mesmo valor volta no envelope). **Tempos:** o log de fim de cada operação (`event.name` = `fila`, `pesquisa`, `chamado` ou `saude`, `outcome` = `success`) traz `duracao_ms`; o da `fila` traz também `paginas_lidas`, `abertos` e `total_softdesk`; no modo `todas`, fila e pesquisa trazem ainda `todas` e `parada_por`. Cada chamada ao SoftDesk gera um log `softdesk_http` com `rota` e `duracao_ms`. Para ver os últimos: `Select-String -Path "$env:LOCALAPPDATA\softdesk-local\logs\servico*" -Pattern duracao_ms | Select-Object -Last 10`. O envelope de resposta só traz `duracao_ms` na `softdesk_saude`. Procure pelas **keywords**:

| Keyword | Quando |
|---------|--------|
| `softdesk_contrato_mudou` | `LAYOUT_LOGIN_MUDOU` ou `CONTRATO_ROTA_MUDOU` (nível `error`) |
| `softdesk_deriva` | campo usado ausente ou com tipo diferente (nível `warn`; só nomes) |
| `softdesk_campo_novo` | campo novo no item da pesquisa, uma vez por processo (nível `info`; só nomes) |
| `softdesk_sessao_expirada` | o SoftDesk derrubou a sessão |
| `softdesk_rede` | falha de conexão, tempo esgotado ou 5xx |
| `softdesk_login_recusado` | o SoftDesk recusou o login |
| `rest_nao_autorizado` | REST sem token, token errado, `Host` ou `Origin` recusados |

## Início automático com o Windows (opcional, fora desta entrega)

Para subir o serviço no logon, crie um atalho na pasta Inicializar (`shell:startup`) para:

```text
powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\Users\<usuario>\Desenvolvimentos\01-PROJECTS\ACTIVE\softdesk-local\scripts\iniciar-servico.ps1"
```

Não é necessário: o MCP já inicia o serviço quando precisa.

## Segurança em uma página

- O serviço escuta só em `127.0.0.1`. Todo pedido confere `Host`, recusa `Origin` (bloqueia página de navegador) e exige `Authorization: Bearer <token>`; o token (32 bytes aleatórios) muda a cada início e fica só em `%LOCALAPPDATA%\softdesk-local\servico.json`, numa pasta com ACL restrita ao usuário.
- O balão do Windows (`notificarWindows`) tem texto fixo por código, sem dado do chamado nem da pessoa.
- O endereço da janela de login (com o token de uso único, válido por 5 minutos) fica por instantes na linha de comando do navegador e do `cmd`, visível a processos do mesmo usuário; risco aceito (o mesmo usuário já lê o arquivo de descoberta).
- O serviço iniciado pelo MCP roda com a pasta do próprio repositório como diretório de trabalho e com um ambiente mínimo (sem as credenciais de outros MCPs). O mesmo vale para `npm run servico:iniciar`. Passam só a lista de permissão: variáveis `SOFTDESK_LOCAL_*`, pastas do Windows, `PATH`, CA corporativa e proxy (`NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`) e `NODE_OPTIONS` (com `--use-openssl-ca`/`--use-system-ca`), este sem `--require`, `--import`, `--loader` e `--inspect`.
- A suíte de testes usa só o SoftDesk simulado; senhas de teste são sentinelas aleatórias.
