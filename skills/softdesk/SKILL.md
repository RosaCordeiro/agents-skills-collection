---
name: softdesk
description: >-
  Abre chamados no SoftDesk via MCP user-softdesk com texto consistente para o
  próprio usuário. É crítico: pergunta o que falta, separa fato de hipótese e
  cruza PB/Sybase quando o assunto é tela/pedido/NF. Tipos: incidente, causa
  raiz, projeto, melhoria. Use when the user asks abrir chamado, SoftDesk,
  criar_chamado, reportar bug, incidente, causa raiz, projeto, melhoria, ou /softdesk.
---

# SoftDesk — abrir chamado (para mim)

Responda em português. MCP **`user-softdesk`**. Tools reais: `criar_chamado`, `consultar_chamado`, `pesquisar_chamados_abertos`, `listar_*`, `buscar_usuario`, `listar_tipos_chamado`, `listar_clientes`, etc. Não inventar nome de tool.

O usuário está com preguiça de escrever. Extraia o que ele já disse, **seja crítico** ([critico.md](critico.md)): pergunte o que muda o diagnóstico, cruze PB/Sybase se houver tela/pedido, monte o HTML e abra **depois do ok**. IDs em [defaults.md](defaults.md).

## Tipos (obrigatório)

| Tipo interno | Quando |
|--------------|--------|
| **incidente** | Bug, falha, comportamento errado, urgência operacional. Report para corrigir. |
| **causa-raiz** | Investigar *por que* aconteceu; 5 porquês / evidência; não é o patch em si. |
| **projeto** | Entrega maior, várias frentes, prazo, escopo. |
| **melhoria** | Evolução de algo que já funciona; sem incidente. |

Se o pedido for ambíguo: **um** `AskQuestion` com essas quatro opções. Se estiver óbvio (ex. “deu erro na tela X”), não pergunte.

Um chamado = um tipo. Incidente + causa raiz = **dois** chamados (ou incidente agora e causa raiz depois), não misturar modelos.

Consulta pontual PB/Sybase (cor, status, um pedido na homolog): **neste chat**, ver [critico.md](critico.md). Spec/mock/DOCX para outro dev: `/pb-sybase` se o usuário pedir.

## Solicitante e área (não perguntar)

Ler [defaults.md](defaults.md). Sempre:

- `usuario` **1276** (solicitante Guilherme da Rosa Cordeiro). **Não** usar 393 aqui — 393 solicitante é a filial 0745.
- `atendente` **393** (mesmo Guilherme, catálogo de atendentes); ele encaminha depois se precisar.
- `area` **34** (TI - Desenvolvimento).

Não perguntar área nem atendente. Não usar matrícula `995670` como login SoftDesk. `tipo_chamado` pela tabela de defaults. `listar_*` só se o default falhar na API.

**Descrição em HTML**, nunca Markdown. Modelos em [modelos.md](modelos.md).

## Fluxo

1. Classificar o tipo (AskQuestion se ambíguo).
2. Ser crítico: [critico.md](critico.md) + checklist [modelos.md](modelos.md). Perguntar o que falta; cruzar PBG/Sybase se for tela/pedido/NF.
3. Duplicidade: `pesquisar_chamados_abertos` com `usuario` **1276**. Payload enorme — não despejar no chat; se travar, pular.
4. Rascunho: **Tipo**, **Título**, **Descrição (HTML)**, payload (`usuario` 1276, `atendente` 393, `area` 34, `servico` 231, `prioridade` 18 salvo o usuário mudar, `nivel_indisponibilidade` 4, `tipo_chamado`).
5. Esperar ok explícito.
6. `criar_chamado` com esses campos + HTML. Sem `enviar_email_abertura` salvo pedido.
7. Se `atendente` vier vazio: `editar_chamado` com 393 (+ serviço/prioridade/impacto se faltarem).
8. Devolver o **código**. Conferir `objeto.usuario.nome` = Guilherme da Rosa Cordeiro. Se a API voltar `null`, reportar falha.

Título: uma linha, verbo + objeto, sem número de chamado, sem “urgente” no título (prioridade é campo).

Descrição: HTML dos modelos; frases curtas; nomes reais de tela/tabela/serviço; sem jargão de MCP/agent; **sem Markdown**.

## MCP indisponível

`namespaceStatus` `error` / `needsAuth` / timeout: não abrir. Pedir para recarregar o MCP `softdesk` no Cursor (`https://mcp-servicedesk.clamed.com.br/mcp`). Texto do rascunho pode ficar pronto no chat para colar depois.

API: 60 req/min. Não chamar todos os `listar_*` de uma vez sem necessidade.

## Fronteiras

| Assunto | Onde |
|---------|------|
| Abrir/consultar chamado SoftDesk | esta skill / `/softdesk` |
| Dado pontual tela/pedido (PBG + homolog) | neste chat ([critico.md](critico.md)) |
| Spec PB + mock + DOCX | `/pb-sybase` |
| Encerrar / atividade / mudar status | só se o usuário pedir; `registrar_atividade` |
| Chamado em nome de outro | só com pedido explícito + `buscar_usuario` da outra pessoa |
