---
name: logger
description: >-
  Padrao de logs com @clamed/logger: keywords, niveis, event (name/action/outcome),
  correlation_id e contexto automatico para rastreio no Elasticsearch/Kibana.
  Use quando o agent Pro/Simples/backend/review/auditor implementar ou revisar
  logs em projeto Node que ja usa (ou for adotar) @clamed/logger.
---

# Logger (`@clamed/logger`)

Consulte esta skill **sempre** que o trabalho tocar logs estruturados em projeto
**Node.js** que ja usa (ou decidir incluir) `@clamed/logger`.

Responda em portugues. Nao troque o pacote de logger sem autorizacao explicita.

## Quando aplicar

| Situacao | Acao |
|----------|------|
| Projeto **ja** tem `@clamed/logger` | Herdar; novos fluxos seguem este padrao |
| Greenfield Node (gate da `especificacao`) | Se o usuario escolheu logger → aplicar esta skill na implementacao |
| Stack nao-Node / sem logger padrao | **N/A** — nao forcar `@clamed/logger` |

Leitura complementar: [reference.md](reference.md) (catalogo de `event`, exemplos Kibana, checklist de aceite).

---

## 1. Pacote e campos base (compatibilidade)

Usar o provider do projeto (`LoggerProvider` / `create-logger` / `observability/`).

Campos que **devem permanecer** (mudanca incremental; nao quebrar Kibana):

```text
@timestamp
app_name
environment
level
msg
keywords
service_type
version
hostname
```

Proibido em caminhos de producao: `console.log` / `console.error` de ruido; PII desnecessaria (token, senha, corpo completo de PII); spam em loop quente.

---

## 2. Niveis

| Nivel | Quando |
|-------|--------|
| `error` | Falha que impede a operacao ou exige acao (integracao, timeout, exception) |
| `warn` | Condicao de negocio / degradacao recuperavel (validacao, fallback, duplicidade tratada) |
| `info` | Marco relevante do fluxo (inicio/fim de operacao de negocio, agrupamento) |
| `debug` | Diagnostico fino (homolog/dev); nao usar como unico sinal de alerta em PRD |

Regras:

- Escolher o nivel pelo **impacto operacional**, nao pelo texto do `msg`.
- Um evento de falha canonica = **um** `error` (evitar duplicar com segundo `error` generico no worker — padrao `falhaJaLogada` quando o projeto ja usa).
- Com `LOG_LEVEL=error` / `LOGGER_LEVEL=error`, `warn`/`info` somem: documentar keywords de warn no README se forem operacionais.

---

## 3. Keywords (padrao atual — manter)

`keywords` e `string[]` estavel para filtro no Elasticsearch (nao e o texto do `msg`).

Regras:

1. **snake_case**, ingles ou dominio do time, **estavel** (nao gerar a partir da mensagem).
2. Um identificador **canonico** por classe de evento (ex.: `api_translog_erro_criar_romaneio`, `timeout_execucao_nf`, `placa_veiculo_obrigatoria`).
3. Pode haver keywords auxiliares no mesmo array (ex.: agrupamento + variante).
4. Documentar keywords novas no README / observabilidade da entrega.
5. **Transicao:** `keywords` continua obrigatorio nos fluxos que ja o usam; nao remover nesta etapa so porque `event` chegou.

Exemplo:

```typescript
logger.warn(
  "Placa do veiculo obrigatoria para criar romaneio na Translog...",
  { keywords: ["placa_veiculo_obrigatoria"] }
);
```

---

## 4. Padronizacao de eventos e `correlation_id`

### Objetivo

Evoluir o padrão de logs da aplicação para permitir **monitoramento, rastreabilidade e correlação de uma operação ponta a ponta no Elasticsearch/Kibana**.

A aplicação atualmente possui campos como `app_name`, `environment`, `level`, `keywords` e `msg`. Devemos adicionar uma estrutura padronizada para identificar **qual evento ocorreu** e **qual operação originou aquele evento**, permitindo acompanhar uma mesma transação através de diferentes etapas, workers e serviços.

### 4.1 Campo `event`

Adicionar aos logs um campo estruturado `event` para identificar de forma padronizada a operação ou evento de negócio/técnico ocorrido.

Exemplo:

```json
{
  "event": {
    "name": "romaneio",
    "action": "create",
    "outcome": "failure"
  }
}
```

#### Regras

* `event.name` deve representar o domínio/operação.
* `event.action` deve representar a ação executada.
* `event.outcome` deve representar o resultado da operação.
* Os valores devem ser padronizados e estáveis, evitando utilizar o texto de `msg` como identificador do evento.
* O `msg` continua sendo utilizado para detalhamento legível do ocorrido.
* O `keywords` existente pode continuar sendo utilizado durante a transição, não sendo necessário removê-lo nesta etapa.

Exemplo (Translog):

```json
{
  "event": {
    "name": "romaneio",
    "action": "create",
    "outcome": "failure"
  },
  "keywords": ["placa_veiculo_obrigatoria"],
  "msg": "Placa do veículo obrigatória para criar romaneio na Translog..."
}
```

Forma compacta de referencia (name.action.outcome):

```text
romaneio.create.success
romaneio.create.failure
nfe.process.success
nfe.process.failure
translog.request.success
translog.request.failure
```

A nomenclatura deve ser definida e documentada pela equipe antes da implementação definitiva. Catalogo vivo: [reference.md](reference.md).

### 4.2 `correlation_id`

Adicionar um identificador único para permitir rastrear uma operação completa entre diferentes logs, processos e serviços.

Exemplo:

```json
{
  "correlation_id": "01K2ABC123XYZ..."
}
```

#### Regras

* Toda operação que iniciar um fluxo deve gerar um `correlation_id` caso não exista um identificador recebido do fluxo anterior.
* Caso a operação já receba um `correlation_id`, ele deve ser propagado para os próximos processos/serviços.
* O mesmo `correlation_id` deve aparecer em todos os logs pertencentes à mesma operação.
* O valor não deve ser alterado durante o processamento.
* O identificador deve ser seguro para utilização como campo `keyword` no Elasticsearch.
* O `correlation_id` não deve depender do texto da mensagem.
* O valor deve possuir baixa probabilidade de colisão.

Propagacao (conceito):

```text
Requisição
   │
   │ correlation_id = ABC123
   ▼
xml-translog
   │
   ├── log 1 → ABC123
   ├── log 2 → ABC123
   ├── log 3 → ABC123
   │
   ▼
Kafka
   │
   ▼
Worker
   │
   ├── log 4 → ABC123
   └── log 5 → ABC123
```

Pesquisa Kibana: `correlation_id:"ABC123"`.

Preferir ULID / UUID sem espacos (keyword-safe). Headers/campos de mensagem: propagar quando tecnicamente possivel (HTTP, Kafka headers, etc.).

### 4.3 Contexto automatico de logging

O `correlation_id` deve ser mantido automaticamente no contexto da execução, evitando que os desenvolvedores precisem informá-lo manualmente em cada chamada de logger.

Exemplo conceitual:

```typescript
logger.info({
  event: {
    name: "romaneio",
    action: "create",
    outcome: "success"
  }
}, "Romaneio criado");
```

O logger deve automaticamente incluir:

```json
{
  "correlation_id": "ABC123"
}
```

em todos os logs daquela execução.

Implementacao tipica (AsyncLocalStorage / child logger / binder do `@clamed/logger` conforme o projeto ja expuser). **Nao** exigir `correlation_id` no objeto de cada chamada se o contexto estiver ativo.

### 4.4 Compatibilidade

A implementação deve manter os campos atuais dos logs (§1). A mudança deve ser incremental e não deve quebrar os dashboards, consultas ou processos atuais do Kibana.

---

## 5. Como chamar o logger (implementacao)

Padrao alvo (mensagem + campos estruturados). Adaptar a assinatura real do `@clamed/logger` do projeto (`(msg, obj)` vs `(obj, msg)`):

```typescript
logger.error(
  "Placa do veiculo obrigatoria para criar romaneio na Translog...",
  {
    keywords: ["placa_veiculo_obrigatoria"],
    event: { name: "romaneio", action: "create", outcome: "failure" },
    // correlation_id: injetado pelo contexto — nao repetir a cada call
  }
);
```

Checklist do agent ao escrever log novo:

- [ ] Nivel correto (§2)
- [ ] `keywords` canonicos (§3)
- [ ] `event.name` / `event.action` / `event.outcome` (§4.1)
- [ ] Fluxo tem `correlation_id` no contexto (§4.2–4.3)
- [ ] `msg` legivel; sem secret/PII
- [ ] Sem log duplicado no mesmo caminho de falha

---

## 6. Onde entra no fluxo de desenvolvimento

| Agent / skill | Uso |
|---------------|-----|
| `desenvolvimento-pro` / `desenvolvimento-simples` | Ler esta skill ao implementar/alterar logs Node |
| `backend` | Logs estruturados em API/worker = esta skill |
| `especificacao` | Gate herda logger; RNF/obs citam `event` + `correlation_id` se a feat tocar obs |
| `arquitetura` | Desenhar geracao/propagacao do `correlation_id` e catalogo `event` |
| `review` / CR9 | Verificar keywords + `event` + correlacao automatica |
| `documentacao` R6 | Documentar keywords/`event` novos e como filtrar por `correlation_id` |
| `auditor` Validacao 17 | Avaliar aderencia a esta skill se o projeto usa o logger |
| `teste-automatizado` | Testes de geracao/propagacao de `correlation_id` quando a entrega introduzir o mecanismo |

---

## 7. Fora de escopo

- Trocar `@clamed/logger` por outro pacote
- Remover `keywords` nesta etapa
- Exigir logger Clamed em Python/Go/SAP/ABAP
- Dashboards Kibana finais (objetivo posterior; os campos preparam a base)
