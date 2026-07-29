# Arquitetura (system design)

Skill consultiva. Nao implemente codigo de producao aqui — entregue design completo e aguarde aprovacao. Responda em portugues.

## Pre-requisito

Idealmente a especificacao de regra de negocio ja esta aprovada (`especificacao`). Se nao estiver, avise e ofereca voltar a essa fase.

## Processo

1. Partir da especificacao aprovada e das constraints (WSL, Docker, DBs, linguagens).
2. Se houver **Postgres / schema**: consultar skill **`modelagem-dados`** e tipar colunas no design (`uuid`, `varchar(n)`, `TEXT` só quando couber).
3. Oferecer **ate 2 abordagens** + **1 recomendacao** com trade-offs honestos.
4. Entregar o system design no formato abaixo (**completo**, nao simplorio — ver **Profundidade obrigatoria**).
5. Recortes de MVP **somente se o usuario pedir** ou a SPEC tiver fases explicitas; senao foque **so nesta entrega**.
6. Aprovar com **`AskQuestion`** — prompt: `O system design esta ok para implementar?`
   - `Sim, seguir para desenvolvimento` | `Ajustar design` | `Outro (eu digito)`
   - Se `AskQuestion` indisponivel: mesmas opcoes em prosa curta.

## Proibição (nao aceitar design “magro” nestes pontos)

**Proibido** entregar:

- Modelo de dados so com “entidades principais” em uma linha.
- Fluxos so com uma tabela `Fluxo | GET /algo` incompleta.
- API como “endpoints principais: produtos, chamados…” sem catalogo.
- Validacao de arquitetura com 4–5 checks genericos (“alinhado SPEC”, “stack ok”).

Se a entrega tiver API e/ou persistencia, as secoes **5, 6, 7 e validacao** devem estar no **nivel de detalhe** do padrao abaixo (como em `clamed.dev/docs/arquitetura/ARCH-001.md` v0.2+).

**Melhor omitir** uma secao de API do que fingir um “resumo” de rotas. Se houver API: catalogo completo da entrega.

---

## Formato de saida (system design)

```markdown
## 1. Contexto e objetivos
- problema, metas, NFR (performance, seguranca, observabilidade se relevante)

## 2. Recomendacao e alternativas
- recomendada + por que
- alternativa descartada + trade-offs

## 3. Visao de sistema
- diagrama textual (caixas e setas) ou mermaid
- fronteiras: frontend / backend / scripts / workers / externos
- o que cada caixa FAZ e NAO faz

## 4. Componentes e responsabilidades
- cada servico/modulo e o que NAO faz

## 5. Modelo de dados  ← DESTACAR (obrigatorio se houver DB)
### 5.1 Entidades e relacionamentos
- diagrama textual/mermaid com cardinalidades (1:N, N:N, 1:1)
### 5.2 Constraints / enforcement das RNs
- CHECK, UNIQUE, FKs, transacoes (ex.: operacao multi-tabela)
### 5.3 Atributos criticos por tabela/colecao
- tabela: campos minimos de cadastro (nao so nome da entidade)
- escolha de DB e onde fica consistencia

## 6. Fluxos de negocio no sistema  ← DESTACAR (obrigatorio)
- Um fluxo por US/RF/VAL relevante da SPEC (F1, F2, …)
- Cada fluxo: passos UI → API/comando → regras/erros → persistencia → resposta
- NAO reduzir a uma linha HTTP; HTTP entra no passo, nao substitui o fluxo

## 7. API / contratos  ← DESTACAR (obrigatorio se houver API)
### 7.1 Catalogo de rotas (ou mensagens) da ENTREGA
- tabela: Recurso | Metodo | Rota | Uso (cadastro/consulta/acao)
- cobrir TODOS os recursos desta entrega (CRUD + acoes especiais)
### 7.2 Auth, formato de erro, versionamento
- prefixo, headers, shape `{ code, message }`, codigos alinhados a SPEC
- OpenAPI/contrato: obrigatorio na implementacao se houver API REST
- Se nao houver API (CLI/batch): descrever invocacao/IO com o mesmo rigor

## 8. Infra
- Caminho oficial de subir o ambiente (preferir Docker Compose `build` + `up` quando houver app+servicos)
- servicos, portas, volumes, redes, env, healthcheck
- WSL quando aplicavel
- Nao deixar “compose opcional” se o usuario/SPEC exigir Compose

## 9. Estrutura de pastas / branch
- layout do repo
- branch feat/fix ja aberta na especificacao

## 10. Riscos e decisoes abertas
- o que ainda pode mudar o design
- Duvidas a esclarecer (PowerBuilder se aparecer)

## 11. Plano de implementacao
- ordem sugerida + skills especialistas + encaixe VAL/testes

## 12. Validacao de arquitetura  ← DESTACAR (obrigatorio, checklist)
Checklist acionavel para o usuario aprovar. Incluir no minimo (quando couber):

### 12.1 Modelo de dados
- [ ] Tabelas/colecoes listadas com campos
- [ ] Cardinalidades e FKs
- [ ] Constraints das RNs criticas
- [ ] Transacoes nas operacoes multi-write

### 12.2 Cadastros (write)
- [ ] Cada entidade cadastravel da entrega tem operacao de escrita no design

### 12.3 Consultas (read)
- [ ] Listagens/filtros/detalhes necessarios as telas e VALs

### 12.4 Rotas / contratos
- [ ] Catalogo completo (nao resumo)
- [ ] Codigos de erro alinhados a SPEC
- [ ] Auth/versionamento/health

### 12.5 Fluxos SPEC
- [ ] Cada US/VAL principal tem fluxo F# correspondente

### 12.6 Infra
- [ ] Comando oficial de subida documentado
- [ ] Servicos, portas, volumes, seed/boot

### 12.7 Escopo
- [ ] So esta entrega (ou fases explicitas da SPEC)
- [ ] Fora de escopo respeitado
```

Secoes **5, 6, 7 e 12** sao o padrao de qualidade exigido. Referencia de bom exemplo: monorepo/docs de arquitetura no estilo ARCH-001 do clamed.dev (fluxos F1–Fn, catalogo de rotas em tabela, modelo 5.1–5.3, checklist 12.x).

---

## Apps desktop (C++)

Quando o alvo for aplicativo desktop:

- Tratar C++ neste espaco de arquitetura (nao ha skill `cpp` dedicada ainda).
- No system design, acrescentar bloco **Apps desktop** cobrindo:
  - plataforma alvo (preferir Linux/WSL; se Windows for inevitavel, declarar e justificar)
  - UI toolkit / framework escolhido e alternativas
  - build (CMake ou padrao do repo), packing e como rodar
  - integracao com backend/DB (Postgres/Sybase/Mongo) se houver
  - fronteira com `backend` / `script` / `mcp` quando o desktop for so cliente
- Encaminhamento tipico apos aprovacao: implementar sob o plano desta skill → `review` (e `backend`/`script` se houver servicos auxiliares).
- Modelo de dados / “contratos” (IPC, arquivos, API) seguem a mesma **Proibicao**: detalhar ou omitir, nunca resumir genérico.

## Duvidas (por enquanto)

Nao existe skill especialista para estes itens. Se surgirem no pedido, **so perguntar / registrar em decisoes abertas** — nao inventar padrao completo:

- **PowerBuilder** — esclarecer: legado vs novo, versao, DB alvo, se e so manutencao pontual ou redesenho; aguardar decisao do usuario antes de propor stack paralela.

## Preferencias

- Linux/WSL; **Docker Compose** (`build` + `up`) como caminho oficial quando houver multiplos processos
- Limites claros entre frontend, backend e scripts
- Completo o suficiente para implementar sem surpresas; sem over-engineering gratuito
- Se houver consulta inteligente a dados/docs: decidir explicitamente RAG (`rag`), MCP (`mcp`), SQL/API ou hibrido — nao misturar sem desenho
- Se for SAP: encadear `fiori` + `ui5` + `abap` (nao usar `frontend`/`backend` genericos para isso)
- Se for desktop C++: secao **Apps desktop** acima
- PowerBuilder: apenas em **Duvidas**, ate haver skill propria
- No plano de implementacao, nomear explicitamente quais skills especialistas entram em cada passo

## Encaminhamento pos-aprovacao

Apos o usuario aprovar o design, a **proxima fase do orquestrador e Desenvolvimento** (skills especialistas), depois `review` → `teste-regra-negocio` → `teste-automatizado` → `documentacao`.

Ordem tipica na implementacao:
- Web tipico: `backend` → `frontend` / `ui5` → `script`
- Dados para agent: `mcp` e/ou `rag`
- SAP: `fiori` → `abap` → `ui5`
- Desktop C++: implementacao alinhada ao design desta skill

Nao pular code review nem as fases de teste.
