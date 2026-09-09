---
name: automacao-deploy
description: >-
  Templates prontos para CRIAR jobs de CI/CD que atuam de verdade no
  servidor de deploy da Clamed: subir/parar/reiniciar container, escrever
  o .env do ambiente, checar variáveis sem vazar segredo, ver log, e o
  esqueleto completo de pipeline (diretorio → variaveis → deploy →
  verificar → notificacao → manutencao) pra um projeto novo, já no
  padrão correto (compose direto, sem o bug de --env-file ausente). Use
  quando o usuário pedir criar um `.gitlab-ci.yml` do zero, adicionar um
  job de manutenção (start/stop/log/diagnóstico) num pipeline existente,
  ou montar a automação de deploy de um projeto novo. Para entender como
  os pipelines existentes estão montados hoje (mapa, não template), skill
  `gitlab-cicd`; para auditar se um deploy já existente está correto,
  skill `docker-cicd-review`.
---

# Automação de deploy — templates para criar, não só auditar

Esta skill é o lado "escrever do zero" da skill `gitlab-cicd` (que mapeia
o que já existe) e da `docker-cicd-review` (que audita o que já existe).
Aqui o objetivo é: o usuário pede uma automação nova que **atua no
servidor de verdade** — sobe/derruba container, escreve config, dá
log/diagnóstico — e a resposta é um job de CI pronto para colar, já no
padrão sem o bug de `--env-file` ausente (ver `gitlab-cicd`, "Padrão B").

**Antes de criar qualquer coisa**, confirme com o usuário (ou olhando um
projeto irmão real): nome do projeto (`$CI_PROJECT_NAME`), tag do runner
certo para aquele host, se o projeto já tem `docker-compose.yml`/
`docker-compose.<ambiente>.yml`, e a porta interna da aplicação. Sem isso
o template vira suposição, não automação real.

## Variáveis padrão a declarar no topo do `.gitlab-ci.yml`

```yaml
variables:
  DIRETORIO: $CI_PROJECT_NAME
  SERVIDOR: <IP do host de deploy>
  PORTA: <porta interna/prd>      # ex.: 3001
  PORTAH: <porta host/hmg>        # ex.: 4001 — muitas vezes PORTA + 1000, mas confira
```

## Esqueleto completo de stages para um projeto novo

```yaml
stages:
  - diretorio
  - variaveis
  - deploy
  - manutencao
```

### Stage `diretorio` — clonar/atualizar o checkout no servidor

```yaml
deploy-diretorio-hmg:
  stage: diretorio
  tags: [<tag-do-runner>]
  only:
    variables:
      - $EXECUTAR == "hmg"
  script:
    - cd /var/conteiner/hmg
    - test -d "$DIRETORIO" && sudo mv "$DIRETORIO" "${DIRETORIO}_old" || true
    - sudo rm -rf "${DIRETORIO}_old"
    - git clone --branch "$CI_COMMIT_BRANCH" "$CI_REPOSITORY_URL" "$DIRETORIO"
```

Repita trocando `hmg` por `prd` e o diretório base para `/var/conteiner/prd`.

### Stage `variaveis` — escrever o `.env` real do ambiente

A variável de CI (`HMGVARIAVEIS`/`PRDVARIAVEIS`, tipo arquivo) contém o
`.env` inteiro do ambiente — nunca commitar esse arquivo no repo, ele é
gitignorado e vive só como CI/CD variable no GitLab (Settings → CI/CD →
Variables, marcada como arquivo, idealmente `Protected` + `Masked` se o
GitLab suportar pro conteúdo).

```yaml
env-hmg:
  stage: variaveis
  tags: [<tag-do-runner>]
  only:
    variables:
      - $EXECUTAR == "hmg"
  script:
    - cat "$HMGVARIAVEIS" > "/var/conteiner/hmg/${DIRETORIO}/.env"
```

### Stage `deploy` — build + subida via compose direto (padrão correto)

Só funciona se o `docker-compose.<ambiente>.yml` do projeto tiver
`env_file: - path: .env` (ver skill `docker`). Rodar o compose **na
mesma pasta** onde o `.env` acabou de ser escrito é o que faz a injeção
funcionar sem `--env-file` manual:

```yaml
deploy-docker-hmg:
  stage: deploy
  tags: [<tag-do-runner>]
  only:
    variables:
      - $EXECUTAR == "hmg"
  script:
    - test -f "/var/conteiner/hmg/${DIRETORIO}/.env" || { echo "ERRO: .env ausente, abortando"; exit 1; }
    - cd "/var/conteiner/hmg/${DIRETORIO}"
    - docker compose -p "${DIRETORIO}-hmg" -f docker-compose.hmg.yml up -d --build --remove-orphans
    - docker compose -p "${DIRETORIO}-hmg" -f docker-compose.hmg.yml ps
```

Se o projeto **não** builda via compose (ex.: precisa do scan Trivy antes
do run, como os apps Kafka), inline a lógica completa dentro deste
mesmo job em vez de chamar script externo — ver o exemplo real corrigido
em `api-orquestra-integracao-sybase-kafka/.gitlab-ci.yml` (job
`deploy-docker-hmg`, branch `fix/deploy-docker-hmg-env-file-testes`):
build via `docker-compose build`, `docker run --rm <imagem> npm test`
(gate de teste), scan Trivy, `test -f "$ENVFILE" || exit 1`, e só então
`docker container run --env-file "$ENVFILE" ...`.

### Stage `deploy` — verificação pós-subida

```yaml
verificar-deploy-hmg:
  stage: deploy
  tags: [<tag-do-runner>]
  only:
    variables:
      - $EXECUTAR == "hmg"
  dependencies:
    - deploy-docker-hmg
  script:
    - sleep 40
    - curl -v --fail "http://${SERVIDOR}:${PORTAH}/<healthcheck>"
```

Usar `--fail` no `curl` (não só `-v`) faz o próprio job falhar se o
endpoint não responder 2xx — sem isso, um `curl` que dá "connection
refused" ainda pode deixar o job "verde" dependendo de como o resto do
script está escrito.

## Jobs de manutenção — automações que "atuam no servidor" sob demanda

Cada um só dispara com um valor específico de `$EXECUTAR`, nunca junto
com o deploy normal — são ações pontuais, avulsas.

**Reiniciar container:**
```yaml
restart-container-hmg:
  stage: manutencao
  tags: [<tag-do-runner>]
  rules:
    - if: '$EXECUTAR == "hmgrestart"'
  script:
    - docker restart "${DIRETORIO}-hmg" || docker restart "hmg_${DIRETORIO}"
    - docker ps
```

**Ver log recente:**
```yaml
log-container-hmg:
  stage: manutencao
  tags: [<tag-do-runner>]
  rules:
    - if: '$EXECUTAR == "hmglog"'
  script:
    - docker logs --since 24h "hmg_${DIRETORIO}"
```

**Diagnóstico de variável de ambiente, sem vazar valor** (útil pra
confirmar que um deploy novo recebeu a config certa — ver skill
`docker-cicd-review` item 2 para o porquê):
```yaml
env-container-hmg:
  stage: manutencao
  tags: [<tag-do-runner>]
  rules:
    - if: '$EXECUTAR == "hmgenv"'
  script:
    - >
      docker exec "hmg_${DIRETORIO}" sh -c '
      for v in VAR1 VAR2 VAR3; do
        val=$(printenv "$v")
        if [ -n "$val" ]; then echo "$v: SET (len=${#val})"; else echo "$v: EMPTY/UNSET"; fi
      done'
```

Troque `VAR1 VAR2 VAR3` pela lista real de variáveis críticas daquele
projeto (driver de banco, URL de conexão, porta, nome da API).

## Cuidados ao criar automação que atua em ambiente real

- Job de `stop`/`restart`/`rm` em produção derruba o serviço, ainda que
  por segundos — confirmar com o usuário antes de disparar, nunca incluir
  como efeito colateral de outro job.
- Runner é shell executor: o job roda direto no host, não num container
  descartável — um `rm -rf`/`docker system prune` mal escopado afeta
  **todos** os projetos que compartilham aquele host/tag, não só o seu.
- Ao criar o pipeline de um projeto novo do zero, preferir o padrão
  "compose direto" (`docker compose up -d --build`) em vez de replicar o
  padrão "build separado do run" que já causou o bug de `--env-file`
  ausente em outros repos — ver `gitlab-cicd` para os dois padrões lado a
  lado.

