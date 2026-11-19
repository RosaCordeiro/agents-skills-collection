---
name: entrega-guiada
description: >-
  Orquestrador de Entrega (10 fases): descoberta, especificacao, desenho,
  codigo, revisao, aceite, testes, revisao de testes, docs, encerramento.
  Use quando o usuario quiser aprovar fase a fase, escolher entrega guiada ou
  pedir as 10 fases.
---

# Orquestrador de Entrega (10 fases)

Conduz o desenvolvimento até o **Encerramento** (DoD), com aprovação em cada etapa.

**Mapa visual:** [fases.md](fases.md)

Responda em português. Prefira WSL/Linux e Docker.

## As 10 fases (ordem obrigatória)

| # | Nome | Skill / agent | Artefato principal |
|---|------|---------------|-------------------|
| 1 | **Descoberta** | `descoberta` | Resumo da Descoberta aprovado |
| 2 | **Especificação funcional** | `especificacao` / `correcao-erro` | SPEC/CORR + branch |
| 3 | **Desenho** | Task `arquitetura-pro` | ARCH + ADR |
| 4 | **Código** | `frontend` / `backend` / … | código |
| 5 | **Revisão** | Task `review-pro` | REVIEW-* |
| 6 | **Aceite de negócio** | `teste-regra-negocio` | VAL/V |
| 7 | **Testes automáticos** | `teste-automatizado` | suite (com evidência) |
| 8 | **Revisão de testes** | Task `review-testes-pro` | REVIEW-TESTES-* |
| 9 | **Documentação** | `documentacao` | README + docs F2/F4/F5 |
| 10 | **Encerramento** | DoD | entrega fechada |

Anuncie: **"Fase N — Nome"** + entrega + aprovação esperada. Cada fase pode
gerar correção antes de avançar — a aprovação da fase anterior não impede
voltar e ajustar se surgir algo novo (ver loops por fase abaixo).

## Modelos por fase

Referência: [modelos.md](modelos.md)

| Fase | Executor | Primário | Fallback |
|------|----------|----------|----------|
| 1 Descoberta | orquestrador | `claude-sonnet-5-thinking-high` | `claude-sonnet-5` → Grok medium |
| 2, 4, 6, 7, 9, 10 | orquestrador | `claude-sonnet-5` | `cursor-grok-4.6-medium` → `composer-2.5-fast` |
| 3 Desenho | Task `arquitetura-pro` | `claude-sonnet-5-thinking-high` | Sonnet → Composer |
| 5 Revisão código | Task `review-pro` | `cursor-grok-4.6-medium` | `claude-sonnet-5` |
| 8 Revisão testes | Task `review-testes-pro` | `cursor-grok-4.6-medium` | `claude-sonnet-5` |

Fase 1 (Descoberta) usa **thinking-high** por pedido explícito do time — para investigar melhor o pedido e chegar a soluções melhores antes de redigir a spec. Isso é exceção fixa (não precisa reconfirmar por entrega); as demais fases do orquestrador seguem em Sonnet padrão.

Fases 3, 5 e 8 **via Task** com `model:` do primário. `review-pro` e `review-testes-pro` são **readonly**; `arquitetura-pro` só grava o ARCH e os ADRs, nunca código.

Agents: `arquitetura-pro`, `review-pro`, `review-testes-pro`.

**Nunca** Task dos orquestradores (`orquestrador-entrega-guiada`, etc.).

<!-- claude-model -->
### Claude Code

No Claude Code vale o campo `claude-model` (o sync grava em `model:` no `~/.claude`). As tabelas acima valem para o Cursor.

| Fase | Skill / Task | Claude Code | Fallback |
|------|--------------|-------------|----------|
| Início | orquestrador (sessão) | `opus` | `sonnet` |
| 1 Descoberta | skill `descoberta` | `opus` | `sonnet` |
| 2 Especificação | skill `especificacao` / `correcao-erro` | `opus` | `sonnet` |
| 3 Desenho | Task `arquitetura-pro` | `fable` | `opus` → `sonnet` |
| 4 Código | skills `backend` / `frontend` / `abap` / `fiori` / `ui5` / `java` / `springboot` / `script` | `sonnet` | — |
| 5 Revisão | Task `review-pro` | `opus` | `sonnet` |
| 6 Aceite de negócio | skill `teste-regra-negocio` | `opus` | `sonnet` |
| 7 Testes automáticos | skill `teste-automatizado` | `sonnet` | — |
| 8 Revisão de testes | Task `review-testes-pro` | `opus` | `sonnet` |
| 9 Documentação | skill `documentacao` | `sonnet` | — |
| 10 Encerramento | orquestrador | `sonnet` | — |

**Como o modelo troca no Claude Code**

- O orquestrador roda neste chat: vale o modelo da sessão. Começar em `opus`, salvo no modo mãe e filhas (abaixo), em que vale o modelo que o usuário escolheu.
- Fase com skill: a skill tem `model:` no frontmatter; ao invocá-la, o turno roda nesse modelo.
- Fase via Task: o subagent já tem `model:` no frontmatter; para `general-purpose`, passar `model` no Task.
- Fallback: se o modelo falhar ou não estiver disponível, relançar com o próximo da cadeia e anotar o modelo efetivo no artefato.
- As regras "nunca Opus" / "Opus só com pedido explícito" deste documento valem só no **Cursor**.

**Ferramentas no Claude Code**

- `AskQuestion` deste documento = ferramenta `AskUserQuestion`.
- Ao gravar ou atualizar SPEC/CORR, ARCH, REVIEW ou outro artefato da entrega, enviar o arquivo ao usuário (`SendUserFile`) em vez de só citar o caminho.

**Sessão mãe e sessões filhas (app desktop)**

Caminho padrão quando existe a ferramenta `start_session` (app desktop). O usuário pediu, por esta skill, que as fases rodem em sessões próprias: o diálogo de cada fase fica num contexto pequeno e a sessão mãe não cresce. Sem a ferramenta (terminal, Cursor) ou se ela recusar, seguir o fluxo normal com Task.

- **Mãe = este chat, orquestra.** Fica no modelo que o usuário escolheu para a sessão: não trocar nem sugerir troca. Conduz as fases 1, 2 e 10, abre a filha de cada fase, repassa a ela o que ela precisa e acompanha pelo aviso de retorno. Não lê código em volume nem implementa; investigação pesada das fases 1 e 2 vai por Task que devolve conclusão curta com arquivo e linha.
- **Estado em arquivo.** `ESTADO-<n>.md` na pasta da SPEC: fase atual, decisões (uma linha cada, com data), pendências, branch e repositórios. A mãe cria na Fase 2 e atualiza a cada decisão e a cada retorno de filha.
- **Filhas por fase.** Desenho (3) · Código (4, uma por repositório) · Revisão (5) · Testes (6, 7 e 8) · Documentação (9). Cada filha usa o modelo da fase na tabela acima (`model` do `start_session`) e lança ela mesma o agent da fase (`arquitetura-pro`, `review-pro`, `review-testes-pro`).
- **Briefing da filha** (contexto novo, ela não vê este chat): fase e objetivo; caminhos do `ESTADO-<n>.md`, da SPEC e do ARCH; decisões da mãe que afetam a fase; repositório, branch e arquivos que pode tocar; o que gravar. A filha conversa com o usuário sobre a fase, faz a pergunta de aprovação dela, grava o resultado no `ESTADO-<n>.md` e termina com um aviso curto (feito, pendências, aprovado ou não).
- **Rodadas.** Correção de achados ou ajustes pedidos depois: filha nova de Código para a rodada, com a lista dos ajustes no briefing. Filha encerrada não é reaproveitada para outra fase nem para outra rodada.
- **Concorrência.** Duas filhas nunca escrevem no mesmo repositório ao mesmo tempo. Repositórios diferentes (API e portal) podem rodar em paralelo.
- **Avanço.** A mãe só abre a próxima fase com a anterior aprovada no `ESTADO-<n>.md`. Nunca dar por feito sem conferir o que a filha gravou.

**Regras de custo no Claude Code**

Cada chamada relê o contexto inteiro, então sessão ou Task longa custa mais a cada passo (medição de 15/11/2026: 65% do gasto do dia foi releitura de contexto).

- **Uma entrega por sessão.** Fechou a Fase 10 ou o usuário trouxe outra entrega: gravar o ponto em disco e pedir sessão nova. Não emendar a próxima entrega neste chat.
- **Sessão longa.** Nas trocas 3→4 e 5→6, e quando o usuário avisar que vai parar, checar o tamanho da sessão (ferramenta `get_usage` do app desktop, se houver; senão, já houve compactação ou muitas rodadas de correção). Acima de ~200k tokens, sugerir em uma linha `/compact` ou sessão nova — a Retomada acha a fase pelos artefatos.
- **Código em `sonnet`, por fragmento.** Ao delegar a Fase 4 por Task `general-purpose`, passar `model: sonnet` (nunca `opus` nem `fable` para escrever código) e cortar o trabalho: um repositório e uma fatia do ARCH por Task. No prompt: caminhos da SPEC e do ARCH, arquivos a tocar e resumo curto na volta (arquivos alterados, pendências). Na medição, a Task com o dobro do trabalho custou mais de três vezes.
- **Correções em lote.** Juntar os achados do review ou os ajustes pedidos numa rodada só: neste chat se forem poucos arquivos, ou uma Task `sonnet` por repositório. Nunca uma Task por ajuste — cada Task já começa com ~68k tokens fixos e relê o repositório.
- **Re-review só do diff.** `review-pro` e `review-testes-pro` leem a entrega inteira uma vez. Na re-revisão, o prompt limita o escopo aos achados corrigidos e ao diff desde o último review. Correção trivial de achado não bloqueante: o orquestrador confere neste chat e registra no REVIEW, sem re-Task.

## Retomada

Antes da Fase 1, olhar a branch e `docs/` do repo. Se já houver artefatos
desta entrega (SPEC/CORR, ARCH, REVIEW-*, REVIEW-TESTES-*), dizer em que
fase a entrega parou e perguntar se retoma dali ou recomeça. Retomar não
pula a aprovação da fase em que parou.

---

### Fase 1 — Descoberta

Skill `descoberta`: perguntas objetivas até fechar o entendimento do pedido
(objetivo, atores, gatilho, escopo, restrições). **Sem** branch, **sem**
documento de spec ainda — só o Resumo da Descoberta aprovado pelo usuário.

AskQuestion: `Este é exatamente o entendimento do que você quer?`

### Fase 2 — Especificação funcional

`especificacao` / `correcao-erro`, a partir do Resumo da Descoberta aprovado;
branch; greenfield → `.ai/context/`. A especificação é escrita em linguagem
que o usuário entenda e inclui os **pontos de investigação técnica** que o
analista precisa checar no código/banco antes do desenho (§14 do
`modelo-feat.md`).

AskQuestion: `Especificação ok — seguir para Desenho?`

### Fase 3 — Desenho

**Gate:** listar `docs/arquitetura/ARCH-*` da entrega. Se **já existe** → orquestrador **emenda** no chat; **não** Task `arquitetura-pro`. Se **não existe** → Task **uma vez**; ADRs.

AskQuestion: `Desenho ok — seguir para Código?`

### Fase 4 — Código

Skills de implementação; greenfield → `.ai/rules/`. Delegando por Task: ver Regras de custo no Claude Code.

AskQuestion: `Código pronto — seguir para Revisão?`

### Fase 5 — Revisão (código)

Task `review-pro`; loop corrigir código → re-review (correções em lote e re-review só do diff — ver Regras de custo no Claude Code).

AskQuestion: `Revisão ok — seguir para Aceite de negócio?` (+ `Corrigir achados`)

### Fase 6 — Aceite de negócio

`teste-regra-negocio` — VAL/V.

AskQuestion: `Aceite ok — seguir para Testes automáticos?`

### Fase 7 — Testes automáticos

`teste-automatizado` — **rodar suite**; registrar comando + resultado (evidência para Fase 8).

AskQuestion: `Testes automáticos ok — seguir para Revisão de testes?`

### Fase 8 — Revisão de testes

Task `review-testes-pro` + skill `review-testes` (RT1–RT12).

**Foco:** abrangência, execução real, **teste não adaptado ao bug** (RT5 bloqueante).

Orquestrador grava `REVIEW-TESTES-*-resultado.md`.

**Loop** — AskQuestion `Revisão de testes ok?`

- `Sim, seguir para Documentação`
- `Corrigir testes` → orquestrador ajusta testes → **re-Task** `review-testes-pro` (e rodar suite na Fase 7 se necessário)
- `Corrigir código` → orquestrador ajusta produto → voltar **Fase 7** (rodar suite) → Fase 8 de novo
- `Outro (eu digito)`

### Fase 9 — Documentação

Skill `documentacao` — README R1–R10 **e** revisão obrigatória dos docs das fases **2, 4 e 5** (DOC-F2/F4/F5): SPEC/CORR, operação do código, fechamento do REVIEW.

Sincronizar `.ai/docs/indice.md`.

AskQuestion: `Documentação ok — seguir para Encerramento?`

### Fase 10 — Encerramento

Antes do checklist, nos repositórios tocados, nesta ordem:

1. Skill `backstage-recursos` — dependências de infra novas/removidas.
2. Skill `backstage-catalog-info` — catalog-info.yaml, mkdocs.yml, docs/index.md.

Único pulo aceito: `backstage-recursos` detectar que está fora da rede Clamed
(ela mesma avisa e pula).

Checklist DoD; AskQuestion `DoD completo — encerrar?`

---

## Routing

| Situação | Skill / Task |
|----------|----------------|
| Descoberta / entendimento do pedido | `descoberta` |
| Revisão código | Task `review-pro` + `review` |
| Revisão testes | Task `review-testes-pro` + `review-testes` |
| Docs + sync F2/F4/F5 | `documentacao` |
| Demais | ver tabela de fases |

## Definition of Done (Fase 10)

- [ ] Descoberta — Resumo aprovado
- [ ] Especificação (SPEC/CORR) + branch, com pontos de investigação técnica
- [ ] `.ai/` greenfield
- [ ] Desenho (ARCH)
- [ ] Revisão código (`REVIEW-*`) sem bloqueantes
- [ ] Aceite negócio (VAL/V)
- [ ] Testes automáticos executados
- [ ] Revisão testes (`REVIEW-TESTES-*`) sem RT5 bloqueante
- [ ] Documentação: README + **DOC-F2/F4/F5** (spec, código, review alinhados)
- [ ] Backstage: `backstage-recursos` + `backstage-catalog-info` (ou pulo registrado por falta de rede)
- [ ] WSL/Compose/secrets/lint conforme projeto
- [ ] **10 fases** aprovadas pelo dev
