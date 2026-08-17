---
name: backend
description: Implementa APIs e servicos com Node/TypeScript, Go ou Python, Docker Compose e bancos Postgres, Sybase ou MongoDB. Use quando o trabalho for backend nao-SAP, API, banco, migracoes, servicos Docker. Nao usar para ABAP/RAP/CDS/OData SAP (skill abap) nem PowerBuilder (skill pbg).
---

# Backend

Responda em portugues. Em tarefas grandes, valide o plano antes de implementar. Siga a especificacao e o system design aprovados.

## Fronteiras

| Assunto | Skill |
|---------|--------|
| API Node/Go/Python, Compose, Postgres/Sybase/Mongo | **esta skill (`backend`)** |
| ABAP, CDS, RAP, OData SAP, BAPI | `abap` |
| PowerBuilder 12, PBL, ORCA, snapshots PBG | `pbg` |
| MCP expondo DB ao agent | `mcp` (contrato) + esta skill se houver API auxiliar |
| RAG sobre docs/dados | `rag` |

## Stack preferida

- Linguagens: Node/TS, Go, Python (PowerBuilder → skill `pbg`; C++ desktop → `arquitetura`)
- Infra: Docker + Docker Compose em Linux/WSL
- DB: Postgres, Sybase, MongoDB — escolha a do projeto; nao misture sem necessidade

## Regras

- Implemente a melhor opcao planejada, com codigo legivel (sem complexidade gratuita)
- Durante o desenvolvimento: cobrir cenarios de **regra de negocio** da especificacao (RN-xx). Suíte ampla fica apos o desenvolvimento.
- Secrets apenas via env / secrets do Compose — nunca no codigo
- Separar handlers, dominio e acesso a dados quando o tamanho justificar
- Migracoes/versionamento de schema quando houver DB relacional
- **Postgres:** ler e seguir `modelagem-dados` (`~/.cursor/skills/modelagem-dados/SKILL.md`) — PK/FK `uuid`, `varchar(n)`, `TEXT` só para texto longo
- Healthcheck e logs estruturados em servicos novos
- **Logs Node (`@clamed/logger`):** ler e seguir `logger` (`~/.cursor/skills/logger/SKILL.md`) — keywords, niveis, `event`, `correlation_id` automatico
- Preferir ferramentas Linux (bash, make, compose) a scripts Windows
- Branch: `feat/` ou `fix/` conforme o caso

## Docker Compose

Ao criar/ajustar servicos:

- Rede interna entre app e DB
- Volumes para dados persistentes
- Variaveis documentadas em `.env.example` (sem valores secretos reais)

## Histórico de campos (auditoria de alteração)

Ao gravar histórico campo a campo (ex.: GMUD):

1. **Normalizar antes de comparar** — nunca comparar string crua de `Date`/`timestamptz` com `yyyy-MM-dd`.
2. Campos **date** (só dia): canônico de armazenamento/diff = `yyyy-MM-dd`. Aceitar parse de ISO, `Date`, e strings JS.
3. Se após normalizar `anterior === novo`, **não** inserir linha de histórico.
4. Na **API de leitura**, campos date do histórico devem ir formatados para UI como **`dd/mm/yyyy`** (ou um campo `*Display` explícito).
5. Mesma regra para qualquer entidade nova com “histórico por campo”.

## Checklist

- [ ] Sobe com Compose (quando aplicavel)
- [ ] Conexao DB configuravel por env
- [ ] README ou secao de como rodar em portugues
- [ ] Sem secrets commitados
- [ ] Histórico de datas normalizado (se a feat tiver auditoria por campo)

## Ao terminar

Resuma endpoints/servicos. Em seguida use **`AskQuestion`** — prompt: `Proximo passo?`
- `Ir para code review` | `Seguir com frontend` | `Ajustar backend` | `Outro (eu digito)`
