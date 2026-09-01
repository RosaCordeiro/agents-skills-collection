# Coluna `dh_ultimo_saldo` — tabela `filial`

| | |
|--|--|
| Tipo | `datetime` (nullable) |
| Domínio | Primeiro dia de um mês de referência (ex.: `01/03/2026 00:00`). Aponta qual “foto” mensal do estoque em `saldo_produto` vale para a loja. |
| Cadastro (onde altera) | **Não tem tela de cadastro.** Atualizado por processos automáticos (fechamento mensal, inclusão de filial). |

## Em uma frase

É a **data do estoque “oficial” da loja**: indica de qual mês o sistema deve ler as quantidades e custos em `saldo_produto`. Quase tudo que consulta estoque atual compara `saldo_produto.dh_saldo` com este campo na filial.

## Onde você altera esse valor

- **Não tem tela no GE063** nem em outro cadastro de filial que o usuário edite no dia a dia.
- **Fechamento mensal de estoque** — processo batch do sistema **Carga** (`uo_fechamento`, biblioteca CA002). Quando o mês vira, o job copia o saldo do mês que está fechando para o mês seguinte e **avança** `dh_ultimo_saldo` para o novo mês. Chama a procedure `sp_fechamento_mensal` no banco.
- **Inclusão de filial nova** — ao cadastrar uma loja, o banco define automaticamente a data com base no parâmetro geral de movimentação (`parametro.dh_movimentacao`), no primeiro dia do mês corrente.
- **Carga de filial para PDV Java (RO112)** — na implantação de loja nova, o processo marca a filial como tendo estoque e grava a data inicial de saldo.
- **Correção pontual (TI)** — existe função interna `of_atualiza_ultimo_saldo_filial` no módulo de fechamento para ajustar uma filial específica; não é operação de rotina do usuário de loja.

## Onde o sistema usa (e para quê)

### Consulta de estoque atual (loja / produto)

- O que acontece: ao listar quantidade em estoque, o sistema não pega “qualquer” registro de `saldo_produto` — só o do mês apontado por `dh_ultimo_saldo`.
- Por que usa este campo: evita misturar saldo de meses diferentes; garante que relatórios e telas mostrem o **estoque do período contábil aberto**.
- Telas/sistemas envolvidos:
  - **GE139** — Consulta Vendas do Produto (aba/lista de estoque por filial)
  - View **`vw_saldo_atual_produto`** — saldo atual usado por integrações e consultas genéricas
  - **WS136** (WMS) — listagens que cruzam saldo ERP com filial

### Nota fiscal, devolução e transferência

- O que acontece: ao incluir ou alterar itens de NF (venda, devolução, transferência), o sistema valida e debita/credita estoque **do mês vigente** da filial.
- Por que importa: se `dh_ultimo_saldo` estiver defasado em relação ao parâmetro de movimentação, a NF pode não achar saldo ou usar quantidade errada.
- Onde: triggers de item de NF (`ti_item_nf_venda`, `ti_item_nf_devolucao_venda`, `ti_item_nf_transferencia`, etc.), cancelamento de NF (`sp_cancelamento_nf_venda`), devolução de compra.

### WMS — movimentação, ajuste e localização

- O que acontece: movimentações de armazém, ajustes de estoque e alterações de localização comparam o saldo WMS/ERP com o saldo do mês corrente da filial.
- Por que importa: sincronismo entre estoque físico (WMS) e contábil (ERP) usa a mesma referência de mês.
- Onde: triggers `tu_wms_movimentacao`, `ti_wms_ajuste_estoque`, `tu_wms_localizacao`; procedures `sp_wms_mov_segregado_erp`, `sp_wms_movimentacao_segregado_erp`.

### Ajuste de estoque e movimento de estoque

- O que acontece: inclusão de ajuste ou movimento de estoque lê `@mes_saldo_filial` a partir de `filial.dh_ultimo_saldo` para gravar no período certo.
- Onde: `ti_ajuste_estoque`, `ti_movimento_estoque`.

### Análise de excesso, remanejamento e rateio no CD

- O que acontece: relatórios de excesso de estoque, retirada de excesso (GE115), análises da Diretoria (GE132), rateio de estoque central (RO036, RO097) e consulta de pedidos no CD (RO085) filtram saldo pelo mês oficial da loja.
- Por que importa: decisões de compra, transferência entre lojas e distribuição no centro de distribuição usam a mesma base de estoque.

### Exportação SAP e custo de produto (GE481)

- O que acontece: na exportação/importação SAP, rotinas de custo de produto leem `dh_ultimo_saldo` de cada filial para montar interfaces com quantidade e custo do período correto.
- Onde: `uo_ge481_custo_produto`, pedidos urgentes EC, ordem distribuidora (GE501), entre outras interfaces GE481.

### Exportação analítica (EL101, EL007)

- Relatórios estatísticos e carga de produto EAN usam o saldo do mês apontado pela filial para não exportar dados de período fechado incorreto.

### Fechamento pendente — monitoramento

- O que acontece: o sistema lista filiais com estoque (`id_possui_estoque = 'S'`) cujo `dh_ultimo_saldo` **ainda está atrás** do mês esperado pelo parâmetro de movimentação — ou seja, **fechamento mensal não rodou** para aquela loja.
- Onde: `dw_ca002_filial_fechamento`, `ds_ca002_filial_fechamento_pendente` (módulo Carga).

## O que o banco faz ao gravar

- **`ti_filial`** (inclusão de filial): define `dh_ultimo_saldo` como o dia 1 do mês de `parametro.dh_movimentacao` e também ajusta `cd_perfil_estoque`.
- **`sp_fechamento_mensal`**: para faixa de filiais com estoque, copia linhas de `saldo_produto` do mês atual para o próximo e atualiza `filial.dh_ultimo_saldo` para o primeiro dia do mês seguinte (somente se ainda estiver menor que a data alvo).
- **Triggers de NF/WMS/ajuste**: em dezenas de pontos, o padrão `s.dh_saldo = f.dh_ultimo_saldo` garante que operações usem o saldo do mês aberto.

## Cuidados e exceções

- **Não confundir com `parametro.dh_movimentacao`**: o parâmetro é a data de movimentação global do sistema; `dh_ultimo_saldo` é **por filial** e pode ficar atrás se o fechamento mensal não executou para aquela loja.
- **Filial sem estoque** (`id_possui_estoque = 'N'`): o fechamento mensal em lote **não atualiza** `dh_ultimo_saldo` (filtro na `sp_fechamento_mensal`).
- **Filial nova**: recebe data inicial via trigger; RO112 pode sobrescrever na carga PDV.
- **Alterar manualmente** sem fechar saldo corretamente pode causar inconsistência entre `saldo_produto` e o ponteiro na filial — operação exclusiva de suporte/TI.
- Campo **não aparece** no cadastro GE063; usuário de loja normalmente só percebe o efeito indireto (estoque “zerado” ou NF rejeitada quando o mês não fechou).

## Evidência técnica (referência)

| Sistema | Objeto | Papel |
|---------|--------|-------|
| Carga | `uo_fechamento` / `of_fechamento_mensal` | dispara fechamento; chama `sp_fechamento_mensal` |
| Carga | `dw_ca002_filial_fechamento` | lista filiais com fechamento pendente |
| Retaguarda Operacional | `uo_ro112_carga_pdv_java` | grava na implantação de loja |
| Gestão Filiais | `dw_ge139_lista_consulta_estoque` | leitura — estoque por produto |
| Exportação | `uo_ge481_custo_produto` / `ds_ge481_custo_filial` | leitura — custo SAP |
| Diretoria / WMS | `ds_ge132_*` / `uo_ge115_remanejamento` | leitura — excesso e remanejamento |
| Retaguarda Operacional | `uo_rateio_estoque_central`, `uo_ro097_*` | leitura — rateio CD |
| sybase-objects | `sp_fechamento_mensal.sql` | gravação em lote |
| sybase-objects | `ti_filial.sql` | gravação na inclusão |
| sybase-objects | `vw_saldo_atual_produto.sql` | view saldo atual |
| sybase-objects | `vw_saldo_produto_sem_pendente.sql` | view saldo sem pendente |
| sybase-objects | `ti_*` / `tu_*` NF, WMS, ajuste (+15 objetos) | leitura em validação de estoque |

_Gerado em 2026-09-01 — skill mapeador-dados-mestres-coluna_
