# Defaults SoftDesk (produção)

> **Uso pessoal.** Os IDs abaixo (solicitante, atendente, matrícula) são fixos
> para o autor original desta skill. Se outro desenvolvedor clonar este
> repositório para usar o `/softdesk`, precisa **trocar os valores desta
> página pelos próprios** (nome, login, e-mail, `usuario`, `atendente`) antes
> de abrir qualquer chamado — do contrário os chamados saem em nome de outra
> pessoa.

MCP: `https://mcp-servicedesk.clamed.com.br/mcp` (`user-softdesk`).

Não perguntar área nem solicitante a cada chamado. Perguntar **categorização** (padrão vs outra). Atendente padrão 393; mudar só se o usuário escolher.

**Catálogos diferentes:** `usuario` (solicitante) ≠ `atendente`. O mesmo número **não** serve nos dois campos.

## Solicitante (sempre)

| Campo | Valor |
|-------|--------|
| Nome | Guilherme da Rosa Cordeiro |
| Login SoftDesk | `guilherme.cordeiro` |
| E-mail | `guilherme.cordeiro@clamed.com.br` |
| `usuario` (código do solicitante) | **1276** |
| Matrícula Windows | 995670 (não é login nem código SoftDesk) |

Confirmar com `buscar_usuario` (`login` `guilherme.cordeiro` ou e-mail). **Não** usar `393` em `usuario`: 393 no catálogo de solicitante é a filial **0745 - Pirabeiraba**.

## Atendente (sempre)

| Campo | Valor |
|-------|--------|
| `atendente` | **393** (Guilherme, catálogo de **atendentes**) |

Ele encaminha depois se quiser. Padrão; outro atendente só na pergunta de categorização.

## Área (sempre)

| Campo | Valor |
|-------|--------|
| Nome | **TI - Desenvolvimento** |
| `area` | **34** |

Não perguntar. Outras áreas (TI=1, TI-Infra=35, Operações e Suporte=47) só se o usuário pedir.

## Tipo interno → `tipo_chamado`

| Tipo do agent | SoftDesk | `tipo_chamado` |
|---------------|----------|----------------|
| incidente / report de bug | Incidente | **12** |
| causa raiz | Análise | **57** |
| projeto | Desenvolvimento | **58** |
| melhoria | Melhoria | **16** |

Exceções se o usuário pedir o nome exato: Correção do Sistema=44, Melhoria Planejada=71, Projeto CEM=50, Incidente Recorrente=68.

## Corpo do chamado = HTML

A UI do SoftDesk **não** interpreta Markdown. `descricao` (e atividade) vai em **HTML** simples: `<p>`, `<br>`, `<b>` ou `<strong>`, `<ol>`/`<li>`, `<ul>`/`<li>`. Sem `##`, sem `**`, sem listas `- `.

No rascunho do chat, mostrar o HTML que será enviado (ou o texto já com quebras visíveis **e** o HTML). Depois de `criar_chamado`, conferir `objeto.usuario.nome` = Guilherme da Rosa Cordeiro. Se vier filial/loja, o `usuario` estava errado.

## Duplicidade

`pesquisar_chamados_abertos` com `usuario` **1276** (não 393). A resposta pode ter **vários MB**. Não colar o JSON no chat. Procurar título/pedido no arquivo de saída. Se a tool travar o turno, pular a busca e avisar.

## Serviço, prioridade e impacto (sempre nestes chamados)

| Campo | Valor |
|-------|--------|
| `servico` | **231** SAP/Sybase |
| `prioridade` | **18** (3 - Média) |
| `nivel_indisponibilidade` (impacto na UI) | **4** Operação Normal |

Mandar no `criar_chamado`. Se `atendente` vier vazio, `editar_chamado` com 393 (+ serviço/prioridade/impacto). Prioridade 18 é o padrão; se o impacto for NF/filial/parada, perguntar Média vs Alta antes de abrir.

## Categoria (padrão — confirmar antes de abrir)

| Campo | Valor |
|-------|--------|
| Caminho na UI | **TI - Desenvolvimento → Software → Comercial/Estoque** |
| `categoria` | **241** |

Sempre mandar `categoria` no `criar_chamado` (e no `editar_chamado` se vier vazio).

**Antes do rascunho final**, um `AskQuestion`: usar o padrão acima ou outra categoria/atendente? Se o usuário já disser “padrão” / “default” / “Comercial Estoque”, não repetir a pergunta.

Subcategorias sob **241** (só se o assunto for óbvio e o usuário confirmar): Carga=243, Compras=152, Faturamento=244, Gerenciador de Notas Fiscais=305, Gerenciamento de Categorias=292, Gestão de Estoque=300, Licitação=245, Retaguarda Operacional=238, WMS=203. Na dúvida, ficar em **241**.

Se escolher **outra categoria**: `listar_categorias` e filtrar pelo texto (área 34 ou caminho `TI - DESENVOLVIMENTO.SOFTWARE`). Não chamar o catálogo inteiro no chat.

Se escolher **outro atendente**: `listar_atendentes` ou `buscar_usuario` pelo nome/login. Manter `usuario` **1276** (solicitante continua Guilherme) salvo pedido explícito de abrir em nome de outro.

## Não setar sem pedido

`cliente`, `grupo_solucao`, `enviar_email_abertura`.








