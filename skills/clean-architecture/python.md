# Python — convencoes

Mesma **intencao** do padrao TS (`api-integracao-syb-kafka`): dominio no centro, portas abstratas, adapters na borda.

## Estrutura espelhada

```text
src/
  core/
    domain/
      entities/
      services/
      ports/                 # alternativa: ports/ em vez de entities/*.repository
    application/
      use_cases/             # snake_case de pastas
      workers/
  infrastructure/
    db/
    messaging/
    http/
  presentation/
    api/                     # FastAPI routers ou Flask blueprints
    cli/
  shared/
    container.py             # ou dependencies.py (FastAPI)
    errors/
```

Repos Python existentes sem essa arvore: adotar em **greenfield**; em legado, alinhar feature nova a estas pastas.

## Naming

| Artefato | Padrao | Exemplo |
|----------|--------|---------|
| Use case | `<acao>_use_case.py` | `processar_integracao_use_case.py` |
| Porta | `Protocol` ou `ABC` | `IntegracaoRepositoryPort` |
| Adapter | `<Nome>Repository` | `SybaseIntegracaoRepository` |
| Entidade | `@dataclass` ou Pydantic model **no dominio** | `LogExportacao` |

## Porta (Protocol)

```python
from typing import Protocol

class IntegracaoRepositoryPort(Protocol):
    async def buscar_dados(self, message: KafkaMessage, conn: SybaseConnection) -> dict: ...
```

## Use case

```python
class BuscarDadosSybaseUseCase:
    def __init__(self, repo: IntegracaoRepositoryPort) -> None:
        self._repo = repo

    async def execute(self, message: KafkaMessage, conn: SybaseConnection) -> dict:
        return await self._repo.buscar_dados(message, conn)
```

## DI

| Framework | Onde registrar |
|-----------|----------------|
| FastAPI | `dependencies.py` — `Depends(get_integracao_repository)` |
| script/CLI | `container.py` — factory simples ou `dependency-injector` se o repo ja usa |
| testes | injetar fake que implementa o `Protocol` |

## Presentation

- Router/CLI so valida entrada, chama `use_case.execute()`, mapeia excecao → HTTP/status code
- Sem SQL nem regra de negocio na rota

## Testes

- `domain/services`: pytest puro
- `use_cases`: mock do `Protocol` (`unittest.mock` ou fake in-memory)
- `infrastructure`: testes de integracao opcionais

## Scripts one-off

Scripts com **so** glue (sem RN) podem ficar em `scripts/` sem camadas completas. Se o script crescer ou repetir regra de negocio → promover para `core/application` + portas (skill `script`).








