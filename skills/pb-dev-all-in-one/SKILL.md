---
name: pb-dev-all-in-one
description: >-
  Orquestrador de Entrega PB (8 fases): sincronismo, descoberta,
  especificacao, arquitetura (fragmentacao), system design por fragmento,
  revisao das specs vs descoberta, sugestoes de teste, encerramento. So
  especifica e desenha — nao implementa PB nesta fase. Use com
  pb-desenvolvimento-pro / entrega guiada PB.
---

# Orquestrador de Entrega PB (8 fases)

Equivalente ao `dev-all-in-one`, mas para pedidos PowerBuilder + Sybase que
merecem descoberta e arquitetura de verdade — não um patch pontual (isso é
`/pbg`) nem uma consulta rápida (isso é `/pb-sybase` modo consulta).

**Este fluxo não implementa código PB.** Termina em specs aprovadas +
sugestões de teste + Encerramento (DoD). Implementação é decisão separada,
fora deste agente, por enquanto.

Responda em português.

## As 8 fases (ordem obrigatória)

| # | Nome | O que acontece | Artefato principal |
|---|------|-----------------|---------------------|
| 1 | **Sincronismo** | Checa se snapshot PBG, SVN (`.srw`/`.srd`) e `sybase-objects` (git) estão coerentes entre si | Nota no chat (sem arquivo) |
| 2 | **Descoberta** | skill `descoberta` — entender exatamente o pedido | Resumo da Descoberta aprovado |
| 3 | **Especificação do usuário** | Consulta PB+Sybase+sybase-objects, redige spec em linguagem de negócio, mocks se houver tela | `SPEC-<n>.md` + `mock-*.html` |
| 4 | **Arquitetura (fragmentação)** | Decide as fronteiras: Cadastro / Consulta / Funcionamento / Integração; sistemas e bancos envolvidos | `ARCH-<n>.md` (mapa de fragmentos) |
| 5 | **System design por fragmento** | Uma spec técnica detalhada por fragmento (telas, banco, lógica) | `SPEC-<n>-<fragmento>.md` (um por fragmento) |
| 6 | **Revisão das specs vs Descoberta** | Confere cada spec de fragmento contra o Resumo da Descoberta e o `SPEC-<n>.md` original — nada ficou de fora, nada foi inventado | `REVIEW-<n>-resultado.md` |
| 7 | **Sugestões de teste** | Cenários de teste sugeridos por fragmento — **não executa** | Seção "Sugestões de teste" em cada spec de fragmento |
| 8 | **Encerramento** | Checklist DoD; specs aprovadas; fecha sem gerar código | DoD ok |

Anuncie **"Fase N — Nome"** + artefato + aprovação esperada. Cada fase pode
gerar correção antes de avançar (ver loops abaixo).

## Modelos por fase

| Fase | Motivo | Primário | Fallback |
|------|--------|----------|----------|
| 1 Sincronismo | Checagem mecânica | `claude-sonnet-5` | Grok medium |
| 2 Descoberta | Investigar o pedido a fundo (mesma exceção do `dev-all-in-one`) | `claude-sonnet-5-thinking-high` | `claude-sonnet-5` → Grok medium |
| 3 Especificação | Redação/consulta de rotina | `claude-sonnet-5` | Grok medium |
| 4 Arquitetura (fragmentação) | Decisão de fronteiras entre specs — julgamento, não redação | `claude-sonnet-5-thinking-high` | `claude-sonnet-5` |
| 5 System design por fragmento | Detalhamento técnico, roda 1x por fragmento (custo multiplica) | `claude-sonnet-5` | Grok medium |
| 6 Revisão | Conferência | `claude-sonnet-5` | Grok medium |
| 7 Sugestões de teste | Redação | `claude-sonnet-5` | Grok medium |
| 8 Encerramento | Checklist | `claude-sonnet-5` | Grok medium |

Fases 2 e 4 usam `thinking-high` por serem as duas fases de **julgamento**
(entender o pedido; decidir como cortar o trabalho em partes) — as demais são
redação/checagem de rotina em Sonnet padrão. Thinking-high explícito para
outra fase só se o usuário pedir.

---

### Fase 1 — Sincronismo

Antes de qualquer pergunta de negócio, garantir que as três fontes de
verdade não estão divergentes:

1. **Snapshot PBG vs SVN**: comparar a data do `.srw`/`.srd` em
   `C:\SVN\Sistemas_PB12\<Sistema>\Bibliotecas\` com a do snapshot em
   `.pbg\snapshots\...` do workspace PBG (skill `pbg` § Ambiente Clamed →
   Snapshot desatualizado). Preferir `pbg_status` (MCP `user-pbg`) para
   verificar/atualizar o snapshot — não editar `.sr*` a mão.
2. **`sybase-objects` (git)**: no clone local, checar se há divergência
   entre o que está versionado e o remoto (`git status`, `git log` local vs
   `origin`), sem fazer `pull`/`fetch` sozinho.
3. **Não rodar nada por conta própria.** Se algo estiver desatualizado,
   relatar exatamente o quê (arquivo, data local vs data mais nova) e
   **`AskQuestion`**:
   - Prompt: `Encontrei [X] desatualizado. Como seguir?`
   - Opções: `Atualizar agora (pbg_status / svn update / git pull)` |
     `Seguir mesmo assim (registrar risco)` | `Outro (eu digito)`
4. Se tudo coerente: seguir direto para a Fase 2, sem alarde.
5. Registrar a decisão (atualizado / seguiu com risco) no cabeçalho do
   `SPEC-<n>.md` quando ele for criado na Fase 3.

**Sempre preferir as ferramentas do MCP `user-pbg`** (`pbg_status`,
`pbg_search`, `pbg_read_object`) a comandos de arquivo direto — é o que
mantém o snapshot e o estado do workspace consistentes.

### Fase 2 — Descoberta

Rodar a skill `descoberta` como está — mesmo processo do `dev-all-in-one`
(objetivo, atores, gatilho, escopo, restrições, ROI opcional), adaptado ao
contexto PB: perguntar também **qual sistema PB** (`path` do workspace),
quais telas/objetos o usuário já sabe que estão envolvidos, e se há sistemas
Sybase/bancos adicionais na jogada.

AskQuestion: `Este é exatamente o entendimento do que você quer?`

### Fase 3 — Especificação do usuário

Reaproveita a skill `pb-sybase` (`consulta.md` para cruzar as três fontes,
`especificacao.md` para o pipeline de redação e mocks), **parando antes do
DOCX** — DOCX só na Fase 8, se pedido.

1. Consultar PB (`user-pbg`) + Sybase homolog (`user-sybase-hmg`) +
   `sybase-objects` a partir do Resumo da Descoberta aprovado.
2. Redigir `SPEC-<n>.md` em `Projetos/Especificações/Chamado <n>/` —
   documento autocontido, linguagem de negócio (skill `especificacao` §6
   como referência de padrão, mesmo fora do Node).
3. Mocks HTML se houver tela — meramente ilustrativos, padrão CLAMED.
4. Se for **melhoria ou mudança** (não incidente): este é o ponto de
   aprovação formal do usuário antes de seguir para Arquitetura.
5. **`AskQuestion`**: `Especificação e mocks estão ok — seguir para Arquitetura?`
   - `Sim, seguir` | `Ajustar` | `Outro (eu digito)`

### Fase 4 — Arquitetura (fragmentação)

O objetivo desta fase **não** é desenhar telas — é decidir **em quantas
specs** este pedido precisa virar, porque um chamado PB frequentemente
mistura coisas que são de dono, ritmo e teste diferentes.

**Critério de corte (obrigatório verificar):**

| Tipo de fragmento | O que é | Exemplo |
|--------------------|---------|---------|
| **Cadastro** | Tela/DW que grava o parâmetro/master data | Cadastro do corte de filial (a tela que define o horário/regra) |
| **Consulta** | Tela/relatório só de leitura | Consulta de pedidos cortados |
| **Funcionamento** | Lógica/processamento que **usa** o cadastro | O motor que aplica o corte na hora de gerar o pedido |
| **Integração** | Troca entre sistemas PB, multi-banco, API/serviço externo | WMS lendo parâmetro do Fiscal; exposição via API |

Regra: se a mudança tem uma parte de **cadastro** e uma parte de
**funcionamento** (ex.: "cadastro de corte de filial" **e** "funcionamento
do corte de filial"), são **dois fragmentos, duas specs** — mesmo que o
usuário tenha pedido como um único chamado. Da mesma forma, cada sistema PB
ou banco Sybase adicional tocado é candidato a fragmento próprio.

1. Listar os fragmentos identificados: nome, tipo, sistema(s)/tela(s)/
   tabela(s) envolvidos, dependência entre fragmentos (ex.: Funcionamento
   depende do Cadastro existir primeiro).
2. Registrar em `ARCH-<n>.md` (mesma pasta do chamado).
3. Se o pedido só tem **um** fragmento natural, dizer isso explicitamente no
   `ARCH-<n>.md` (não forçar divisão artificial).
4. **`AskQuestion`**: `Esta divisão em fragmentos faz sentido — seguir para o desenho de cada um?`
   - `Sim, seguir` | `Ajustar divisão` | `Outro (eu digito)`

### Fase 5 — System design por fragmento

Para **cada** fragmento da Fase 4, produzir uma spec técnica própria:
`SPEC-<n>-<fragmento-slug>.md`, cobrindo o "Conteúdo mínimo do MD" da skill
`pb-sybase` (`especificacao.md`): tela (ancestor, dw_1/dw_2, menu), banco
(DDL de tabelas/colunas, triggers/SPs afetados), lógica (retrieve,
itemchanged, gravar, filtros), critérios de aceite.

- Um fragmento por vez; não misturar o conteúdo de dois fragmentos no mesmo
  arquivo.
- Mocks do fragmento (se houver tela) ficam junto da spec do fragmento, não
  na spec-mãe (`SPEC-<n>.md`).
- **`AskQuestion`** por fragmento (ou em lote, se todos ficaram prontos
  juntos): `Specs de fragmento ok — seguir para Revisão?`

### Fase 6 — Revisão das specs vs Descoberta

Conferir, para cada `SPEC-<n>-<fragmento>.md`:

- Está coberto pelo Resumo da Descoberta (Fase 2) e pelo `SPEC-<n>.md`
  (Fase 3) — nada foi inventado, nada ficou de fora.
- Fronteiras da Fase 4 foram respeitadas (fragmento não invadiu escopo de
  outro).
- Documento autocontido (mesmo padrão da skill `especificacao` §6).

Registrar em `REVIEW-<n>-resultado.md`: por fragmento, `OK` / `FALHA`
(o que falta) / `N/A`.

**`AskQuestion`**: `Revisão ok — seguir para sugestões de teste?`

### Fase 7 — Sugestões de teste

Por enquanto, **só sugerir** — não executar nada (nem teste de mesa, nem
suite). Para cada fragmento, acrescentar uma seção "Sugestões de teste"
na própria `SPEC-<n>-<fragmento>.md`:

| ID | Cenário | Entrada | Resultado esperado |
|----|---------|---------|---------------------|
| VAL-01 | ... | ... | ... |

Teste de mesa de trigger/SP continua sendo a skill `teste-mesa-sybase`,
sob pedido — esta fase só deixa o roteiro sugerido, não a executa.

**`AskQuestion`**: `Sugestões de teste ok — seguir para Encerramento?`

### Fase 8 — Encerramento

Checklist DoD; marcar cada `SPEC-<n>-<fragmento>.md` como `Status: aprovado`.
DOCX (skill `pb-sybase` § DOCX) só aqui, e só se o usuário pedir.

**`AskQuestion`**: `DoD completo — encerrar?`

Por enquanto este orquestrador **encerra aqui** — não encadeia para `/pbg`
nem `/pb-criar-objeto` automaticamente. Implementar é uma decisão separada,
tomada pelo usuário fora deste fluxo.

## Definition of Done (Fase 8)

- [ ] Sincronismo verificado (ou risco assumido e registrado)
- [ ] Descoberta — Resumo aprovado
- [ ] `SPEC-<n>.md` aprovado (+ mocks se houver tela)
- [ ] `ARCH-<n>.md` — fragmentação decidida e aprovada
- [ ] Uma `SPEC-<n>-<fragmento>.md` por fragmento, aprovada
- [ ] `REVIEW-<n>-resultado.md` sem `FALHA` pendente
- [ ] Sugestões de teste registradas por fragmento
- [ ] Nenhum código PB alterado neste fluxo
- [ ] **8 fases** aprovadas pelo usuário

## Loops de correção

| Após fase | Se pedir correção |
|-----------|-------------------|
| 2 Descoberta | `Ajustar entendimento` → repetir perguntas até novo Resumo aprovado |
| 3 Especificação | `Ajustar` → reescreve `SPEC-<n>.md`/mocks e pede aprovação de novo |
| 4 Arquitetura | `Ajustar divisão` → reagrupa/recorta fragmentos e pede aprovação de novo |
| 5 System design | Corrigir a spec do fragmento específico e reaprovar só ele |
| 6 Revisão | `FALHA` → volta para a Fase 5 do fragmento afetado |
| 7 Testes | Ajustar cenários sugeridos |

## Fronteiras (não confundir com outros agents PB)

| Situação | Agent / skill |
|----------|----------------|
| Pedido grande, quer descoberta + arquitetura + specs por fragmento | **este** (`pb-desenvolvimento-pro`) |
| Consulta rápida / cruzamento PB+Sybase | `/pb-sybase` (modo consulta) |
| Spec pequena e direta, sem fases | `/pb-sybase` (modo especificação, como hoje) |
| Patch de objeto PB já existente | `/pbg` |
| Objeto/PBL/tela nova (depois da spec aprovada) | skill `pb-criar-objeto`, fora deste fluxo |
| Teste de mesa de trigger/SP | `/teste-mesa-sybase` |
