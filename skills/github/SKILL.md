---
name: github
description: >-
  Uso real (hoje mínimo) de GitHub neste workspace — repositórios
  pessoais de ferramentas/skills, push direto via HTTPS, sem PR nem
  GitHub Actions em uso. Use quando o usuário pedir mexer num repo
  hospedado no GitHub (não confundir com o GitLab self-hosted da
  empresa — skill gitlab-cicd), ou avaliar adotar PR/Actions/gh CLI. A
  maior parte do conteúdo típico de uma skill de GitHub fica marcada como
  "a estudar" porque ainda não é usada aqui — não inventar fluxo que não
  existe.
---

# GitHub neste workspace

## O que existe de fato

GitHub é usado hoje só para repositórios **pessoais** de ferramentas e
skills (ex.: a coleção de agents/skills deste próprio workspace), não
para os projetos de aplicação da empresa — esses ficam nos GitLab
self-hosted (skill `gitlab-cicd`). Antes de agir, confirme sempre com
`git remote get-url origin` se o repo é mesmo GitHub (`github.com`) e não
um dos GitLab internos — os nomes de projeto podem parecer intercambiáveis
mas o fluxo de publicação é diferente.

Fluxo observado:
- Remoto em HTTPS (`https://github.com/<usuario>/<repo>.git`), não SSH.
- Push direto na branch `main`, sem Pull Request — mudança é commitada e
  enviada num só passo, sem revisão de terceiros.
- Sem GitHub Actions configurado nesses repos — nenhum `.github/workflows/`
  encontrado no workspace.

## Antes de publicar

Mesmo sem PR, siga a mesma disciplina de qualquer publish num repo
compartilhável: confirmar remoto e branch, mostrar ao usuário o que vai
subir, e só then commitar/dar push — nunca assumir que "publicar" já foi
autorizado de forma genérica para sempre.

## A estudar

Praticamente todo o repertório padrão de GitHub ainda não foi adotado
aqui — vale considerar caso o uso cresça além de repositórios pessoais:

- Pull Requests como fluxo padrão de revisão (hoje é push direto em main).
- GitHub Actions para CI/CD (hoje todo CI real da empresa é GitLab CI).
- `gh` CLI para abrir/gerenciar issues, PRs, releases — não usado ainda
  neste workspace (os `gh api`/`gh pr` do fluxo geral do Claude Code se
  aplicam ao repo em foco no momento, mas não há hábito estabelecido de
  usar GitHub para colaboração além de hospedagem pessoal).
- Branch protection rules, required reviews, status checks obrigatórios.
- GitHub Packages / Container Registry como alternativa ao Nexus/registry
  interno da empresa.
- Secrets do GitHub Actions, se algum dia um workflow for adotado.

