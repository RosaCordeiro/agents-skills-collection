# ADR-003: `node:http` e `fetch` nativos, composição manual, três dependências

- **Status:** aceito em 2026-11-19
- **Data:** 2026-11-19
- **Contexto:** O serviço tem 9 rotas em loopback, uma janela de login e um cliente HTTP para duas rotas do SoftDesk. O protótipo validado em produção usa só módulos nativos do Node.

## Decisao

Servidor REST e janela de login em `node:http` com roteador próprio pequeno. Cliente do SoftDesk com `fetch` nativo (`redirect: 'manual'`, `AbortSignal.timeout`) e cookie jar próprio em memória. Composição por função `montarContainer(config, substitutos)`, sem `tsyringe`. CommonJS compilado com `tsc`. Dependências de produção: `@modelcontextprotocol/sdk`, `zod`, `@clamed/logger`.

## Alternativas consideradas

| Alternativa | Por que nao |
|-------------|-------------|
| Express 4 (padrão do time) | Dezenas de pacotes transitivos para 9 rotas locais; nada do ecossistema de middleware é necessário |
| axios ou undici explícito | O `fetch` nativo já foi validado e dá controle de redirecionamento |
| `tsyringe` + decorators | Cerca de 12 objetos com um único ciclo de vida; a função de composição já aceita substitutos nos testes |

## Consequencias

- Positivas: menos superfície e menos cadeia de suprimentos num processo que guarda sessão pessoal; reaproveita o protótipo.
- Negativas / divida: desvio local do padrão do time (Express e `tsyringe`); roteador e cookie jar próprios precisam de teste.

## Referencias

`docs/arquitetura/ARCH-001.md` §4, §9; skill `clean-architecture`.
