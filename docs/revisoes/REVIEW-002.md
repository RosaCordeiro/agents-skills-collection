# REVIEW-002 — Re-revisão das correções de REVIEW-001-A e REVIEW-001-B

- **Revisor:** somente leitura (nenhum código ou doc existente alterado; SoftDesk real não tocado)
- **Data:** 2026-11-19
- **Escopo:** só as correções de A-2, A-3, A-5, A-6, A-7, B-1 a B-7, à procura de regressão e correção incompleta
- **Suíte:** `npm run build` ok; `npx jest --runInBand` duas vezes seguidas: 42 suítes, 684 passaram, 1 pulado, ~74 s nas duas (estável)
- **Teste descartável:** `scratchpad/t-contrato.js` contra `dist/` (fora do repo)

## Resumo

| Severidade | Qtde |
|------------|------|
| BLOQUEANTE | 0 |
| ALTO | 0 |
| MÉDIO | 0 |
| BAIXO | 3 |
| NIT | 5 |

Nenhuma regressão encontrada. As correções resolvem os cenários dos achados originais. Ficam três pontos BAIXO: a folga do A-2 pode não bastar, o A-6 está incompleto e o B-4 notifica um campo que não é usado.

---

## Achados

### 1. BAIXO — A-2: a folga de 30 s pode ser menor que o login, e a senha ainda pode sair depois de a janela fechar

- **Arquivo:** `src/infraestructure/login/janela-login.server.ts:25` (`GRACA_LOGIN_EM_ANDAMENTO_MS = 30_000`), `:191-196` (`expirar`), `:358` (`this.op.gateway.autenticar(usuario, senha, perfil)`, sem sinal)
- **Cenário:** `autenticar` passa por três etapas:
  - espera uma das 2 vagas do semáforo, que pode estar ocupada por uma pesquisa de até 20 s;
  - faz o `GET /login`, com até 6 requisições de 20 s cada (redirecionamentos);
  - faz o `POST /login`, com mais 20 s.

  No pior caso isso passa bem de 30 s. Se a pessoa envia o formulário aos 4 min 59 s e o SoftDesk está lento, a janela fecha aos 5 min 30 s com `closeAllConnections`. É o mesmo efeito do achado original, só que numa faixa de tempo menor. A variante também continua: `autenticar` não recebe `AbortSignal`, então, se o encerramento acontece na espera da vaga ou durante o `GET`, o `POST` com a senha ainda é enviado ao SoftDesk. O resultado é descartado (os cookies são limpos em `:370`), mas o login acontece lá.
- **Não acontece:** a janela não fica aberta para sempre. A folga é dada uma única vez (`j.graca`), e o segundo `expirar` encerra a janela. O token não é reutilizado: `usado` é marcado no mesmo tick da conferência, e GET ou POST com login em andamento recebem 403 `usado`. A senha não vaza: é zerada no `finally` e não aparece em log nem no estado. O estado também fica coerente: `janelaEncerrada` leva `AUTENTICANDO` para `SEM_SESSAO`, e um resultado que chega atrasado é descartado.
- **Correção:**
  - criar um `AbortController` por janela, abortado em `encerrar`, e passar o sinal dele para `autenticar(usuario, senha, perfil, sinal)`;
  - derivar a folga do timeout do gateway (por exemplo, `3 × timeoutMs + 10 s`) em vez de fixar 30 s.

### 2. BAIXO — A-6 incompleto: o script de início ainda passa o ambiente inteiro, e o ambiente mínimo descarta `NODE_OPTIONS`

- **Arquivo:** `scripts/iniciar-servico.ps1:38-39` (`Start-Process` sem ambiente reduzido; o achado A-6 citava este script); `src/presentation/mcp/iniciar-servico.ts:22-28`
- **Cenário 1:** quem sobe o serviço com `npm run servico:iniciar` continua passando ao processo destacado todas as variáveis do terminal, inclusive `SOFTDESK_SENHA`/`SOFTDESK_USUARIO` e tokens de outros MCPs. A correção valeu só para o início feito pelo MCP.
- **Cenário 2:** numa estação com inspeção TLS (Fortinet), há quem resolva a CA com `NODE_OPTIONS=--use-openssl-ca` ou `--use-system-ca` em vez de `NODE_EXTRA_CA_CERTS`. Nesse caso, o serviço iniciado pelo MCP falha no TLS com o SoftDesk (`REDE`), enquanto o iniciado pelo script funciona. É uma divergência difícil de diagnosticar.
- **Lista de permissão conferida:** o Node é achado, porque o `spawn` usa `process.execPath` absoluto. `LOCALAPPDATA`, `USERPROFILE`, `USERNAME`, `USERDOMAIN` (usado pelo `icacls`), `PATH`, `PATHEXT`, `ComSpec` e `SystemRoot` estão na lista, o que basta para `cmd /c start` e `powershell` (balão). Variáveis em minúsculas (`http_proxy`) também casam, porque a comparação ignora maiúsculas. Falta `SystemDrive` (NIT; nada no código depende dela hoje).
- **Correção:**
  - no script, montar o ambiente do filho (por exemplo, `ProcessStartInfo` com o ambiente limpo e só a lista) ou registrar o desvio como risco aceito;
  - documentar no README que a CA corporativa deve vir por `NODE_EXTRA_CA_CERTS`. Não incluir `NODE_OPTIONS` na lista, porque ele permite `--require` de código arbitrário.

### 3. BAIXO — B-4: o diagnóstico da saúde gera balão e `ultimo_alerta` também por campo `outro`

- **Arquivo:** `src/core/application/useCases/verificar-saude.use-case.ts:60-64`; `softdesk-http.gateway.ts:194` (`diagnosticarLista` com critério `'algum'`); `alerta-contrato.ts:70-73`
- **Cenário:** a saúde lê 1 item. Se esse item não traz um campo `outro` (que nenhum mapeamento usa), `derivaDiagnostico` registra `ultimo_alerta: DERIVA` e mostra um balão. O RF-07 pede notificação para aviso de deriva, que no envelope só vale para campos `usado`. Notificar campo `outro` traz de volta, em escala menor, o alarme falso que o B-2 combateu. Isso vale para a saúde manual e para a automática, no primeiro login.
- **Correção:** separar o diagnóstico por marca. Campos `essencial`/`usado` geram balão e `ultimo_alerta`. Campos `outro` vão só para o log `softdesk_deriva`, sem balão nem alerta. Outra opção é usar o critério `'todos'` para ausentes também na saúde.

### 4. NIT — `ultimo_alerta` fica preso no último erro de contrato

- **Arquivo:** `src/core/application/services/alerta-contrato.ts:86-88`
- A regra "deriva não encobre erro" está correta e tem teste (`alerta-contrato.spec.ts:102`). O efeito colateral é que, depois de um `CONTRATO_ROTA_MUDOU` já resolvido, nenhuma deriva posterior aparece em `softdesk_estado_sessao` até o serviço reiniciar. Se incomodar, guardar um `ultima_deriva` à parte.

### 5. NIT — A-7: serviço legítimo com outra linha de comando ainda tem o arquivo apagado

- **Arquivo:** `scripts/parar-servico.ps1:68` e `:75-77`
- A comparação ainda é por substring (`dist\servico.js`), e não pelo caminho absoluto do pacote. O risco de matar o processo errado ficou desprezível, porque um processo criado mais de 15 s depois de `iniciado_em` não é encerrado. Mas um serviço legítimo travado que tenha sido iniciado de outro jeito (`tsx src/servico.ts`, caminho relativo a partir de `dist\`) continua classificado como "outro programa": o arquivo é apagado, o processo fica com a porta e o script sai com 0. Hoje não existe script `dev` no `package.json`, por isso fica como NIT. Sugestão: sair com 1 nesse ramo e só apagar o arquivo quando o processo não for `node`.
- **Conferido:** a linha de comando ilegível agora sai com 1 sem apagar nada. Barra normal e barra invertida são aceitas. `CreationDate` (local, convertido para UTC) é comparado com `iniciado_em`, que vem do mesmo `new Date()` do início do processo (`servico.ts:62`) e é gravado em ISO com Z. Um processo legítimo sempre nasce antes desse instante, então a conferência nunca recusa o serviço certo.

### 6. NIT — Durante a folga, a janela continua anunciada como aberta com `expiraEm` no passado

- **Arquivo:** `janela-login.server.ts:115-125`
- `info()` e `enderecoManual()` só olham `encerrada`/`concluida`. Na folga, `exigirSessao` responde `janela.aberta: true` com um vencimento que já passou, e `GET /v1/sessao/janela` devolve um endereço cujo token já foi consumido. É só cosmético, porque o login em andamento termina sozinho.

### 7. NIT — B-1: a captura ainda lê só uma página, filtrada pelo atendente

- **Arquivo:** `src/cli-capturar-forma.ts:126`
- `LIMITE_CAPTURA = 200` e `mapaDeTipos` somando todos os itens resolvem a amostragem de `lista[0]`. Ainda faltam os não atribuídos e os fechados (sugestão original). O risco é contido pela tolerância a null do B-2 e está documentado no comentário e no README. Um efeito do B-2 a registrar: um campo `usado` que passe a vir **sempre** nulo deixa de gerar `aviso_deriva` (só renomear ou trocar o tipo continua detectado). É coerente com o RN-17 como foi redesenhado, mas convém constar no ARCH §17.

### 8. NIT — B-3: com troca recusada, o dourado é regravado mesmo assim e a mensagem vem antes do aviso

- **Arquivo:** `src/cli-capturar-forma.ts:158-173`
- O comportamento está correto: o campo crítico não é tocado, o resto é unido e a saída é 3. Mas o terminal mostra primeiro "Contrato dourado atualizado" e só depois o "ATENCAO". Sugestão: imprimir as trocas recusadas antes ou trocar o texto para "atualizado, exceto os campos abaixo".

---

## O que foi conferido e está correto

- **A-2:** a folga é dada uma única vez e rearmada pelo agendador injetável. `cancelarTempo` é trocado pelo novo cancelamento e chamado em `encerrar`, sem temporizador órfão. Depois de `lerCorpo` há nova checagem de `j.encerrada` e a senha não segue (`:326`). No ramo encerrado, `sessaoHttp?.cookies.clear()` roda. A requisição feita após o prazo com login em andamento não derruba o login (`emAndamento`, `:278-281`). A-8 também ficou certo: `marcarAguardando` preserva `AUTENTICANDO`. O teste `janela-login.spec.ts:293` cobre o cenário.
- **A-3:** só `ECONNREFUSED` (ou arquivo ausente/401) inicia e repete. `ECONNRESET`, timeout e qualquer outro erro resultam em `SERVICO_INDISPONIVEL` sem repetição. O teste usa `resetAndDestroy` real. A conexão é com `127.0.0.1` literal, então não há `AggregateError` de múltiplos endereços escondendo o código.
- **A-4 (efeito):** `TIMEOUT_PADRAO_MS = 310 s`, acima do teto de 280 s da espera e do teto de 300 s do prazo de varredura.
- **A-5:** `cwd = path.resolve(dirname(dist/servico.js), '..')`, a raiz do pacote, igual ao script.
- **B-1/B-2 (`tipoAceito`):** confirmado com teste descartável contra `dist/`:
  - `st_chamado: '1'` → `essenciais: ['st_chamado']`, e o gateway (`:180-184`) transforma isso em `CONTRATO_ROTA_MUDOU`;
  - `st_chamado: null` e `cd_atendente: null` também acusam (essencial estrito);
  - `diagnosticarLista` com `st_chamado` em texto → `tipo_trocado: ['st_chamado']`;
  - `ds_tipo_chamado: null` (usado) → sem deriva;
  - `tt_chamado: 5` (usado, número) → `usados: ['tt_chamado']`;
  - chamado fechado com `hr_fechamento_chamado`/`dt_termino_previsto_chamado` preenchidos → diagnóstico vazio.
- **B-3:** `trocasCriticas` e `unirNoDourado` usam a mesma regra de `tipoAceito`. Um campo crítico com troca não é regravado sem `--aceitar-troca-de-tipo`. `--aceitar-troca-de-tipo` sem `--atualizar` é recusado, com saída 2. As saídas são 0, 1, 2 e 3, como documentado. O dourado só recebe nomes e conjuntos de tipos (`mapaDeTipos` descarta valores), nunca valores.
- **B-4:** o log de deriva (operação e saúde automática) leva só nomes, em `campos_deriva`, que está na lista de permissão do adaptador como lista de primitivos. `DERIVA` tem texto de balão próprio, respeita o limite de 10 min por código e não encobre `LAYOUT`/`CONTRATO`. A saúde automática registra `campos_deriva` (uso, ausentes e tipo trocado, sem repetidos).
- **B-5:** o prazo é armado antes de `esperarVez`. Estourar na espera resulta em `REDE`/`MENSAGEM_PRAZO`, o que espera sai da fila, e o temporizador é limpo no `finally`. A vez só é liberada se foi obtida, uma vez só, no `finally`. Se o abort acontece no mesmo instante em que a vez é entregue, `entregar` remove o ouvinte, `ler` vê o sinal abortado, sai com cancelamento e a vez é devolvida. `SESSAO_EXPIRADA` prevalece sobre o prazo. Não achei vazamento de vaga nem de temporizador.
- **B-6:** a chave da leitura compartilhada inclui o id da sessão (`WeakMap<SessaoHttp, number>`, sem reter a sessão antiga). Quem entra com S2 nunca se junta a uma leitura de S1.
- **B-7:** `limite_pedido` é aplicado por chamador fora da promessa compartilhada. A chave usa `limite_aplicado`, o que está correto, porque o resultado é o mesmo.
- **Dado pessoal em log:** nenhuma correção acrescentou campo com título, nome, usuário, filtro ou senha. Os logs novos levam `motivo`, `campos_deriva`, `modo`, `duracao_ms` e `codigo_erro`.
- **Estabilidade:** duas rodadas completas com o mesmo resultado, sem teste intermitente.
