---
name: projeto-ai
description: >-
  Padrao obrigatorio da pasta .ai em projetos greenfield: context, rules,
  decisions, docs. Use quando criar repo, servico, app, CLI, MCP, RAG, Fiori/UI5
  ou sistema PB novo; ou quando outra skill de desenvolvimento indicar greenfield.
---

# Pasta `.ai` (contexto para agentes)

Responda em portugues. Esta skill define o **padrao unico** de contexto de IA por projeto — vale para **todas** as stacks (Node, Go, Python, SAP, PB, MCP, RAG, scripts, etc.).

## Quando e obrigatorio

Criar ou completar `.ai/` **antes do primeiro codigo de produto** quando:

| Situacao | Onde fica `.ai/` |
|----------|------------------|
| Novo repositorio / monorepo / servico | raiz do repo |
| Novo app dentro de monorepo | raiz do app (`apps/api/.ai`, `packages/foo/.ai`) |
| Novo MCP server / CLI / job autonomo | raiz do pacote |
| Novo app Fiori / componente UI5 (repo proprio) | raiz do projeto UI5 |
| Novo sistema PB (workspace/PBL nova) | raiz do sistema (`C:\Sistemas_PB12\<Sistema>\.ai` ou repo de docs do sistema) |
| Repo legado **sem** `.ai` e feat greenfield grande | criar na raiz na fase 1 (spec) — nao esperar o dev |

**Nao** e obrigatorio em patch pontual, hotfix ou feat pequena em repo que **ja** tem `.ai/` — apenas **manter** e atualizar o que mudou.

## Estrutura obrigatoria

```text
.ai/
  README.md                 # indice da pasta .ai (proposito + mapa)
  context/
    README.md
    projeto.md              # o que e, para quem, dominio, limites
    stack.md                # tecnologias, versoes, constraints de runtime
  rules/
    README.md
    desenvolvimento.md      # regras locais para agentes (convencoes do repo)
  decisions/
    README.md
    ADR-001-<slug>.md       # decisoes arquiteturais (ver template)
  docs/
    README.md
    indice.md               # mapa para docs humanos + SPEC/ARCH/CORR
```

Subpastas `context/`, `rules/`, `decisions/`, `docs/` sao **obrigatorias**. Arquivos minimos acima tambem.

Templates prontos: [templates/](templates/) — copiar e preencher; nao reinventar estrutura.

## Conteudo de cada pasta

### `context/` — o que o agente precisa saber

- **projeto.md:** problema, usuarios, escopo, integracoes, o que o sistema **nao** faz.
- **stack.md:** linguagem, runtime, DB, Compose, pacotes-chave, paths importantes, WSL vs Windows.
- Atualizar quando mudar stack, dominio ou fronteira do sistema.

### `rules/` — regras locais (complementam `~/.claude/rules/`)

- **desenvolvimento.md:** convencoes do repo (naming, pastas, branch, testes, logs, migrations). Em API/servico **TS/Python**: apontar para skill `clean-architecture` e documentar desvios locais.
- Regras curtas e acionaveis — nao duplicar skills globais inteiras.
- Equivalente a “`.cursor/rules` do projeto”, versionado no git.

### `decisions/` — ADRs (Architecture Decision Records)

- Uma decisao relevante por arquivo `ADR-NNN-<slug>.md`.
- Fase **arquitetura** (Pro): extrair do `ARCH-NNN.md` as decisoes fechadas para `.ai/decisions/`.
- Incluir: contexto, decisao, alternativas descartadas, consequencias.

### `docs/` — indice e ponte para documentacao humana

- **indice.md:** links para `docs/especificacoes/`, `docs/arquitetura/`, README, runbooks.
- Nao substituir `docs/` do projeto — e o **mapa para agentes** achar SPEC/ARCH/CORR/README.

## Quem faz o que (fluxo Pro)

| Fase | Acao em `.ai/` |
|------|----------------|
| 1 Especificacao (greenfield) | Criar estrutura + preencher `context/projeto.md` (rascunho) e `context/stack.md` (premissas) |
| 2 Arquitetura | `decisions/ADR-*.md` a partir do design; atualizar `context/stack.md` se necessario |
| 3 Desenvolvimento | `rules/desenvolvimento.md` com convencoes adotadas no codigo |
| 7 Documentacao | `docs/indice.md` alinhado ao README e paths reais; `.ai/README.md` atualizado |

Fluxo **Simples** (sem fases): ao criar projeto novo, executar **toda** a estrutura minima antes de codar; preencher o essencial em `context/` e `rules/`.

## Checklist (gate)

- [ ] `.ai/` na raiz correta do projeto/app
- [ ] Quatro subpastas existem: `context`, `rules`, `decisions`, `docs`
- [ ] `README.md` em cada nivel (raiz + subpastas)
- [ ] `context/projeto.md` e `context/stack.md` preenchidos (nao vazios)
- [ ] `rules/desenvolvimento.md` com pelo menos convencoes de branch e estrutura de pastas
- [ ] `decisions/` com ADR-001 se houve arquitetura; ou `README.md` explicando “sem ADRs ainda”
- [ ] `docs/indice.md` aponta para SPEC/ARCH ou README
- [ ] `.ai/` versionado no git (nao em `.gitignore`)

## Integracao com outras skills

Toda skill que **cria projeto novo** deve incluir no checklist:

> Greenfield → ler e aplicar `projeto-ai` (`~/.claude/skills/projeto-ai/SKILL.md`).

Skills cobertas: `backend`, `frontend`, `script`, `clean-architecture`, `mcp`, `rag`, `abap`, `fiori`, `ui5`, `pb-criar-objeto`, orquestradores `dev-all-in-one`, agents Pro/Simples.

## Nao fazer

- Colocar secrets ou credenciais em `.ai/`
- Usar `.ai/` como dump de chat — conteudo autocontido (mesmo criterio da spec)
- Ignorar `.ai/` em greenfield “porque e MVP”
- Duplicar SPEC inteira em `context/` — resumir e linkar via `docs/indice.md`

