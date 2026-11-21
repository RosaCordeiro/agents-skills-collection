# Stack

## Runtime e ambiente

- Alvo primário: **Windows** (PowerShell), Node.js >= 20 LTS. Motivo: no WSL a janela de login local falhou por causa não identificada; no Windows o fluxo foi validado.
- Dois executáveis Node (ADR-001): `servico` (um por usuário, longa duração, iniciado pelo `mcp` quando está parado, dono da sessão, da janela de login e do REST em 127.0.0.1:47821) e `mcp` (stdio, um por chat, cliente fino do serviço; sete tools `softdesk_*`). Nada de Docker (o serviço precisa abrir o navegador do usuário e ficar na máquina dele).

## Linguagens e frameworks

- TypeScript (Node). `@modelcontextprotocol/sdk` + `zod` para o MCP (mesmo molde do `mcp-sybase-readonly`).
- Servidor HTTP (REST e janela de login): `node:http` nativo com roteador próprio; cliente do SoftDesk: `fetch` nativo do Node 20 (ADR-003). Sem Express, sem axios.
- Composição manual em `shared/container` (sem `tsyringe`); CommonJS compilado com `tsc`.
- Dependências de produção: `@modelcontextprotocol/sdk`, `zod`, `@clamed/logger`.
- Testes: jest 29 + ts-jest, com SoftDesk simulado em `test/simulador` (ADR-006).
- Clean Architecture com toque hexagonal (skill `clean-architecture`).

## Banco e persistência

N/A. Sessão e dados de chamado só em memória (RN-13 da SPEC-001). Em disco, fora do repositório (`%LOCALAPPDATA%\softdesk-local`): `servico.json` (porta, token do REST, pid; ADR-002), `config.json` opcional (não secreto) e `logs/`.

## Observabilidade

`@clamed/logger` apenas (decisão do usuário; `light-node-metrics` fora porque o serviço roda local e ninguém consumiria `/metrics`). Logs só com código de chamado e tipo de erro.

## Estrutura de pastas (resumo)

```text
src/            # core/{domain,application}, infraestructure/, presentation/{rest,mcp}, shared/ (ARCH-001 §9)
test/           # simulador/, unit/, integration/, e2e/
scripts/        # iniciar-servico.ps1, parar-servico.ps1
docs/especificacoes/   # SPEC
docs/arquitetura/      # ARCH
.ai/
```

## Comandos úteis

Previstos no ARCH-001 §8.1 (README após a implementação): `npm run build`, `npm run servico:iniciar`, `npm run servico:parar`, `npm run servico:estado`, `npm run entrar`, `npm test`.
