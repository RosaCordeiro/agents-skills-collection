# ADR-006: jest e SoftDesk simulado em processo

- **Status:** aceito em 2026-11-19
- **Data:** 2026-11-19
- **Contexto:** Todos os VAL precisam rodar no Windows sem tocar a produção (RNF-07, RNF-08).

## Decisao

Testes com jest 29 + ts-jest, `--runInBand`. Um servidor `node:http` simula `/login` (XSRF) e `/chamado/json`, com cenários de falha, expiração, lentidão, registro de requisições e contador de simultaneidade. Três níveis: unitário, integração (serviço no processo, pelo REST) e e2e (serviço como processo filho e MCP pelo cliente stdio do SDK). O navegador é substituído por um `IAbridorNavegador` de teste.

## Alternativas consideradas

| Alternativa | Por que nao |
|-------------|-------------|
| Vitest | Segunda ferramenta de teste no time, sem ganho para suíte pequena |
| Gravações de respostas reais | Conteriam dados pessoais; proibido pelas regras do repositório |

## Consequencias

- Positivas: mesma ferramenta do molde `mcp-sybase-readonly`; VAL-10 e VAL-23 medidos pelo próprio simulador.
- Negativas / divida: o simulador é uma leitura nossa do SoftDesk; a validação manual em produção continua necessária.

## Referencias

`docs/arquitetura/ARCH-001.md` §10; `docs/especificacoes/SPEC-001.md` §16.
