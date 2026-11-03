---
name: pb-padroes-clamed
description: >-
  Padrões de tela e de desenvolvimento CLAMED para PowerBuilder 12: fontes, cores,
  janelas herdadas, DW de seleção (ge058/ge558) e de lista (gc022), histórico,
  menu, permissão, check-out SVN, ORCA/PBG. Use ao criar ou ajustar tela, DW,
  menu ou objeto PB (pb-criar-objeto, pbg), ao revisar layout e quando o usuário
  disser padrão Clamed, layout errado, fonte errada ou /pb-padroes-clamed.
---

# Padrões de tela e desenvolvimento CLAMED (PowerBuilder 12)

Fonte: ajustes da GE678 (chamado 2439010, 27/10/2026; antes numerada GE677, número do chamado 2304998) comparados com a ge058, ge558 e gc022. Antes de desenhar tela nova, **abrir o DW de referência no snapshot** (`.pbg\snapshots\<pbl>\*.srd`) e copiar a geometria; não inventar. Tela nova só depois do mock HTML aprovado; depois de pronta, pedir print ao usuário (não dá para ver a tela daqui).

## 1. Regras visuais (valem para toda tela)

| Item | Padrão |
|---|---|
| Fonte | **Verdana** em tudo (DW, botões, group box). Nunca Tahoma/MS Sans Serif/Arial |
| Rótulos e cabeçalhos de coluna | Verdana `-8`, peso 400, cor `8388608` (azul escuro) |
| Células/campos (DW) | Verdana `-7`, peso 400, cor `0` (preto) |
| Botões (commandbutton) | Verdana `textsize = -8`, 311 x 100 (OK/Fechar/Cancelar) |
| Group box (`gb_1` Seleção, `gb_2` Lista) | Verdana `-8`, peso 700, `textcolor = 8388608`, `borderstyle = styleraised!` |
| Célula de dado | **sempre** `border="2"` (box) + `background.mode="2"` + `background.color="16777215"`. Somente leitura = `tabsequence=32766` com a mesma aparência |
| Cor de fundo da janela | herdada (`67108864`) |

Anti-padrões vistos: célula somente leitura com borda 0 e fundo transparente (os números "voam" e, na linha selecionada, o texto branco some); coluna em `-8` (fonte maior que o resto); botão de linha estreito que corta o texto ("Históricc"); DW de histórico solto, fora de group box.

## 2. DW de seleção (modelo `dw_ge058_selecao`, `dw_ge558_*`)

- `header(height=0)`, `detail(height≈250–316)`, linhas em `y = 8, 88, 168, 248` (altura 64).
- Rótulo: `alignment=1` (direita), `x=9`, `width=242`, Verdana -8 azul.
- Campo descrição (editável, `edit.case=upper`, tabsequence 10, 20, ...): `x=270`, `width=1202`.
- Campo código ao lado (somente leitura, `tabsequence=32766`, alinhado à direita): `x=1490`; **filial `width=128`**, **produto `width=206`**.
- Datas: `editmask.mask="dd/mm/yyyy"`, `alignment=2`, `width=320`; "até" no meio (`x=603`, `width=91`).
- Situação/tipo: ddlb ou dddw com `useasborder=yes`, mesma altura 64.
- Pesquisa de produto/filial: objetos `uo_Produto` / `uo_Filial` ligados no `dw_1` da janela (não digitar código solto).
- Situação **Ativo por padrão** (`initial="A"`). Sem botão Consultar/Limpar quando a janela herdada já tem (menu da janela).

## 3. DW de lista (modelo `dw_gc022_lista`)

- `header(height=88)`, `detail(height=80)`; linha da célula em `y=8`, `height=64`.
- Cabeçalho: `text` Verdana -8 cor `8388608`, `y=8 h=64`, **mais uma `line` sublinhando** em `y1=y2=80`, `x1=x`, `x2=x+width`, `pen.width=9`, `pen.color=8388608`.
- Células conforme seção 1. Código `alignment=1`, texto `0`, datas/situação `2`. Data com hora: `editmask.mask="dd/mm/yyyy hh:mm"`.
- Janela: `dw_2` (herdado de `dc_uo_dw_base`) com `ivb_ordena_colunas = True` e `This.of_SetRowSelection()` no `constructor` (linha selecionada em verde-azulado com texto branco).
- Agrupamento (ex.: por filial): `group(level=1 header.height=76 ...)` com `compute` em Verdana -8 peso 700 azul: `Filial: 13 - NOME`.
- Botão por linha (ex. Histórico): **no fim da linha** (última coluna), Verdana -7, largura ≥ 280, `y=8 h=64`.
- Colunas de auditoria (últ. atualização, matrícula **+ nome do usuário**) somente leitura; `dh_atualizacao` e matrícula preenchidas no `ue_presave`; nome via `left join usuario u on u.nr_matricula = ...` (`nm_usuario`). Em histórico também mostrar matrícula + nome.
- **Descrição de produto na lista** = `de_produto + ' : ' + de_apresentacao_venda` (`produto_geral`) em Retaguarda/GC/Compras; em telas do **WMS** usar `de_apresentacao_estoque` no lugar. Usar `coalesce` e coluna `char(125)`.
- Largura: se as colunas passarem da largura do `dw_2`, alargar a janela, os group box e o `dw_2` (não deixar scroll horizontal por padrão).

## 4. Janelas e herança

| Necessidade | Ancestral |
|---|---|
| Cadastro com seleção + lista (+ Incluir pelo menu) | `dc_w_cadastro_selecao_lista` (`dw_1` seleção, `dw_2` lista, `gb_1` "Seleção", `gb_2` "Lista") |
| Consulta/relatório | `dc_w_selecao_lista_relatorio` |
| Diálogo OK/Cancelar | `dc_w_response_ok_cancela` (`gb_1`, `dw_1`, `cb_ok`, `cb_cancelar`; `CloseWithReturn`) |
| Diálogo só de leitura (ex. histórico) | `dc_w_response` + `gb_1` "Lista" + `dw_1` (`dc_uo_dw_base`) + `cb_fechar` (`&Fechar`, 311x100, canto inferior direito, `cancel=true`) |

- **Botões sem default**: nunca `default = true` em OK/Gravar; Enter dentro de um campo (ex. escolher produto/filial) não pode acionar o botão. Em `dc_w_response_ok_cancela` sobrescrever `cb_ok` com `boolean default = false`. Só o Cancelar/Fechar mantém `cancel = true` (Esc).
- Ações da tela ficam no menu (Incluir, Gravar, Exportar, ...); botão só para ações de linha ou fora do menu (ex. Importar Excel no canto direito da seleção).
- Nomes: `w_geNNN_<nome>`, `dw_geNNN_selecao|lista|inclusao|historico`, `uo_...`; PBL comum `geNNN.pbl` em `Comuns\Bibliotecas` (precisa entrar no `LibList` do `.pbt` de cada sistema que usa).
- Mock HTML navegável antes da tela; layout em raias/blocos como o usuário aprovou.

## 5. Menu, permissão e sistemas

- Item de menu: `event clicked; mf_Abre_Janela("w_x", True)` e `this.tag = "w_x"` (o que vale é o nome passado a `mf_Abre_Janela`, em maiúsculas).
- Permissão (`dc_uo_seguranca.of_acesso_procedimento`): linha em `procedimento` (tipo `CA` p/ cadastro, `cd_library`), `procedimento_sistema` (por `cd_sistema`: GC, CO, ...) e `procedimento_perfil_usuario` (por perfil, `id_inclusao/alteracao/exclusao`). Sem isso: "Procedimento não liberado para este usuário". Script reexecutável com `if not exists`, na ordem pai → filhas.
- **Menu herdado**: `m_janelas` herda de `m_mdi` (GC). Mudou o ancestral → recompilar o descendente (`pbg compile ... m m_janelas`), senão "Bad runtime function reference" ao abrir.
- Quem entrega para o time de categorias: GC (`Gerenciamento_Categoria`); Retaguarda/WMS só se pedido.

## 6. Dados e histórico

- Histórico de alteração: `gf_grava_historico_alteracao_tabela(tabela, chave, coluna, de, para, operador, tipo, ref msg, mostra)` (ge040): só grava se `de <> para`, não faz commit; `nm_tabela` em maiúsculas, `de_chave` = `produto` ou `produto/filial`.
- Importação de planilha: `dc_uo_excel` (ge040) — linha 1 cabeçalho, commit por linha, relatório de erros `<planilha>.erros.txt`.
- DW de SP: `procedure="1 execute dbo.sp_x;1 @arg = :arg"`. Parâmetros em `wms_parametro`; por loja em `parametro_loja`.
- Datas nulas em edit mask aparecem `00/00/0000`: tratar na apresentação se incomodar.

## 7. Fluxo de desenvolvimento (SVN, ORCA, PBG)

1. **Check-out antes de alterar objeto existente**: `svn lock -m "Chamado N - ..."` no espelho em `C:\SVN\Sistemas_PB12\<Sistema>\Bibliotecas\` (se já travado por outro, parar, sem `--force`). **Nunca check-in** (`svn commit/unlock/add`): é sempre do usuário. Objeto novo: Add To Source Control é do usuário.
2. Alterar via `pbg_apply_patch` ou CLI: `pbg import <pbl relativo com .pbl> <arquivo> -p <workspace>` e `pbg compile <pbl> <d|w|u|m> <nome> -p <workspace>`. Objeto novo: arquivo com **CRLF, sem BOM, ASCII** com `$$HEX1$$..$$ENDHEX$$` para acentos; senão "wrong pb export header". `pbg_apply_patch` não cria objeto.
3. Biblioteca nova: criar com `pborca` (`session begin pborc120.dll`; `library create`), `.pbg` vazio e LibList nos `.pbt`.
4. Alterou ancestral (menu, janela, uo): recompilar descendentes.
5. Compilar em **todos** os sistemas cujo LibList carrega o objeto (Retaguarda, WMS, GC).
6. Banco: script em `sybase-objects` na branch `chamado-NNNN` (SP em `Procedures\`, scripts em `Publicações\<chamado>\scripts`), reexecutável, grants para `role_geral`, nunca aplicado sem o usuário.
7. Registrar no SoftDesk só quando o usuário pedir. Não subir PB para o git sem pedido (o repo `C:\Sistemas_PB12` tem trabalho alheio); `sybase-objects` pode subir a branch do chamado.
8. Fechar a entrega com o que **não foi testado** (tela precisa ser aberta pelo usuário).

## 8. Código (regras de estilo vistas na revisão do usuário)

- **Datastore sempre com DW objeto** (`dc_uo_ds_base` + `of_ChangeDataObject("ds_roNNN_...")`, `Retrieve`), igual às demais ds da `uo`. Nunca montar DW em runtime com `SyntaxFromSQL`/`Create`.
- **Parâmetro numérico decimal** (`wms_parametro`, `parametro_loja`): converter no SQL (`convert(numeric(12,4), vl_parametro)`, com `isnumeric` quando vier de várias linhas) e ler direto em variável/coluna decimal. Não escrever função de parse em PB (`Dec` depende do separador regional do Windows).
- **Coluna nova em DW existente** (ex. `left join` a mais): conferir o custo (join pela PK/índice, uma linha por chave, sem duplicar) antes de entregar.

- **Procedure chamada pelo PowerBuilder**: o PB roda dentro de transacao e o ASE recusa DDL de tabela temporaria ai (erro 226, `SELECT INTO ... not allowed within multi-statement transaction`). Nada de `select into #tabela` nem `create table #tabela` em SP que o PB chama (DW de procedure, `Execute Immediate`, datastore): usar tabelas derivadas numa consulta so, ou chamar com `AutoCommit = True`. No DBeaver (autocommit) funciona e engana.
