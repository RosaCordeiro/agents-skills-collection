---
name: pb-criar-objeto
description: >-
  Cria objeto PowerBuilder 12 novo (PBL, window herdada de genérica, DataWindow)
  via ORCA/PBG e deixa o PBSCC com ícone + para o dev dar Add To Source Control.
  Use when the user asks tela nova, PBL nova, herdar genérica, dc_w_cadastro_lista,
  criar window/DW, WSxxx, ícone + SCC, PBSCC, ou implementar tela após spec
  /pb-sybase. Não usar para patch de objeto já existente (isso é /pbg).
---

# Criar objeto PB (PBL / janela / DW)

Responda em português. Skill de **criação**. Patch de objeto que já existe: `/pbg`.

Consulta/spec de chamado: **`/pb-sybase`** ou **`/pb-desenvolvimento-pro`** (pedido grande). Nenhum dos dois implementa — se o pedido for spec **e** implementar, fechar a spec (e a aprovação) primeiro, num desses agents; **esta skill roda depois, em chat/agent separado**, nunca dentro do `/pb-sybase` ou `/pb-desenvolvimento-pro`.

ORCA **não tem Inherit**. Janela herdada = `.srw` com `from <genérica>` + `import` + `regenerate`.

## Greenfield — pasta `.ai`

Novo **sistema** PB ou PBL/workspace autônomo:

1. Criar `C:\Sistemas_PB12\<Sistema>\.ai\` (ou raiz do repo de docs do sistema) conforme `projeto-ai`
2. Preencher `context/` (dominio WMS/Fiscal, integrações Sybase) e `rules/desenvolvimento.md` (PBL, naming WSxxx, fluxo PBSCC)
3. Tela nova em sistema **existente** com `.ai/`: atualizar `context/` ou `decisions/` se a tela introduzir decisão nova — não recriar a árvore

## Pastas (não misturar)

| Pasta | Papel |
|-------|--------|
| `C:\Sistemas_PB12\<Sistema>` | PBL, ORCA, `pbg import` / `pbg compile` |
| `C:\Sistemas_PB12\<Sistema>\Bibliotecas\` | `.pbl` + `.pbg` da biblioteca (Objects **vazio** até o Add no PB) |
| `C:\SVN\Sistemas_PB12\<Sistema>\Bibliotecas\` | Working copy SVN / PBSCC. **Não** deixar `.srw`/`.srd` da tela nova aqui até o usuário dar Add To Source Control |

`C:\Sistemas_PB12` **não** é working copy SVN. MCP `path` = pasta PBG (ex. `C:\Sistemas_PB12\WMS`).

## PBSCC (ícone + vs bolinha verde)

Ícones do PB (workspace com SCC):

| Ícone | Significado | Menu |
|-------|-------------|------|
| **+** | Objeto só na PBL, **não** registrado no SCC | **Add To Source Control** |
| Bolinha verde | PBSCC acha que já está no SCC | Check Out = `svn lock` |

Para nascer com **+** (obrigatório):

1. Objeto compilado **na PBL**.
2. **Não** listar o objeto na seção `Objects` do `.pbg`.
3. **Não** `svn add`.
4. **Não** deixar `w_foo.srw` / `dw_foo.srd` em `C:\SVN\Sistemas_PB12\<Sistema>\Bibliotecas\`.

Arquivo nesse WC (mesmo `svn status ?`) → PBSCC mostra **verde** e o Check Out falha:

`svn: E155010: The node '...w_foo.srw' was not found.`

Check Out **não** registra objeto novo. Fluxo do dev no PB: fechar/reabrir workspace se o status estiver velho → Refresh → **Add To Source Control** (aí o PB grava `.srw` no WC, atualiza `.pbg` e registra no SVN).

Não `svn commit` / `svn add` / `svn lock` sem pedido.

## Genéricas (WMS / `classe_comum.pbl`)

| Ancestor | Uso |
|----------|-----|
| `dc_w_cadastro_lista` | Cadastro em grade (`dw_1`) — esqueleto tipo GE401 |
| `dc_w_cadastro_freeform` | Cadastro formulário |
| `dc_w_cadastro_selecao_lista` | Filtro `dw_1` + lista `dw_2` |

Clone **só o esqueleto** da irmã (header, `from`, `dw_1`/`dw_2`, `dataobject`). **Não** copiar SQL, `ue_preretrieve`, `Open(w_...)` nem `DataObject = "dw_<irmã>"`.

Renomear em todo o `.srw`: `$PBExportHeader$`, `global type`, `within`, `on ...create`. Header e `global type` diferentes = import por cima da irmã ou não compila.

## Receita (tela nova)

Backup dos arquivos novos **antes** de apagar qualquer coisa do WC SVN.

1. **Tabela** — `sybase_describe_table`. Sem coluna na homolog, não fingir. GRANT do login do app se SELECT/INSERT falhar. DDL novo: skill `pb-sybase` / `sybase-objects` (MCP não grava).
2. **Nomes** — PBL/programa de teste: nome explícito (`wms_teste`), **não** o próximo WSxxx de produção. Tela de chamado: WSxxx alinhado à spec.
3. **PBL** — `pbg create-pbl` hoje quebra: ORCA exige 2 args. Usar `pborca.exe` com `library create <pbl>, <comentario>` (UTF-8 **sem BOM**). Ex.: `C:\Sistemas_PB12\WMS\Bibliotecas\<nome>.pbl`.
4. **LibList** — incluir a PBL no `.pbt` que o PBG usa (`Bibliotecas\wms.pbt` no WMS) para compile/Open. Target pessoal só se o usuário pedir.
5. **`.pbg` da biblioteca** (só no workspace PB, Objects vazio):

```
Save Format v3.0(19990112)
@begin Libraries
 "WMS\\Bibliotecas\\<nome>.pbl" "";
@end;
@begin Objects
@end;
```

CRLF. Gravar em `C:\Sistemas_PB12\<Sistema>\Bibliotecas\<nome>.pbg`. **Não** copiar para o WC SVN.

6. **DW** — clonar `.srd` irmã **do mesmo layout**, trocar header / `retrieve` / `update` / `dbname` / nomes de coluna. `varchar(n)` no ASE → `char(n)` no DW. Encoding do export PB (`HA$PBExportHeader$`).
7. **Janela** — clonar `.srw` mínimo (GE401 para lista). **CRLF obrigatório** (LF → `wrong pb export header`). Trocar ancestor/controles/`dataobject`/eventos para a tabela nova.
8. **Import** — DW primeiro, depois window: `pbg import <pbl> <arquivo.sr*> -p C:\Sistemas_PB12\<Sistema>`.
9. **Compile** — `pbg compile <pbl> d <dw>` e `pbg compile <pbl> w <janela>`. Entrega = `imported` + compile OK. `pbg compile --all` / `pbg_list_objects` pode listar vazio em PBL nova; compile **por objeto** conta.
10. **SCC** — parar. Dizer ao usuário: Refresh (ou fechar o PB) → **+** → Add To Source Control.

Snapshots PBG (`.pbg/snapshots/...`) podem ficar; o PBSCC **não** olha isso. O que estraga o `+` é arquivo em `C:\SVN\Sistemas_PB12\...\Bibliotecas\`.

## ORCA / PBG (pegadinhas)

- `library create pbl` (1 arg) → `wrong parm count`. Sempre `, comentario`.
- `.srw` com LF → `wrong pb export header`. Clonar irmã e manter CRLF.
- Sem BOM nos `.orc` e nos `.sr*`.
- Regenerar descendente precisa da genérica no LibList (`classe_comum.pbl` já entra no WMS).
- `pbg_apply_patch` **não** cria objeto novo (exige snapshot existente).

## Handoff

| Pedido | Skill / agent |
|--------|----------------|
| Spec/chamado/mock/consulta PB+Sybase | `/pb-sybase` ou `/pb-desenvolvimento-pro` |
| Tela/PBL/DW **nova**, spec já aprovada | esta skill, em agent/chat separado (não dentro de `/pb-sybase`/`/pb-desenvolvimento-pro`) |
| Patch de objeto **já no SCC** | `/pbg` |
| Trigger/SP teste de mesa | `/teste-mesa-sybase` |








