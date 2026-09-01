# TypeScript / Node — convencoes

Alinhado a `api-integracao-syb-kafka` e `api-orquestra-integracao-sybase-kafka`.

## Naming

| Artefato | Padrao | Exemplo |
|----------|--------|---------|
| Use case | `<verbo>-<objeto>.use-case.ts` | `buscar-dados-sybase.use-case.ts` |
| Porta | `I<Nome>Repository` em `*.repository.ts` | `IIntegracaoRepository` |
| Adapter | `<Nome>Repository` classe | `IntegracaoRepository` |
| Entidade | classe ou type no dominio | `LogExportacao` |
| Domain service | funcao ou modulo puro | `grafo-exportacao.ts` |
| Controller | `<recurso>.controller.ts` | `Its-alive.controller.ts` |
| Worker | `<contexto>.worker.ts` | `consumer-fila-integracao.worker.ts` |
| Token DI | string PascalCase | `'IntegracaoRepository'` |

## Use case (esqueleto)

```typescript
import { inject, injectable } from "tsyringe";
import { IIntegracaoRepository } from "@/core/domain/entities/integracao.repository";

@injectable()
class BuscarDadosSybaseUseCase {
  constructor(
    @inject("IntegracaoRepository")
    private readonly integracaoRepository: IIntegracaoRepository,
  ) {}

  async execute(message: TKafkaMessage, conexaoSybase: Connection): Promise<unknown> {
    return this.integracaoRepository.buscarDados(message, conexaoSybase);
  }
}

export { BuscarDadosSybaseUseCase };
```

## Porta no dominio

```typescript
// core/domain/entities/integracao.repository.ts
interface IIntegracaoRepository {
  buscarDados(kafkaMessage: TKafkaMessage, conexaoSybase: Connection): Promise<unknown>;
}
export { IIntegracaoRepository };
```

## Adapter + binding

```typescript
// infraestructure/db/sybase/integracao.repository.ts
@injectable()
export class IntegracaoRepository implements IIntegracaoRepository { /* SQL */ }

// shared/container/repositories/integracao.repository.ts
container.registerSingleton<IIntegracaoRepository>("IntegracaoRepository", IntegracaoRepository);
```

## Presentation

```typescript
// routes chamam controller; controller resolve use case do container
const useCase = container.resolve(BuscarDadosSybaseUseCase);
await useCase.execute(dto, connection);
```

## Path alias

Usar `@/` → `src/` (tsconfig paths) como nos repos de referencia.

## Stack tipica

- **DI:** `tsyringe` + `reflect-metadata`
- **HTTP:** Express (controllers finos)
- **Workers:** KafkaJS consumers em `application/workers`
- **Logs:** `@clamed/logger` (skill `logger`)

## Novo agregado — ordem de criacao

1. Entidade + porta (`core/domain/...`)
2. Use case (`core/application/useCases/`)
3. Adapter (`infraestructure/...`)
4. Binding (`shared/container/repositories/`)
5. Rota/worker (`presentation/` ou `application/workers/`)
