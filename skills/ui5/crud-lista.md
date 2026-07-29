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
- Exclusão lógica: **não** rotular como “Excluir”; usar Ativar/Inativar.
- Dialog/form de criar/editar: **sem** campo Situação — situação só pelos botões Ativar/Inativar.
- Novo registro nasce **Ativo**.

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
- [ ] Situação fora do form de editar
- [ ] Inativo em vermelho; Ativo em verde
- [ ] ACL UI + API alinhadas
