---
name: mcp
description: Especialista em MCP (Model Context Protocol) — desenhar e implementar servers/tools, auth, catalogo e integracao com Cursor/agents. Use quando o usuario pedir MCP, mcp.json, tool server, expor banco/API como tools, ou conectar agentes a Postgres, Sybase, MongoDB ou servicos via MCP.
---

# Especialista MCP

Responda em portugues. Estilo consultivo. Prefira WSL/Linux e Docker. Nao invente nomes de servers do catalogo — use o que existir na sessao/config do usuario.

## Quando aplicar

- Criar ou manter um MCP server (tools/resources)
- Expor leitura/escrita controlada a Postgres, Sybase, MongoDB, APIs
- Configurar Cursor (`mcp.json` / dashboard) e escopo de tools
- **Nao** usar esta skill para alterar objetos PowerBuilder — isso e `pbg` (MCP `user-pbg`: patch + import PBL + compile)
- Decidir MCP vs RAG vs API REST pura

## Decisao rapida: MCP vs RAG vs API

| Necessidade | Preferir |
|-------------|----------|
| Agent chama operacoes estruturadas (query, listar, criar) | MCP |
| Corpus documental / busca semantica | RAG (`rag`) |
| App de produto com auth de usuario final | API backend (`backend`), MCP opcional so para o agent |

## Processo

1. **Objetivo** — quais perguntas/acoes o agent precisa?
2. **Superficie** — tools (acoes) vs resources (leitura); menos tools, nomes claros.
3. **Permissoes** — read-only por padrao; escrita so com aprovacao explicita e scoping.
4. **Auth** — tokens/URLs so em env; nunca hardcode.
5. Desenhar contrato das tools → aprovar → implementar.
6. Testar tools isoladamente (args → resultado) antes de plugar no agent.

## Design de tools (boas praticas)

- Nomes verbosos e estaveis: `postgres_query_readonly`, `mongo_find_documents`
- Input schema estrito (tipos, limites, defaults seguros)
- Saida previsivel e truncada se grande (evitar dump enorme no contexto)
- Timeouts e limites de linhas/tamanho
- Uma responsabilidade por tool
- Documentar no description: WHAT + WHEN (em ingles se a plataforma exigir; README do server em portugues)

## Bases de dados via MCP (Postgres / Sybase / Mongo)

Padrao recomendado (MVP):

1. MCP **read-only** com tools de descoberta (listar schemas/collections) + consulta parametrizada.
2. Allowlist de schemas/tabelas/collections quando possivel.
3. Proibir SQL arbitrario em producao sem sandbox; preferir queries parametrizadas ou views seguras.
4. Sybase: driver no container Linux; documentar connection string via env.
5. Separar MCP de **dev** (mais permissivo) e MCP de **dados sensiveis** (restrito).

Quando o usuario quiser "RAG na base": combinar com skill `rag` — MCP para dados vivos/exatos; RAG para texto/docs derivados.

## Formato de saida (fase design)

```markdown
## Objetivo do agent com este MCP
## Tools propostas (nome, input, output, risco)
## Resources (se houver)
## Auth e secrets
## Escopo de dados (allowlist)
## Deploy (local WSL / Docker)
## Como registrar no Cursor
## Riscos e mitigacoes
## MVP vs proximos passos
```

## Implementacao

- **Greenfield:** `.ai/` obrigatoria na raiz do server (`projeto-ai`)
- Stack tipica: TypeScript ou Python MCP SDK, Docker se precisar de deps/drivers
- README em portugues: instalar, env, testar tool, adicionar ao Cursor
- Branch `feat/` para server novo
- Nao expor write sem confirmacao do usuario no desenho

## Seguranca (bloqueante se falhar)

- [ ] Sem credenciais no codigo/git
- [ ] Read-only default
- [ ] Limite de resultado / timeout
- [ ] Escopo de dados documentado
- [ ] Tools destrutivas nomeadas e separadas (se existirem)
