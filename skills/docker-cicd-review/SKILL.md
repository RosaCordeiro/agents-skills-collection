---
name: docker-cicd-review
description: >-
  Checklist para revisar ou validar a configuração Docker + CI/CD de um
  projeto (greenfield ou existente): consistência de porta entre .env,
  Dockerfile, docker-compose e variáveis do pipeline; confirmação de que o
  comando que sobe o container injeta de fato as variáveis de ambiente
  (--env-file/env_file, não só o arquivo existir no host); preferência por
  lógica de deploy versionada no .gitlab-ci.yml do próprio repo em vez de
  scripts externos fora de controle de versão; validação que falha o
  pipeline (não só avisa no log) quando um pré-requisito de deploy está
  ausente; e um estágio de testes automatizados rodando dentro da imagem já
  buildada, entre o build e o deploy real. Use quando o usuário pedir revisar
  ou validar Docker, revisar CI/CD, checklist de deploy, "container sobe mas
  não responde", "env vazia dentro do container", ou ao configurar Docker/CI
  de um projeto novo. Não usar para escrever o Dockerfile/aplicação em si
  (skill backend) nem para a estrutura de pasta `.ai` de projeto greenfield
  (skill projeto-ai) — esta skill foca só na cadeia build → variáveis →
  deploy → validação do CI/CD.
---

# Revisão Docker + CI/CD

Checklist para auditar a cadeia completa "código → imagem → variáveis →
container rodando" de um projeto que builda e implanta via Docker/Docker
Compose num pipeline de CI (GitLab CI ou equivalente). Sintoma raiz que esta
skill existe para pegar cedo: **o pipeline reporta sucesso, a imagem builda,
o container aparece no `docker ps`, mas a aplicação não funciona** — porque
alguma etapa entre "arquivo de config existe" e "processo realmente recebeu
essa config" está quebrada, silenciosamente.

## 1. Consistência de porta

A mesma porta precisa aparecer, com o mesmo valor, em todos estes lugares:

| Onde | O quê |
|------|-------|
| `.env` (ou arquivo de variáveis de deploy) | `PORT=` (porta que a aplicação escuta internamente) |
| `Dockerfile` | `EXPOSE <porta>` |
| `docker-compose.yml` | `ports: "<host>:<porta>"` — o lado direito (container) precisa bater com `PORT` |
| Variáveis do pipeline de CI | qualquer `PORTA`/`PORTAH`/equivalente usado no `docker run -p` ou no healthcheck (`curl http://host:porta/...`) |

Se algum desses divergir, o processo pode subir escutando numa porta
diferente da que o Docker publica — o container aparece saudável, mas nada
externo alcança a aplicação. Ao revisar, liste os quatro valores lado a lado
e confirme que são o mesmo número (ou uma relação explícita e documentada,
tipo host = porta+1000 para o ambiente de homologação).

## 2. O container realmente recebe as variáveis de ambiente?

Um arquivo `.env` de deploy existir no disco do servidor **não** significa
que o processo dentro do container o recebeu. Isso só acontece se o comando
que sobe o container referenciar esse arquivo explicitamente:

- `docker run --env-file <caminho>/.env ...`, ou
- `docker-compose.yml` com `env_file: - .env` **e** o container for
  efetivamente subido via `docker-compose up` (não um `docker run` manual
  separado que ignora o compose depois de usá-lo só para buildar a imagem).

Um padrão perigoso comum: um script de deploy usa `docker-compose build`
para gerar a imagem, mas depois sobe o container com `docker container run`
cru, sem `--env-file` — o arquivo de variáveis nunca chega ao processo.
Sintoma: todas (ou quase todas) as variáveis de ambiente aparecem vazias
dentro do container, causando falhas de validação de config que parecem não
ter relação nenhuma entre si (driver de banco ausente, porta indefinida,
credencial vazia), todas com a mesma causa raiz.

**Como confirmar, sem expor segredo no log do CI:** rode dentro do container
já em execução, reportando só presença, nunca o valor:

```bash
docker exec <container> sh -c '
for v in VAR1 VAR2 VAR3; do
  val=$(printenv "$v")
  if [ -n "$val" ]; then echo "$v: SET (len=${#val})"; else echo "$v: EMPTY/UNSET"; fi
done'
```

Se tudo vier `EMPTY/UNSET` de uma vez, o problema é a injeção do arquivo no
container (item acima), não uma variável específica faltando na definição.

## 3. Lógica de deploy versionada no repo, não em script externo

Prefira que os passos de build/scan/deploy fiquem como `script:` inline no
`.gitlab-ci.yml` (ou equivalente) do próprio projeto, em vez de uma chamada
a um script compartilhado fora do controle de versão do repo (ex.:
`/usr/local/bin/deploy-*.sh` num runner, mantido por outra equipe/pessoa).

Motivos:
- Fica revisável em Merge Request, com histórico e diff, como qualquer outra
  mudança de código.
- Um bug no script (como o do item 2) pode afetar **todos** os projetos que
  o chamam ao mesmo tempo, sem que nenhum deles tenha visibilidade ou
  controle sobre a correção — corrigir dentro do próprio `.gitlab-ci.yml`
  resolve para aquele projeto imediatamente, sem depender de outra equipe.
- Scripts externos tendem a acumular lógica implícita (nomes de container,
  caminhos, cálculo de porta) que ninguém revisita até quebrar.

Ao herdar um projeto que já delega para um script externo, ler o conteúdo
desse script (é possível via um job de CI que só faz `cat` nele, se não
houver acesso direto ao servidor) antes de assumir o que ele faz — não
adivinhar pela documentação ou pelo nome do arquivo.

## 4. O pipeline deve falhar, não só avisar

Uma checagem que só imprime um aviso (`echo "ATENÇÃO: ..."`) e continua
mesmo quando um pré-requisito crítico está ausente não previne o problema —
só documenta que ele aconteceu, depois do fato. Pré-requisitos de deploy
(arquivo de env existir, imagem ter sido buildada, credencial estar
presente) devem fazer o job de CI falhar quando ausentes:

```bash
test -f "$ENVFILE" || { echo "ERRO: env-file não encontrado em $ENVFILE"; exit 1; }
```

Reservar `echo` sem `exit 1` só para avisos genuinamente não-bloqueantes
(ex.: uma vulnerabilidade de severidade baixa que o time decidiu não
bloquear o deploy).

## 5. Testes automatizados entre o build e o deploy

Adicionar uma etapa que roda a suite de testes do projeto **depois** da
imagem Docker ser buildada e **antes** do container de deploy real subir —
gate que impede código quebrado de ir ao ar. Preferir rodar a suite dentro
da própria imagem já buildada, não em um ambiente genérico separado, porque
isso garante o mesmo runtime (versão de Node/Java, dependências nativas
compiladas) que vai para produção:

```bash
docker run --rm <imagem_buildada> npm test
```

Se a suite falhar (exit code não-zero), o job de CI falha e as etapas
seguintes (scan de segurança, deploy) não devem rodar. Isso vale tanto para
projetos novos (definir o estágio desde o início) quanto para revisão de
projetos existentes que builda e faz deploy sem nenhum gate de teste no
meio.

## Fronteiras

| Se o pedido for... | Usar |
|---|---|
| Escrever o Dockerfile/API/serviço em si | skill `backend` |
| Estrutura `.ai` (context/rules/decisions) de projeto novo | skill `projeto-ai` |
| Revisão de qualidade/segurança do código da mudança (não da infra de deploy) | skill `review` |
| Executar e documentar a suite de testes como fase de entrega | skill `teste-automatizado` |

Esta skill cobre especificamente a cadeia build → variáveis → deploy →
validação do pipeline — não a lógica de negócio da aplicação nem a revisão
de código da feature.

