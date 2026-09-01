---
name: criar-skill-agent
description: >-
  Cria uma nova skill e/ou um novo agent para este repositorio (Cursor + Claude
  Code), no formato e no local corretos: fonte versionada em
  agents-skills-collection-import, sincronizada via sync-agents-skills.ps1 para
  ~/.claude do usuario que rodar o script (pessoal, global, vale em qualquer
  pasta). Use quando o usuario pedir criar skill, criar agent, nova skill, novo
  agent, adicionar agent, adicionar skill, ou /criar-skill-agent.
---

# Criar Skill / Agent

Cria agents e skills deste repositorio no lugar certo — sempre pela fonte
versionada, nunca direto em `~/.claude`. Nao depende de usuario, maquina ou
caminho fixo: qualquer pessoa que clonar o repo e rodar o script sincroniza
para o **proprio** `~/.claude`.

## Onde vive cada coisa (nao confundir)

| Camada | Caminho | Escopo |
|--------|---------|--------|
| Fonte versionada (edita aqui) | `agents-skills-collection-import\{agents,skills}\` | git, compartilhavel |
| **Ativo, global, pessoal** | `~/.claude/{agents,skills}/` (pasta do usuario logado) | usado em QUALQUER pasta daquele usuario — e o que o Claude Code realmente le |
| Projeto (pasta onde o repo foi clonado) | so `.claude/settings.local.json`, se existir | permissoes daquele projeto — nao e agent/skill |

Nunca criar ou editar direto em `~/.claude`: a proxima rodada do sync
sobrescreve com o que estiver em `agents-skills-collection-import`.

## Passo a passo

1. Perguntar: **skill**, **agent**, ou os dois? Nome (kebab-case, curto, sem
   acento/espaco)? Descricao/gatilho (quando deve disparar)?
2. Conferir duplicidade antes de escrever:
   `Get-ChildItem agents-skills-collection-import\agents` e
   `...\skills` — nao sobrescrever nome existente sem avisar.
3. Criar o(s) arquivo(s) seguindo os templates abaixo. Nao usar nenhum caminho
   fixo de usuario/maquina no conteudo (nada de `C:\Users\<alguem>\...` cravado).
4. Rodar, a partir da raiz deste repositorio (onde fica `sync-agents-skills.ps1`;
   sem commit primeiro, so pra ver o que muda):
   ```powershell
   .\sync-agents-skills.ps1
   ```
   O script resolve sozinho a pasta pessoal (`$env:USERPROFILE\.claude`) de quem
   o executa — funciona igual para qualquer usuario/maquina que clonar o repo.
5. Perguntar ao usuario se pode commitar. Se sim:
   ```powershell
   .\sync-agents-skills.ps1 -Commit
   ```
6. Nao precisa reiniciar o Claude Code — mudancas em skills/agents recarregam
   na sessao atual assim que os arquivos existem em `~/.claude`.

## Template — Skill

`agents-skills-collection-import\skills\<nome>\SKILL.md`:

```markdown
---
name: <nome>
description: >-
  <o que a skill faz + quando usar. Gatilhos em portugues: "Use quando o
  usuario pedir X, Y, ou /<nome>". Cite skills vizinhas para evitar
  sobreposicao (ex: "nao usar para Z — skill outra-skill").>
---

# <Titulo>

<corpo: instrucoes, regras, checklist. Responda em portugues (padrao do
workspace). Se pisar em outra skill, ter uma secao "Fronteiras" com tabela.>
```

## Template — Agent

`agents-skills-collection-import\agents\<nome>.md`:

```markdown
---
name: <nome>
description: >-
  <quando usar este agent, em portugues, citando "/<nome>" e sinonimos. Se so
  roda neste chat (nao via Task), dizer "Neste chat; nao Task".>
model: <ex: claude-sonnet-5 | composer-2.5-fast | omitir para herdar o padrao>
---

Voce e o **<Nome do Agent>** — <uma linha de identidade/objetivo>.

<regras, custo/limites de chamadas de tool, escopo, o que "nao fazer">
```

## Boas praticas (seguidas pelos 28 existentes)

- `description` sempre em bloco YAML folded (`>-`), citando `/<nome>` e
  sinonimos — e o que o Claude usa pra decidir quando disparar a skill/agent.
- Corpo curto e direto, respostas em portugues, WSL/Linux quando aplicavel a
  desenvolvimento.
- Fronteiras explicitas: se a skill/agent se sobrepoe a outra existente, citar
  "nao usar para X (skill Y)" no proprio texto.
- Modelo caro (`claude-opus-5` / thinking-high) so quando o usuario pedir
  explicitamente; default e barato/medio (`claude-sonnet-5`, `composer-2.5-fast`).

## Nao fazer

- Nao criar ou editar direto em `~/.claude` (perde git/historico; proximo sync
  sobrescreve).
- Nao commitar sem perguntar antes.
- Nao duplicar nome de agent/skill ja existente sem avisar o usuario.



