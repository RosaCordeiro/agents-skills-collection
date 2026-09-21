---
name: java
description: >-
  Convenções gerais de desenvolvimento Java neste workspace: JDK LTS, Maven,
  estrutura de pacotes em Clean Architecture (skill clean-architecture),
  testes com JUnit 5/Mockito, nomenclatura. Base para as skills springboot,
  jfx-windows e jdbc-windows. Use quando o trabalho for Java puro ou quando
  outra skill Java pedir para ler esta primeiro. Não usar para Node/Go/Python
  (skill backend) nem para PowerBuilder/ABAP/Fiori.
---

# Java (padrão Clamed)

Responda em português. Esta skill é a base comum — `springboot`, `jfx-windows`
e `jdbc-windows` assumem que o projeto já segue o que está aqui.

## Fronteiras

| Assunto | Skill |
|---------|--------|
| Java genérico (build, pacotes, testes, nomenclatura) | **esta skill (`java`)** |
| Serviço backend HTTP/worker em Java | `springboot` |
| Client desktop JavaFX rodando em estação Windows | `jfx-windows` |
| JDBC (SQLite local ou Sybase/jTDS) em ambiente Windows | `jdbc-windows` |
| Backend Node/Go/Python | `backend` |
| Camadas/hexagonal (linguagem-agnóstico) | `clean-architecture` |

## Versão e build

- **JDK 21 LTS** — não usar versões não-LTS nem inferiores a 17 em projeto novo.
- **Maven** é o padrão deste workspace para projetos Java (convenção mais previsível para times que não vivem em Java todo dia). Gradle só se o projeto específico já usar ou se houver motivo técnico explícito documentado em `.ai/decisions/`.
- `pom.xml` com `<properties><maven.compiler.release>21</maven.compiler.release></properties>` — nunca fixar `source`/`target` separados de forma inconsistente com o `release`.
- Sem dependências não versionadas (`LATEST`/`RELEASE` no Maven); sempre pinar a versão.

## Estrutura de pacotes (Clean Architecture)

Antes de codar, ler e seguir **`clean-architecture`** (`~/.claude/skills/clean-architecture/SKILL.md`) — os conceitos (domain/application/infrastructure/presentation, dependências apontando pra dentro) são os mesmos; aqui vai só o mapeamento pra convenção Java:

```text
src/main/java/br/com/clamed/<projeto>/
  core/
    domain/
      model/            # entidades e value objects
      port/              # interfaces (portas) — prefixo sem "I" em Java, sufixo "Port" ou "Repository"
      service/           # regra de domínio pura, sem framework
    application/
      usecase/           # um caso de uso por classe: <Acao>UseCase, método execute(...)
      workers/           # jobs/consumers que chamam use cases (se houver)
  infrastructure/
    db/<vendor>/         # adapters de persistência, implementam as portas
    http/                # clients HTTP de saída, se houver
  presentation/
    controller/          # REST/entrada — fino, sem regra de negócio (Spring: ver skill springboot)
  shared/
    config/              # configuração/DI
    error/                # exceções de domínio
```

- Pacote raiz: `br.com.clamed.<nome-do-projeto>` (kebab-case do projeto vira uma palavra em minúsculo no pacote — sem hífen, Java não aceita).
- Uma porta por arquivo: `PedidoRepository` (interface), implementação em `infrastructure/db/postgres/PedidoRepositoryImpl` ou `JdbcPedidoRepository` — nome explícito do adapter, nunca `Impl` genérico demais quando houver mais de um adapter possível.
- Use case injeta a porta (interface), nunca a implementação concreta.

## Nomenclatura

- Classes: `PascalCase`. Métodos e variáveis: `camelCase`. Constantes: `SCREAMING_SNAKE_CASE`.
- Pacotes: tudo minúsculo, sem underscore nem hífen.
- Um caso de uso = um verbo de negócio: `AbrirVolumeUseCase`, `RegistrarDivergenciaUseCase` (mesmo padrão de nomenclatura já usado no ARCH do domínio, independente da linguagem de implementação).
- Interfaces de porta: `PedidoRepository`, `EventoPublisher` — sem prefixo `I` (não é convenção Java, ao contrário de C#).

## Testes

- **JUnit 5** (Jupiter) + **Mockito** para mocks de porta.
- `domain/service`: teste unitário puro, sem mock.
- `application/usecase`: mock das portas via Mockito, teste de comportamento (dado X, chama Y da porta com Z).
- `infrastructure`: teste de integração — Testcontainers quando o adapter for Postgres; para SQLite local, banco em arquivo temporário real é aceitável (ver `jdbc-windows`).
- Nomenclatura de teste: `<Classe>Test` para unitário, `<Classe>IT` para integração (convenção Maven Failsafe/Surefire).

## Regras

- Sem lógica de negócio em construtor, getter/setter ou classe de configuração.
- Sem `System.out.println`/`e.printStackTrace()` em código de produção — usar SLF4J (`org.slf4j.Logger`), nunca `java.util.logging` direto.
- Exceções de domínio em `shared/error/`, distinguindo erro permanente (não adianta retry) de transiente (retry faz sentido) — mesmo princípio já adotado em `clean-architecture` para TS/Python.
- Branch: `feat/` ou `fix/`, conforme skill `git`.

## Checklist

- [ ] JDK 21, Maven, `maven.compiler.release` configurado
- [ ] Estrutura `core/domain` + `core/application/usecase` + `infrastructure` + `presentation`
- [ ] Porta (interface) no domain, implementação no infrastructure
- [ ] Teste de domínio ou use case com porta mockada (Mockito)
- [ ] Logs via SLF4J, nunca `println`
- [ ] Sem versão `LATEST`/`RELEASE` de dependência no `pom.xml`

