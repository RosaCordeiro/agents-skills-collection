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
4. Ativar localmente — a partir da raiz deste repositorio (onde fica
   `sync-agents-skills.ps1`), so na direcao fonte -> pessoal (evita ida-e-volta
   desnecessaria que suja o `git status` com ruido de encoding):
   ```powershell
   .\sync-agents-skills.ps1 -Direction cursor-to-claude
   ```
   O script resolve sozinho a pasta pessoal (`$env:USERPROFILE\.claude`) de quem
   o executa — funciona igual para qualquer usuario/maquina que clonar o repo.
   Nao precisa reiniciar o Claude Code: skills/agents recarregam na sessao
   atual assim que o arquivo existe em `~/.claude`.
5. **Fase Publicar (git) — so se o usuario pedir para subir/commitar:**
   1. Identificar o repositorio antes de qualquer coisa (cada pessoa pode ter
      o proprio fork/repo — nao assumir qual e):
      ```powershell
      git -C agents-skills-collection-import remote get-url origin
      git -C agents-skills-collection-import branch --show-current
      ```
      Mostrar o resultado ao usuario ("vou publicar em `<url>`, branch
      `<branch>` — confirma?") antes de seguir.
   2. Commitar **so os arquivos criados/alterados nesta tarefa** (nunca `-A` —
      o sync reescreve todo mundo e cria ruido de encoding em arquivos que nao
      mudaram de verdade):
      ```powershell
      .\sync-agents-skills.ps1 -Commit -Paths @('agents/<nome>.md','skills/<nome>/') -Message "feat: adiciona skill/agent <nome>"
      ```
   3. Perguntar explicitamente se pode dar `git push` (acao que afeta o repo
      remoto/compartilhado — nunca assumir "sim"). Se confirmado:
      ```powershell
      .\sync-agents-skills.ps1 -Push
      ```
      (ou, com o commit no mesmo passo: `-Commit -Push` junto com `-Paths`).

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

## Boas praticas

- `description` sempre em bloco YAML folded (`>-`), citando `/<nome>` e
  sinonimos — e o que o Claude usa pra decidir quando disparar a skill/agent.
- Corpo curto e direto, respostas em portugues, WSL/Linux quando aplicavel a
  desenvolvimento.
- Fronteiras explicitas: se a skill/agent se sobrepoe a outra existente, citar
  "nao usar para X (skill Y)" no proprio texto.
- Modelo caro (`claude-opus-5` / thinking-high) so quando o usuario pedir
  explicitamente; default e barato/medio (`claude-sonnet-5`, `composer-2.5-fast`).

## Nao fazer

- **Nunca escrever conteudo preso ao contexto da conversa que gerou a
  skill/agent.** Nada de contagens ("os N existentes", "as X skills atuais"),
  referencias temporais ("agora", "recem-criado", "nesta sessao") ou qualquer
  fato que so faz sentido pra quem estava no chat naquele momento. Esses
  numeros ficam desatualizados na primeira mudanca e viram ruido sem
  significado pra qualquer leitor (inclusive uma sessao futura do Claude) que
  nao tenha esse historico. O conteudo tem que valer sozinho, como se tivesse
  sido escrito do zero sem conversa nenhuma por tras.
- Nao criar ou editar direto em `~/.claude` (perde git/historico; proximo sync
  sobrescreve).
- Nao commitar sem perguntar antes.
- Nao duplicar nome de agent/skill ja existente sem avisar o usuario.







