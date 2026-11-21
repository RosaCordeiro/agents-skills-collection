# Regras de desenvolvimento (local)

## Branch e commits

- Branches `feat/<slug>` e `fix/<slug>`. Branch atual: `feat/softdesk-local-mvp`.
- Commit e push só quando o dono do repo pedir.

## Estrutura e naming

Seguir a skill global **`clean-architecture`** (referência: `api-integracao-syb-kafka`). Desvios locais ficam documentados nos ADRs.

- Regra de negócio (erros tipados, filtro de fila, validação de contrato) fica no núcleo, sem importar HTTP nem MCP.
- Cliente HTTP do SoftDesk isolado em um único adaptador: toda a ligação com as rotas não oficiais fica ali.
- MCP e REST são adaptadores finos sobre os mesmos casos de uso.

## Testes

- O SoftDesk é simulado por um servidor falso nos testes automáticos (login com XSRF, `/chamado/json`).
- Teste obrigatório: nenhum log, resposta ou erro contém senha ou cookie.

## Logs e erros

- `@clamed/logger` com `event` e `correlation_id`.
- Logs só com código de chamado e tipo de erro. Nunca título, nome de pessoa, cookie ou senha.
- Erros tipados da SPEC-001 §11; quebra de layout/rota nunca se mistura com sessão expirada.

## Migrations / transportes

N/A (sem banco).

## Proibições locais

- Não commitar `.env`, cookies, capturas de resposta com valores reais ou credenciais.
- Não adicionar chamadas de escrita ao SoftDesk (RN-01).
- Não aceitar senha por argumento de tool, variável de ambiente ou arquivo.
