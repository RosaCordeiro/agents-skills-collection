# SPEC-001 — SoftDesk Local: fila e pesquisa avançada de chamados com login local

## 1. Identificação do documento

| Campo | Valor |
|-------|-------|
| Tipo | **feat** |
| Título | SoftDesk Local — consulta de chamados (fila e pesquisa avançada) por sessão web local |
| Código / versão | SPEC-001 / v0.10 |
| Branch | `feat/softdesk-local-mvp` |
| Objetivo | Permitir que o atendente liste os chamados da sua fila e faça qualquer pesquisa avançada do SoftDesk, pelo Claude (MCP) ou por REST local, usando o login do próprio usuário digitado numa janela local, sem senha no chat. |
| Solicitante / stakeholders | Guilherme Cordeiro (atendente, código 393) |
| Atores / personas | Atendente; agente de IA (Claude, skill `/softdesk`); SoftDesk web |
| Prioridade | MVP |
| Status | aprovado em 2026-11-19 (folheto do plano v4) |
| Data | 2026-11-19 |

## 2. Contexto e problema (BRD)

- **Situação atual.** O MCP oficial do SoftDesk usa uma credencial de serviço e só devolve os chamados que o usuário abriu; não filtra por atendente. A busca avançada do SoftDesk (tela web) filtra por atendente, status e vários outros campos, mas a única ferramenta que a usa (`pesquisar_chamados_avancado`, no repositório `mcp-softdesk`, de outro time) exige usuário e senha a cada chamada, o que faz a senha passar pelo chat.
- **Dor.** O atendente não consegue pedir ao Claude "quais chamados estão na minha fila" nem fazer pesquisas avançadas sem expor a senha. Por isso a lista da fila é feita à mão na tela do SoftDesk.
- **Por que agora.** O acesso direto ao banco do SoftDesk está bloqueado por liberação de IP fixo, e a captura real da rota web foi feita em produção em 19/11/2026 e confirmou que login, filtro por atendente, total real e paginação funcionam.
- **Restrições.** A norma de uso de IA da Clamed (SIN-NOR-000021, item 6.1.1) veda senha em prompt. As rotas web usadas (`/login`, `/chamado/json`) **não são oficiais nem documentadas**: podem mudar sem aviso, e o usuário aceita esse risco desde que a quebra seja claramente sinalizada.

## 3. Objetivos e métrica de sucesso

| Objetivo | Como medir (negócio) |
|----------|----------------------|
| Listar a fila do atendente sem a senha passar pelo chat | Nenhuma senha em chat, logs ou argumentos de tool (RNF-01, VAL-01) |
| Cobrir "qualquer pesquisa avançada" que a tela web oferece | Os filtros de RF-04 funcionam contra produção (o de atendente já foi comprovado); os que não foram confirmados ficam marcados como "por convenção" |
| Perceber rápido quando o SoftDesk mudar | Toda quebra de layout/rota aparece com código próprio e mensagem destacada (VAL-06, VAL-07) |

## 4. Escopo

### 4.1 Em escopo

- Janela de login local e sessão em memória.
- Minha fila (chamados abertos do atendente configurado).
- Pesquisa avançada com os filtros do SoftDesk, com paginação e total real.
- Chamado completo por código (todos os campos que o SoftDesk devolve).
- Estado da sessão e verificação de saúde (detecção de mudança de layout/rota).
- Duas portas sobre o mesmo núcleo: MCP (stdio) e REST em 127.0.0.1.
- Início do serviço pelo próprio MCP, sem passo manual; o serviço não encerra por ociosidade.
- Atividades de um chamado, só leitura e sob demanda, assim que a rota web delas for descoberta (Q-07).
- Mitigação do risco da rota não oficial: contrato dourado, detecção de deriva campo a campo, comando de captura e roteiro de recuperação (RN-17, RF-12).
- Janela de login com a identidade visual da Clamed, sem animação (RNF-09).
- Filtros de texto (nome de quem abriu, parte do título, prioridade e tipo) na fila e na pesquisa, para pedir em linguagem natural, como "meus chamados abertos pela Rosangela".
- Ajuste da skill `/softdesk` para consultar o serviço local (última etapa da entrega).

### 4.2 Fora de escopo

- Escrever no SoftDesk (registrar atividade, editar, criar chamado): o MCP oficial já faz, e manter o serviço só de leitura reduz o risco de uma sessão pessoal ser usada para alterar chamados.
- Ler chamado por código pela API oficial: já existe; o chamado completo deste serviço vem da mesma rota da pesquisa.
- Espelhar chamados em banco ou gerar relatórios: o `clamed.dev` já mantém espelho no Postgres.
- Guardar senha em disco ou reter senha em memória para relogin automático: decisão do usuário, para que a senha nunca fique guardada.
- Acesso direto ao banco MySQL do SoftDesk: o acesso só é liberado para IPs fixos.
- Alterar o `mcp-softdesk`: pertence a outro time; uma extensão futura será avaliada depois do uso real.
- Vários usuários no mesmo processo: o serviço atende só quem o executa.
- Iniciar o serviço junto com a inicialização do Windows: o MCP já o inicia na primeira chamada, então não há ganho para o MVP.

### 4.3 Premissas e dependências

- Premissas: o usuário tem login pessoal no SoftDesk e rede Clamed (ou VPN); base de produção `https://helpdesk.clamed.com.br` (configurável); código de atendente configurável, padrão 393.
- Dependências externas: rotas `/login` e `/chamado/json` do SoftDesk web.
- Observabilidade (stack Node, projeto novo): **só `@clamed/logger`**, por decisão do usuário; `light-node-metrics` fica fora porque o serviço roda local e nada consumiria um endpoint de métricas.
- Contexto de agentes: `.ai/` criado conforme skill `projeto-ai`.

## 5. Glossário

| Termo | Definição de negócio |
|-------|----------------------|
| Chamado | Registro de atendimento no SoftDesk, identificado por código numérico |
| Minha fila | Chamados cujo atendente é o código configurado e cujo status não é fechado |
| Status fechado | Encerrado (2), Fechado pelo usuário (3), Fechado pelo administrador da área (4), Fechado por decurso de prazo (6); mesma regra do `clamed.dev` |
| Pesquisa avançada | Busca do SoftDesk web por filtros combinados (atendente, status, prioridade, grupo, tipo, cliente, período etc.) |
| Sessão | Login válido no SoftDesk web, mantido só em memória do processo |
| Janela de login | Página servida em 127.0.0.1, aberta no navegador padrão, onde o usuário digita usuário e senha |
| Contrato da rota | Formato de resposta que o serviço espera do SoftDesk (JSON com `lista` e `treeview.total`; login com `status`) |
| Código de atendente | Número do atendente no catálogo de atendentes (diferente do código de solicitante) |

## 6. Regras de negócio (RN)

| ID | Regra | Obrigatória? |
|----|-------|--------------|
| RN-01 | O serviço só lê: as únicas chamadas ao SoftDesk são a página de login e o login (um só fluxo de entrada) e a consulta de pesquisa. | Sim |
| RN-02 | A senha só é digitada na janela de login local; nunca por chat, argumento de tool, parâmetro REST, variável de ambiente, arquivo ou log. Motivo: norma SIN-NOR-000021, item 6.1.1. | Sim |
| RN-03 | A sessão vive só na memória do processo e a senha não é retida depois do login. Quando a sessão cai, o serviço abre nova janela de login. Motivo: a senha nunca fica guardada. | Sim |
| RN-04 | Minha fila = chamados com `cd_atendente` igual ao código configurado e status fora de {2, 3, 4, 6}. Motivo: é a definição de "aberto" já usada no `clamed.dev`. | Sim |
| RN-05 | Na pesquisa avançada, a lista traz 50 itens por página por padrão e no máximo 200. O total informado é o **total real** do SoftDesk (`treeview.total`), não o tamanho da página. Motivo: o SoftDesk aceitou páginas de 500, mas 200 limita peso e tempo, e o total real mostra se faltam páginas. O parâmetro opcional `todas` (RN-09) lê todas as páginas por conta do serviço, sem a página de 50 nem o teto de 200 por parte; ele não pode ser combinado com `limite`. | Sim |
| RN-06 | A lista traz só campos básicos (código, título, status em código e texto, prioridade, tipo, solicitante, data e hora de abertura, quantidade de interações, código do atendente). O chamado completo traz todos os campos devolvidos pelo SoftDesk, sem remodelar. Motivo: a lista fica leve e o completo serve para inspeção pontual. | Sim |
| RN-07 | Falhas têm código tipado e mensagem de ação (§11). Mudança de layout ou rota (`LAYOUT_LOGIN_MUDOU`, `CONTRATO_ROTA_MUDOU`) é sinalizada de forma destacada e nunca é confundida com sessão expirada ou senha errada. Motivo: o usuário aceitou a rota não oficial desde que a quebra seja avisada. | Sim |
| RN-08 | Contrato verificado a cada resposta: o login só é válido se for JSON com `status` booleano; a pesquisa só é válida se for JSON com `lista` (array) e `treeview.total` numérico. Resposta que não é JSON mas redireciona para `/login` é sessão expirada; no login, resposta que não seja JSON com `status` booleano (ou página sem cookie XSRF) é `LAYOUT_LOGIN_MUDOU`; na pesquisa, qualquer outra resposta fora do contrato é `CONTRATO_ROTA_MUDOU`; HTTP 5xx ou falha de conexão é `REDE`. No login, `status` falso ou HTTP 401 é `CREDENCIAL`; na pesquisa, HTTP 401 ou 403 é `SESSAO_EXPIRADA`. Motivo: o código existente no `mcp-softdesk` trata página HTML e erro 5xx como sessão expirada, o que esconderia a quebra real. | Sim |
| RN-09 | A fila é lida de forma progressiva: a cada chamada o serviço lê páginas do SoftDesk (200 por página) a partir de `inicio`, descarta os chamados fechados e devolve os primeiros `limite` abertos (padrão 50, máximo 200), lendo no máximo 15 páginas por chamada. A resposta traz `proximo_inicio` (posição do SoftDesk para continuar; `null` quando acabou) e o total do SoftDesk (`treeview.total`, que inclui os fechados) só como informação. Se as 15 páginas foram lidas e ainda há itens, a resposta marca `incompleto: true` e traz `proximo_inicio`. Na pesquisa avançada, o servidor só recebe o filtro de status "EM_ATENDIMENTO" (único validado); para qualquer outro status o serviço usa a mesma leitura progressiva, filtrando no cliente, marca `filtro_status_no_cliente: true` e devolve `proximo_inicio`; o total é o do SoftDesk antes desse filtro. Motivo: os nomes dos outros status no filtro do servidor não estão confirmados; a fila aberta do atendente passa de 200 chamados, então precisa ser percorrida por partes; e o total do SoftDesk da fila (2.394 na captura de produção) inclui os fechados, então não representa a fila aberta. **Modo `todas` (opcional, padrão `false`):** na fila e na pesquisa, `todas: true` faz o próprio serviço ler as páginas de 200 em sequência, a partir de `inicio`, e devolver todos os itens que casam (campos básicos de RN-06), sem o limite de 50 e sem o teto de 200 por parte. Proteções fixas: no máximo 15 páginas lidas, 300 itens devolvidos, 60.000 bytes (60 KB) de JSON dos itens por resposta e 90 s no total (o prazo é o da varredura, RNF-05). O teto de 300 itens e o de 60.000 bytes existem para a resposta caber numa resposta de tool MCP; como a fila do usuário pode passar de 300 abertos, quem chama (a skill) encadeia as leituras com `proximo_inicio` até ele vir `null`. Ao atingir qualquer proteção, a resposta devolve o que foi lido com `incompleto: true`, `proximo_inicio` preenchido e `parada_por` (`paginas`, `itens`, `tamanho` ou `prazo`); nunca erro nem resultado parcial silencioso. Na parada por tamanho o item que não coube não é devolvido e a continuação começa nele. A continuação por `proximo_inicio` só evita repetidos se a lista não mudar entre as chamadas; o cliente descarta repetidos por código. Um `todas` longo ocupa a vez da varredura (RNF-04): outros pedidos esperam e podem estourar o próprio prazo com `REDE` (limitação aceita, usuário único). Exceção: prazo vencido antes de ler a primeira página continua sendo `REDE` (não há o que devolver). A resposta traz `todas: true`, `itens_devolvidos`, `teto_itens`, `limite_pedido` e `limite_aplicado` nulos; sem `todas` o formato e o comportamento são os de antes (inclusive o prazo estourado ser `REDE` sem parcial). `todas: true` junto de `limite` é ambíguo e vira `FILTRO_INVALIDO`; `inicio` é permitido (continuar a partir de `proximo_inicio`); `todas` que não seja booleano é `FILTRO_INVALIDO`. Os filtros de texto, de status e de atendente valem com `todas`. Motivo: o usuário quis ver todas as abertas de uma vez, e a leitura por partes de 50 exigia pedir várias vezes; os tetos protegem o SoftDesk, o tempo de resposta e o volume de títulos e nomes de pessoas no chat (norma de IA). | Sim |
| RN-10 | A janela de login escuta só em 127.0.0.1, em porta aleatória, com token de uso único, expira em 5 minutos, rejeita `Host` diferente do esperado e fecha depois do uso. Motivo: impede que outro programa ou site use a janela para capturar ou provocar login. | Sim |
| RN-11 | O perfil de login padrão é Atendente; a janela permite escolher Solicitante ou Técnico. Motivo: o SoftDesk exige o perfil no login (A para atendente, U para solicitante, T para técnico, como o `mcp-softdesk` já usa) e a fila é do perfil Atendente. O serviço não restringe o perfil: com Solicitante ou Técnico, a fila e a pesquisa devolvem o que o SoftDesk devolver para esse perfil (inclusive lista vazia ou erro de contrato), e isso cabe ao usuário. | Não |
| RN-12 | O código de atendente e a base URL vêm de configuração local não secreta (padrão: 393 e `https://helpdesk.clamed.com.br`). A configuração é lida quando o serviço inicia; mudar exige reiniciá-lo. O serviço não confere se quem entrou é o atendente configurado e não avisa: a fila é sempre a do código configurado, e cabe ao usuário configurá-lo e entrar com o próprio login. Motivo: a resposta de login não devolve o código do usuário. | Sim |
| RN-13 | Nada de dado de chamado é gravado em disco; logs trazem só códigos (de chamado e o de atendente configurado) e tipos de erro, nunca título, nome de pessoa, cookie ou senha. Motivo: títulos e nomes de solicitantes são dados pessoais. O nome de usuário do login aparece só na resposta de estado da sessão (RF-02), nunca em log. Em disco só existem arquivos sem dado de chamado, senha ou cookie: o arquivo de descoberta do serviço (porta e token do REST), a configuração local e os logs. | Sim |
| RN-14 | Sem sessão ou com sessão expirada, o serviço abre a janela de login (ou reaproveita a que já está aberta, nunca abrindo duas), responde na hora e não repete a consulta sozinho (sem sessão: `AGUARDANDO_LOGIN`; sessão que acabou de expirar: `SESSAO_EXPIRADA` na primeira consulta e `AGUARDANDO_LOGIN` nas seguintes, até o login); quem chamou repete depois do login. Motivo: o login pode levar minutos e a consulta original já pode não fazer mais sentido; quem chamou decide se repete. | Sim |
| RN-15 | O usuário nunca precisa iniciar o serviço à mão: quando uma tool MCP é chamada e o serviço não está rodando, o MCP o inicia em segundo plano (uma só instância por usuário) e espera até 10 s. O serviço não encerra por ociosidade: continua rodando até ser parado por comando, até o Windows reiniciar ou o usuário sair; a sessão do SoftDesk só termina quando o SoftDesk a rejeita (RN-14). Motivo: o uso deve ser o mesmo do `mcp-sybase-readonly`, só registrar e usar, e o usuário não quer perder o login por ficar um tempo sem pedir nada. | Sim |
| RN-16 | Os filtros de texto casam sem diferenciar maiúsculas e acentos, e todas as palavras pedidas precisam aparecer no campo ("rosangela" casa "Rosângela Alves"): `solicitante_nome` (nome de quem abriu), `titulo_contem`, `prioridade_nome` e `tipo_nome`. São aplicados no cliente, sobre os itens lidos, na fila e na pesquisa, e a resposta marca `filtro_texto_no_cliente: true`. Motivo: o usuário pede por nome ("chamados abertos pela Rosangela"), e o SoftDesk filtra por código, sem rota conhecida que descubra o código a partir do nome. Quando a pesquisa não tem filtro de servidor que a restrinja (como o atendente), a leitura cobre só os 3.000 chamados mais novos (15 páginas de 200) e a resposta marca `incompleto: true`. | Sim |
| RN-17 | Cada resposta de pesquisa é conferida campo a campo contra o contrato dourado (arquivo de referência gerado de uma captura real). Campos essenciais: `cd_chamado`, `st_chamado` e `cd_atendente`; se algum faltar ou mudar de tipo, a resposta é `CONTRATO_ROTA_MUDOU` com os nomes dos campos, porque a fila e a identificação dependem deles. Campos usados nas listas e nos filtros: `ds_status`, `nm_usuario`, `tt_chamado`, `ds_prioridade`, `ds_tipo_chamado`, `da_chamado`, `ha_chamado` e `qtd_interacoes`; se algum faltar ou mudar para um tipo que não seja `null`, o item sai com o campo nulo e a resposta traz `aviso_deriva` destacado com os nomes. `null` em campo usado é aceito e não gera aviso (tolerância intencional): um único `null` real em milhares de itens geraria alarme falso, e as capturas reais já mostram campos que ora vêm nulos, ora texto; os campos essenciais continuam sem poder ser `null`. Campo novo no SoftDesk não é erro: vai só para o log. O log guarda só nomes e tipos de campos, nunca valores. Motivo: o usuário aceita a rota não oficial desde que a quebra seja percebida cedo e se possa recuperar rápido, e uma mudança parcial (um campo renomeado) é mais provável do que a quebra total. | Sim |

## 7. Requisitos funcionais (RF / FRD)

| ID | Requisito | Prioridade | RNs |
|----|-----------|------------|-----|
| RF-01 | O sistema deve abrir a janela de login e, quando o login for aceito, deixar a sessão autenticada e informar só o estado (usuário e perfil), sem credenciais. Retorna quando o login for aceito (autenticada), quando for rejeitado (`CREDENCIAL`, `REDE` ou `LAYOUT_LOGIN_MUDOU`) ou quando a espera de 120 s se esgotar (`AGUARDANDO_LOGIN`, com a janela ainda aberta até os 5 minutos de RN-10). Se já houver sessão válida, retorna autenticada sem abrir janela; se já houver janela aberta, reaproveita-a. | Must | RN-02, RN-03, RN-08, RN-10, RN-11, RN-14 |
| RF-02 | O sistema deve informar o estado da sessão (autenticada ou não, usuário, perfil, desde quando) sem credenciais. | Must | RN-02, RN-03 |
| RF-03 | O sistema deve listar a minha fila por partes (`inicio` e `limite`), na ordem em que o SoftDesk devolve (mais novo primeiro), com `proximo_inicio` para continuar e o total do SoftDesk à parte. Aceita os filtros de texto de RN-16, por exemplo para ver só os abertos por determinada pessoa. Com `todas: true` (RN-09) devolve todos os abertos de uma vez, com os tetos de proteção, sem `limite`. | Must | RN-04, RN-06, RN-09, RN-12, RN-16 |
| RF-04 | O sistema deve executar pesquisa avançada com estes filtros: código do chamado, palavra-chave, status (lista, por código do catálogo, de 0 a 14 sem o 12 que não existe, ou pelo nome), atendente (lista), prioridade (lista), grupo de solução (lista), tipo de chamado (lista), cliente (lista), área, solicitante, serviço, categoria, descrição da categoria, período, término previsto, incluir inativos; os filtros de texto de RN-16 (nome do solicitante, parte do título, nome da prioridade e do tipo); mais início e limite de página (parâmetros `start` e `limit`, comprovados na captura de produção) e a opção `todas` (RN-09), que lê todas as páginas por conta do serviço, com os tetos de proteção, e não aceita `limite` junto. Confirmados: atendente (produção, captura de 19/11/2026); status "EM_ATENDIMENTO" combinado com atendente (homologação, validação do `mcp-softdesk`); código, prioridade, grupo, tipo e cliente constam como confirmados no Anexo A da SPEC-001 do `mcp-softdesk`, sem ambiente informado. Os demais são repassados "por convenção", sem garantia. | Must | RN-05, RN-06, RN-08, RN-09 |
| RF-05 | O sistema deve devolver o chamado completo (todos os campos do SoftDesk) a partir do código. | Must | RN-06, RN-08 |
| RF-06 | O sistema deve oferecer verificação de saúde: sem sessão, confere a página de login (cookie XSRF presente); com sessão, executa uma pesquisa mínima e confere o contrato. Retorna OK ou o código de falha. | Must | RN-07, RN-08 |
| RF-07 | O sistema deve registrar em log e, quando disponível, notificar o Windows quando ocorrer `LAYOUT_LOGIN_MUDOU`, `CONTRATO_ROTA_MUDOU` ou um aviso de deriva do contrato. | Should | RN-07, RN-13, RN-17 |
| RF-08 | As operações de RF-01 a RF-06 devem estar disponíveis por MCP (stdio, no molde do `mcp-sybase-readonly`: tools `softdesk_*` e retorno JSON com `success`) e por REST em 127.0.0.1, com o mesmo comportamento e os mesmos códigos de erro. A sessão é única e compartilhada: o login feito por uma porta vale para a outra, porque a senha deve ser digitada uma vez só. Rotas operacionais do serviço (versão, parada e endereço da janela de login) existem só no REST e ficam fora dessa paridade. | Must | RN-01 a RN-14 |
| RF-09 | A skill `/softdesk` deve passar a usar as tools MCP do serviço local para listar fila e pesquisar (o REST fica para outros clientes e testes), mantendo o MCP oficial para ler por código e registrar atividade. | Should | RN-02 |
| RF-10 | O sistema deve iniciar o serviço em segundo plano quando uma tool MCP é chamada e ele não está rodando, e mantê-lo rodando, sem encerrar por ociosidade; a sessão só termina quando o SoftDesk a rejeita. | Must | RN-15 |
| RF-11 | O sistema deve mostrar as atividades (interações) de um chamado a partir do código, só leitura e sob demanda. Depende da rota web de atividades, ainda não descoberta (Q-07); enquanto não houver, a tool responde `NAO_DISPONIVEL` e orienta a usar o MCP oficial (`dossie_chamado`). | Should | RN-01, RN-13 |
| RF-12 | O sistema deve oferecer ferramentas de recuperação da rota não oficial: um comando de captura que gera de novo o contrato dourado a partir de uma sessão real (só nomes e tipos de campos) e mostra a diferença para o contrato atual; e a verificação de saúde (RF-06) passa a comparar a resposta com o contrato dourado. | Must | RN-17 |

## 8. Requisitos não funcionais (RNF)

| ID | Categoria | Requisito | Critério / métrica |
|----|-----------|-----------|--------------------|
| RNF-01 | Segurança | Senha e cookies nunca aparecem em log, resposta, erro ou argumento. | Teste automático que varre logs e respostas de todos os cenários de login (sucesso, senha errada, rede) e não acha a senha nem o valor de cookie |
| RNF-02 | Segurança | O REST escuta só em 127.0.0.1 e exige token local gerado a cada início do serviço, para que outro programa da máquina não use a sessão. | Requisição sem token recebe 401; bind confirmado em 127.0.0.1 |
| RNF-03 | Desempenho | Uma página de 50 chamados responde em até 5 s; cada leitura da fila (até 15 páginas de 200) em até 30 s. | Medição em produção com o atendente 393 (Q-04); metas valem enquanto o SoftDesk responder normalmente |
| RNF-04 | Carga | No máximo 2 requisições simultâneas ao SoftDesk e 1 leitura de fila por vez. | Teste com simulador que conta a concorrência |
| RNF-05 | Resiliência | Timeout de 20 s por chamada ao SoftDesk e nenhuma repetição automática; cada leitura da fila tem prazo total de 90 s (configurável), e estourá-lo é `REDE`. Motivo: 15 páginas de até 20 s chegariam a 300 s, muito acima da meta de RNF-03. | Teste com simulador lento: erro `REDE` em até 21 s numa chamada e ao estourar o prazo da varredura |
| RNF-06 | Observabilidade | Logs estruturados com `@clamed/logger`, com `event` e `correlation_id` por operação. | Toda operação gera um log de início e um de fim com o mesmo `correlation_id` |
| RNF-07 | Portabilidade | O serviço roda no Windows (PowerShell) com Node.js >= 20 LTS, porque a janela de login local falhou no WSL por causa não identificada; o Claude Code pode rodar no Windows ou no WSL e deve alcançar o mesmo serviço (o MCP do WSL roda como processo do Windows). | Suíte de testes passa no Windows |
| RNF-08 | Testabilidade | Existe um SoftDesk simulado (login com XSRF, pesquisa, expiração, mudança de formato), gerado a partir do contrato dourado. | Todos os VAL de §16 rodam contra o simulador |
| RNF-09 | Identidade visual | A janela de login segue o protótipo `MOCK-login-softdesk-local.html` (identidade da Clamed no estilo do login do Portal SupplyChain, sem animação) e embute CSS e imagens na própria página, sem fonte, imagem ou script externos. | Comparação com o protótipo aprovado e teste de que a página não referencia recurso externo |

## 9. User stories e critérios de aceite (Gherkin)

### US-01 — Entrar sem senha no chat

**Como** atendente, **quero** informar usuário e senha numa janela local, **para** que a senha nunca passe pelo chat.

| ID | Critério (Given / When / Then) | RFs / RNs |
|----|--------------------------------|-----------|
| CA-01 | **Dado** que não há sessão **Quando** peço para entrar **Então** abre uma janela local, e depois do login aceito o estado da sessão passa a "autenticada" sem mostrar credenciais | RF-01, RF-02, RN-02, RN-10 |
| CA-02 | **Dado** uma janela de login aberta **Quando** uma requisição chega com `Host` diferente de `127.0.0.1:<porta>` ou com token errado **Então** ela é recusada | RF-01, RN-10 |
| CA-03 | **Dado** uma janela de login com mais de 5 minutos ou já usada **Quando** abro o endereço de novo **Então** é recusado | RF-01, RN-10 |

### US-02 — Ver minha fila

**Como** atendente, **quero** listar os chamados abertos que estão comigo, **para** priorizar o dia sem abrir a tela do SoftDesk.

| ID | Critério (Given / When / Then) | RFs / RNs |
|----|--------------------------------|-----------|
| CA-04 | **Dado** uma sessão autenticada e atendente configurado 393 **Quando** peço minha fila **Então** todos os itens têm `cd_atendente` 393 e status fora de {2, 3, 4, 6}, com os campos básicos de RN-06 | RF-03, RN-04, RN-06 |
| CA-05 | **Dado** chamados abertos e fechados do atendente espalhados em várias páginas do SoftDesk e mais de 200 abertos **Quando** peço minha fila e continuo com `proximo_inicio` até ele vir `null` **Então** recebo todos os abertos, sem repetidos e sem fechados, e o total do SoftDesk vem à parte | RF-03, RN-09 |
| CA-06 | **Dado** que uma chamada lê 15 páginas e ainda há itens **Quando** a fila é pedida **Então** a resposta marca `incompleto: true` e traz `proximo_inicio` | RF-03, RN-09 |
| CA-31 | **Dado** mais de 200 abertos do atendente espalhados em 3 páginas ou mais do SoftDesk **Quando** peço minha fila com `todas: true` **Então** recebo todos os abertos de uma vez, sem repetidos e sem fechados, com `todas: true`, `itens_devolvidos`, `teto_itens` e `parada_por` nulo | RF-03, RN-09 |

### US-03 — Pesquisa avançada

**Como** atendente, **quero** combinar filtros do SoftDesk, **para** achar chamados que a minha fila não cobre.

| ID | Critério (Given / When / Then) | RFs / RNs |
|----|--------------------------------|-----------|
| CA-07 | **Dado** uma sessão autenticada **Quando** pesquiso por atendente e status "EM_ATENDIMENTO" **Então** todos os itens são do atendente e estão em atendimento | RF-04, RN-09 |
| CA-08 | **Dado** um limite acima de 200 **Quando** pesquiso **Então** o serviço usa 200 e informa o limite aplicado | RF-04, RN-05 |
| CA-09 | **Dado** um filtro marcado como "por convenção" **Quando** pesquiso **Então** a resposta indica que o filtro não é confirmado | RF-04 |
| CA-18 | **Dado** uma pesquisa com mais itens que a página **Quando** peço a página seguinte **Então** não há chamados repetidos e o total informado é o total real do SoftDesk | RF-04, RN-05 |
| CA-22 | **Dado** uma pesquisa por um status diferente de "EM_ATENDIMENTO" **Quando** pesquiso **Então** o serviço lê páginas filtrando o status no cliente até juntar o limite, marca `filtro_status_no_cliente: true`, traz `proximo_inicio` e o total é o do SoftDesk antes desse filtro | RF-04, RN-09 |
| CA-23 | **Dado** a minha fila com chamados de várias pessoas **Quando** peço só os abertos por "rosangela" **Então** recebo apenas itens cujo nome do solicitante contém essa palavra, sem diferenciar maiúsculas e acentos, com `filtro_texto_no_cliente: true` e `proximo_inicio` para continuar | RF-03, RF-04, RN-16 |
| CA-32 | **Dado** uma pesquisa (por atendente, por status ou por texto) com mais itens que 200 **Quando** pesquiso com `todas: true` **Então** recebo todos os que casam, sem repetidos, em várias páginas lidas pelo serviço | RF-04, RN-09 |
| CA-33 | **Dado** uma leitura com `todas: true` que atinge 15 páginas, 300 itens, 60.000 bytes ou 90 s **Quando** a resposta chega **Então** traz o que foi lido com `incompleto: true`, `proximo_inicio` e `parada_por` correto (`paginas`, `itens`, `tamanho` ou `prazo`; nunca erro), e continuar com `proximo_inicio` completa a leitura sem repetidos (com a lista estável; o cliente descarta repetidos por código). O teto de itens é 300 e o de tamanho é 60.000 bytes de JSON dos itens | RF-03, RF-04, RN-09 |
| CA-34 | **Dado** um pedido sem `todas` **Quando** o serviço responde **Então** o formato e o comportamento são os de antes; `todas` não booleano, ou `todas: true` com `limite`, é `FILTRO_INVALIDO` sem chamar o SoftDesk | RF-03, RF-04, RN-09 |

### US-04 — Ver um chamado completo

**Como** atendente, **quero** ver todos os campos de um chamado, **para** inspecionar um caso sem sair do Claude.

| ID | Critério (Given / When / Then) | RFs / RNs |
|----|--------------------------------|-----------|
| CA-10 | **Dado** um código existente **Quando** peço o chamado completo **Então** recebo todos os campos devolvidos pelo SoftDesk, sem remodelar | RF-05, RN-06 |
| CA-11 | **Dado** um código inexistente ou fora da minha visibilidade **Quando** peço o chamado **Então** recebo `NAO_ENCONTRADO` | RF-05 |

### US-05 — Ser avisado quando o SoftDesk mudar

**Como** atendente, **quero** saber quando a rota ou a tela de login do SoftDesk mudou, **para** não perder tempo achando que é senha ou sessão.

| ID | Critério (Given / When / Then) | RFs / RNs |
|----|--------------------------------|-----------|
| CA-12 | **Dado** que a página de login deixa de trazer o cookie XSRF **Quando** peço login ou saúde **Então** recebo `LAYOUT_LOGIN_MUDOU` destacado | RF-06, RN-07, RN-08 |
| CA-13 | **Dado** que a pesquisa devolve JSON sem `lista` ou sem `treeview.total` **Quando** consulto **Então** recebo `CONTRATO_ROTA_MUDOU` destacado | RF-06, RN-07, RN-08 |
| CA-14 | **Dado** que o SoftDesk redireciona a pesquisa para `/login` **Quando** consulto **Então** recebo `SESSAO_EXPIRADA` e a janela de login abre | RN-08, RN-14 |
| CA-15 | **Dado** HTTP 5xx ou falha de conexão **Quando** consulto **Então** recebo `REDE`, nunca `SESSAO_EXPIRADA` | RN-08 |
| CA-19 | **Dado** que não há sessão **Quando** peço a verificação de saúde **Então** o serviço confere só a página de login (cookie XSRF) e informa OK ou `LAYOUT_LOGIN_MUDOU`, sem pedir senha | RF-06, RN-07 |
| CA-20 | **Dado** uma falha `LAYOUT_LOGIN_MUDOU` ou `CONTRATO_ROTA_MUDOU` **Quando** ela ocorre **Então** o evento fica registrado em log sem dados pessoais | RF-07, RN-13 |
| CA-25 | **Dado** que o SoftDesk deixa de enviar um campo usado nas listas (por exemplo `nm_usuario`) **Quando** consulto a fila **Então** os itens saem com esse campo nulo, a resposta traz `aviso_deriva` destacado com o nome do campo e o log registra só o nome | RF-12, RN-17 |
| CA-26 | **Dado** que o SoftDesk deixa de enviar um campo essencial (`cd_chamado`, `st_chamado` ou `cd_atendente`) **Quando** consulto **Então** recebo `CONTRATO_ROTA_MUDOU` com os nomes dos campos | RF-12, RN-17 |
| CA-27 | **Dado** que o SoftDesk passa a enviar um campo novo **Quando** consulto **Então** a resposta é normal e o log registra o nome do campo novo uma vez | RN-17 |
| CA-28 | **Dado** uma mudança suspeita no SoftDesk **Quando** rodo o comando de captura e a verificação de saúde **Então** vejo a diferença de nomes e tipos de campos contra o contrato dourado, sem nenhum valor de chamado | RF-12, RN-17 |

### US-06 — Usar pela skill `/softdesk`

**Como** atendente, **quero** que a skill `/softdesk` consulte o serviço local, **para** pedir a fila em linguagem natural.

| ID | Critério (Given / When / Then) | RFs / RNs |
|----|--------------------------------|-----------|
| CA-16 | **Dado** o serviço rodando **Quando** peço "minha fila" pela skill **Então** a skill usa o serviço local e não pede senha no chat | RF-09, RN-02 |
| CA-17 | **Dado** que o MCP não conseguiu iniciar o serviço sozinho **Quando** peço "minha fila" **Então** a skill avisa que o serviço local não subiu e onde ver o motivo (o log) | RF-09, RF-10 |
| CA-21 | **Dado** o mesmo pedido feito pelo MCP e pelo REST, com o mesmo login **Quando** comparo as respostas **Então** o conteúdo e os códigos de erro são iguais e o login feito por uma porta vale para a outra | RF-08 |
| CA-24 | **Dado** que o serviço não está rodando **Quando** uso uma tool do MCP pela primeira vez **Então** o serviço sobe sozinho e a resposta chega, sem eu iniciar nada; com dois MCPs ao mesmo tempo existe uma só instância do serviço | RF-10, RN-15 |

### US-07 — Ver as atividades de um chamado

**Como** atendente, **quero** ver as atividades de um chamado quando preciso, **para** entender o histórico sem abrir a tela do SoftDesk.

| ID | Critério (Given / When / Then) | RFs / RNs |
|----|--------------------------------|-----------|
| CA-29 | **Dado** um código de chamado e a rota de atividades conhecida **Quando** peço as atividades **Então** recebo a lista só de leitura, sem nada gravado em disco | RF-11, RN-01, RN-13 |
| CA-30 | **Dado** que a rota de atividades ainda não foi descoberta **Quando** peço as atividades **Então** recebo `NAO_DISPONIVEL` com a orientação de usar o MCP oficial (`dossie_chamado`) | RF-11 |

## 10. Fluxos / casos de uso principais

### Fluxo: Entrar (UC-01)

- **Ator primário:** atendente.
- **Pré-condições:** serviço rodando; rede Clamed ativa.
- **Fluxo básico:** (1) o atendente pede para entrar; (2) o serviço abre a janela no navegador; (3) o atendente digita usuário, senha e perfil; (4) o serviço faz login no SoftDesk e guarda a sessão em memória; (5) a janela mostra "Pronto" e o serviço informa "autenticada".
- **Alternativos:** o atendente escolhe outro perfil; o navegador não abre sozinho e o usuário roda um comando de terminal do serviço que mostra o endereço (o endereço contém o token de uso único e por isso nunca sai pelo MCP).
- **Exceção:** senha errada → `CREDENCIAL`, a janela mostra o erro e fecha (nova tentativa exige novo "entrar"); SoftDesk fora do ar → `REDE`; login sem cookie XSRF → `LAYOUT_LOGIN_MUDOU`; sem login em 120 s → `AGUARDANDO_LOGIN` com a janela ainda aberta; sem login em 5 min → a janela expira.
- **Pós-condições:** sessão autenticada em memória; senha descartada.

### Fluxo: Minha fila (UC-02)

- **Ator primário:** atendente (ou agente de IA em nome dele).
- **Pré-condições:** sessão autenticada.
- **Fluxo básico:** (1) o serviço consulta a pesquisa pelo atendente configurado, 200 por página, a partir de `inicio`; (2) descarta os fechados e segue para a próxima página até juntar `limite` abertos, acabar ou ler 15 páginas; (3) devolve os abertos, `proximo_inicio` e o total do SoftDesk à parte.
- **Alternativos:** com o teto de 15 páginas atingido, devolve o que leu com `incompleto: true`; quem chamou continua com `proximo_inicio`.
- **Exceção:** sessão ausente/expirada → abre janela, `AGUARDANDO_LOGIN`; contrato quebrado → `CONTRATO_ROTA_MUDOU`.
- **Pós-condições:** nenhum dado de chamado gravado em disco.

### Fluxo: Sessão expirou no meio do uso (UC-03)

- **Ator primário:** serviço.
- **Pré-condições:** sessão autenticada que expirou no SoftDesk.
- **Fluxo básico:** (1) a consulta é redirecionada para `/login`; (2) o serviço descarta a sessão e abre a janela; (3) responde `SESSAO_EXPIRADA` com a janela aberta (as consultas seguintes recebem `AGUARDANDO_LOGIN` até o login); (4) depois do login, quem chamou repete a consulta.
- **Pós-condições:** nova sessão em memória.

## 11. Exceções e erros de negócio

| Situação | Comportamento esperado | Código |
|----------|------------------------|--------|
| Sem sessão ao consultar, ou espera de 120 s do login esgotada | Abre (ou reaproveita) a janela de login e responde que está aguardando | `AGUARDANDO_LOGIN` |
| Usuário ou senha incorretos (login com `status` falso ou HTTP 401) | Informa credencial inválida com texto fixo, sem repetir o usuário digitado nem a mensagem do SoftDesk | `CREDENCIAL` |
| Sessão rejeitada (HTTP 401/403 na pesquisa) ou redirecionada para login | Descarta a sessão, abre a janela | `SESSAO_EXPIRADA` |
| SoftDesk indisponível, timeout ou HTTP 5xx | Informa indisponibilidade; sem repetição automática | `REDE` |
| Página de login sem cookie XSRF ou sem JSON no login | Alerta destacado "o SoftDesk mudou o login" | `LAYOUT_LOGIN_MUDOU` |
| Pesquisa fora do contrato (sem `lista`, sem `treeview.total`, não JSON sem redirecionar para login) | Alerta destacado "o SoftDesk mudou a rota de pesquisa" | `CONTRATO_ROTA_MUDOU` |
| Código de chamado inexistente ou invisível | Informa que não foi encontrado | `NAO_ENCONTRADO` |
| Filtro inválido (tipo errado, campo desconhecido, limite menor que 1) | Recusa antes de chamar o SoftDesk | `FILTRO_INVALIDO` |
| O MCP não conseguiu iniciar ou alcançar o serviço em 10 s | Informa que o serviço não subiu e onde ver o motivo (CA-17) | `SERVICO_INDISPONIVEL` |
| REST chamado sem o token local ou com token errado | Recusa a requisição (RNF-02) | `NAO_AUTORIZADO` |
| Falha inesperada do próprio serviço | Informa erro interno, sem dados de chamado | `ERRO_INTERNO` |
| Atividades pedidas e a rota de atividades ainda não descoberta | Informa que não está disponível e orienta a usar o MCP oficial (CA-30) | `NAO_DISPONIVEL` |
| Leitura da fila atingiu o teto de 15 páginas | Devolve o que leu com `incompleto: true` e `proximo_inicio` | (aviso, não erro) |

## 12. Dados de negócio

| Entidade | Atributos críticos | Regras / validade |
|----------|--------------------|-------------------|
| Chamado (lista) | código, título, status (código e texto), prioridade, tipo, solicitante, data e hora de abertura, quantidade de interações, código do atendente | Só em memória; fonte é a resposta do SoftDesk (RN-06, RN-13) |
| Chamado (completo) | todos os campos devolvidos pelo SoftDesk (cerca de 70 na captura de 19/11/2026) | Sem remodelar; alguns campos podem vir nulos (por exemplo `nm_atendente` e `ds_grupo_solucao`, nulos num chamado da captura e preenchidos em outro) |
| Sessão | usuário, perfil, instante do login, cookies | Só em memória; sem senha (RN-03) |
| Configuração | base URL, código de atendente, perfil padrão, espera do login | Local, não secreta (RN-12) |

## 13. Integrações

| Sistema | Direção | Objetivo de negócio | Dados trocados (resumo) |
|---------|---------|---------------------|-------------------------|
| SoftDesk web (`/login`, `/chamado/json`) | Out | Autenticar e consultar chamados | Login (usuário, senha, perfil); pesquisa por filtros; lista de chamados com total |
| Navegador padrão | Out | Abrir a janela de login local | Endereço local com token de uso único |
| Claude / skill `/softdesk` | In | Consultar fila e pesquisas | Pedidos de operação e respostas de chamados |

## 14. Pontos de investigação técnica (para o analista)

| Área | O que investigar | Onde provavelmente está |
|------|------------------|--------------------------|
| Expiração real da sessão | Quanto tempo a sessão vive e como a resposta de expiração aparece (redirect para `/login`?) | Teste real com cookie removido; `mcp-softdesk/.../softdesk_http_client.py:187` |
| Nomes de status no filtro | Valores aceitos em `pesq_st_chamado[]` além de `EM_ATENDIMENTO` | Captura real; `mcp-softdesk/docs/especificacoes/SPEC-001.md` Anexo A |
| `treeview.total` com filtros | Se o total respeita todos os filtros combinados | Captura real com atendente + status |
| Transporte MCP | stdio no Claude Code e no app desktop; como o servidor MCP e o REST convivem no mesmo processo ou em dois | `mcp-sybase-readonly/src/index.ts` como referência |
| Notificação do Windows | Existência e instalação do script de notificação | Workspace do usuário (a confirmar) |
| Skill `/softdesk` | Onde a skill escolhe a fonte de dados | `agents-skills-collection-import/skills/softdesk` |

## 15. Rastreabilidade (mínima)

| User story | RFs | RNs | Critérios de aceite |
|------------|-----|-----|---------------------|
| US-01 | RF-01, RF-02 | RN-02, RN-03, RN-10, RN-11 | CA-01, CA-02, CA-03 |
| US-02 | RF-03 | RN-04, RN-06, RN-09, RN-12 | CA-04, CA-05, CA-06, CA-31, CA-33, CA-34 |
| US-03 | RF-03, RF-04 | RN-05, RN-09, RN-16 | CA-07, CA-08, CA-09, CA-18, CA-22, CA-23, CA-32, CA-33, CA-34 |
| US-04 | RF-05 | RN-06 | CA-10, CA-11 |
| US-05 | RF-06, RF-07, RF-12 | RN-07, RN-08, RN-13, RN-14, RN-17 | CA-12, CA-13, CA-14, CA-15, CA-19, CA-20, CA-25, CA-26, CA-27, CA-28 |
| US-06 | RF-08, RF-09, RF-10 | RN-02, RN-15 | CA-16, CA-17, CA-21, CA-24 |
| US-07 | RF-11 | RN-01, RN-13 | CA-29, CA-30 |

## 16. Cenários de validação de regra de negócio (fase dedicada pós-review)

| ID | Cenário | Entrada | Resultado esperado | RN/RF |
|----|---------|---------|--------------------|-------|
| VAL-01 | Senha não vaza | Login com senha de teste e varredura de logs e respostas | Senha e cookies ausentes de tudo | RN-02, RN-13 |
| VAL-02 | Fila só do atendente | Fila com atendente 393 contra simulador com chamados de vários atendentes | Todos os itens com atendente 393 e status aberto | RN-04 |
| VAL-03 | Pesquisa paginada | Pesquisa avançada com mais itens que a página; limite pedido 500 | Total = total do SoftDesk; sem repetidos entre páginas; limite aplicado 200 | RN-05 |
| VAL-04 | Teto de leitura por chamada | Simulador com mais de 15 páginas só de abertos | `incompleto: true` e `proximo_inicio` preenchido | RN-09 |
| VAL-05 | Janela de login protegida | Host errado, token errado, token reusado, token expirado | Todas recusadas | RN-10 |
| VAL-06 | Mudança de login | Simulador sem cookie XSRF; simulador cujo login devolve HTML em vez de JSON | `LAYOUT_LOGIN_MUDOU` nos dois casos | RN-07, RN-08 |
| VAL-07 | Mudança de rota | Simulador devolvendo JSON sem `lista` | `CONTRATO_ROTA_MUDOU` | RN-07, RN-08 |
| VAL-08 | Sessão expirada | Simulador redirecionando a pesquisa para `/login` | `SESSAO_EXPIRADA`, janela abre, sem repetição automática | RN-08, RN-14 |
| VAL-09 | Indisponibilidade | Simulador com HTTP 500 e com timeout | `REDE` nos dois casos | RN-08, RNF-05 |
| VAL-10 | Somente leitura | Registro das requisições feitas ao simulador em todos os cenários | Só página de login, login e pesquisa; nenhuma outra rota | RN-01 |
| VAL-11 | REST protegido | Requisição sem token | 401 | RNF-02 |
| VAL-12 | Fila por partes | Simulador com mais de 200 abertos e fechados do atendente 393 espalhados em várias páginas de 200; leituras repetidas com `proximo_inicio` | Todos os abertos, sem repetidos e sem fechados; `proximo_inicio` `null` no fim; total do SoftDesk à parte | RN-04, RN-09 |
| VAL-13 | Login rejeitado e sessão rejeitada | Simulador com login `status` falso, login HTTP 401, pesquisa HTTP 401 e HTTP 403 | `CREDENCIAL` nos dois primeiros; `SESSAO_EXPIRADA` nos dois últimos | RN-08 |
| VAL-14 | Janela única e espera do login | Duas consultas sem sessão seguidas; "entrar" sem digitar nada por 120 s | Uma só janela aberta; `AGUARDANDO_LOGIN` na consulta e no "entrar", com a janela ainda aberta | RN-14, RF-01 |
| VAL-15 | Senha em lugar nenhum | Inspeção dos schemas das tools MCP e das rotas REST; envio de campo `senha` extra; busca por senha em variáveis de ambiente e arquivos criados | Nenhuma tool nem rota aceita senha; campo extra é rejeitado; nada gravado | RN-02 |
| VAL-16 | Senha não retida | Sessão expirada no simulador | O serviço não refaz login sozinho; abre a janela | RN-03 |
| VAL-17 | Lista básica x completa | Pedir fila e depois o chamado completo do mesmo código | Lista só com os campos de RN-06; completo com todos os campos do simulador | RN-06 |
| VAL-18 | Configuração | Trocar código de atendente e base URL na configuração | A fila e as chamadas passam a usar os novos valores | RN-12 |
| VAL-19 | Nada em disco e logs limpos | Varrer arquivos criados e logs depois de todos os cenários | Sem título, nome de pessoa, cookie, senha nem nome de usuário em log; sem dado de chamado em disco; em disco só o arquivo de descoberta, a configuração e os logs | RN-13 |
| VAL-20 | Filtro inválido e chamado inexistente | Limite 0, tipo errado, código que não existe | `FILTRO_INVALIDO` antes de chamar o SoftDesk; `NAO_ENCONTRADO` | CA-11 |
| VAL-21 | Paridade MCP x REST | Mesmos pedidos pelas duas portas, com um só login | Respostas iguais; login de uma porta vale na outra | RF-08 |
| VAL-22 | Saúde sem sessão | Simulador sem sessão, com e sem cookie XSRF | OK e `LAYOUT_LOGIN_MUDOU`, sem pedir senha | RF-06 |
| VAL-23 | Concorrência | 5 pedidos simultâneos contra simulador que conta conexões | No máximo 2 simultâneas; 1 leitura de fila por vez | RNF-04 |
| VAL-24 | Status filtrado no cliente | Pesquisa por status "Aguardando solicitante" contra simulador com status variados na página | Só itens desse status, juntando o limite mesmo com itens de outros status nas páginas; `filtro_status_no_cliente: true`; `proximo_inicio` preenchido enquanto houver mais; total = total do SoftDesk antes do filtro | RN-09, CA-22 |
| VAL-25 | Filtro por nome do solicitante | Fila e pesquisa contra simulador com solicitantes "Rosângela Alves", "ROSANGELA Souza" e "Rogério Lima"; filtro `solicitante_nome: "rosangela"` | Só os dois primeiros, sem diferenciar maiúsculas e acentos; `filtro_texto_no_cliente: true`; `proximo_inicio` coerente | RN-16, CA-23 |
| VAL-26 | Filtros de texto combinados | `solicitante_nome` + `titulo_contem` + status juntos | Só itens que casam todos os filtros | RN-16 |
| VAL-27 | Início automático do serviço | MCP chamado com o serviço parado; dois MCPs chamados ao mesmo tempo | O serviço sobe sozinho e a resposta chega; uma só instância; sem o serviço subir em 10 s, `SERVICO_INDISPONIVEL` | RN-15, CA-17, CA-24 |
| VAL-28 | Sem encerramento por ociosidade | Serviço sem pedidos por um tempo longo (relógio de teste) e depois uma consulta | A sessão continua válida e a consulta responde sem pedir login; só a rejeição do SoftDesk (VAL-08) derruba a sessão | RN-15 |
| VAL-29 | Deriva de campo usado nas listas | Simulador sem `nm_usuario` nos itens | Itens com o campo nulo; `aviso_deriva` com o nome; log só com o nome | RN-17, CA-25 |
| VAL-30 | Campo essencial ausente ou de outro tipo | Simulador sem `cd_atendente`; outro com `st_chamado` texto | `CONTRATO_ROTA_MUDOU` com os nomes dos campos | RN-17, CA-26 |
| VAL-31 | Campo novo | Simulador com campo extra nos itens | Resposta normal; nome do campo novo no log uma vez; sem valores no log | RN-17, CA-27 |
| VAL-32 | Comando de captura e diferença | Comando de captura contra o simulador alterado | Mostra campos novos, removidos e com tipo trocado; grava só nomes e tipos | RF-12, CA-28 |
| VAL-33 | Atividades | Simulador com e sem a rota de atividades | Com a rota: lista de leitura; sem a rota: `NAO_DISPONIVEL` com a orientação | RF-11, CA-29, CA-30 |
| VAL-34 | Janela de login sem recurso externo | Página servida pela janela | Nenhuma referência a URL externa, fonte ou script; imagens embutidas | RNF-09 |
| VAL-35 | Todas devolve tudo | Simulador com 3 páginas ou mais (abertos e fechados misturados): fila e pesquisa (por atendente, por status e por texto) com `todas: true`, pelos casos de uso e pelo REST | Todos os itens que casam, sem repetidos e sem fechados; `todas: true`, `itens_devolvidos`, `teto_itens`, `parada_por` nulo, `incompleto: false`, `proximo_inicio` nulo | RN-09, CA-31, CA-32 |
| VAL-36 | Tetos e prazo do modo todas | Tetos de itens, de páginas e de tamanho reduzidos pelo container e simulador lento com prazo reduzido; fila com mais de 300 abertas e os tetos reais | `incompleto: true`, `proximo_inicio` preenchido e `parada_por` `itens`, `paginas`, `tamanho` ou `prazo`, nunca erro; encadear com `proximo_inicio` devolve TODAS sem repetidos, cada resposta com no máximo 60.000 bytes de itens; continuar com `proximo_inicio` completa a leitura sem repetidos; prazo antes da 1ª página continua `REDE`; cancelamento continua erro; uma varredura por vez | RN-09, CA-33 |
| VAL-37 | Sem todas nada muda; entrada inválida | Mesmos pedidos sem `todas` e com `todas: false`; `todas` não booleano; `todas` com `limite`; `tools/list` do MCP; MCP e REST | Resposta sem campos novos e igual à anterior (prazo estourado sem `todas` segue `REDE`); `FILTRO_INVALIDO` com zero requisições ao SoftDesk; `tools/list` expõe `todas`; envelope igual no MCP e no REST | RN-09, CA-34 |

## 17. Assumptions e perguntas abertas

| ID | Tipo | Texto | Impacto se errado |
|----|------|-------|-------------------|
| A-01 | assumption | A rota `/chamado/json` continua com a mesma resposta (`lista`, `treeview.total`) em produção. | Alto: o serviço acusa `CONTRATO_ROTA_MUDOU` até ser ajustado |
| A-02 | assumption | O perfil Atendente enxerga o conjunto completo de chamados para pesquisa (a captura sem filtro mostrou 192.537). | Médio: a fila pode ficar incompleta se houver restrição de visibilidade |
| A-03 | assumption | O Claude Code do WSL consegue iniciar o MCP como processo do Windows (`node.exe`) e alcançar o serviço; o do Windows nativo não depende disso. | Médio: sem isso, o uso pelo WSL fica fora até haver outra solução |
| A-04 | assumption | O atendente configurado tem mais de 200 chamados abertos (informado pelo solicitante), por isso a fila é lida por partes. | Médio: com menos de 200, a leitura em uma chamada já basta |
| A-05 | assumption | O app desktop do Claude Code lê o mesmo registro de MCP (`~/.claude.json`) do Claude Code em terminal (MCPs já registradas, como `sybase-hmg`, funcionam nas duas formas de uso). | Baixo: sem isso, o registro no app desktop precisa de um passo próprio |
| Q-01 | pergunta | Quais valores `pesq_st_chamado[]` aceita para cada status além de `EM_ATENDIMENTO`? | Médio: sem isso, a fila exige varredura por páginas |
| Q-02 | pergunta | Quanto tempo a sessão do SoftDesk vive e como aparece a expiração? | Médio: define o texto de `SESSAO_EXPIRADA` e a frequência da janela de login |
| Q-03 | pergunta | Como o REST local se identifica para o token (arquivo no perfil do usuário, saída do terminal, outro)? | Médio: define o uso do REST por outros clientes e testes (a skill usa o MCP) |
| Q-04 | pergunta | Qual o tempo real de uma página de 50 e de uma leitura da fila de 15 páginas em produção? | Baixo: afeta só as metas de RNF-03 |
| Q-05 | pergunta | A notificação do Windows (RF-07) usa algum script já existente? | Baixo: RF-07 é Could |
| Q-06 | pergunta | Existe rota do SoftDesk que resolva nome em código (solicitante, cliente, grupo)? Hoje só se filtra por nome no cliente (RN-16). | Médio: com a rota, o filtro por nome valeria para toda a base, e não só para os 3.000 chamados mais novos |
| Q-07 | pergunta | Qual é a rota web do SoftDesk que lista as atividades de um chamado, e o que ela devolve? | Médio: sem ela, RF-11 fica indisponível e as atividades só vêm pelo MCP oficial |

## 18. Histórico de revisão

| Versão | Data | Autor | Mudança |
|--------|------|-------|---------|
| 0.1 | 2026-11-19 | Claude (a pedido do solicitante) | Rascunho inicial |
| 0.2 | 2026-11-19 | Claude (a pedido do solicitante) | Conferência interna: semântica da fila (sem paginação, total de abertos), janela de login (reaproveitar, 120 s), erros de login e pesquisa, sessão compartilhada MCP e REST, procedência dos filtros, VAL-12 a VAL-23 |
| 0.3 | 2026-11-19 | Claude (a pedido do solicitante) | Reconferência: RN-08 separa erro de login e de pesquisa; VAL-06 cobre login em HTML; CA-22 e VAL-24 para status filtrado no cliente; colunas de RNs de RF-01/RF-03; Q-03 |
| 0.4 | 2026-11-19 | Claude (a pedido do solicitante) | Alinhamento com o desenho: códigos `SERVICO_INDISPONIVEL`, `NAO_AUTORIZADO` e `ERRO_INTERNO`; contagem após 200 abertos; prazo de 90 s da varredura; endereço da janela só por terminal; arquivos permitidos em disco; status por código ou nome; configuração lida no início; texto fixo em `CREDENCIAL`; rotas operacionais fora da paridade |
| 0.5 | 2026-11-19 | Claude (a pedido do solicitante) | Teste em contexto zerado: fila lida por partes com `inicio`, `limite` e `proximo_inicio` (mais de 200 abertos); status filtrado no cliente na mesma leitura progressiva; RN-14 separa `SESSAO_EXPIRADA` de `AGUARDANDO_LOGIN`; sem validação do login contra o atendente configurado; catálogo sem o código 12; Claude Code no Windows e no WSL (A-03, A-04) |
| 0.6 | 2026-11-19 | Claude (a pedido do solicitante) | Segunda rodada do leitor de contexto zerado: UC-03 alinhado com RN-14; `proximo_inicio` é `null` no fim; perfil Solicitante/Técnico não é restringido (RN-11); A-05 (app desktop) |
| 0.7 | 2026-11-19 | Claude (a pedido do solicitante) | Reprovação do folheto v2 pelo solicitante: o MCP inicia o serviço sozinho e o serviço encerra por ociosidade (RN-15, RF-10, CA-24, VAL-27, VAL-28); filtros de texto por nome, título, prioridade e tipo para pedir em linguagem natural (RN-16, CA-23, VAL-25, VAL-26, Q-06); CA-17 e §11 ajustados |
| 0.8 | 2026-11-19 | Claude (a pedido do solicitante) | Segunda reprovação do folheto: o serviço não encerra por ociosidade (RN-15, VAL-28); atividades de um chamado (RF-11, US-07, CA-29, CA-30, Q-07, `NAO_DISPONIVEL`); janela de login com identidade Clamed (RNF-09, VAL-34); mitigação da rota não oficial (RN-17, RF-12, CA-25 a CA-28, VAL-29 a VAL-32); RF-07 sobe para Should |
| 0.9 | 2026-11-21 | Claude (a pedido do solicitante) | Revisão de código (revisor B, achado B-1): `null` em campo usado nas listas é aceito e não gera `aviso_deriva` (RN-17); essenciais continuam estritos; campo ausente ou de outro tipo continua gerando o aviso (VAL-29 a VAL-31) |
| 0.10 | 2026-11-21 | Claude (a pedido do solicitante) | (emendado após a revisão REVIEW-003: teto de itens 300 e parada por tamanho de 60.000 bytes, `parada_por: 'tamanho'`, encadeamento pela skill, limitação da vez da varredura) Ajuste pedido após a validação em produção ("ela está mostrando só as top 50, quero uma opção para mostrar todas"): modo `todas` na fila e na pesquisa (RN-05, RN-09, RF-03, RF-04), com tetos de 15 páginas, 1.000 itens e 90 s e parcial com `incompleto`/`proximo_inicio`/`parada_por`; `todas` com `limite` é `FILTRO_INVALIDO`; CA-31 a CA-34; VAL-35 a VAL-37 |
