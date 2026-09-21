---
name: jdbc-windows
description: >-
  Cuidados específicos de JDBC em ambiente Windows com Java: SQLite local
  (driver, threading, WAL), pool de conexões, e o bridge JDBC/jTDS para
  Sybase ASE (mesmo padrão usado em api-integracao-syb-kafka) quando um
  serviço ou worker Java precisa falar com o legado. Ler `java` antes desta;
  ler `jfx-windows` junto se o consumidor for um client desktop. Não usar
  para Node/Go/Python falando com o mesmo banco (skill backend).
---

# JDBC em Windows (padrão Clamed)

Responda em português. Pressupõe a skill `java` já lida.

## Fronteiras

| Assunto | Skill |
|---------|--------|
| Convenção Java genérica | `java` |
| Client desktop que usa este JDBC (thread de UI) | `jfx-windows` — ler junto |
| Serviço Spring que usa este JDBC | `springboot` |
| Mesmo problema em Node/TS (`java` npm package como bridge JDBC) | `backend` (ver `api-integracao-syb-kafka` como referência) |

## SQLite local (estação/client offline-first)

- Driver: `org.xerial:sqlite-jdbc` — não precisa de instalação nativa separada, o driver já embute o binário SQLite pra Windows/Linux/Mac no próprio JAR.
- **Nunca chamar JDBC síncrono na thread de UI** (JavaFX Application Thread, ou a thread de eventos de qualquer toolkit desktop) — mesmo uma leitura rápida de SQLite local pode enfileirar atrás de uma escrita e travar a UI perceptivelmente. Ver `jfx-windows` para o padrão de `Task`/`ExecutorService`.
- **Connection string em Windows**: `jdbc:sqlite:` seguido do caminho — usar sempre `/` (forward slash) mesmo em Windows, ou construir a partir de `Path.toUri()`, nunca concatenar `\` cru na string (`jdbc:sqlite:C:\dados\app.db` quebra por causa do escaping):
  ```java
  String url = "jdbc:sqlite:" + dbPath.toAbsolutePath().toUri().getPath().substring(1);
  // ou, mais simples: sempre usar forward slash na string, mesmo em Windows
  String url = "jdbc:sqlite:C:/ProgramData/Conferi/estacao.db";
  ```
- **WAL mode** (`PRAGMA journal_mode=WAL;`) logo na abertura da conexão — permite leitura concorrente enquanto uma escrita está em andamento, relevante quando a UI lê a lista de itens enquanto o outbox grava em background. Sem isso, SQLite serializa tudo e a UI pode perceber travamentos sob uso intenso.
- Uma conexão por thread de acesso (ou um pool pequeno, ex. HikariCP com `maximumPoolSize` baixo tipo 2-4) — SQLite não se beneficia de pool grande como um banco cliente-servidor; conexão demais só aumenta contenção de lock de arquivo.
- Local do arquivo: `%ProgramData%\<Empresa>\<App>\` (não `%APPDATA%` do usuário — o app roda como qualquer operador que logar na estação, dado compartilhado de máquina, não de usuário) — garantir que o instalador (`jpackage`, ver `jfx-windows`) cria essa pasta com permissão de escrita.

## Sybase ASE via jTDS (Worker de Integração Legado, se escrito em Java)

Mesmo padrão de bridge JDBC/jTDS já usado neste workspace em `api-integracao-syb-kafka` (lá em Node, via o pacote `java` que embrulha um bridge JDBC) — em Java, é direto, sem essa camada de embrulho:

- Driver: `net.sourceforge.jtds:jtds` versão `1.3.1` — mesmo driver e versão já usados em `api-integracao-syb-kafka`/`api-orquestra-integracao-sybase-kafka` (hoje consumidos via bridge Node; em Java puro é dependência Maven direta, sem bridge nenhum).
- Connection string, no formato real já validado nesses projetos:
  ```
  jdbc:jtds:sybase://<host>:<porta>/<database>;autoCommit=false;appName=<nome-do-servico>
  ```
  Exemplo real de homologação: `jdbc:jtds:sybase://syb-hmg.clamed.com.br:6000/homologa;autoCommit=false;appName=api-integracao-syb-kafka` — `appName` identifica a conexão nas ferramentas de monitoramento do próprio Sybase, útil para o DBA saber quem está conectado; sempre setar com o nome real do serviço, nunca deixar genérico.
  Classe do driver: `net.sourceforge.jtds.jdbc.Driver`.
- **Encoding é o erro mais comum**: bancos Sybase ASE legados frequentemente usam `cp1252` ou `iso_1`, não UTF-8. Se o `charset` não bater com o collation real do banco, dados com acento (nome de produto, descrição) corrompem silenciosamente — não dá erro, só grava/lê errado. Confirmar o charset real do banco (`sp_helpsort` ou consulta ao DBA) antes de fixar no connection string, nunca assumir UTF-8 por padrão.
- **Timeout**: ASE legado sob carga (ou atrás de VPN/rede do CD) pode responder devagar — configurar `loginTimeout` e o timeout de query explicitamente (`Statement.setQueryTimeout`), nunca confiar no timeout default do driver, que costuma ser alto demais para falhar rápido ou baixo demais pra rede lenta de filial.
- **Pool de conexões**: HikariCP. Os serviços Node existentes deste workspace usam `MINPOOLSIZE=2`/`MAXPOOLSIZE=10` para esse mesmo Sybase — bom ponto de partida também em Java (`HikariConfig.setMinimumIdle(2)`/`setMaximumPoolSize(10)`), mas confirmar com quem administra o banco antes de escalar, o servidor tem limite próprio de conexões simultâneas.
- **Nunca abrir conexão Sybase a partir da thread de UI** de um client desktop — isso é exatamente o cenário que a arquitetura deste tipo de projeto isola num worker/serviço backend dedicado (ver ARCH do projeto: só uma peça específica fala com o legado), nunca do client diretamente.

### Duas armadilhas reais já vividas neste workspace (evitar de novo)

1. **Variável de ambiente vazia por deploy sem `--env-file`**: um incidente real em produção (`Missing driver class`) foi rastreado a um script de deploy que subiu o container sem `--env-file`, então as variáveis JDBC chegaram vazias — o serviço subiu, mas sem conseguir conectar. Ao revisar pipeline/deploy deste tipo de serviço, confirmar explicitamente que o comando que sobe o container injeta as variáveis (ver skill `docker-cicd-review`), não só que o arquivo de variáveis existe no host.
2. **Aspas supérfluas em variável de ambiente**: `DRIVERNAME="net.sourceforge.jtds.jdbc.Driver"` com aspas dentro de um arquivo usado com `--env-file` vira parte literal do valor (a aspa não é removida) — o nome da classe do driver fica errado e a conexão falha de um jeito que não é óbvio pela mensagem de erro. Nunca colocar aspas em valores de arquivo de env consumido dessa forma.
3. **Bridge nativo Node só funciona em Linux** (não se aplica a Java puro, mas é o motivo de o padrão atual existir): o pacote `java` do Node (usado como bridge JDBC nos serviços TS deste workspace) só builda/roda em Linux — em máquina de desenvolvimento não-Linux falha com `Cannot find module '.../jvm_dll_path.json'`. Um serviço Java puro (Spring Boot, por exemplo) **não tem esse problema**, porque fala JDBC nativamente sem bridge — é inclusive um argumento a favor de Java puro em vez de manter a ponte Node+JVM nesses dois serviços, se a decisão de linguagem do backend for revisitada.

## Regras gerais (as duas fontes de dado)

- String de conexão **sempre via variável de ambiente** (`SYBASE_JDBC_URL`, `SQLITE_DB_PATH` ou nomes equivalentes já usados no projeto) — nunca hardcoded, mesmo em ambiente de desenvolvimento.
- Fechar `Connection`/`Statement`/`ResultSet` sempre em `try-with-resources` — vazamento de conexão em Windows costuma se manifestar como "funciona no dev, trava em produção depois de X horas".
- Logar (SLF4J, nunca `println`) toda falha de conexão com contexto suficiente pra diagnosticar sem precisar reproduzir (host, timeout configurado, não a senha).

## Checklist

- [ ] SQLite: WAL mode habilitado, connection string com `/`, arquivo em `%ProgramData%`
- [ ] Nenhuma chamada JDBC na thread de UI — sempre em thread de background (ver `jfx-windows`)
- [ ] Sybase/jTDS: charset confirmado com o banco real, não assumido
- [ ] Timeout de login e de query configurados explicitamente, não no default do driver
- [ ] Pool de conexões dimensionado combinando com o limite do servidor Sybase
- [ ] Strings de conexão via variável de ambiente, nunca hardcoded
- [ ] `try-with-resources` em toda abertura de `Connection`/`Statement`/`ResultSet`

