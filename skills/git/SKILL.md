---
name: git
description: >-
  Padrões reais de uso do git neste workspace: dois hosts GitLab distintos
  (checar sempre o remote antes de assumir qual), convenção de branch
  feat/fix/chore + fluxo de Merge Request, estilo de mensagem de commit,
  padrão registrado de hotfix de emergência direto em main, e o
  procedimento completo para diagnosticar e reconciliar um histórico
  remoto corrompido por force-push (histórico não relacionado). Use
  quando o usuário pedir revisar histórico git, investigar force-push,
  reconciliar branches, entender convenção de commit/branch do projeto,
  ou "main quebrado"/"histórico sumiu". Não usar para mecânica de pipeline
  (skill gitlab-cicd) nem para revisão de código da mudança em si (skill
  review).
---

# Git neste workspace

## Hosts

Existem **dois** GitLab self-hosted em uso, não um só — sempre confirme
com `git remote get-url origin` antes de qualquer ação que dependa do host
(abrir MR, checar CI/CD variables, etc.):

| Host | Namespace visto | Repos exemplo |
|------|------------------|----------------|
| `git-repo.clamed.com.br` (SSH) | `supplychain-clamed` (com hífen) | api-orquestra-integracao-sybase-kafka, api-integracao-sybase-kafka, clamed.dev, agendador-tarefas |
| `10.0.4.67` (SSH ou HTTP, IP direto — mesmo host do Nexus de pacotes) | `supplychain` (sem hífen) | api_estoques, portal-supply-chain, xml-translog |

O segundo é o GitLab mais antigo; repos foram migrando para o primeiro,
mas nem todos migraram. Nunca assuma qual é "o" GitLab da empresa.

## Branches e commits

- Prefixo de branch: `feat/<nome>`, `fix/<nome>`, `chore/<nome>` — curto,
  kebab-case, descrevendo o que muda, não o ticket.
- Fluxo: push da branch → o próprio `git push` já retorna o link pronto
  pra abrir o Merge Request (`remote: To create a merge request for
  <branch>, visit: ...`) — não precisa `gh`/`glab` pra isso. Merge é
  "merge commit" simples (`Merge branch 'X' into 'main'`), não squash nem
  rebase.
- Mensagem de commit: prefixo `feat:`/`fix:`/`chore:`/`docs:` + corpo em
  português explicando o **porquê** (causa raiz, motivo da escolha),não só
  o que mudou — especialmente em `fix:`, o corpo costuma trazer a cadeia
  causal completa (sintoma → causa raiz → correção → verificação).

## Hotfix de emergência direto em main (padrão registrado, não escondido)

É aceito, em incidente de produção, commitar a correção **direto em
`main`** antes de passar por branch/MR/documentação formal — mas isso
precisa ser registrado explicitamente depois (nos documentos CORR-NNN do
projeto, seção "Nota sobre ordem do processo" ou equivalente), nunca
silenciado. Se encontrar um commit de fix direto em main sem branch
correspondente, não é necessariamente um erro de processo — confira se
existe o registro do porquê antes de assumir problema.

## Diagnosticando e reconciliando um `main` corrompido por force-push

Sintoma: `git fetch` traz um histórico completamente diferente do
esperado (poucos commits genéricos tipo "Initial commit"), ou colegas
relatam "sumiu tudo do repo".

**1. Confirmar e medir a divergência** (não assumir, medir):
```bash
git branch -vv                              # mostra "ahead N, behind M" de cada branch local vs seu remoto
git rev-list --left-right --count main...origin/main
git reflog show origin/main                 # procure "forced-update" — mostra o exato commit antes/depois do force-push
```
Um salto reflog de `<commit-bom>` direto pra `<commit-novo>` marcado
`forced-update` identifica quem, quando e a partir de qual estado (o
autor/data do commit novo geralmente aponta pra quem fez o force-push).

**2. Nunca restaurar com outro force-push por conta própria.** Local
`main` provavelmente ainda tem o histórico real intacto (force-push só
afeta o remoto) — assim como as branches de feature, que não são tocadas
por um `push -f` em `main`. Reconcilie com um merge de históricos não
relacionados, num branch dedicado, sem forçar nada:
```bash
git checkout -b chore/reconcile-main-origin main
git merge origin/main --allow-unrelated-histories --no-commit
```

**3. Resolver conflitos com dado, não com suposição.** Um merge de
históricos não relacionados frequentemente marca **todo arquivo em comum**
como conflito, mesmo quando o conteúdo é idêntico — isso costuma ser só
diferença de fim de linha (CRLF vs LF), não conteúdo real. Antes de
decidir `--ours`/`--theirs` por arquivo, meça a diferença real:
```bash
git diff --ignore-all-space "main:<arquivo>" "origin/main:<arquivo>"
```
Se vier vazio, é só CRLF — resolva a favor do lado que mantém o estilo de
fim de linha do projeto (normalmente LF). Se vier diferença real, o lado
"main" local (histórico contínuo, testado) quase sempre é o mais atual —
mas confira, não assuma; pode haver melhoria genuína do outro lado (ex.:
config de CI, certificado, ajuste de infra) que vale preservar caso a
caso.

**4. Depois de resolvido, o push é normal, sem force.** O commit de merge
tem o `origin/main` atual como um dos pais — dá pra enviar como uma branch
comum e abrir MR; não precisa (e não deve) sobrescrever o remoto.

## A estudar

- Commits assinados (GPG/SSH signing) — não em uso hoje.
- Git hooks (pre-commit/pre-push) para lint/teste automático antes do
  commit — não configurado nos repos observados.
- Submódulos e Git LFS — nenhum repo observado usa.
- Squash merge / rebase linear como política — hoje é merge commit puro.

