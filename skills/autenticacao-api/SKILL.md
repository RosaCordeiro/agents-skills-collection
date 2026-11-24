---
name: autenticacao-api
description: >-
  Regra obrigatoria de autenticacao para toda API, rota HTTP, WebSocket ou MCP
  HTTP que devolve dado de negocio ou dado pessoal: Bearer do hub validado por
  introspeccao, permissao por procedimento do sistema SC, lista fechada de
  excecoes e teste de contrato. Use ao especificar, desenhar, implementar,
  revisar ou auditar qualquer API (backend, script com servidor HTTP, MCP).
claude-model: sonnet
---

# Autenticacao de API (regra obrigatoria)

Nenhuma API nasce aberta. **Toda rota exige autenticacao**, exceto as da lista
fechada abaixo. Nao e preciso classificar o dado: na duvida, autentica. Vale
para dado de negocio e para dado pessoal de qualquer pessoa (cliente, paciente,
colaborador, fornecedor).

## Padrao do time

- Header `Authorization: Bearer <token do hub>`. Token nunca na URL nem em query.
- O servico valida o token por **introspeccao no hub**. Config por ambiente:
  `HUB_URL`, `HUB_SISTEMA`, `HUB_SEGREDO` (nunca no codigo nem no git).
- Cache da validacao de **60 s**. **Falha fechada**: sem token ou token invalido
  = `401`; hub indisponivel = `503`. Nunca liberar a rota porque o hub caiu.
- O filtro e registrado **uma vez**, como primeira camada do modulo (ou no roteador raiz), antes de qualquer rota
  (fechado por padrao). Rota nova ja nasce protegida; nao repetir a checagem
  rota a rota. Ver `clean-architecture` (presentation).

## Permissao (sistema `SC`)

- Token valido e o minimo para toda rota.
- **Permissao por procedimento do sistema `SC`** e obrigatoria em rota que
  devolve **dado pessoal** e em toda rota que **escreve** (POST/PUT/PATCH/DELETE).
- A spec declara o procedimento de cada rota que o exige; sem procedimento
  cadastrado, a rota nao fecha.

## Excecoes (lista fechada)

Podem ficar abertas, sem dado de negocio nem pessoal na resposta:
`/health`, `/itsAlive`, `/metrics`.

Qualquer outra rota aberta exige **decisao do usuario**, registrada com motivo e
data na spec (RNF) e no ARCH (§7.2). Sem registro = reprovada. Nao inventar
excecao por conta propria, nem por "e so interno".

## Dados pessoais (LGPD)

- Dado pessoal fora de log e fora de URL/query (usar id opaco no caminho).
- Nao logar o token nem o corpo de resposta com dado pessoal.
- Resposta devolve so o campo necessario (minimizacao).

## Teste de contrato (obrigatorio)

Teste automatizado que lista **todas** as rotas registradas e falha se alguma
fora da lista de excecoes responder diferente de `401` sem token. A lista de
excecoes fica no proprio teste. Modelo: `test/autenticacao-rotas.spec.ts` do
repo `api_compras` (branch `fix/compras-exigir-token`, ate o MR ser mesclado).

## Onde cada fase aplica

| Fase / skill | O que fazer |
|--------------|-------------|
| `especificacao` | RNF de acesso: o que a API devolve, quem acessa, procedimento `SC`, excecoes pedidas |
| `arquitetura` | ARCH §7.2: filtro como primeira camada do modulo, hub, procedimentos por rota, excecoes registradas |
| `backend` / `clean-architecture` | Implementar o filtro e o teste de contrato; segredos so em env |
| `frontend` | Enviar o Bearer em toda chamada; token fora da URL |
| `review` (CR5) | Reprovar rota aberta fora da lista, token em URL, dado pessoal em log |
| `auditor` (V15) | `FAIL` se existir prefixo de rota sem filtro ou sem teste de contrato |
