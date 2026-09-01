# Catalogo de validacoes

Usar os numeros abaixo no AUD (`Validacao 1`, `Validacao 2`, …). Nao pular ID: se nao aplicar, marcar `N/A` com motivo.

Apos V32, criar Validacao 33+ **deste** sistema (nomear o que esta checando). Nao inflar com checks genericos repetidos.

Status: `PASS` | `FAIL` | `PARCIAL` | `N/A`.

---

## A. Entendimento

### Validacao 1 — Mapa do sistema

O auditor consegue explicar o que o sistema faz, fronteiras (API/worker/UI/scripts/DB/fila/externos) e como sobe, com base em README + codigo — nao so no titulo do repo.

`FAIL` se o README mente ou nao ha como descobrir o entrypoint.

### Validacao 2 — Inventario de artefatos

Existem (ou ha justificativa de ausencia) README, contrato de env, Compose/scripts de subida, docs de SPEC/ARCH/CORR se o time usa esse padrao neste repo, e local da suite.

`PARCIAL` se o codigo cresceu e os docs de fase ficaram para tras.

---

## B. Arquitetura

### Validacao 3 — Camadas e responsabilidades

Separacao coerente com o que o repo ja adotou (ex.: domain / application / infrastructure / presentation). Dependencias apontam para dentro. UI nao fala com SQL direto se o design proibe. Worker nao vira “god object” sem motivo.

Olhar a estrutura real, nao so as pastas.

### Validacao 4 — Aderencia ARCH vs codigo

SPEC/ARCH/CORR de entregas **passadas** sao retrato de **como o sistema era** naquela feat. O fluxo de dev **nao** as atualiza quando entra spec nova — isso e historia, nao mentira.

- **Nao** marcar `FAIL`/`PARCIAL` porque ARCH-001 ainda cita SQLite/Compose all-in-one se o README e o ARCH da entrega vigente descrevem Postgres/host.
- Ler os ARCH antigos para entender a evolucao (mapa historico no AUD, 3–6 linhas).
- Confrontar com o codigo **somente** o SPEC/ARCH/CORR da **entrega atual** (branch vigente) + README operacional.
- Sem ARCH da entrega atual: pontuar Arquitetura pelo codigo; `N/A` em D10 se nao houver documento vigente nenhum.

`FAIL` aqui = o ARCH **desta** entrega contradiz o codigo de hoje (rotas, tabelas, fluxos da feat atual).

### Validacao 5 — Acoplamento e fronteiras

Modulos conhecem o que deveriam. Sem dependencia circular obvia. Contratos entre servicos (HTTP, Kafka, arquivo) explicitos. SAP: fronteiras `fiori` / `ui5` / `abap` (ver V30).

### Validacao 6 — Stack e runtime

Stack do README/Compose e a que realmente roda. Sem path Windows em scripts Linux. Sem troca silenciosa de Node/gerenciador/banco. Compose vs host coerente com o que o projeto escolheu.

---

## C. Modelagem de dados

Se nao ha persistencia propria: V7–V9 = `N/A` (dimensao Modelagem fora da media).

Postgres: skill `modelagem-dados`. Sybase/Mongo: padroes **deste** repo, nao forcar UUID Postgres.

### Validacao 7 — Tipos e identificadores

PK/FK `uuid` em Postgres novo; `varchar(n)` em codigo/nome/status; `TEXT` so para texto longo. IDs nao sao `TEXT` livre. Enums/status com limite ou CHECK quando o dominio e fechado.

### Validacao 8 — Integridade

FKs, UNIQUE, NOT NULL, CHECKs das RNs criticas. Operacoes multi-tabela com transacao (ou compensacao documentada). Cardinalidades do ARCH batem com o schema.

### Validacao 9 — Evolucao do schema

Migrations versionadas (ou DDL do repo) idempotentes/seguras o bastante. Sem editar schema so no ambiente. Seed de negocio nao explode ambiente existente sem aviso.

---

## D. Codigo e contratos

### Validacao 10 — Fluxos criticos

Walkthrough de 2–5 fluxos que pagam o sistema (nao so healthcheck): happy path + 1 falha de negocio. Estados invalidos rejeitados. Sem race obvia (read-modify-write, double submit) no caminho critico.

`FAIL` se o fluxo documentado nao existe no codigo ou o contrario (codigo faz outra regra).

### Validacao 11 — Contratos (API / CLI / mensagens)

Rotas/comandos/topicos alinhados ao que clientes e docs esperam. Status HTTP / codigos de erro estaveis. Validacao de input. Breaking change sem nota no README/CHANGELOG = `FAIL` ou `PARCIAL`.

Sem API: descrever o contrato real (CLI, arquivo, fila) com o mesmo rigor.

### Validacao 12 — Qualidade de codigo

Funcoes focadas; nomes do dominio; sem bloco grande comentado; duplicacao evitavel no nucleo; complexidade gratuita no caminho quente. Amostrar o nucleo, nao lintar arquivo por arquivo como Sonar.

### Validacao 13 — Erros e resiliencia

Falhas nao engolidas (`catch` vazio). Erros de dominio vs infra distinguiveis. Timeout/retry so com idempotencia quando o design pede. DLQ / poison message se houver fila. Processo nao morre calado no boot por config invalida (falha explicita).

---

## E. Seguranca

### Validacao 14 — Secrets

Nenhum segredo real no git: `.env` commitado com valor, token em codigo, connection string em doc. Exemplos so em `.env.example`.

`FAIL` aqui aciona teto de nota ([notas.md](notas.md)).

### Validacao 15 — Auth e dados

Rotas mutaveis autenticadas se o sistema tem usuarios. IDOR considerado. PII demais em log. Endpoints de debug expostos.

N/A so se o sistema e interno sem auth **por design documentado**.

### Validacao 16 — Injecao

SQL/Sybase parametrizado. Sem concatenar input em query/comando. XSS se houver UI. Path traversal em leitura de arquivo. `eval` de input.

---

## F. Observabilidade

### Validacao 17 — Logs

Se o projeto **ja** usa `@clamed/logger` (ou o logger padrao do repo): fluxos criticos logam com contexto (nao `console.log` de ruido em prod). Sem PII desnecessaria. Sem spam em loop. Avaliar aderencia a skill `logger` (`keywords`, niveis, `event`, `correlation_id` automatico) quando a entrega ja deveria seguir o padrao novo.

Se o projeto nao tem logger padrao: `PARCIAL` ou nota baixa — nao exigir `@clamed/logger` em greenfield Python/Go/SAP so porque a skill Node cita.

### Validacao 18 — Metricas e health

Healthcheck real se ha servico HTTP. Se o projeto ja usa `light-node-metrics` (ou Prometheus do repo): caminhos de negocio relevantes medidos; `/metrics` (ou equivalente) documentado no README.

Ausencia total em servico de producao = `PARCIAL`/`FAIL` conforme criticidade. CLI one-shot pode ser `N/A` em metricas.

---

## G. Testes

### Validacao 19 — Execucao da suite (obrigatoria)

Rodar o comando oficial. Registrar comando + resultado.

| Resultado | Status |
|----------|--------|
| Suite passou | `PASS` |
| Suite falhou (produto) | `FAIL` |
| Nao ha suite | `FAIL` (nao `N/A`) |
| Ambiente indisponivel e usuario optou por seguir sem | `PARCIAL` + teto de nota |
| Tooling quebrou (versao/stack) | `PARCIAL`/`FAIL` + nao trocar stack |

Teto: ver [notas.md](notas.md).

### Validacao 20 — Cobertura dos fluxos criticos

Os fluxos da V10 tem teste automatizado (unit/integracao/e2e conforme o repo) **ou** gap consciente ja escrito em doc. Teste que so cobre utils e ignora a regra de negocio = `PARCIAL`.

### Validacao 21 — VAL / V de regra de negocio

Se o repo tem SPEC/CORR com VAL-xx / V-xx: ainda fazem sentido vs o codigo atual; resultados antigos nao contradizem o estado atual.

Sem docs de fase: `N/A` ou `PARCIAL` se regras criticas so existem na cabeca de quem opera.

### Validacao 22 — Higiene da suite

Testes deterministicos. Sem relogio/rede flaky sem fixture. Sem skip eterno sem motivo. Nomes descrevem a regra. Fixtures nao dependem de producao.

---

## H. Documentacao

### Validacao 23 — README operacional

Operador consegue: subir, configurar env, achar endpoints/CLI, rodar testes, achar metricas/logs se o sistema tem. Espirito R1–R10 da skill `documentacao`.

README de uma linha + sistema complexo = `FAIL`.

### Validacao 24 — Docs de fase vs realidade

So a **entrega vigente** precisa bater com o codigo (SPEC/ARCH/CORR/REVIEW/VAL da branch). Docs de feats anteriores sao historicos — observar, nao cobrar rewrite.

`PARCIAL`/`FAIL`: README, CHANGELOG Unreleased, DoD da entrega atual, ou o ARCH **desta** feat mentem (rota, env, commit, comportamento). Nao usar ARCH-001 como prova de doc stale.

### Validacao 25 — CHANGELOG e indice

Se o repo tem CHANGELOG: ultima entrega relevante aparece. Indice de `docs/` nao aponta para arquivo inexistente.

### Validacao 26 — Docs stale / mentiras

Instrucoes que nao funcionam, paths velhos, “ainda nao existe” para coisa que existe, contagem de testes errada.

---

## I. Operacao

### Validacao 27 — Docker / processo

Compose (se for o caminho oficial): servicos, portas publicadas so as necessarias, volumes, healthcheck em servico critico, rede. Sem `compose opcional` se o README manda Compose.

### Validacao 28 — Variaveis de ambiente

Toda env lida no codigo esta no `.env.example` ou README. Sem default perigoso (ex.: auth desligada). Nomes consistentes.

### Validacao 29 — Paths e scripts

Scripts Linux com paths Unix / `/mnt/c/...` quando WSL. Sem `C:\` embutido em bash. Make/scripts documentados de fato rodam.

---

## J. SAP (condicional)

### Validacao 30 — Fronteiras Fiori / UI5 / ABAP

Launchpad/tile/intent vs views/controllers vs CDS/RAP. Sem Vue/React generico em app Fiori sem decisao. Nao-SAP = `N/A`.

---

## K. Consistencia global

### Validacao 31 — Debito visivel

TODOs/FIXME no nucleo, codigo morto no caminho critico, `any`/ignore de lint em massa, feature flag esquecida. Debito aceito em REVIEW antigo ainda aberto e sem dono = registrar.

### Validacao 32 — Mudanca grande vs regressao

Apos alteracao grande: contratos que clientes usam, migrations, e testes de regressao existem. Breaking change sem migracao/doc = `FAIL`.

---

## Validacoes especificas do sistema (33+)

Obrigatorio acrescentar se o mapa revelar mecanismos que o catalogo generico nao cobre, por exemplo:

- Workers, claim de fila, drain, DLQ, `MAX_CLAIM` / chunk
- Kafka `MESSAGE_TOO_LARGE`, schema de envelope
- NFe / XML / integracao fiscal
- Triggers Sybase (pode apontar desk check, sem virar `teste-mesa-sybase`)
- RAG / MCP (escopo, secrets, citacao)
- Multi-tenant / UF / filial

Formato: **Validacao 33 — &lt;nome concreto&gt;** + o que foi checado + evidencia.

