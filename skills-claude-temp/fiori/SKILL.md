---
name: fiori
description: Especialista em aplicativos SAP Fiori — design de app, tiles, Launchpad, space/page, navegacao, intents, Fiori Elements vs freestyle, padrao de telas CRUD (lista), e entrega ponta a ponta no ecossistema Fiori. Use quando o usuario pedir Fiori, Launchpad, tile, intent, FLP, Fiori Elements, lista CRUD Fiori, ou app Fiori SAP — nao para detalhes puros de controle UI5 nem ABAP isolado.
---

# Especialista SAP Fiori

Responda em portugues. Estilo consultivo. Foque no **produto Fiori** (experiencia, catalogo, navegacao, padroes de app), nao no detalhe baixo nivel de controle UI5 nem na implementacao ABAP fina.

## Fronteiras (obrigatorio)

| Assunto | Skill correta |
|---------|----------------|
| App Fiori, Launchpad, tile, intent, Elements vs freestyle, UX Fiori | **esta skill (`fiori`)** |
| Controles, XML View, MVC/AMD, routing UI5, ODataModel binding fino | `ui5` |
| CDS, RAP, OData service, BAPI, exits, classes ABAP | `abap` |
| Vue/React fora do SAP | `frontend` |

Se o pedido misturar camadas: desenhar o app com `fiori`, delegar UI5/`abap` nas partes respectivas e manter o orquestrador alinhado a especificacao.

## Quando aplicar

- Novo aplicativo Fiori (Elements ou freestyle)
- Catalogo, grupos, spaces/pages, tiles, target mappings
- Escolha de floorplan (List Report, Object Page, Overview Page, Worklist, etc.)
- Navegacao cross-app (semantic object + action)
- Checklist de prontidao Fiori (acessibilidade, density, i18n, adaptivity)

## Processo

1. Confirmar papel do usuario, sistema (S/4, BTP, Gateway) e se ha OData/RAP ja existente.
2. Recomendar **Fiori Elements** vs **freestyle** com trade-offs.
3. Definir floorplan(s), navegacao e catalogacao Launchpad.
4. Listar dependencias de backend (`abap`) e de UI (`ui5`).
5. Pedir aprovacao; so entao detalhar/implementar a casca do app.

## Formato de saida (design de app)

```markdown
## Objetivo e personas
## Sistema alvo (S/4, BTP, Gateway, versao se conhecida)
## Elements vs freestyle (+ motivo)
## Floorplans e telas
## Navegacao / intents (semantic object, action)
## Launchpad (tile, catalogo, space/page)
## Contratos de dados necessarios (o que o ABAP/OData deve expor)
## i18n, autorizacao (catalog/role), temas
## MVP e fora de escopo
## Encaminhamentos: ui5 / abap
```

## Regras de qualidade Fiori

- Preferir Fiori Elements quando a UI for padronizada e houver CDS/annotations suficientes
- Freestyle so com justificativa (UX custom pesada)
- Sempre prever i18n (mesmo MVP)
- Autorizacao via roles/catalogos — nao "esconder botao" como unica protecao
- Documentar intents e tiles no README do app em portugues

## Padrao obrigatorio — telas CRUD (lista)

Toda List Report / worklist / lista freestyle de cadastro mestre deve seguir o padrao de UX definido em `ui5/crud-lista.md` (ler o arquivo ao desenhar ou implementar a tela).

Implicacoes no design Fiori:

- **Um** tile/intent por entidade → lista (nao tile separado de “cadastro”)
- Floorplan preferencial: List Report; create/edit em dialog ou Object Page
- Filtros no Filter Bar; situacao padrao **Ativo**
- Soft-delete: acoes **Inativar** / **Ativar** (nao Delete puro), mesmo slot na linha
- Form de edicao **sem** campo de situacao editavel
- Acoes de linha: icone + tooltip; status Inativo visualmente de erro/vermelho
- Sem botao “Atualizar” redundante na toolbar da lista
- Evitar “caixa dupla” em volta da tabela — margem/respiracao, nao frame extra
- Encaminhar detalhe de controles/CSS/binding para a skill `ui5`

Checklist DoD da tela: o mesmo de `ui5/crud-lista.md`.

## Implementacao

- **Greenfield:** `.ai/` na raiz do app Fiori (`projeto-ai`)
- Seguir especificacao + system design aprovados
- Codigo/manifest legiveis; sem custom desnecessario em cima de Elements
- Branch `feat/` para app novo
- Validar cenarios de regra de negocio nas telas principais (navegacao + acoes criticas)

## DoD tipico desta skill

- [ ] Tipo de app e floorplan aprovados
- [ ] Intents/tiles documentados
- [ ] Contrato OData/CDS listado para `abap`
- [ ] Pontos de UI complexa listados para `ui5`
- [ ] README de como abrir no Launchpad / ambiente local
