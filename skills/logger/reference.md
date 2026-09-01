# Logger — referencia

Complemento da skill `logger`. Ler sob demanda (catalogo, aceite, exemplos).

---

## Criterios de aceite

* [ ] Todos os novos logs possuem `event`.
* [ ] `event.name`, `event.action` e `event.outcome` seguem uma nomenclatura padronizada.
* [ ] Toda operação iniciada pela aplicação possui um `correlation_id`.
* [ ] O `correlation_id` é propagado entre as etapas internas da aplicação.
* [ ] O `correlation_id` é propagado para integrações externas quando tecnicamente possível.
* [ ] O `correlation_id` é incluído automaticamente pelo mecanismo de logging.
* [ ] É possível pesquisar todos os logs de uma operação utilizando apenas o `correlation_id`.
* [ ] O `msg` continua disponível para diagnóstico detalhado.
* [ ] Os campos atuais permanecem compatíveis.
* [ ] A documentação dos valores possíveis de `event` é criada.
* [ ] São criados testes garantindo a geração e propagação do `correlation_id`.

---

## Resultado esperado (Kibana)

Após a implementação, deverá ser possível utilizar o Elasticsearch/Kibana para responder perguntas como:

* Qual foi o fluxo completo de uma determinada NF?
* Quais etapas foram executadas?
* Em qual etapa ocorreu o erro?
* Qual serviço gerou o erro?
* Quantas operações de determinado tipo falharam?
* Quais eventos apresentam maior frequência de erro?
* Uma mesma operação passou por quais workers/serviços?

O objetivo final é transformar os logs atuais em uma base estruturada de **eventos rastreáveis**, permitindo posteriormente criar dashboards, métricas e alertas operacionais no Kibana.

---

## Catalogo de `event` (rascunho — equipe fecha nomes)

Valores **estaveis**. Ampliar no README do produto ao adicionar dominio novo.

### `event.outcome` (fechado)

| Valor | Uso |
|-------|-----|
| `success` | Operacao concluida com sucesso |
| `failure` | Operacao falhou |
| `partial` | Sucesso parcial / degradado (se o dominio precisar) |
| `skipped` | Nao executada de proposito (guard, feature off) |

### `event.action` (exemplos)

`create` · `update` · `delete` · `process` · `request` · `upload` · `download` · `retry` · `timeout` · `validate`

### `event.name` por dominio (exemplos Translog / generico)

| name | Dominio |
|------|---------|
| `romaneio` | Criacao/atualizacao de romaneio |
| `nfe` | Processamento de NF-e |
| `translog` | Chamada HTTP/FTP Translog generica |
| `ftp` | Operacao FTP |
| `kafka` | Produce/consume |
| `worker` | Ciclo do worker |

Pares canonicos de referencia:

```text
romaneio.create.success | romaneio.create.failure
nfe.process.success     | nfe.process.failure
translog.request.success| translog.request.failure
ftp.upload.success      | ftp.upload.failure
ftp.upload.skipped      # ex.: arquivo ja presente (fallback)
```

Mapear keywords legadas ↔ event quando documentar (transicao):

| keyword (legado) | event sugerido |
|------------------|----------------|
| `placa_veiculo_obrigatoria` | `romaneio.create.failure` |
| `api_translog_erro_criar_romaneio` | `romaneio.create.failure` |
| `timeout_execucao_nf` | `nfe.process.failure` (action pode ser `timeout` se o time padronizar) |
| `ftp_timeout` | `ftp.upload.failure` / `ftp.download.failure` |
| `ftp_translog_upload_ja_presente` | `ftp.upload.skipped` ou `ftp.upload.success` (definir no produto) |

---

## Queries Kibana uteis

```text
correlation_id:"01K2ABC123XYZ"
event.name:"romaneio" AND event.outcome:"failure"
event.name:"nfe" AND event.action:"process" AND event.outcome:"failure"
keywords:"placa_veiculo_obrigatoria"
app_name:"xml-translog" AND correlation_id:"…"
```

---

## Testes minimos (quando a entrega introduzir correlacao)

1. Inicio de fluxo **sem** id externo → gera `correlation_id` e aparece no log.
2. Inicio **com** id recebido (header/mensagem) → **reusa** o mesmo valor em todos os logs do escopo.
3. Propagacao para o proximo hop (mock HTTP/Kafka) envia o mesmo id.
4. Dois fluxos concorrentes nao misturam `correlation_id` (contexto isolado).

---

## Anti-padroes

| Evitar | Preferir |
|--------|----------|
| `event` copiado do texto de `msg` | Catalogo estavel name/action/outcome |
| Passar `correlation_id` manual em toda call | Contexto automatico |
| Novo `error` generico depois do error canonico | Um error + `falhaJaLogada` |
| Keyword unica por instancia (`erro_nf_4226…`) | Keyword de classe + campos (`chave`) |
| Logar token / senha / payload PII completo | Codigo + id de negocio |

