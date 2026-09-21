---
name: springboot
description: >-
  Serviços backend (API HTTP, worker/polling) em Java com Spring Boot,
  seguindo Clean Architecture (skill java + clean-architecture). Use quando o
  projeto escolher Java no backend em vez de Node/Go/Python — ex. equivalente
  Java a um serviço de sincronização/integração já descrito num ARCH. Ler
  `java` antes desta. Não usar para client desktop (skill jfx-windows) nem
  para backend Node/Go/Python (skill backend).
---

# Spring Boot (padrão Clamed)

Responda em português. Pressupõe que a skill `java` já foi lida — aqui só o
que é específico do Spring Boot.

## Fronteiras

| Assunto | Skill |
|---------|--------|
| Convenção Java genérica | `java` |
| Este serviço em Node/Go/Python em vez de Java | `backend` |
| Client desktop (não é serviço HTTP/worker) | `jfx-windows` |
| Acesso a Postgres/Sybase via JDBC | `jdbc-windows` |

## Estrutura de projeto

Mesma árvore de `java`, com os estereótipos Spring entrando **só na borda**:

```text
src/main/java/br/com/clamed/<projeto>/
  core/
    domain/
      model/
      port/               # interfaces puras — NUNCA anotadas com @Repository/@Service
      service/
    application/
      usecase/            # classes simples com execute(...); podem ser @Component, mas sem lógica de framework
  infrastructure/
    db/postgres/          # @Repository — implementa a porta usando Spring Data JPA ou JdbcTemplate
    messaging/            # se houver fila/outbox — @Component
    http/                 # @Component, clients de saída (RestClient/WebClient)
  presentation/
    controller/           # @RestController — fino: valida entrada, chama use case, mapeia resposta/erro
    dto/                  # DTOs de request/response — nunca vazam pro domain
  shared/
    config/               # @Configuration, beans de DI explícitos
    error/                # @ControllerAdvice + exceções de domínio
```

- **Use case não é `@Service` do Spring por reflexo.** Pode ser `@Component`, mas a classe não deve depender de nada do Spring além de injeção de construtor — testável fora do container.
- Porta (`interface PedidoRepository`) fica em `core/domain/port`, **sem** anotação Spring — quem anota é a implementação em `infrastructure` (`@Repository`).
- Controller nunca acessa `EntityManager`/`JdbcTemplate` diretamente — sempre via use case → porta.

## Persistência

- **Spring Data JPA** é aceitável no adapter (`infrastructure/db/postgres`), desde que a entidade JPA seja um objeto de persistência separado do modelo de domínio (não anotar a entidade de domínio com `@Entity`) — evita vazar detalhe de ORM pro `core/`.
- Para SQL mais direto/controlado (ex. queries complexas, ou quando o time prefere), usar `JdbcTemplate`/`NamedParameterJdbcTemplate` em vez de JPA — ver `jdbc-windows` para as regras de conexão/threading.
- Migrations: **Flyway** (`src/main/resources/db/migration`), versionado no repo — nunca alterar schema só via `ddl-auto: update` em produção.

## Configuração por ambiente

- `application.yml` base + `application-hmg.yml` / `application-prd.yml` com `spring.profiles.active` — mesmo conceito de HMG/PRD já usado nos pipelines deste workspace (skill `gitlab-cicd`).
- Segredos (senha de banco, tokens) **nunca** no `application.yml` commitado — via variável de ambiente (`${DB_PASSWORD}`) injetada pelo Compose/CI, mesmo padrão da skill `backend`.
- Healthcheck: Spring Boot Actuator (`/actuator/health`), exposto no Compose com o mesmo formato de healthcheck já usado em outros serviços do workspace.

## Testes

- `@SpringBootTest` só para teste de integração fim a fim (poucos, caros).
- Use case: teste unitário puro com Mockito, sem subir contexto Spring (ver `java`).
- Adapter de banco: **Testcontainers** (Postgres) — nunca H2 como substituto de Postgres em teste de integração (diferenças de comportamento SQL escondem bug).

## Regras

- Sem lógica de negócio em `@RestController` nem em `@RestControllerAdvice` além de tradução de erro.
- Sem `@Autowired` em campo — injeção **sempre por construtor** (testável, imutável, sem mágica).
- Logs via SLF4J (`Logger`/`LoggerFactory`), nunca `System.out`.

## Checklist

- [ ] Porta no `domain/port` sem anotação Spring; implementação anotada só no `infrastructure`
- [ ] Use case testável sem subir contexto Spring
- [ ] Controller fino, sem acesso direto a repositório/JDBC
- [ ] Migrations versionadas (Flyway), sem `ddl-auto: update` em produção
- [ ] `application-hmg.yml`/`application-prd.yml` sem segredo em texto plano
- [ ] Injeção por construtor, não por campo

