# Decisões (ADR)

Registro de decisões arquiteturais. Um arquivo por decisão: `ADR-NNN-<slug>.md`. Os ADRs abaixo saíram do `docs/arquitetura/ARCH-001.md` e foram **aceitos** em 2026-11-19, com a aprovação do folheto do plano v4.

| ADR | Decisão |
|-----|---------|
| [ADR-001](ADR-001-servico-local-e-mcp-fino.md) | Serviço local de longa duração dono da sessão, iniciado pelo próprio MCP; MCP stdio fino |
| [ADR-002](ADR-002-token-rest-por-arquivo-de-descoberta.md) | Token do REST por arquivo de descoberta no perfil do usuário |
| [ADR-003](ADR-003-http-nativo-e-composicao-manual.md) | `node:http` e `fetch` nativos, composição manual, três dependências |
| [ADR-004](ADR-004-erros-tipados-e-deteccao-de-contrato.md) | Erros tipados no domínio; detecção de contrato no adaptador |
| [ADR-005](ADR-005-fila-por-varredura-sequencial.md) | Fila por leitura progressiva (`proximo_inicio`), uma por vez, semáforo de 2 vagas |
| [ADR-006](ADR-006-jest-e-softdesk-simulado.md) | jest e SoftDesk simulado |
| [ADR-007](ADR-007-endereco-da-janela-fora-do-mcp.md) | Endereço da janela de login nunca sai pelo MCP |
| [ADR-008](ADR-008-filtros-de-texto-no-cliente.md) | Filtros de texto (nome do solicitante, título, prioridade, tipo) aplicados no cliente |
| [ADR-009](ADR-009-mitigacao-da-rota-nao-oficial.md) | Mitigação da rota não oficial: contrato dourado, deriva por campo, captura e recuperação rápida |
