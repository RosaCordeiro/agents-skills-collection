---
name: linux
description: >-
  Convenções reais do ambiente Linux onde os deploys da Clamed rodam:
  runners GitLab shell executor com Docker/Trivy no próprio host,
  convenção de diretório /var/conteiner/<tipo>/<projeto>, roteiro de
  diagnóstico de "container subiu mas não responde" sem acesso SSH
  direto, e por que o bridge JDBC (pacote npm `java`) não roda de
  verdade fora de Linux com JDK instalado. Use quando o usuário pedir
  investigar um servidor/container remoto via CI, diagnosticar
  conectividade (ping vs curl), ou entender por que algo só falha fora do
  Docker/WSL. Para o passo a passo específico de porta/env-file, skill
  docker-cicd-review; para a mecânica do pipeline em si, skill
  gitlab-cicd.
---

# Linux neste workspace

## Runners são shell executor — o host é real, não descartável

Os runners GitLab usados aqui rodam com executor **shell**: os comandos
do job executam direto no sistema operacional do host (Ubuntu), não
dentro de um container efêmero. Docker e Trivy já estão instalados nesse
host. Consequência prática: um job de CI pode ler (ou, com cuidado,
escrever) qualquer coisa no filesystem daquele runner — útil para
diagnóstico sem acesso SSH (ex.: `cat` num script de deploy externo,
`docker exec`/`docker logs` num container já rodando) — mas também
significa que esse host é infraestrutura de produção compartilhada, não
um sandbox descartável. Qualquer mudança feita por um job (parar
container, remover imagem, sobrescrever arquivo) afeta o host real e
pode impactar outros projetos que rodam nele.

## Convenção de diretório de deploy

```
/var/conteiner/<tipo>/<projeto>/
```

onde `<tipo>` é `hmg` ou `prd`. Esse diretório guarda tanto o checkout git
(feito pelo job "diretorio") quanto o `.env` real do ambiente (escrito
pelo job "variaveis" — ver skill `gitlab-cicd`). Nome do container/projeto
compose geralmente é `<tipo>_<projeto>` ou `<projeto>-<tipo>` (varia por
repo, confira antes de assumir).

## Diagnosticar "container subiu mas não responde", sem SSH

Roteiro na ordem, usando só o que um job de CI (ou você, de fora) consegue
fazer:

1. `docker ps` — confirma o mapeamento de porta publicado
   (`host:porta_host->porta_container`).
2. `curl -v http://<host>:<porta_host>/<healthcheck>` de fora — o tipo de
   falha já diz muito:
   - **"Connection refused"** rápido → o host respondeu, mas nada está
     escutando naquela porta *dentro* do container (processo não subiu
     na porta esperada, ou não subiu de todo).
   - **Timeout** (sem resposta nenhuma) → provavelmente bloqueado antes
     de chegar (firewall, rede, host errado) — nem chegou a testar o
     processo.
3. `docker logs --since 24h <container>` — erros de aplicação, stack
   trace, mensagem de "servidor ativo na porta X" (confirma em qual porta
   o processo realmente escutou, comparar com o mapeamento do `docker
   ps`).
4. `docker exec <container> sh -c 'printenv <VAR>'` por variável
   específica (nunca um dump completo do ambiente, evita vazar
   credencial em log de CI) — confirma se a config chegou ao processo.

**`ping` falhando não é sinal de problema** quando `curl`/HTTPS funciona
— ICMP costuma estar bloqueado no firewall corporativo
independentemente das portas de aplicação estarem liberadas. Não
persiga essa pista.

## Bridge JDBC (pacote npm `java`) exige JDK real

Os serviços que falam com Sybase via jTDS usam o pacote npm `java`
(bridge JVM), que precisa de um JDK instalado de verdade
(`openjdk-17-jdk`), `JAVA_HOME` e `LD_LIBRARY_PATH` apontando para
`libjvm.so` — não roda com só o JRE, e não roda em Windows sem toolchain
nativo (`node-gyp` falha por falta de compilador/Java). Ao validar uma
mudança que toca nesse bridge, sempre teste dentro do container Linux
real (ou WSL com JDK instalado) — uma falha de build nativo no Windows
puro não indica bug no código, só ambiente incompatível.

## A estudar

- Gerenciamento via `systemd` — os containers aqui são geridos só pelo
  próprio Docker (`--restart on-failure:N`) e por jobs manuais de CI
  (start/stop), não há unit files systemd envolvidos.
- Agregação de log além de `docker logs` — existe um diretório de
  Fluent Bit (`/var/conteiner/data/fluent-bit/app`) referenciado nos
  scripts de deploy, mas a operação direta dele não foi mapeada aqui.
- Regras de firewall além de acionar `deploy-firewall.sh` como caixa
  preta — não sabemos o que esse script faz por dentro.
- Hardening do host do runner (usuários, permissões, atualização de
  pacotes do próprio SO do runner).

