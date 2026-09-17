---
name: backstage-recursos
description: >-
  Varre um projeto para descobrir de quais recursos de infraestrutura ele
  depende (banco Sybase/Postgres/Mongo, fila/broker Kafka, host Docker onde
  o app roda, API externa relevante) e cruza com o catalogo de Resources ja
  cadastrados em git-repo.clamed.com.br/devops/recursos-backstage, para
  alimentar o dependsOn do catalog-info.yaml do projeto. So roda quando o
  repositorio de recursos estiver acessivel (rede Clamed/VPN) — se nao
  estiver, pula graciosamente sem travar a entrega. Use ao final de QUALQUER
  entrega de codigo (feature, hotfix, patch), antes da skill
  backstage-catalog-info. Nao usar para escrever o catalog-info.yaml/mkdocs
  em si (isso e a skill backstage-catalog-info) nem para criar Resource
  novo sem confirmacao do usuario.
---

# Backstage — varredura de recursos de infra

Descobre do que um projeto depende em termos de infraestrutura ja cadastrada
(ou nao) como `kind: Resource` no Backstage da Clamed, para alimentar
`spec.dependsOn` do Component do projeto. Esta skill **so descobre e aponta**
— quem edita/cria o `catalog-info.yaml` de fato e a skill
`backstage-catalog-info`.

## Passo 0 — checar se está "dentro da Clamed" (gate obrigatório)

Antes de qualquer outra coisa, tentar acessar o catálogo de referência:

```bash
git ls-remote https://git-repo.clamed.com.br/devops/recursos-backstage.git
```

(ou `git fetch`/`clone` raso se já houver um clone local de referência).

- **Sucesso** → segue o resto desta skill.
- **Falha** (timeout, DNS, sem VPN, rede fora da Clamed) → **avisar em uma
  linha** que a varredura de recursos Backstage foi pulada por falta de
  acesso à rede Clamed, e **seguir o fluxo normal do agent sem travar** a
  entrega. Nunca bloquear ou re-tentar insistentemente.

## Passo 1 — varrer o projeto por dependências de infra

Ler (sem executar) os sinais do próprio projeto:

- Variáveis de ambiente: `.env`, `.env.example`, `docker-compose*.yml`
  (seção `environment`/`env_file`), variáveis de CI (`HMGVARIAVEIS`/
  `PRDVARIAVEIS` — ver skill `gitlab-cicd`).
- `docker-compose*.yml`: serviços de banco/broker declarados, `depends_on`,
  imagens (`sybase`, `postgres`, `mongo`, `kafka`, `redis`, etc).
- `Dockerfile`: base image, pacotes instalados (ex. bridge JDBC/jTDS
  indica Sybase — ver skill `docker`).
- Imports/drivers no código: cliente Kafka (`kafkajs`, `confluent-kafka`),
  driver Sybase/jTDS, `pg`/`typeorm`/`prisma` (Postgres), `mongodb`/
  `mongoose` (Mongo), SDK de API externa relevante.
- Onde o app é hospedado (ver `.gitlab-ci.yml` / scripts de deploy —
  skill `gitlab-cicd`/`linux`): nome do host Docker (ex. `docker-kafka`,
  `dockerlan-01`).

Produzir uma lista curta: `<tipo> — <evidência encontrada> — <nome provável do recurso>`.

## Passo 2 — cruzar com o catálogo de Resources

No `catalog-info.yaml` (raiz) de `devops/recursos-backstage`, procurar
entradas `kind: Resource` e seus `metadata.name` (ex.: `kafka-cluster`,
`sybase`, `docker-kafka`, `lnx-postgres01`, `mongo-atlas`).

Para cada dependência encontrada no Passo 1:

- **Existe Resource correspondente** → registrar `resource:default/<name>`
  como candidato a `dependsOn`.
- **Não existe** → **não inventar nem criar sozinha**. Avisar o usuário:
  "o projeto usa `<X>` mas não achei Resource equivalente em
  recursos-backstage — quer que eu crie um novo Resource lá?" Só se o
  usuário confirmar: criar branch nova a partir de `main` nesse repo
  (nunca commit direto em `main`), adicionar a entrada `kind: Resource`,
  e devolver o link de MR que o `git push` retorna — não abrir/mergear
  sozinha.

## Passo 3 — host de deploy também entra como dependsOn

Por precedente já usado no catálogo da Clamed (ex.: `database-oms`
`dependsOn` `lnx-postgres01`), o host Docker onde o app roda também entra
como `resource:default/<host>` em `dependsOn`.

**Ressalva a documentar sempre que isso for feito:** semanticamente
`dependsOn` deveria expressar dependência em runtime (ex.: "essa API lê
desse banco"), não hospedagem ("essa API roda nesse host"). Usamos mesmo
assim por já ser o padrão adotado no catálogo existente — não é a leitura
"correta" do campo, é a convenção local.

## Saída desta skill

Uma lista final de `resource:default/<name>` (com a ressalva do Passo 3
quando aplicável) e, se houve Resource novo criado, o link do MR — para a
skill `backstage-catalog-info` usar ao montar/atualizar `spec.dependsOn`.

## Fronteiras

| Situação | Skill |
|----------|-------|
| Escrever/editar catalog-info.yaml, mkdocs.yml, docs/index.md | `backstage-catalog-info` |
| Padrões de Dockerfile/docker-compose deste stack | `docker` |
| Variáveis de ambiente por estágio no pipeline | `gitlab-cicd` |
