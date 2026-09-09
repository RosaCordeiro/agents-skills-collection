---
name: gitlab-cicd
description: >-
  Como os pipelines GitLab CI deste workspace realmente funcionam:
  disparo manual por variável $EXECUTAR (não CI automático em push),
  esqueleto de stages padrão, onde vivem as variáveis de ambiente de
  deploy (HMGVARIAVEIS/PRDVARIAVEIS), os dois padrões de subida de
  container observados (um com bug conhecido, outro correto), os
  scripts de deploy externos por repo, e o scan Trivy. Use quando o
  usuário pedir mexer em .gitlab-ci.yml, entender por que um pipeline
  "passou" mas o app não subiu certo, revisar/criar stage de deploy,
  ou comparar deploy entre repos. Para o checklist específico de
  verificar se um deploy está correto (porta, env-file, teste pós-build),
  use a skill docker-cicd-review — esta skill aqui é o mapa de como o
  GitLab CI está montado; aquela é o procedimento de auditoria.
---

# GitLab CI/CD neste workspace

## Disparo: manual, por variável, não automático

Os pipelines não rodam sozinhos a cada push. Cada job é condicionado a
`only: variables: - $EXECUTAR == "<valor>"` (ou o equivalente moderno
`rules: - if:`) — nada roda até alguém disparar manualmente o pipeline na
UI do GitLab (Run pipeline) escolhendo a branch e definindo `$EXECUTAR`.
Valores de `$EXECUTAR` comuns e o que cada um dispara:

| Valor | O que roda |
|-------|------------|
| `qa` | Sonarqube |
| `fw` | Abrir porta no firewall |
| `hmg` / `prd` | Clonar diretório → escrever `.env` → build+deploy do ambiente |
| `hmgstart`/`hmgstop`/`prdstart`/`prdstop` | Start/stop manual do container |
| `hmglog`/`prdlog` | `docker logs` do container (manutenção) |

Ao pedir "roda o pipeline pra mim", sempre perguntar/confirmar com qual
valor de `$EXECUTAR` — sem isso, nenhum job real dispara.

## Esqueleto de stages padrão

A maioria dos repos Node segue este esqueleto (nomes de stage em
português, na ordem):

```
qualidade → firewall → diretorio → variaveis → deploy → notificacao → manutencao
```

- **diretorio**: `deploy-diretoriov2.sh` faz backup do diretório antigo
  (`mv $PROJETO ${PROJETO}_old`) e `git clone` fresco em
  `/var/conteiner/$TIPO/$DIRETORIO` — o checkout no runner nunca tem
  `.env` (está no `.gitignore`, nunca vai pro git).
- **variaveis**: escreve o `.env` real a partir de uma variável de CI do
  tipo arquivo — `HMGVARIAVEIS` (homolog) / `PRDVARIAVEIS` (produção) —
  direto no mesmo diretório: `cat $HMGVARIAVEIS >
  /var/conteiner/$EXECUTAR/$DIRETORIO/.env`. É aqui que fica a "fonte da
  verdade" das variáveis de ambiente de cada ambiente — não no `.env`
  local do repositório.
- **deploy**: builda a imagem e sobe o container — ver os dois padrões
  abaixo.
- **manutencao**: jobs avulsos de start/stop/log, cada um só reage a um
  valor específico de `$EXECUTAR`, nunca rodam junto com deploy normal.

## Dois padrões de subida de container — um com bug conhecido

**Padrão A — build e run separados (visto em vários repos, com bug real
já confirmado):** um script externo builda via `docker-compose ... build`
e depois sobe o container com um `docker container run` cru, montado na
mão (`-p`, `--name`, `--restart`, etc.), **sem `--env-file`**. Isso
desconecta completamente o `.env` escrito no stage "variaveis" do
processo real — sintoma: todas as variáveis de ambiente vêm vazias dentro
do container (confirmável com `docker exec <container> printenv <VAR>`),
causando falhas de validação de config que parecem não ter relação entre
si. Ver skill `docker-cicd-review` para o procedimento completo de
diagnóstico e correção (inclui o exemplo real documentado). Scripts
externos observados nesse padrão, um por repo (**não é um script único
compartilhado** — cada repo pode chamar um nome diferente, sempre
confirme qual antes de assumir comportamento):
`deploy-docker.sh`, `deploy-docker-fk.sh`, `deploy-docker-limitado.sh`,
`deploy-docker-trivy.sh` — todos em `/usr/local/bin/` no runner.

**Padrão B — compose direto, sem split (visto em `clamed.dev`, correto):**
sem script externo de deploy nenhum — o job só faz `cd` até o diretório
exato onde o stage "variaveis" escreveu o `.env`, e roda
`docker compose -p <projeto>-<ambiente> -f docker-compose.<ambiente>.yml
up -d --build --remove-orphans`, com `env_file: - path: .env` declarado
no compose. Build e subida acontecem no mesmo comando, na mesma pasta —
o `.env` é encontrado automaticamente pelo compose, sem depender de
nenhuma flag manual. **Este é o padrão a preferir** ao criar ou corrigir
um stage de deploy — evita a classe inteira de bug do Padrão A.

## Scan de segurança (Trivy)

Onde existe, o scan roda contra a imagem recém-buildada, duas vezes
(saída tabela pro log do job + relatório HTML como artifact via
`--format template --template @/usr/local/share/trivy/templates/html.tpl`),
não-bloqueante em homolog (`--exit-code 0`), bloqueando só severidade
CRITICAL em produção. `trivy` está disponível direto no runner (executor
shell), não precisa de imagem/container extra pra rodar o scan.

## Runners

Executor **shell** (não Docker executor) — os comandos do job rodam
direto no host do runner, com `docker`/`trivy` já instalados nele. Isso
também significa que um job de CI pode inspecionar/ler qualquer coisa no
filesystem daquele host (útil pra auditar um script de deploy externo
sem precisar de acesso SSH — só um job com `cat <script>`). Tags de
runner observadas, cada uma amarrada a um host físico diferente:
`shDKafka` (host dos apps Kafka), `shDKlan6` (host do clamed.dev) — o
job precisa da tag certa pra cair na máquina que tem o diretório/imagem
esperados.

## A estudar

- `environments:` do GitLab (rastreamento de deploy/histórico na UI,
  hoje inexistente — deploys não aparecem na aba Environments/Deployments).
- Migrar `only: variables:` (sintaxe legada) para `rules: if:` em todo
  lugar — já parcialmente adotado, inconsistente entre repos.
- `include:` de um template de CI compartilhado entre repos, em vez de
  copiar o mesmo esqueleto de stages em cada `.gitlab-ci.yml` — reduziria
  duplicação, mas exige um repo de templates mantido à parte.
- GitLab Container Registry (usar o registry nativo do GitLab, ou o
  `reg.clamed.com.br` já usado por `xml-translog`, para versionar imagens
  em vez de rebuildar do zero a cada deploy).
- Variáveis de CI protegidas/mascaradas (`Protected`/`Masked` no GitLab)
  para `HMGVARIAVEIS`/`PRDVARIAVEIS` — confirmar se já estão marcadas.

