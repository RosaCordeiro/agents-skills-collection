---
name: seguranca-si
description: >-
  Guardrail de Seguranca da Informacao para toda aplicacao nova ou alterada da
  CLAMED: checklist SI-1 a SI-8 (desenho, autenticacao, segredos, API e dados,
  pre-validacao local, ambientes, logs, go-live) com status OK, N/A ou
  PENDENTE; PENDENTE bloqueia o deploy sem aceite registrado da SI. Use ao
  especificar, desenhar, implementar, revisar, testar, auditar ou encerrar
  qualquer entrega de codigo, API, script com servidor, MCP ou integracao.
claude-model: sonnet
---

# Seguranca da Informacao (guardrail obrigatorio)

Toda aplicacao nova ou alterada passa pelo checklist da SI **antes do deploy em
producao**. O checklist completo, com os itens numerados, esta em
[checklist.md](checklist.md). Referencias da SI: OWASP API Security Top 10
(2023), OWASP Top 10, OWASP ASVS, NIST SSDF (SP 800-218) e LGPD.

## Regra

- Cada item recebe um status: `OK` | `N/A` (com justificativa de uma linha) |
  `PENDENTE`.
- **`PENDENTE` bloqueia o deploy**, salvo aceite registrado da SI.
- `OK` so com evidencia: trecho de codigo, arquivo de config, saida de comando
  ou resultado de teste. Nunca por suposicao nem por "o projeto costuma fazer".
- `N/A` so quando o item nao se aplica de fato (ex.: CORS em CLI sem HTTP).
  Justificativa obrigatoria; na duvida, `PENDENTE`.
- Ferramenta que nao pode rodar (Trivy ausente, sem rede) = `PENDENTE` com o
  motivo. Nao vale como `OK`.

## Aceite da SI

- Somente a Seguranca da Informacao aceita um `PENDENTE`. O agente **nunca**
  aceita por conta propria, nem troca `PENDENTE` por `N/A` para liberar o fluxo.
- Aceite registrado = nome de quem na SI aceitou, data e referencia (chamado ou
  e-mail), informados pelo usuario. Gravar no relatorio, no item aceito.
- Sem aceite registrado, o item continua `PENDENTE` e o deploy segue bloqueado.
- Em duvida sobre o que a SI exige, o contato e `csi@clamed.com.br`.

## Relatorio

Gravar `SEGURANCA-SI.md` ao lado da SPEC e do ARCH da entrega (mesma pasta),
atualizado a cada fase. Formato:

```markdown
# Validacao SI — <entrega>

| Item | Status | Evidencia ou justificativa | Aceite SI |
|------|--------|----------------------------|-----------|
| SI-2.1 | OK | filtro do hub no roteador raiz (`src/...`), teste de contrato | — |
| SI-5.1 | PENDENTE | Trivy indisponivel no ambiente | — |

Resumo: <n> OK, <n> N/A, <n> PENDENTE (<n> com aceite).
Deploy: liberado | bloqueado (itens: ...)
```

## Relacao com `autenticacao-api`

SI-2 (autenticacao e autorizacao) e implementado pelo time com a skill
`autenticacao-api`: Bearer do hub validado por introspeccao, permissao `SC`,
lista fechada de rotas abertas e teste de contrato. Seguir `autenticacao-api`
para o **como**; este checklist cobre o **o que a SI cobra**. Se a SI exigir
validacao local de JWT (assinatura, `exp`, `iss`, `aud`) em vez de introspeccao,
e decisao do usuario com a SI, registrada na spec e no ARCH; o agente nao
decide sozinho.

## Onde cada fase aplica

| Fase / skill | O que fazer |
|--------------|-------------|
| `descoberta` | Levantar responsaveis, dados tratados, integracoes e exposicao (SI-1) |
| `especificacao` | RNF de seguranca: classificacao dos dados, integracoes (leitura ou escrita), exposicao, perfis (SI-1, SI-2) |
| `arquitetura` | ARCH §7.2 e §12.4: auth, CORS, erros, paginacao, segredos, ambientes (SI-2 a SI-4, SI-6) |
| `backend` / `frontend` / `script` / `implementador` | Implementar sem segredo em codigo, CORS restrito, query parametrizada, erro sem detalhe interno (SI-3, SI-4) |
| `review` (CR4 a CR6) | Reprovar item de SI-2 a SI-4 e SI-6 violado no diff |
| `teste-automatizado` | Pre-validacao local (SI-5) com evidencia; testes de rota sem token e com token falso (SI-8) |
| `auditor` (V14 a V16) | `FAIL` em segredo, auth ou injecao; conferir o relatorio `SEGURANCA-SI.md` |
| `documentacao` | Rotas abertas, integracoes e responsavel documentados; Backstage (SI-7) |
| Encerramento da entrega | Relatorio sem `PENDENTE` sem aceite; so entao `pronto_para_deploy` (ver gate abaixo) |

## Gate antes do deploy

Antes de mover o card para `pronto_para_deploy` ou declarar a entrega pronta:

1. Reler `SEGURANCA-SI.md` e conferir cada item contra o estado atual do codigo.
2. Qualquer `PENDENTE` **de pre-deploy** sem aceite: **parar**, mostrar a lista
   ao usuario e nao avancar. As opcoes sao corrigir, ou o usuario obter o
   aceite da SI e informar os dados.
3. Itens de **go-live** (SI-6.3 HTTPS, SI-7.1 monitoramento, SI-8.1 a SI-8.4)
   so se verificam com a aplicacao no ar. Ficam `PENDENTE (go-live)`, **nao**
   bloqueiam o `pronto_para_deploy`, e vao como lista de verificacao pos-deploy
   para a tarefa GMUD e para o infografico de encerramento. Eles bloqueiam a
   **divulgacao** da aplicacao: so dar o go-live por feito depois de rodados e
   de a SI fazer o reteste. Em duvida se um item e de go-live, ele e de
   pre-deploy.
4. Entrega nova, ou alteracao que muda exposicao, autenticacao ou dados
   pessoais: propor o chamado para a SI fazer o reteste (SI-8). O agente
   redige o texto; abrir o chamado so com confirmacao do usuario (skill
   `softdesk`).

## Limites

- Teste de rota so contra o ambiente que o usuario indicou, e so GET. Rotas
  POST, PUT e DELETE sao confirmadas pelo time de desenvolvimento por leitura
  do codigo e do teste de contrato, sem teste destrutivo.
- Nunca copiar segredo, token ou string de conexao para o relatorio, para o
  chat ou para log. Citar so o nome da variavel e o arquivo.
- Em homologacao, nao usar dado real de producao sem autorizacao da SI. Antes
  de subir qualquer servico com `.env` copiado de outro repositorio, conferir
  para onde ele aponta (host, porta e nome do banco, nunca a senha).
- Esta skill nao substitui o pipeline do DevOps: o que o pipeline bloquear
  continua valendo, e achado que nao puder ser corrigido e alinhado com o
  DevOps e a SI.
