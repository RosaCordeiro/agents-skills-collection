---
name: docker
description: >-
  Padrões reais de Dockerfile e docker-compose usados neste workspace:
  base Ubuntu 22.04 com Node 20 + Java 17 instalados via apt (para o
  bridge JDBC/jTDS do Sybase) versus a imagem corporativa pré-pronta
  reg.clamed.com.br/dev-base-images/node20-jre17, confiança de CA
  corporativa (Fortinet SSL-inspection) e de CA de broker Kafka,
  convenção de arquivo por ambiente no docker-compose, e onde a porta
  interna precisa bater. Use quando o usuário pedir escrever/revisar
  Dockerfile ou docker-compose deste stack, decidir entre base image
  manual vs pronta, ou configurar rede/CA dentro de um container. Para
  o checklist de porta/env-file/teste no contexto do deploy via CI, use
  a skill docker-cicd-review; para a lógica de negócio do serviço em si,
  skill backend.
---

# Docker neste workspace

## Duas famílias de base image, para o mesmo runtime

**A) Manual via apt (mais comum hoje)** — `FROM ubuntu:22.04`, depois
`apt-get install` de Node 20 (via repositório NodeSource) e
`openjdk-17-jdk`/`openjdk-17-jre`. Usada nos serviços que dependem do
pacote npm `java` (bridge JDBC) para falar com Sybase via driver jTDS —
sem essa combinação Node+JRE completo, o driver não carrega. Reconstrói o
toolchain inteiro (apt update, Node, JDK, build-essential) a cada build,
sem cache entre repos.

**B) Imagem corporativa pré-pronta** — `FROM
reg.clamed.com.br/dev-base-images/node20-jre17:1.0.0`, num Dockerfile
multi-stage (`AS builder`). Mesmo par Node 20 + JRE 17, mantido
centralizado num registry próprio (`reg.clamed.com.br`, diferente do
Nexus de pacotes npm) — build mais rápido e consistente, sem repetir a
instalação de SO em todo repositório. **Preferir esta opção** ao criar um
Dockerfile novo que precise de Node+Java — só cair no padrão manual (A)
se a imagem pronta não existir ainda para a combinação de versões
necessária.

Serviços puramente frontend (sem bridge Java) não precisam de nenhuma das
duas — `FROM node:alpine` (build) é suficiente e mais leve.

## Confiança de CA — duas situações distintas, não confundir

1. **CA corporativa para `apt`/`curl` dentro do build** — a rede da
   Clamed faz inspeção SSL (Fortinet). Sem confiar nessa CA dentro da
   imagem, `apt-get update`/`curl` para hosts externos pode falhar ou
   travar durante o build. Padrão: `COPY docker/certs/*.crt
   /usr/local/share/ca-certificates/` + `update-ca-certificates` **antes**
   de qualquer `apt-get`/`curl` que precise de rede externa.
2. **CA do broker Kafka para o cliente Node em runtime** — SSL/SASL do
   Kafka interno da Clamed precisa da CA própria confiada pelo *processo
   Node*, não só pelo SO: `COPY ca.crt
   /usr/local/share/ca-certificates/clamed-ca.crt` +
   `update-ca-certificates` + `ENV NODE_EXTRA_CA_CERTS=
   /usr/local/share/ca-certificates/clamed-ca.crt`. Sem essa variável, o
   `update-ca-certificates` sozinho não é suficiente — o runtime do
   Node/OpenSSL não lê o CA bundle do sistema automaticamente para
   conexões TLS da aplicação.

## docker-compose: um arquivo por ambiente, nome inconsistente entre repos

Cada ambiente tem seu próprio arquivo de compose — mas a convenção de
nome **não é uniforme** entre repositórios, confira sempre o nome real
antes de escrever um comando:

- `docker-compose.yml` — local/dev, comum a todos.
- `docker-compose-hmg.yml`/`docker-compose.hmg.yml` (hífen **ou** ponto,
  varia por repo) e o par prd equivalente.
- Overlays adicionais quando existem (ex.: `docker-compose.kafka-clamed.yml`
  para trocar o broker local pelo Kafka real da Clamed,
  `docker-compose.load-6filas.yml` para cenário de carga com múltiplos
  workers).

Para o padrão de deploy funcionar sem bug (ver skill `gitlab-cicd`,
"Padrão B"), o `env_file:` do compose do ambiente precisa apontar
exatamente para o arquivo que o pipeline escreve — `env_file: - path:
.env` funciona quando o `docker compose` roda com esse `.env` no mesmo
diretório (CWD), o que só acontece se o job de deploy fizer `cd` para lá
antes de rodar o compose.

## Porta interna == porta do compose == PORT do app

Regra que já rendeu incidente real: a porta que a aplicação escuta
(variável `PORT`) precisa ser **exatamente** o lado direito do
`ports:`/`-p` do container (o lado "container", não o lado "host"), e
bater com o `EXPOSE` do Dockerfile. O lado esquerdo (porta do host) é
outra variável, específica do ambiente/CI. Checklist completo de como
verificar isso na prática (incluindo o comando pra confirmar de fora que
bateu) está na skill `docker-cicd-review` — não duplicar aqui.

## Redes

`networks:` externas nomeadas (ex.: `kafka-dev`) compartilhadas entre o
container da aplicação e o broker Kafka local, para os dois se
enxergarem por nome de serviço em ambiente de desenvolvimento/homolog
local.

## A estudar

- Multi-stage build para os serviços que hoje usam o padrão manual (A) —
  só `xml-translog` faz multi-stage hoje; os demais buildam tudo num
  stage só, imagem final maior que precisa.
- Rodar como usuário não-root dentro do container — todos os Dockerfiles
  observados rodam como root.
- `HEALTHCHECK` no Dockerfile/compose — não usado; a checagem de saúde
  hoje é só o `curl` externo feito pelo próprio pipeline de CI.
- Cache de camada entre builds (`--cache-from`, BuildKit) — os pipelines
  observados usam `build --no-cache` sempre, rebuild completo a cada
  deploy.
- Redução de tamanho de imagem (imagens Ubuntu+Node+Java completas,
  nenhuma etapa de "distroless"/imagem final enxuta).

