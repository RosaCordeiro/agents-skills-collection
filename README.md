# cursor-kit

Kit pessoal de **agents**, **skills** e **rules** do Cursor — para usar em qualquer PC.

> Inclui só o que é seu. **Não** versiona `skills-cursor/` (skills nativas do Cursor).

## Conteúdo

```
cursor-kit/
├── agents/          # Subagents (~/.cursor/agents/)
├── skills/          # Skills pessoais (~/.cursor/skills/)
├── rules/           # Rules always-on (~/.cursor/rules/)
├── scripts/
│   ├── install.sh   # Linux / WSL / macOS
│   └── install.ps1  # Windows (PowerShell)
└── README.md        # este manual
```

### Agents (subagents)

| Arquivo | Nome para o dev | Papel |
|---------|-----------------|--------|
| `desenvolvimento.md` | **Portal de Desenvolvimento** | Pergunta: Entrega guiada vs Direto ao ponto |
| `orquestrador-entrega-guiada.md` | **Orquestrador de Entrega** | 10 fases — mapa em `entrega-guiada/fases.md` |
| `ajuste.md` | **Desenvolvimento Direto** | Sem fases |
| `arquitetura-pro.md` | Desenho (subagent) | Fase 3 |
| `review-pro.md` | Revisão código (subagent) | Fase 5 |
| `review-testes-pro.md` | Revisão testes (subagent) | Fase 8 — abrangência, execução real, anti-adaptação ao bug |
| `auditor.md` | Auditor 100% (não programa): revalida o sistema, roda a suíte, Validação 1..N, notas 0–10 |
| `pbg.md` | PowerBuilder 12: altera via MCP (`composer-2.5-fast`); patch importa e compila |
| `pb-sybase.md` | Consulta PB + Sybase + sybase-objects; spec pequena de chamado (MD → mock → DOCX), sem fases; **não implementa** |
| `orquestrador-pb-entrega-guiada.md` | Orquestrador de Entrega PB (8 fases) — sincronismo, descoberta, especificação, arquitetura (fragmentação), system design por fragmento, revisão, testes sugeridos, encerramento; **não implementa** |

### Skills

`entrega-guiada`, `descoberta` (Fase 1: perguntas até fechar o entendimento do pedido, antes de qualquer spec), `review-testes` (RT1–RT12 + `REVIEW-TESTES-*`), `monitor-uso-ia` (script + alertas de custo), `especificacao` (documento autocontido: a spec não depende do chat), `projeto-ai` (pasta `.ai` obrigatória em greenfield: context, rules, decisions, docs), `clean-architecture` (Clean + hexagonal — ref. `api-integracao-syb-kafka`; TS/Python), `arquitetura`, `correcao-erro`, `frontend`, `backend`, `script`, `review` (CR1–CR16 + `REVIEW-*-resultado`), `teste-regra-negocio`, `teste-automatizado`, `documentacao`, `abap`, `fiori`, `ui5` (incl. `crud-lista.md`), `mcp`, `rag`, `modelagem-dados`, `logger` (`@clamed/logger`: keywords, `event`, `correlation_id`), `auditor` (AUD-NNN + notas 0–10), `pb-ajuste` (PowerBuilder 12: patch → import PBL → compile; path obrigatório), `pb-sybase` (consulta PB + Sybase + spec MD/mock/DOCX, sem fases, não implementa), `pb-entrega-guiada` (8 fases PB: sincronismo, descoberta, especificação, arquitetura/fragmentação, system design por fragmento, revisão, testes sugeridos, encerramento — não implementa), `liberar-espaco` (C: + WSL Ubuntu + Docker: medir, limpar, compactar ou recriar VHDX), `softdesk` (abrir chamado no MCP: HTML, IDs de produção, crítico + PBG/Sybase)

No Pro: mapa de models em `entrega-guiada/modelos.md` — orquestrador Sonnet; arquitetura Sonnet (Opus só se pedir; **uma vez** por entrega); reviews Grok→Sonnet (readonly). Pro/Simples **não** são lançados via Task — rodam no chat.

### Rules

| Arquivo | Papel |
|---------|--------|
| `modelo-sonnet.mdc` | Slugs por fase/agent + fallbacks; Opus só com pedido explícito |
| `custo-subagent.mdc` | Não aninhar Pro/Simples via Task; ARCH uma vez por entrega |
| `escolha-agent-desenvolvimento.mdc` | Sempre perguntar Pro vs Simples no início de um desenvolvimento (não dispara no agent `auditor`) |
| `execucao-wsl.mdc` | Como rodar comandos no WSL sem travar o chat |
| `crud-lista-ui5-fiori.mdc` | Padrao de telas CRUD lista (UI5/Fiori); overflow ⋮ se > 3 ações |
| `sem-mudanca-tecnologia.mdc` | Proíbe trocar stack/runtime sem autorização explícita |
| `projeto-ai.mdc` | Greenfield: pasta `.ai` obrigatória (context, rules, decisions, docs) |

---

## Padrão de nomes (v0.2.0 dos plugins)

Canal oficial: os plugins `clamed-dev` e `clamed-pb`, montados por `scripts/build-plugin.ps1`. A cópia solta em `~/.claude` é legado.

1. O nome diz a **intenção**, em português: sem inglês e sem sufixo de tamanho (`-pro`, `-simples`).
2. O **prefixo é a stack** (`clamed-dev:` ou `clamed-pb:`); o nome não repete `pb-`. Na fonte, a pasta do PB mantém `pb-` para ser única, e o mapa `rename` do manifesto troca no plugin (`pb-ajuste` vira `clamed-pb:ajuste`).
3. O mesmo nome nos dois plugins é a mesma intenção.
4. O nome da **ferramenta** (`pbg`) fica só no MCP e na CLI (`pbg-cli`, `pbg_*`, `user-pbg`); a skill de quem digita descreve o que faz.
5. Um dono por skill: `analista`, `descoberta` e `agil` ficam só no `clamed-dev`.

| Você quer… | clamed-dev | clamed-pb |
|---|---|---|
| Porta de entrada ("o que quer fazer?") | `construir` | (usa a do clamed-dev) |
| Entender ou investigar, sem construir | `analista` | (usa a do clamed-dev) |
| Construir, aprovando cada fase | `entrega-guiada` (10 fases) | `entrega-guiada` (8 fases, só especifica) |
| Construir, aprovando uma vez só | `entrega-autonoma` (+ agent `implementador`) | (usa a do clamed-dev; implementa PB com `ajuste` e `pb-criar-objeto`) |
| Mudança pontual já definida | `ajuste` | `ajuste` (objeto PB, com `svn lock`) |

Pendente (2ª fase): os subagents (`arquitetura-pro`, `review-pro`, `review-testes-pro`) e as skills de PB que já começam com `pb-` (`pb-sybase`, `pb-criar-objeto`, `pb-mentor`, `pb-padroes-clamed`).

## Manual: usar em outro PC

### 1. Pré-requisitos

- [Cursor](https://cursor.com) instalado e logado na sua conta
- Git instalado
- (opcional) [GitHub CLI](https://cli.github.com/) (`gh`)

### 2. Clonar o repositório

```bash
git clone https://github.com/<SEU_USER>/cursor-kit.git
cd cursor-kit
```

Troque `<SEU_USER>` pelo seu usuário do GitHub.

### 3. Instalar no Cursor

O Cursor lê a pasta do **usuário do sistema onde o app roda**:

| Onde o Cursor está | Pasta alvo |
|--------------------|------------|
| Windows | `%USERPROFILE%\.cursor\` |
| macOS / Linux | `~/.cursor/` |
| Windows + você instala via WSL | o script aponta para o `.cursor` do Windows |

**Windows (PowerShell):**

```powershell
cd caminho\para\cursor-kit
powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1
```

**Linux / macOS / WSL:**

```bash
cd caminho/para/cursor-kit
bash scripts/install.sh
```

Opções:

- `--force` / `-Force` — espelha o kit e remove arquivos locais que não existem mais no repo
- `CURSOR_HOME=/caminho/custom` — sobrescreve o destino (só no `.sh`)

### 4. Ativar no Cursor

1. Feche chats antigos (ou reinicie o Cursor).
2. Abra um **chat novo**.
3. Confirme mentalmente: ao pedir um desenvolvimento, o agent deve oferecer **Pro** / **Simples**.

Não precisa mexer em Settings para agents/skills/rules pessoais — bastam os arquivos nas pastas certas.

### 5. Atualizar depois

No PC que você edita o kit:

```bash
cd cursor-kit
# altere agents/skills/rules
git add -A
git commit -m "atualiza skill X"
git push
```

Em outro PC:

```bash
cd cursor-kit
git pull
bash scripts/install.sh          # ou install.ps1 no Windows
```

Abra um chat novo no Cursor.

### 6. Fluxo do dia a dia (lembrete)

1. Você pede um desenvolvimento.
2. O agent pergunta: **Pro** ou **Simples**.
3. **Pro** / **Entrega guiada** → orquestra as 10 fases (`entrega-guiada/fases.md`).
4. **Simples** / **Direto ao ponto** → implementa sem fases.
5. Após grande alteração, peça o **auditor** (não é Pro/Simples): ele só valida e dá nota.

---

## O que NÃO vai neste repo

| Item | Por quê |
|------|---------|
| `~/.cursor/skills-cursor/` | Skills oficiais do Cursor (sincronizam sozinhas) |
| `~/.cursor/extensions/`, `projects/`, `ai-tracking/` | Estado local da IDE |
| `mcp.json` / secrets | Credenciais — mantenha fora do Git |
| Hooks, se existirem | Adicione depois em `hooks/` se quiser versionar |

---

## Publicar / republicar no GitHub

Se o remote ainda não existir:

```bash
cd cursor-kit
git init
git add -A
git commit -m "chore: kit inicial de agents, skills e rules"
gh repo create cursor-kit --private --source=. --remote=origin --push
```

Sem `gh`:

1. Crie um repo vazio **privado** em https://github.com/new (nome sugerido: `cursor-kit`).
2. Depois:

```bash
git remote add origin https://github.com/<SEU_USER>/cursor-kit.git
git branch -M main
git push -u origin main
```

---

## Troubleshooting

**Skills/agents “não aparecem”**  
Confirme que os arquivos estão em `%USERPROFILE%\.cursor\` (Windows) ou `~/.cursor/` (Linux/macOS), não só dentro do clone. Rode o install de novo e abra um chat novo.

**Instalei pelo WSL e o Cursor Windows não viu**  
O script detecta WSL e grava no `.cursor` do Windows. Se falhar, force:

```bash
CURSOR_HOME="/mnt/c/Users/<SeuUsuarioWindows>/.cursor" bash scripts/install.sh
```

**Conflito com arquivo local**  
Sem `--force`, o install sobrescreve arquivos com o mesmo nome e mantém extras locais. Com `--force`, o destino fica igual ao kit.

**Rule `execucao-wsl` em Mac/Linux puro**  
É inofensiva: só orienta quando o ambiente for Windows+WSL.
