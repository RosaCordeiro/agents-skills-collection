# Defaults SoftDesk (produção)

MCP: `https://mcp-servicedesk.clamed.com.br/mcp` (`softdesk`).

## Perfil por usuário (fora do plugin)

Os códigos de solicitante e atendente são **de cada pessoa**. Esta skill não os
traz. Ela lê o perfil do usuário em `~/.claude/softdesk-perfil.md` (no Windows,
`%USERPROFILE%\.claude\softdesk-perfil.md`). Modelo: [perfil-modelo.md](perfil-modelo.md).

Se o arquivo não existir:

1. `buscar_usuario` pelo login ou e-mail do usuário (perguntar o login) para achar o `usuario` (solicitante).
2. `listar_atendentes` e filtrar pelo nome para achar o `atendente`.
3. Mostrar os valores achados, pedir confirmação e **oferecer** gravar o perfil
   a partir do modelo. Só gravar com o ok do usuário.

Nunca usar o código de outra pessoa. Nunca copiar o perfil para o repositório
nem para o plugin.

**Catálogos diferentes:** `usuario` (solicitante) ≠ `atendente`. O mesmo número
**não** serve nos dois campos (o número do atendente, no catálogo de solicitante,
pode ser uma filial). Depois de `criar_chamado`, conferir se `objeto.usuario.nome`
é o do usuário; se vier filial/loja, o `usuario` estava errado.

Campos do perfil: `usuario`, `atendente`, `area`, `categoria`, `servico`,
`prioridade`, `nivel_indisponibilidade`. Não perguntar área nem solicitante a
cada chamado. Perguntar **categorização** (padrão do perfil vs outra).

## Tipo interno → `tipo_chamado`

Códigos do catálogo (iguais para todos; conferir com `listar_tipos_chamado` se a API recusar).

| Tipo do agent | SoftDesk | `tipo_chamado` |
|---------------|----------|----------------|
| incidente / report de bug | Incidente | **12** |
| causa raiz | Análise | **57** |
| projeto | Desenvolvimento | **58** |
| melhoria | Melhoria | **16** |

Exceções se o usuário pedir o nome exato: Correção do Sistema=44, Melhoria Planejada=71, Projeto CEM=50, Incidente Recorrente=68.

## Corpo do chamado e da atividade = HTML

A UI do SoftDesk **não** interpreta Markdown. `descricao` (e a atividade) vai em **HTML** simples: `<p>`, `<br>`, `<b>` ou `<strong>`, `<ol>`/`<li>`, `<ul>`/`<li>`. Sem `##`, sem `**`, sem listas `- `.

No rascunho do chat, mostrar o HTML que será enviado (ou o texto já com quebras visíveis **e** o HTML).

## Duplicidade

`pesquisar_chamados_abertos` com o `usuario` do perfil. A resposta pode ter **vários MB**. Não colar o JSON no chat. Procurar título/pedido no arquivo de saída. Se a tool travar o turno, pular a busca e avisar.

**Nunca** usar `pesquisar_chamados_avancado`: ela exige usuário e senha do SoftDesk, e senha não entra no chat.

## Serviço, prioridade e impacto

Vêm do perfil. Mandar no `criar_chamado`. Se `atendente` vier vazio, `editar_chamado` com o do perfil (+ serviço/prioridade/impacto). Se o impacto for NF/filial/parada, perguntar Média vs Alta antes de abrir.

## Categoria (padrão do perfil — confirmar antes de abrir)

Sempre mandar `categoria` no `criar_chamado` (e no `editar_chamado` se vier vazio).

**Antes do rascunho final**, um `AskUserQuestion`: usar o padrão do perfil ou outra categoria/atendente? Se o usuário já disser "padrão", não repetir.

Se escolher **outra categoria**: `listar_categorias` e filtrar pelo texto (área do perfil). Não chamar o catálogo inteiro no chat.

Se escolher **outro atendente**: `listar_atendentes` ou `buscar_usuario` pelo nome/login. Manter o `usuario` do perfil salvo pedido explícito de abrir em nome de outro.

## Não setar sem pedido

`cliente`, `grupo_solucao`, `enviar_email_abertura`.
