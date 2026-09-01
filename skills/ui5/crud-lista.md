# Padrão obrigatório — telas CRUD (lista + ações)

Referência canônica para apps **UI5 freestyle** e **Fiori** (Elements ou freestyle). Toda tela de consulta/CRUD nova ou refactorada deve seguir isto. Exemplo vivo: `clamed.dev` → tela **Produtos**.

## 1. Navegação / menu

- **Um** item de menu por entidade → abre a **lista**.
- **Não** criar item separado “Cadastro de X” / “Novo X” no menu lateral.
- Criar / editar / ativar / inativar acontecem **na lista** (dialog, fragment ou Object Page), não em rota de menu paralela.
- Rota antiga de “cadastro” (se existir) deve **redirecionar** para a lista.

## 2. Cabeçalho da página

- Título da tela **maior** e com peso visual claro (ex.: classe `clamedPageTitle` / estilo de H2 reforçado).
- Texto de apoio (lead) logo abaixo: cor **teal** ou **cinza escuro** — legível; evitar cinza claro demais.
- **Não** repetir o mesmo título na toolbar da tabela.

## 3. Filtros

- Barra de filtros **separada** e **acima** do container da lista (mesmo alinhamento de margem horizontal).
- Filtros típicos de cadastro mestre:
  - texto **contém** (`%nome%`)
  - texto **contém** (`%descrição%` / campos longos equivalentes)
  - responsável / FK relevante (com opção “Todos”)
  - situação: **Ativo** (padrão ao abrir) | **Inativo** | **Todos**
- Filtrar no client ou no servidor; o comportamento UX é o mesmo.

## 4. Lista / container

- Aplicar **margem lateral** para a lista “respirar”.
- **Não** embrulhar a tabela branca em outra caixa com borda/sombra/radius próprio (evita “box no box” / cinza em volta do branco).
- **Sem** botão “Atualizar” — refresh do browser basta.
- Status **Ativo** → verde (`Success`); **Inativo** → vermelho (`Error`).
- Toolbar da lista: spacer + ação de cadastrar (se permissão), sem título redundante.

## 5. Ações na linha e no cadastro

- Botões de ação: **somente ícone**, com **tooltip obrigatório** (acessibilidade + clareza).
  - Cadastrar: `sap-icon://add` — tooltip “Cadastrar …”
  - Editar: `sap-icon://edit` — “Editar”
  - Inativar: `sap-icon://stop` (ou equivalente) — “Inativar”
  - Ativar: `sap-icon://play` (ou equivalente) — “Ativar”
- **Inativar** e **Ativar** ocupam o **mesmo lugar** na linha (um ou outro conforme o status atual).
- Exclusão lógica: **não** rotular como “Excluir”; usar Ativar/Inativar (cadastros mestre Ativo/Inativo).
- Dialog/form de criar/editar: **sem** campo Situação — situação só pelos botões Ativar/Inativar.
- Novo registro nasce **Ativo**.

### Menu ⋮ (overflow) — obrigatório quando > 3 ações

- Contar **todas** as ações possíveis da linha (ativas **e** inativas / desabilitadas). Se o total for **maior que 3**, não espalhar ícones: usar **um** botão `MenuButton` com ícone `sap-icon://overflow` (três pontinhos / overflow), tooltip “Ações”.
- O menu lista **todas** as ações; as indisponíveis no momento aparecem **desabilitadas** (`enabled=false`), **não** ocultas.
- Exemplo: Visualizar | Histórico | Editar | Excluir → overflow; Editar | Ativar | Inativar (≤3) → ícones diretos ok.
- Em freestyle UI5: `MenuButton` + `Menu` + `MenuItem` (`itemSelected` → despachar a ação com o binding context da linha).

## 6. Permissões

- Respeitar ACL da tela: visualizar / salvar / excluir.
- **Excluir** (ou equivalente) governa Ativar/Inativar; **Salvar** governa criar/editar.
- Esconder botões sem permissão **e** validar na API — nunca só “esconder botão”.

## 7. Fiori Elements (quando aplicável)

- Floorplan base: **List Report** (+ Object Page se necessário).
- Selection variant / filtro inicial: situação = Ativo.
- Substituir Delete padrão por ação custom **Inativar** / **Ativar** (ou anotar soft-delete conforme backend).
- Create/Edit sem campo de status editável se o status for controlado pelas ações acima.
- Manter tooltips/textos i18n nas actions.

## 8. Checklist DoD (CRUD lista)

- [ ] Menu só com lista; sem “cadastro” paralelo
- [ ] Cabeçalho: título maior + lead legível; sem título duplicado na tabela
- [ ] Filtros separados; situação padrão Ativo
- [ ] Lista só com margem; sem caixa dupla
- [ ] Sem botão Atualizar
- [ ] Ícones + tooltips; Ativar/Inativar no mesmo slot
- [ ] Se > 3 ações na linha → MenuButton ⋮; indisponíveis desabilitadas (não ocultas)
- [ ] Situação fora do form de editar
- [ ] Inativo em vermelho; Ativo em verde
- [ ] ACL UI + API alinhadas

## 9. Cor de tipo (quando a entidade/consulta tiver cor)

Aplicar quando o cadastro ou a consulta exibir **cor de tipo** (PBI, task, GMUD, etc.). Fonte canônica no `clamed.dev`: `webapp/model/TipoVisual.js`.

### 9.1 Faixa / gradiente na linha da lista

- Usar **`TipoVisual.paintListItemBorder(listItem, cor)`** (não inventar CSS paralelo).
- Defaults: faixa inset `0.55rem` + wash `linear-gradient` com alpha `hex+33` até transparente em `45%`.
- Ligar via `updateFinished` da `Table` (reaplica após re-render / growing).
- Sem cor → limpar pintura (sem inventar cor padrão).
- A wash é **clara**: **não** alterar a cor da fonte da célula (permanece o tema / negrito cinza).

### 9.2 Título do diálogo de visualizar / detalhe

- Usar **`TipoVisual.paintDialogTitle(dialog, cor)`** no open (e ao trocar tipo no form, se aplicável).
- Fundo do header = cor sólida do tipo; texto e botão fechar = contraste.
- **`contrastText`:** luminância relativa WCAG ≤ **0.42** → fonte **`#FFFFFF`**; acima → **`#111111`**.
  - Ex.: `#27AE60` / `rgb(39, 174, 96)` → branco (verde médio/forte).
- Ao limpar a cor (tipo sem cor / Nova sem tipo): limpar **os mesmos seletores** pintados (incl. `.sapMTitle` aninhados) — evitar `color` inline stale.
- Ícone colorido na célula (se houver) **permanece**; faixa e título são aditivos.

### 9.3 Checklist extra (cor)

- [ ] Lista: `paintListItemBorder` via `updateFinished`; sem CSS paralelo de faixa
- [ ] Dialog de consulta/detalhe: `paintDialogTitle` + `contrastText` (limiar 0.42)
- [ ] Sem cor: limpeza simétrica dos estilos inline do título
- [ ] Fonte da célula da lista **não** forçada pela wash
- [ ] Form Novo/Editar da entidade-mestre: só pintar título se a SPEC pedir (ex.: visualizar tasks sim; editar PBI pode ficar fora)

