---
name: backstage-catalog-info
description: >-
  Cria ou atualiza, na raiz de um repositorio de projeto (Node/TS, Go,
  Python, PowerBuilder etc), o catalog-info.yaml (kind: Component), o
  mkdocs.yml e docs/index.md para publicar o projeto e seu TechDocs no
  Backstage da Clamed (backstage.clamed.com.br). Idempotente: se ja existe,
  edita preservando customizacoes. Sempre em branch nova a partir de
  origin/main, com stash de trabalho em andamento se necessario. Use ao
  final de QUALQUER entrega de codigo (feature, hotfix, patch), depois da
  skill backstage-recursos (que fornece o dependsOn). Use when the user
  asks registrar no Backstage, publicar TechDocs, catalog-info.yaml,
  Component do Backstage. Nao usar para descobrir dependencias de infra
  (skill backstage-recursos).
---

# Backstage — catalog-info.yaml e TechDocs

Registra ou atualiza um projeto como `Component` no Backstage da Clamed,
com TechDocs funcional. Roda **depois** da skill `backstage-recursos`
(que fornece a lista de `dependsOn`).

## Quando pular

PowerBuilder de tela/módulo dentro de um sistema legado (`Sistemas_PB12`)
não gera repositório git próprio nem faz sentido virar `Component`
individual no Backstage — pular esta skill nesse caso. Se o projeto PB
algum dia ganhar repositório próprio (ex. um serviço de integração), essa
condição deixa de valer.

## Passo 0 — branch limpa

1. `git status` na cópia local do projeto.
2. Se houver mudanças não commitadas na branch atual: `git stash push -u`.
3. `git fetch origin && git checkout -b chore/backstage-catalog origin/main`
   (nunca commitar direto em `main`, nunca misturar com branch de trabalho
   em andamento).
4. Ao final (depois do commit/push desta skill), voltar para a branch
   original do dev e, se houve stash, `git stash pop`.

## Passo 1 — derivar dados do próprio git remote (nunca chutar)

```bash
git remote -v
```

- `gitlab.com/project-slug`: `<grupo>/<repo>` extraído da URL do remote.
- `gitlab.com/instance`: o **hostname** do remote — a Clamed tem pelo menos
  duas instâncias GitLab distintas (`git-repo.clamed.com.br` e um servidor
  interno por IP, ex. `10.0.4.67` — ver skill `git`). Nunca assumir uma
  instância fixa; derivar sempre do remote real deste projeto.

## Passo 2 — decidir `spec.owner` sem chutar

`spec.owner` precisa ser um `Group` que **já existe** no catálogo — senão o
Backstage recusa a entidade ("relations to other entities... not found").

1. Ler `catalog-info.yaml` de outros projetos já registrados (clonar/ler
   `git-repo.clamed.com.br/devops/recursos-backstage` como referência de
   nomes de owner válidos, e/ou outros repositórios já publicados).
2. Se o nome do owner esperado for ambíguo ou não aparecer em nenhuma
   referência (ex.: apareceu "supplychain-clamed" mas o catálogo só tem
   "supply-chain"), **perguntar ao usuário** em vez de adivinhar — não
   inventar nome de owner.

## Passo 3 — escrever/editar os arquivos na raiz

### catalog-info.yaml

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: <nome-do-componente, kebab-case>
  annotations:
    backstage.io/techdocs-ref: dir:.
    gitlab.com/project-slug: <grupo/nome-do-repo-no-gitlab>
    gitlab.com/instance: <hostname derivado do git remote -v>
  description: "<frase curta>"
spec:
  type: service
  lifecycle: production
  owner: <group já existente no catálogo>
  dependsOn:
    - resource:default/<recurso1>
    - resource:default/<recurso2>
```

`dependsOn` vem da saída da skill `backstage-recursos`. Se ela foi pulada
(fora da rede Clamed), deixar `dependsOn` como estava (ou omitir, se
arquivo novo) e registrar no resumo final que essa parte não pôde ser
verificada nesta rodada.

**Idempotência:** se `catalog-info.yaml` já existe, ler o atual e editar só
os campos necessários — preservar `dependsOn` e outras customizações
existentes que não conflitem com o que foi descoberto agora (mesclar, não
sobrescrever a lista inteira às cegas).

### mkdocs.yml (nome exato, não `mkdocs.yaml`)

```yaml
site_name: <nome>
site_description: <frase curta>

nav:
  - Início: index.md

plugins:
  - techdocs-core
```

Toda página nova adicionada em `docs/` precisa entrar em `nav` — página que
existe mas não está listada não aparece no menu do TechDocs.

### docs/index.md (pasta exata `docs`, não `doc`)

Ponto de entrada do TechDocs. Se `docs/` já existir com subpastas de
documentação do projeto (ex. `docs/arquitetura`, `docs/especificacao`),
**referenciar/linkar** essas pastas na página inicial em vez de duplicar
conteúdo.

## Erros comuns a evitar (já vistos na prática)

1. Faltar `gitlab.com/project-slug` ou `gitlab.com/instance` → Backstage
   recusa com erro de integração GitLab.
2. `owner` que não existe como Group no catálogo → erro de relação não
   encontrada.
3. Nome de arquivo/pasta errado: `mkdocs.yaml` (errado) em vez de
   `mkdocs.yml`, `doc/` em vez de `docs/`, ou faltar `docs/index.md`.
4. Página nova sem entrada em `nav`.
5. Commit direto em `main`, ou misturado com outras mudanças de trabalho
   em andamento do dev.

## Passo 4 — commit, push, informar MR

Commit separado (mensagem clara, ex. `chore: registra Component no Backstage`),
push da branch, e **informar a URL de MR** que o `git push` retorna. Não
abrir nem mergear o MR sozinha — decisão do usuário.

## Fronteiras

| Situação | Skill |
|----------|-------|
| Descobrir dependências de infra (dependsOn) | `backstage-recursos` |
| Convenção de branch/commit/MR deste workspace | `git` |
