# Checklist detalhado (CR1–CR16)

Ler sob demanda quando o item do SKILL.md precisar de criterio mais fino.
No artefato e no chat, basta o status + nota curta.

## CR1 — Branch / escopo

- Nome `feat/…` ou `fix/…` coerente com a fase 1
- Diff nao traz refactors colaterais nao pedidos
- Arquivos gerados/lockfile so se justificados pela mudanca

## CR2 — Aderencia SPEC/DESIGN

- Cada CA/comportamento do MVP refletido ou explicitamente adiado
- Nomes de campos/status/enums iguais ao documento
- Nao “melhorar” regra de negocio sem acordo

## CR3 — Corretude

- Happy path + vazios/nulos/duplicata
- Transicoes de estado invalidas rejeitadas
- Condicoes de corrida obvias (read-modify-write, double submit)

## CR4 — Secrets

- Diff sem `.env`, tokens, connection strings reais
- Exemplos so em `.env.example` / docs sem valor secreto

## CR5 — Auth / dados

- Rotas mutaveis exigem auth; IDOR (acessar recurso de outro usuario) considerado
- Logs sem PII sensivel desnecessaria

## CR6 — Injecao

- SQL: bind/parametros; sem concatenar input em query
- UI: escape/encoding; `v-html` / `dangerouslySetInnerHTML` justificado
- Scripts: args quoted; sem `eval` de input

## CR7 — API / contratos

- Paths/metodos/status documentaveis
- Validacao de body/query; 4xx vs 5xx corretos
- Compatibilidade com clientes existentes

## CR8 — Dados / migrations

- PK/FK, NULL, defaults; UUID vs serial conforme skill de modelagem
- Migration reversivel ou risco aceito documentado
- Seed nao quebra ambiente existente sem aviso

## CR9 — Observabilidade

- Se o projeto ja usa `@clamed/logger` / metrics: novos fluxos relevantes logam/medem
- Sem spam de log em loop quente

## CR10 — Erros / resiliencia

- Erros de dominio tipados/codigos estaveis quando o projeto ja tem padrao
- Nao engolir `catch` vazio
- Retry so com backoff e idempotencia quando aplicavel

## CR11 — Qualidade

- Nomes alinhados ao projeto
- Sem comentarios obvios ou codigo comentado grande
- Duplicacao evitavel nesta mudanca

## CR12 — Testes na mudanca

- Pelo menos o caminho critico da feature/fix coberto **ou** gap escrito no review
- Testes deterministicos (sem depender de relogio/rede flaky sem fixture)

## CR13 — Lint / types

- Rodar o comando que o README/scripts ja usam (nao inventar ferramenta nova)
- Falhas introduzidas pela branch corrigidas

## CR14 — Docker / ops

- Portas publicadas no host so as necessarias
- Volumes com dados sensiveis; healthcheck se o servico e critico
- Env obrigatorias documentadas no diff de exemplo

## CR15 — Paths / runtime

- Scripts bash com `/mnt/...` ou paths Linux; sem `C:\` embutido
- Nao trocar Node/python/gerenciador de pacote sem autorizacao do usuario

## CR16 — SAP

- Launchpad/tile/intent → skill `fiori`
- Views/controllers UI5 → `ui5`
- CDS/RAP/ABAP → `abap`
- Nao puxar Vue/React generico para app Fiori sem decisao explicita
