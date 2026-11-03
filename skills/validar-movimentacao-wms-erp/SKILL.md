---
name: validar-movimentacao-wms-erp
description: >-
  Casa a movimentacao de estoque do WMS (wms_movimento_estoque) com a do ERP
  (movimento_estoque) no Sybase ASE, para um produto + CD + periodo, e
  classifica cada evento como OK, sem contrapartida no ERP, sem
  contrapartida no WMS, ou quantidade divergente. Gera relatorio em
  markdown. Somente leitura. Roda em homologacao (MCP `mcp__sybase-hmg`)
  por padrao; roda em producao (MCP `mcp__sybase-prd`) so se o usuario
  pedir explicitamente. Use when the user asks validar movimentacao WMS x
  ERP, casar wms_movimento_estoque com movimento_estoque, achar movimento
  sem contrapartida, ou /validar-movimentacao-wms-erp. Nao usar para
  comparar saldo/posicao ao longo do tempo (isso e outra investigacao, de
  posicao diaria com lag de sincronismo) nem para causa raiz da divergencia
  (essa skill so aponta onde a movimentacao nao bate, nao o motivo).
---

# Validar movimentacao WMS x ERP

Responda em portugues. Compara, para um produto + CD + periodo informados,
os eventos de movimentacao registrados no WMS (`wms_movimento_estoque`) com
os lancamentos equivalentes no ERP (`movimento_estoque`), no Sybase ASE, e
classifica cada evento.

## Fronteiras

- **Nao** e a skill de comparacao de posicao/saldo diario (aquela responde
  "quando a divergencia comecou"; esta responde "qual movimento especifico
  nao bateu"). Se o pedido for sobre posicao ao longo do tempo, nao adapte
  esta skill — avise que e outro tipo de consulta.
- **Nao** determina causa raiz — so classifica e reporta.
- **Somente leitura, sempre.** Homologacao (MCP `mcp__sybase-hmg`) e o
  ambiente padrao. Producao (MCP `mcp__sybase-prd`) so entra se o usuario
  pedir explicitamente — ver "Ambiente" abaixo.

## Ambiente (homologacao x producao)

| | Homologacao (padrao) | Producao (sob pedido) |
|---|---|---|
| MCP | `mcp__sybase-hmg` | `mcp__sybase-prd` |
| Quando usar | Sempre, a nao ser que o usuario peca producao | So se o usuario pedir explicitamente ("roda em producao", "confere no banco de producao") |
| Antes de rodar | Nada alem dos parametros obrigatorios abaixo | Confirmar com o usuario a consulta exata (produto, CD, periodo) antes da primeira execucao do pedido — producao e um banco vivo usado pela operacao real da Clamed |
| Query | Identica (mesma versao MCP do §2.1) | Identica — so troca o prefixo do MCP na chamada da tool |

Nao repita a confirmacao a cada consulta dentro da mesma investigacao ja
autorizada para producao — confirme uma vez por pedido de mudanca de
ambiente, nao por `SELECT`. O filtro obrigatorio por `cd_produto` (abaixo)
vale igual nos dois ambientes; nao relaxe esse cuidado em producao.

## Parametros obrigatorios

| Parametro | Tipo | Observacao |
|-----------|------|------------|
| `cd_produto` | inteiro | Obrigatorio desde a primeira consulta — sem ele, consultas em `movimento_estoque`/`wms_movimento_estoque` tendem a dar timeout. |
| `CD` | inteiro | Centro de Distribuicao. Resolvido para filial(is) conforme a regra abaixo — nunca peca "filial" ao usuario, peca "CD". |
| `dh_ini`, `dh_fim` | data | Periodo da investigacao. Sem limite maximo automatico — se o periodo for muito longo (ex. > 90 dias) para um produto de alto giro, avise o usuario antes de rodar que pode demorar ou retornar muita coisa. |

Se o CD informado nao for numerico ou nao fizer sentido, pare e pergunte —
nunca tente adivinhar a filial. Antes de colar qualquer parametro no texto
da query (e substituicao textual, nao bind), confira que `cd_produto`/`CD`
sao inteiros e `dh_ini`/`dh_fim` sao datas validas — nunca colar valor vindo
direto da mensagem do usuario sem essa checagem minima.

## Passo 1 — Resolver CD para filial(is)

**Essa resolucao tem uma regra por lado — nao e a mesma coisa no ERP e no
WMS — e no WMS, CD 534 e um caso especial, os demais CDs nao.**

- **Lado ERP (`movimento_estoque.cd_filial_movimento`):** regra fixa (nao
  ha cadastro no banco para isso hoje) —
  - **CD = 534** → filiais `534` e `1` juntas (534 = revenda normal, 1 =
    mercadorias em transito/segregado — unica excecao conhecida). Esse
    filtro direto por `cd_filial_movimento` **e confiavel no ERP**
    (confirmado com dado real: filtrar sem filial nenhuma e depois com
    `in (534, 1)` dá a mesma contagem dominada por 534).
  - **Qualquer outro CD** → a propria filial de mesmo numero.
- **Lado WMS (`wms_movimento_estoque`): regra diferente para CD 534.**
  - **Qualquer CD diferente de 534** → filtrar `wme.cd_filial = <CD>`
    direto (igual ao ERP) **continua correto** — confirmado com os casos
    de referencia 740472/CD 353 e 636/CD 294. `wms_bairro` so tem 18 linhas
    no total, cobrindo apenas os armazens fisicos de WMS 534 e 294; um
    evento WMS "destinado" a outro CD (ex. 353) fisicamente acontece
    dentro do armazem de 534 e resolve para `wms_bairro.cd_filial = 534`
    via endereco — usar esse join pra outros CDs pioraria o filtro, nao
    melhoraria (some o evento inteiro, porque a chave real que identifica
    o CD "dono"/destino desses casos e mesmo o `cd_filial` cru).
  - **CD = 534 e o unico caso comprovadamente quebrado pelo filtro cru.**
    Achado real (produto 741851, CD 534, jan-mar/2026): filtrar
    `wme.cd_filial in (534, 1)` direto fazia a skill enxergar so ~15
    linhas/mes de WMS contra milhares no ERP — uma divergencia gigante que
    nao existia de verdade (o volume real era da mesma ordem de grandeza
    do ERP, 5-7 mil linhas/mes). Motivo: `wme.cd_filial` e o **destino**
    do movimento e raramente esta preenchido pros eventos que ainda estao
    dentro do proprio armazem central — o que e a maioria dos eventos
    quando o CD sob investigacao e o proprio 534. Corrija **so quando
    `CD = 534`**, trocando o filtro por
    `wms_movimento_estoque.cd_endereco_localizacao` →
    `wms_endereco.cd_bairro` → `wms_bairro.cd_filial = 534`.
    - **Cuidado com o segregado:** `wms_bairro.cd_filial` **nunca tem o
      valor `1`** — revenda e segregado sao o **mesmo** `cd_filial=534`,
      diferenciados so por `wms_bairro.id_utiliza_saldo` (`'S'` = revenda,
      `'N'` = segregado). Nunca procure `wb.cd_filial = 1`.
    - **Fallback** quando o endereco/bairro nao resolve pra nenhuma
      filial (`wb.cd_filial is null` — endereco sem `wms_endereco`, ou
      bairro fora das 18 linhas de `wms_bairro`): use como ultimo recurso
      `wme.cd_filial in (534, 1)`. Nunca deixe a linha sumir do grupo so
      por isso (mesmo principio do Passo 3).

O criterio de "cruza zona revenda/segregado" do Passo 4 abaixo **so vale
quando o CD e 534** — `wms_bairro.id_utiliza_saldo` so tem esse significado
de zona para o CD 534; para outros CDs nao ha evidencia de que esse
cruzamento signifique a mesma coisa.

## Passo 2 — Rodar a consulta

O script abaixo e a versao canonica (usa `#tabela`, sem CTE, compativel com
o dialeto Sybase ASE do ambiente) — e o formato de referencia para quem for
rodar direto num cliente Sybase (isql, DBArtisan) fora do MCP. Preencha
`@cd_produto`, `@cd_cd`, `@dt_ini`, `@dt_fim` antes de rodar.

**Se estiver executando via MCP (`mcp__sybase-hmg__sybase_query_readonly`
em homologacao — padrao — ou `mcp__sybase-prd__sybase_query_readonly` em
producao, so se pedido explicitamente):** essa ferramenta aceita so uma
unica instrucao `SELECT` por chamada e rejeita `SELECT INTO`/tabela
temporaria. Use a **versao MCP** na secao seguinte (§2.1) — ja escrita
como consultas unicas equivalentes, sem `#tabela`, e testada com dados
reais de homologacao. A query e identica nos dois ambientes; so o prefixo
do MCP na chamada da tool muda.

```sql
-- ============================================================
-- Validar movimentacao WMS x ERP (wms_movimento_estoque x movimento_estoque)
-- Versao canonica (script completo, #tabela) — rodar direto num cliente
-- Sybase (isql/DBArtisan). Para rodar via MCP mcp__sybase-hmg, usar §2.1.
-- ============================================================
-- Parametros — TROCAR antes de rodar:
declare @cd_produto int
declare @cd_cd      int      -- CD informado (ex.: 534, 294)
declare @dt_ini     datetime
declare @dt_fim     datetime

select @cd_produto = 0             -- TROCAR
select @cd_cd      = 534           -- TROCAR
select @dt_ini     = '2025-07-01'  -- TROCAR
select @dt_fim     = '2025-07-31'  -- TROCAR

-- Limpeza de execucoes anteriores (evita abortar em clientes que nao
-- continuam apos erro no primeiro DROP de uma tabela que ainda nao existe)
if object_id('tempdb..#filiais') is not null drop table #filiais
if object_id('tempdb..#wms_lote') is not null drop table #wms_lote
if object_id('tempdb..#wms_lote_resumo') is not null drop table #wms_lote_resumo
if object_id('tempdb..#wms_evento') is not null drop table #wms_evento
if object_id('tempdb..#wms_evento2') is not null drop table #wms_evento2
if object_id('tempdb..#wms_bucket') is not null drop table #wms_bucket
if object_id('tempdb..#erp_raw') is not null drop table #erp_raw
if object_id('tempdb..#erp_raw2') is not null drop table #erp_raw2
if object_id('tempdb..#erp_bucket') is not null drop table #erp_bucket
if object_id('tempdb..#resultado') is not null drop table #resultado

-- ------------------------------------------------------------
-- Passo 1 (RN-07): resolver CD -> filial(is).
-- Unica excecao hoje: CD 534 soma as filiais 534 (revenda) e 1 (transito/
-- segregado). Qualquer outro CD usa a filial de mesmo numero.
-- ------------------------------------------------------------
create table #filiais (cd_filial int not null)

insert into #filiais (cd_filial) values (@cd_cd)

if @cd_cd = 534
begin
	insert into #filiais (cd_filial) values (1)
end

-- ------------------------------------------------------------
-- Passo 2 (RN-06): correcao/troca de lote (tipos 24 e 25) — tratada em
-- separado porque NAO compartilha cd_chave_movimento entre si (confirmado
-- com casos reais). Fica de fora do fluxo de comparacao de quantidade;
-- aparece no relatorio so como nota informativa. Um par esperado tem
-- exatamente 1 linha tipo 24 (entrada) + 1 linha tipo 25 (saida) para o
-- mesmo produto+data+quantidade — qualquer contagem diferente disso e
-- um caso "orfao" e deve ser destacado, nao so descartado em silencio.
-- ------------------------------------------------------------
select
	wme.cd_produto,
	wme.dh_movimento,
	wme.qt_movimento,
	wme.cd_tipo_movimento,
	wme.nr_lote,
	wme.cd_chave_movimento
into #wms_lote
from wms_movimento_estoque wme
left join wms_endereco we on we.cd_endereco = wme.cd_endereco_localizacao
left join wms_bairro wb on wb.cd_bairro = we.cd_bairro
where wme.cd_produto = @cd_produto
and wme.dh_movimento >= @dt_ini
and wme.dh_movimento <= @dt_fim
and wme.cd_tipo_movimento in (24, 25)
and (
	(@cd_cd = 534 and (
		wb.cd_filial = 534
		or (wb.cd_filial is null and wme.cd_filial in (select cd_filial from #filiais))
	))
	or (@cd_cd <> 534 and wme.cd_filial in (select cd_filial from #filiais))
)

select
	cd_produto,
	dh_movimento,
	qt_movimento,
	sum(case when cd_tipo_movimento = 24 then 1 else 0 end) as qt_entradas,
	sum(case when cd_tipo_movimento = 25 then 1 else 0 end) as qt_saidas,
	count(*) as qt_linhas
into #wms_lote_resumo
from #wms_lote
group by cd_produto, dh_movimento, qt_movimento

-- Pares orfaos (qt_entradas <> qt_saidas): destacar no relatorio como
-- "Atencao", nunca descartar em silencio.

-- ------------------------------------------------------------
-- Passo 3 (RF-03/RN-01): extrair e colapsar o WMS por cd_chave_movimento
-- (par entrada+saida do mesmo evento fisico, ou ponta unica legitima),
-- excluindo 24/25 (ja tratados acima). Aplica sinal (E/S) e qt_caixa_padrao
-- para converter para a mesma unidade do ERP.
-- LEFT JOIN em wms_endereco/wms_bairro (nao INNER): um endereco sem bairro
-- mapeado nao pode fazer a linha inteira desaparecer do grupo — isso
-- corromperia qt_liquida_wms do bucket em silencio, sem erro. Uma linha
-- assim fica com toca_zona_revenda=toca_zona_segregado=0 (nao decide zona),
-- mas continua contando na soma; e sinalizada em sem_endereco_mapeado para
-- aparecer no relatorio como "Atencao".
-- FILTRO DE CD (Passo 1): SO para CD 534, usa wb.cd_filial = 534 (filial
-- dona do endereco fisico) em vez de wme.cd_filial (destino do movimento,
-- nem sempre preenchido, sem indice — achado real: produto 741851/CD 534
-- tinha milhares de linhas WMS por mes que o filtro raso escondia por
-- completo). Para qualquer OUTRO CD, wme.cd_filial direto continua sendo
-- o filtro correto (confirmado com os casos 740472/CD 353 e 636/CD 294) —
-- wms_bairro so cobre os armazens fisicos de WMS 534 e 294, entao usar
-- esse join para outros CDs faria o evento sumir, nao corrigir nada.
-- ------------------------------------------------------------
select
	wme.cd_chave_movimento,
	wme.cd_produto,
	min(wme.dh_movimento) as dh_movimento,
	sum(
		case when wtme.id_entrada_saida = 'E' then 1 else -1 end
		* (wme.qt_movimento * isnull(wme.qt_caixa_padrao, 1))
	) as qt_liquida_wms,
	max(case when wb.id_utiliza_saldo = 'S' then 1 else 0 end) as toca_zona_revenda,
	max(case when wb.id_utiliza_saldo = 'N' then 1 else 0 end) as toca_zona_segregado,
	max(case when wme.cd_endereco_localizacao = 'F910010A' then 1 else 0 end) as toca_transito,
	max(isnull(wme.nr_nf, 0)) as nr_nf,
	max(isnull(wme.de_especie, '')) as de_especie,
	max(isnull(wme.de_serie, '')) as de_serie,
	max(wme.cd_filial) as cd_filial_amostra,
	count(*) as qt_linhas_wms,
	max(case when we.cd_endereco is null then 1 else 0 end) as sem_endereco_mapeado
into #wms_evento
from wms_movimento_estoque wme
inner join wms_tipo_movimento_estoque wtme on wtme.cd_tipo_movimento = wme.cd_tipo_movimento
left join wms_endereco we on we.cd_endereco = wme.cd_endereco_localizacao
left join wms_bairro wb on wb.cd_bairro = we.cd_bairro
where wme.cd_produto = @cd_produto
and wme.dh_movimento >= @dt_ini
and wme.dh_movimento <= @dt_fim
and wme.cd_tipo_movimento not in (24, 25)
and (
	(@cd_cd = 534 and (
		wb.cd_filial = 534
		or (wb.cd_filial is null and wme.cd_filial in (select cd_filial from #filiais))
	))
	or (@cd_cd <> 534 and wme.cd_filial in (select cd_filial from #filiais))
)
group by wme.cd_chave_movimento, wme.cd_produto

-- ------------------------------------------------------------
-- Passo 4 (RN-05 + filtro de relevancia ERP): confirmar transferencia via
-- item_nf_transferencia usando NOT EXISTS (correlacionado), NUNCA um JOIN
-- direto — um JOIN a item_nf_transferencia pode multiplicar linhas se
-- houver mais de um item para o mesmo nr_nf/especie/serie/produto/filial
-- (a tabela tem nr_sequencial, ou seja, mais de uma linha por NF e
-- possivel), o que corromperia silenciosamente qt_liquida_wms do bucket
-- exatamente como o bug original do INNER JOIN em wms_endereco/wms_bairro.
-- NOT EXISTS nunca duplica linha, entao e a forma segura de checar.
--
-- Um evento WMS so e candidato a ter contrapartida no ERP se cruza a
-- fronteira revenda/segregado (toca as duas zonas dentro do mesmo evento
-- — SO conta quando 534 esta entre as filiais resolvidas, ver Passo 1), OU
-- toca o endereco de transito F910010A (transferencia), OU carrega nr_nf
-- (compra/devolucao/etc.). Eventos que nao atendem nenhum desses tres
-- criterios sao relocacao interna pura do WMS e nao devem ser comparados
-- ao ERP.
--
-- Chave de data do bucket (R-06, achado na Fase 6 com dado real: produto
-- 740472, CD 353->534, NF 33, dez/2021): uma transferencia confirmada pode
-- levar mais de um dia para completar as duas pernas no WMS (ex.: entrada
-- em transito num dia, entrada segregado + saida transito só dias depois).
-- Bucket por dia estrito fragmentaria esse evento em fatias que parecem
-- divergentes sozinhas. Por isso, para NF/especie/serie que sao uma
-- transferencia CONFIRMADA (existe em item_nf_transferencia, casando por
-- origem OU destino), a chave de bucket ignora o dia (usa o literal
-- 'TRANSFERENCIA'); para qualquer outro caso, mantem o dia exato — e o que
-- preserva a protecao contra NF reaproveitada em eventos distantes no
-- tempo (ADR-001, produto 741213/NF 13061). So funciona porque a checagem
-- e feita por NF+especie+serie+produto (independente de filial/data), e o
-- MESMO calculo e usado do lado ERP no Passo 5 — os dois lados so casam
-- fora do dia exato quando os dois concordam que aquela NF e transferencia.
--
-- IMPORTANTE (achado real, Sybase ASE rejeita a query se nao for assim):
-- "Subqueries are not allowed in a GROUP BY clause" — o `case when exists
-- (...)` que define a chave de bucket NAO pode ir direto no `group by`.
-- Por isso o calculo e feito primeiro (por linha, sem agregacao) numa
-- tabela intermediaria (#wms_evento2), e so entao agrupado por essa coluna
-- ja materializada (`dh_bucket_calc`), nunca pela expressao original.
-- ------------------------------------------------------------
select
	we.*,
	case when exists (
		select 1 from item_nf_transferencia tr
		where tr.nr_nf = we.nr_nf and tr.de_especie = we.de_especie
		and tr.de_serie = we.de_serie and tr.cd_produto = we.cd_produto
		and (tr.cd_filial_origem = we.cd_filial_amostra or tr.cd_filial_destino = we.cd_filial_amostra)
	) then 'TRANSFERENCIA' else convert(char(8), we.dh_movimento, 112) end as dh_bucket_calc
into #wms_evento2
from #wms_evento we
where (toca_zona_revenda = 1 and toca_zona_segregado = 1 and exists (select 1 from #filiais where cd_filial = 534))
   or toca_transito = 1
   or nr_nf <> 0

select
	isnull(nr_nf, 0) as nr_nf,
	isnull(de_especie, '') as de_especie,
	isnull(de_serie, '') as de_serie,
	dh_bucket_calc as dh_bucket,
	sum(qt_liquida_wms) as qt_liquida_wms,
	sum(qt_linhas_wms) as qt_linhas_wms,
	max(sem_endereco_mapeado) as sem_endereco_mapeado,
	max(case when toca_transito = 1 then 1 else 0 end) as toca_transito,
	max(case when toca_transito = 1 and not exists (
		select 1 from item_nf_transferencia tr
		where tr.cd_filial_origem = cd_filial_amostra
		and tr.nr_nf = nr_nf
		and tr.de_especie = de_especie
		and tr.de_serie = de_serie
		and tr.cd_produto = cd_produto
	) then 1 else 0 end) as transferencia_sem_confirmacao
into #wms_bucket
from #wms_evento2
group by isnull(nr_nf, 0), isnull(de_especie, ''), isnull(de_serie, ''), dh_bucket_calc

-- ------------------------------------------------------------
-- Passo 5 (RF-04): extrair o ERP para o mesmo produto/filial(is)/periodo.
-- ------------------------------------------------------------
select
	me.cd_produto,
	me.dh_movimento,
	me.nr_nf,
	me.de_especie,
	me.de_serie,
	me.cd_filial_movimento,
	sum(
		case when tme.id_entrada_saida = 'E' then 1 else -1 end
		* case when tme.id_cancelamento = 'S' then -1 else 1 end
		* me.qt_movimento
	) as qt_liquida_erp,
	count(*) as qt_linhas_erp
into #erp_raw
from movimento_estoque me
inner join tipo_movimento_estoque tme on tme.cd_tipo_movimento = me.cd_tipo_movimento
where me.cd_produto = @cd_produto
and me.dh_movimento >= @dt_ini
and me.dh_movimento <= @dt_fim
and me.cd_filial_movimento in (select cd_filial from #filiais)
group by me.cd_produto, me.dh_movimento, me.nr_nf, me.de_especie, me.de_serie, me.cd_filial_movimento

-- Mesma chave de bucket do Passo 4 (dia exato, exceto NF de transferencia
-- confirmada, que usa 'TRANSFERENCIA' em vez do dia) — precisa ser
-- IDENTICA a do lado WMS para os dois lados casarem corretamente. Mesma
-- restricao de Sybase ASE do Passo 4 (subquery nao pode ir direto no
-- `group by`): calcular a coluna primeiro em #erp_raw2, agrupar depois.
select
	er.*,
	case when exists (
		select 1 from item_nf_transferencia tr
		where tr.nr_nf = er.nr_nf and tr.de_especie = er.de_especie
		and tr.de_serie = er.de_serie and tr.cd_produto = er.cd_produto
		and (tr.cd_filial_origem = er.cd_filial_movimento or tr.cd_filial_destino = er.cd_filial_movimento)
	) then 'TRANSFERENCIA' else convert(char(8), er.dh_movimento, 112) end as dh_bucket_calc
into #erp_raw2
from #erp_raw er

select
	isnull(nr_nf, 0) as nr_nf,
	isnull(de_especie, '') as de_especie,
	isnull(de_serie, '') as de_serie,
	dh_bucket_calc as dh_bucket,
	sum(qt_liquida_erp) as qt_liquida_erp,
	sum(qt_linhas_erp) as qt_linhas_erp
into #erp_bucket
from #erp_raw2
group by isnull(nr_nf, 0), isnull(de_especie, ''), isnull(de_serie, ''), dh_bucket_calc

-- ------------------------------------------------------------
-- Passo 6 (RF-05): casar por bucket (produto fixo pelo filtro acima,
-- nr_nf + especie + serie + dia) e classificar. Usa 3 UNIONs (padrao ja
-- usado nos scripts de referencia do projeto) em vez de FULL OUTER JOIN.
-- ------------------------------------------------------------
select
	w.nr_nf, w.de_especie, w.de_serie, w.dh_bucket,
	w.qt_liquida_wms, w.qt_linhas_wms,
	e.qt_liquida_erp, e.qt_linhas_erp,
	w.sem_endereco_mapeado, w.transferencia_sem_confirmacao,
	case when w.qt_liquida_wms = e.qt_liquida_erp then 'OK' else 'QUANTIDADE_DIVERGENTE' end as id_classificacao
into #resultado
from #wms_bucket w
inner join #erp_bucket e
	on e.nr_nf = w.nr_nf and e.de_especie = w.de_especie
	and e.de_serie = w.de_serie and e.dh_bucket = w.dh_bucket

insert into #resultado
select
	w.nr_nf, w.de_especie, w.de_serie, w.dh_bucket,
	w.qt_liquida_wms, w.qt_linhas_wms,
	0, 0,
	w.sem_endereco_mapeado, w.transferencia_sem_confirmacao,
	'SEM_CONTRAPARTIDA_ERP'
from #wms_bucket w
where not exists (
	select 1 from #erp_bucket e
	where e.nr_nf = w.nr_nf and e.de_especie = w.de_especie
	and e.de_serie = w.de_serie and e.dh_bucket = w.dh_bucket
)

insert into #resultado
select
	e.nr_nf, e.de_especie, e.de_serie, e.dh_bucket,
	0, 0,
	e.qt_liquida_erp, e.qt_linhas_erp,
	0, 0,
	'SEM_CONTRAPARTIDA_WMS'
from #erp_bucket e
where not exists (
	select 1 from #wms_bucket w
	where w.nr_nf = e.nr_nf and w.de_especie = e.de_especie
	and w.de_serie = e.de_serie and w.dh_bucket = e.dh_bucket
)

-- ------------------------------------------------------------
-- Consultas finais (usar para montar o relatorio — ver formato abaixo)
-- ------------------------------------------------------------

-- 1) Resumo (RF-09)
select id_classificacao, count(*) as qt_eventos
from #resultado
group by id_classificacao

-- 2) Sem contrapartida no ERP
select * from #resultado where id_classificacao = 'SEM_CONTRAPARTIDA_ERP' order by dh_bucket

-- 3) Sem contrapartida no WMS
select * from #resultado where id_classificacao = 'SEM_CONTRAPARTIDA_WMS' order by dh_bucket

-- 4) Quantidade divergente
select * from #resultado where id_classificacao = 'QUANTIDADE_DIVERGENTE' order by dh_bucket

-- 5) Atencao — OK no liquido mas contagem de linhas muito diferente entre
--    WMS e ERP (pode mascarar dois erros de sinal que se cancelam), OU
--    endereco WMS nao mapeado, OU transferencia sem confirmacao
select * from #resultado
where (id_classificacao = 'OK' and qt_linhas_wms <> qt_linhas_erp)
   or sem_endereco_mapeado = 1
   or transferencia_sem_confirmacao = 1
order by dh_bucket

-- 6) Correcao de lote (informativo, RN-06 — nao conta como divergencia) +
--    pares orfaos (qt_entradas <> qt_saidas) destacados
select * from #wms_lote order by dh_movimento
select * from #wms_lote_resumo where qt_entradas <> qt_saidas order by dh_movimento

-- 7) Registros brutos por bucket divergente (RF-08 — "dados dos registros
--    envolvidos"). Rodar para cada linha de #resultado que NAO for 'OK',
--    substituindo <nr_nf>/<especie>/<serie>/<dh_bucket> pelos valores da
--    linha:
select wme.* from wms_movimento_estoque wme
left join wms_endereco we on we.cd_endereco = wme.cd_endereco_localizacao
left join wms_bairro wb on wb.cd_bairro = we.cd_bairro
where wme.cd_produto = @cd_produto
and wme.cd_tipo_movimento not in (24, 25)
and (
	(@cd_cd = 534 and (
		wb.cd_filial = 534
		or (wb.cd_filial is null and wme.cd_filial in (select cd_filial from #filiais))
	))
	or (@cd_cd <> 534 and wme.cd_filial in (select cd_filial from #filiais))
)
and isnull(wme.nr_nf, 0) = <nr_nf>
and isnull(wme.de_especie, '') = <especie>
and isnull(wme.de_serie, '') = <serie>
and convert(char(8), wme.dh_movimento, 112) = <dh_bucket>

select * from movimento_estoque
where cd_produto = @cd_produto
and cd_filial_movimento in (select cd_filial from #filiais)
and isnull(nr_nf, 0) = <nr_nf>
and isnull(de_especie, '') = <especie>
and isnull(de_serie, '') = <serie>
and convert(char(8), dh_movimento, 112) = <dh_bucket>
```

### §2.1 — Versao para executar via MCP (sem `#tabela`)

Rodar via `mcp__sybase-hmg` (homologacao, padrao) ou `mcp__sybase-prd`
(producao, so sob pedido explicito do usuario e apos confirmar a consulta
— ver secao "Ambiente" acima). A query abaixo e a mesma nos dois casos.

A ferramenta MCP so aceita **uma unica instrucao `SELECT`** por chamada
(rejeita `SELECT INTO` e multiplas instrucoes). Os passos 1 e 2 do script
canonico nao precisam de SQL: resolva o CD **antes** de montar a query
(ver Passo 1 acima — regra e diferente por lado e, no WMS, diferente para
CD 534 vs qualquer outro CD):

- `<FILIAIS>`: lista textual pro lado ERP e pro fallback do WMS (`534, 1`
  quando `CD = 534`, senao so `<CD>`).
- `<FILTRO_CD_WMS>`: o filtro de CD do lado WMS —
  - **se `CD = 534`:** `(wb.cd_filial = 534 or (wb.cd_filial is null and wme.cd_filial in (534, 1)))`
  - **se `CD` for qualquer outro numero:** `wme.cd_filial in (<FILIAIS>)`
    (raw, sem join — `wms_bairro` so cobre os armazens fisicos de WMS 534
    e 294; usar o join pra outros CDs faria o evento sumir, nao corrigir).

Rode a consulta de correcao de lote (Passo 2) como um `SELECT` simples e
independente, com o mesmo `<FILTRO_CD_WMS>` (join `wms_endereco`/
`wms_bairro` so entra quando `CD = 534`). Os passos 3 a 6 (extracao,
colapso, confirmacao de transferencia, filtro de relevancia, bucket e
classificacao) cabem em **uma unica consulta composta** (varios `SELECT`
ligados por `UNION`, que ainda conta como uma unica instrucao), usando
subqueries no lugar de `#tabela`.

A consulta abaixo esta **completa** (sem placeholder), inclui a
consolidacao de transferencia multi-dia (R-06) e foi **testada com dados
reais** contra o Sybase homolog via `mcp__sybase-hmg` em dois casos:

- Produto 750723, CD 534, filiais `534, 1`, 2025-07-01 a 2025-07-02
  (nao-transferencia): NF 3188937 (WMS=2397 x ERP=2400) e NF 1622972
  (WMS=-1/1 linha x ERP=-4/3 linhas), ambas `QUANTIDADE_DIVERGENTE`,
  `dh_bucket` = dia exato — igual ao resultado antes da correcao do R-06,
  confirmando que NFs normais continuam bucketadas por dia.
- Produto 740472, CD 353 (individual), NF 33, todo 2021 (transferencia
  confirmada que atravessa dois dias — 24/12 e 29/12): antes da correcao
  aparecia como **duas linhas fragmentadas** (uma delas falsamente
  divergente); depois da correcao aparece como **uma linha so**,
  `dh_bucket='TRANSFERENCIA'`, `qt_linhas_wms=3` (as 3 linhas WMS das duas
  datas, consolidadas), `qt_liquida_wms=1` x `qt_liquida_erp=-1`,
  `transferencia_sem_confirmacao=0` (confirmada). **Nota:** essa NF
  especifica continua classificada `QUANTIDADE_DIVERGENTE` mesmo apos a
  correcao — o R-06 resolve a fragmentacao/duplicacao de linhas no
  relatorio, mas nao decide se a transferencia "bateu"; se o WMS e o ERP
  registram sinais diferentes para a perna de origem de uma transferencia
  (visto neste caso real), isso e uma divergencia genuina a investigar na
  fase de causa raiz, nao um bug da consulta.

**Restricao adicional descoberta ao construir esta correcao:** Sybase ASE
**nao aceita subquery dentro de `GROUP BY`** (nem dentro de uma expressao
usada so para agrupar, mesmo que a mesma subquery funcione dentro de um
`SELECT`/`CASE` normal). Por isso a chave `dh_bucket` (que depende de
`exists (select ... from item_nf_transferencia ...)`) e calculada **antes**
do agrupamento, numa subquery intermediaria (`evt2`/`er2`), e so entao
agrupada pela coluna ja materializada — nunca repetir a expressao com
`exists` direto num `group by`.

```sql
-- Substituir @cd_produto, <dt_ini>, <dt_fim>, <FILIAIS> (lista textual,
-- ex.: "534, 1" quando CD=534, senao so "294" — usada no lado ERP e como
-- fallback do WMS), <FILTRO_CD_WMS> (ver secao "Ambiente"/instrucoes
-- acima: se CD=534, usa join wms_endereco/wms_bairro; qualquer outro CD,
-- usa wme.cd_filial in (<FILIAIS>) direto) e <CRUZA_ZONA> (a condicao
-- "and exists (...)" so entra quando o CD e 534; senao, remover esse
-- trecho do WHERE, nas 3 ocorrencias). A confirmacao de transferencia via
-- item_nf_transferencia usa NOT EXISTS/EXISTS correlacionado (nao JOIN)
-- para nao arriscar duplicar linha se houver mais de um item para a
-- mesma NF.

select id_classificacao, nr_nf, de_especie, de_serie, dh_bucket,
       qt_liquida_wms, qt_linhas_wms, qt_liquida_erp, qt_linhas_erp,
       sem_endereco_mapeado, transferencia_sem_confirmacao
from (
	select
		w.nr_nf, w.de_especie, w.de_serie, w.dh_bucket,
		w.qt_liquida_wms, w.qt_linhas_wms,
		e.qt_liquida_erp, e.qt_linhas_erp,
		w.sem_endereco_mapeado, w.transferencia_sem_confirmacao,
		case when w.qt_liquida_wms = e.qt_liquida_erp then 'OK' else 'QUANTIDADE_DIVERGENTE' end as id_classificacao
	from (
		select isnull(nr_nf,0) as nr_nf, isnull(de_especie,'') as de_especie, isnull(de_serie,'') as de_serie,
		       dh_bucket_calc as dh_bucket,
		       sum(qt_liquida_wms) as qt_liquida_wms, sum(qt_linhas_wms) as qt_linhas_wms,
		       max(sem_endereco_mapeado) as sem_endereco_mapeado,
		       max(transferencia_sem_confirmacao_row) as transferencia_sem_confirmacao
		from (
			select
				evt.*,
				case when exists (
				   select 1 from item_nf_transferencia tr
				   where tr.nr_nf = evt.nr_nf and tr.de_especie = evt.de_especie
				   and tr.de_serie = evt.de_serie and tr.cd_produto = @cd_produto
				   and (tr.cd_filial_origem = evt.cd_filial_amostra or tr.cd_filial_destino = evt.cd_filial_amostra)
				) then 'TRANSFERENCIA' else convert(char(8), evt.dh_movimento, 112) end as dh_bucket_calc,
				case when evt.toca_transito = 1 and not exists (
				   select 1 from item_nf_transferencia tr
				   where tr.cd_filial_origem = evt.cd_filial_amostra
				   and tr.nr_nf = evt.nr_nf and tr.de_especie = evt.de_especie
				   and tr.de_serie = evt.de_serie and tr.cd_produto = @cd_produto
				) then 1 else 0 end as transferencia_sem_confirmacao_row
			from (
				select
					wme.cd_chave_movimento,
					min(wme.dh_movimento) as dh_movimento,
					sum(case when wtme.id_entrada_saida='E' then 1 else -1 end * (wme.qt_movimento*isnull(wme.qt_caixa_padrao,1))) as qt_liquida_wms,
					max(case when wb.id_utiliza_saldo='S' then 1 else 0 end) as toca_zona_revenda,
					max(case when wb.id_utiliza_saldo='N' then 1 else 0 end) as toca_zona_segregado,
					max(case when wme.cd_endereco_localizacao='F910010A' then 1 else 0 end) as toca_transito,
					max(isnull(wme.nr_nf,0)) as nr_nf,
					max(isnull(wme.de_especie,'')) as de_especie,
					max(isnull(wme.de_serie,'')) as de_serie,
					max(wme.cd_filial) as cd_filial_amostra,
					count(*) as qt_linhas_wms,
					max(case when we2.cd_endereco is null then 1 else 0 end) as sem_endereco_mapeado
				from wms_movimento_estoque wme
				inner join wms_tipo_movimento_estoque wtme on wtme.cd_tipo_movimento = wme.cd_tipo_movimento
				left join wms_endereco we2 on we2.cd_endereco = wme.cd_endereco_localizacao
				left join wms_bairro wb on wb.cd_bairro = we2.cd_bairro
				where wme.cd_produto = @cd_produto
				and wme.dh_movimento >= '<dt_ini>' and wme.dh_movimento <= '<dt_fim>'
				and wme.cd_tipo_movimento not in (24,25)
				and <FILTRO_CD_WMS>
				group by wme.cd_chave_movimento
			) evt
			where (toca_zona_revenda = 1 and toca_zona_segregado = 1 <CRUZA_ZONA>)
			   or toca_transito = 1
			   or nr_nf <> 0
		) evt2
		group by isnull(nr_nf,0), isnull(de_especie,''), isnull(de_serie,''), dh_bucket_calc
	) w
	inner join (
		select isnull(nr_nf,0) as nr_nf, isnull(de_especie,'') as de_especie, isnull(de_serie,'') as de_serie,
		       dh_bucket_calc as dh_bucket,
		       sum(qt_sinalizada) as qt_liquida_erp, count(*) as qt_linhas_erp
		from (
			select
				er.*,
				case when exists (
				   select 1 from item_nf_transferencia tr
				   where tr.nr_nf = er.nr_nf and tr.de_especie = er.de_especie
				   and tr.de_serie = er.de_serie and tr.cd_produto = @cd_produto
				   and (tr.cd_filial_origem = er.cd_filial_movimento or tr.cd_filial_destino = er.cd_filial_movimento)
				) then 'TRANSFERENCIA' else convert(char(8), er.dh_movimento, 112) end as dh_bucket_calc
			from (
				select
					me.dh_movimento, me.nr_nf, me.de_especie, me.de_serie, me.cd_filial_movimento,
					case when tme.id_entrada_saida='E' then 1 else -1 end
					* case when tme.id_cancelamento='S' then -1 else 1 end * me.qt_movimento as qt_sinalizada
				from movimento_estoque me
				inner join tipo_movimento_estoque tme on tme.cd_tipo_movimento = me.cd_tipo_movimento
				where me.cd_produto = @cd_produto
				and me.dh_movimento >= '<dt_ini>' and me.dh_movimento <= '<dt_fim>'
				and me.cd_filial_movimento in (<FILIAIS>)
			) er
		) er2
		group by isnull(nr_nf,0), isnull(de_especie,''), isnull(de_serie,''), dh_bucket_calc
	) e
	on e.nr_nf=w.nr_nf and e.de_especie=w.de_especie and e.de_serie=w.de_serie and e.dh_bucket=w.dh_bucket
) matched

union

select 'SEM_CONTRAPARTIDA_ERP' as id_classificacao, w.nr_nf, w.de_especie, w.de_serie, w.dh_bucket,
       w.qt_liquida_wms, w.qt_linhas_wms, 0 as qt_liquida_erp, 0 as qt_linhas_erp,
       w.sem_endereco_mapeado, w.transferencia_sem_confirmacao
from (
	select isnull(nr_nf,0) as nr_nf, isnull(de_especie,'') as de_especie, isnull(de_serie,'') as de_serie,
	       dh_bucket_calc as dh_bucket,
	       sum(qt_liquida_wms) as qt_liquida_wms, sum(qt_linhas_wms) as qt_linhas_wms,
	       max(sem_endereco_mapeado) as sem_endereco_mapeado,
	       max(transferencia_sem_confirmacao_row) as transferencia_sem_confirmacao
	from (
		select
			evt.*,
			case when exists (
			   select 1 from item_nf_transferencia tr
			   where tr.nr_nf = evt.nr_nf and tr.de_especie = evt.de_especie
			   and tr.de_serie = evt.de_serie and tr.cd_produto = @cd_produto
			   and (tr.cd_filial_origem = evt.cd_filial_amostra or tr.cd_filial_destino = evt.cd_filial_amostra)
			) then 'TRANSFERENCIA' else convert(char(8), evt.dh_movimento, 112) end as dh_bucket_calc,
			case when evt.toca_transito = 1 and not exists (
			   select 1 from item_nf_transferencia tr
			   where tr.cd_filial_origem = evt.cd_filial_amostra
			   and tr.nr_nf = evt.nr_nf and tr.de_especie = evt.de_especie
			   and tr.de_serie = evt.de_serie and tr.cd_produto = @cd_produto
			) then 1 else 0 end as transferencia_sem_confirmacao_row
		from (
			select
				wme.cd_chave_movimento,
				min(wme.dh_movimento) as dh_movimento,
				sum(case when wtme.id_entrada_saida='E' then 1 else -1 end * (wme.qt_movimento*isnull(wme.qt_caixa_padrao,1))) as qt_liquida_wms,
				max(case when wb.id_utiliza_saldo='S' then 1 else 0 end) as toca_zona_revenda,
				max(case when wb.id_utiliza_saldo='N' then 1 else 0 end) as toca_zona_segregado,
				max(case when wme.cd_endereco_localizacao='F910010A' then 1 else 0 end) as toca_transito,
				max(isnull(wme.nr_nf,0)) as nr_nf,
				max(isnull(wme.de_especie,'')) as de_especie,
				max(isnull(wme.de_serie,'')) as de_serie,
				max(wme.cd_filial) as cd_filial_amostra,
				count(*) as qt_linhas_wms,
				max(case when we2.cd_endereco is null then 1 else 0 end) as sem_endereco_mapeado
			from wms_movimento_estoque wme
			inner join wms_tipo_movimento_estoque wtme on wtme.cd_tipo_movimento = wme.cd_tipo_movimento
			left join wms_endereco we2 on we2.cd_endereco = wme.cd_endereco_localizacao
			left join wms_bairro wb on wb.cd_bairro = we2.cd_bairro
			where wme.cd_produto = @cd_produto
			and wme.dh_movimento >= '<dt_ini>' and wme.dh_movimento <= '<dt_fim>'
			and wme.cd_tipo_movimento not in (24,25)
			and <FILTRO_CD_WMS>
			group by wme.cd_chave_movimento
		) evt
		where (toca_zona_revenda = 1 and toca_zona_segregado = 1 <CRUZA_ZONA>)
		   or toca_transito = 1
		   or nr_nf <> 0
	) evt2
	group by isnull(nr_nf,0), isnull(de_especie,''), isnull(de_serie,''), dh_bucket_calc
) w
where not exists (
	select 1 from (
		select isnull(nr_nf,0) as nr_nf, isnull(de_especie,'') as de_especie, isnull(de_serie,'') as de_serie,
		       dh_bucket_calc as dh_bucket
		from (
			select
				er.*,
				case when exists (
				   select 1 from item_nf_transferencia tr
				   where tr.nr_nf = er.nr_nf and tr.de_especie = er.de_especie
				   and tr.de_serie = er.de_serie and tr.cd_produto = @cd_produto
				   and (tr.cd_filial_origem = er.cd_filial_movimento or tr.cd_filial_destino = er.cd_filial_movimento)
				) then 'TRANSFERENCIA' else convert(char(8), er.dh_movimento, 112) end as dh_bucket_calc
			from (
				select me.dh_movimento, me.nr_nf, me.de_especie, me.de_serie, me.cd_filial_movimento
				from movimento_estoque me
				inner join tipo_movimento_estoque tme on tme.cd_tipo_movimento = me.cd_tipo_movimento
				where me.cd_produto = @cd_produto
				and me.dh_movimento >= '<dt_ini>' and me.dh_movimento <= '<dt_fim>'
				and me.cd_filial_movimento in (<FILIAIS>)
			) er
		) er2
		group by isnull(nr_nf,0), isnull(de_especie,''), isnull(de_serie,''), dh_bucket_calc
	) e
	where e.nr_nf=w.nr_nf and e.de_especie=w.de_especie and e.de_serie=w.de_serie and e.dh_bucket=w.dh_bucket
)

union

select 'SEM_CONTRAPARTIDA_WMS' as id_classificacao, e.nr_nf, e.de_especie, e.de_serie, e.dh_bucket,
       0 as qt_liquida_wms, 0 as qt_linhas_wms, e.qt_liquida_erp, e.qt_linhas_erp,
       0 as sem_endereco_mapeado, 0 as transferencia_sem_confirmacao
from (
	select isnull(nr_nf,0) as nr_nf, isnull(de_especie,'') as de_especie, isnull(de_serie,'') as de_serie,
	       dh_bucket_calc as dh_bucket,
	       sum(qt_sinalizada) as qt_liquida_erp, count(*) as qt_linhas_erp
	from (
		select
			er.*,
			case when exists (
			   select 1 from item_nf_transferencia tr
			   where tr.nr_nf = er.nr_nf and tr.de_especie = er.de_especie
			   and tr.de_serie = er.de_serie and tr.cd_produto = @cd_produto
			   and (tr.cd_filial_origem = er.cd_filial_movimento or tr.cd_filial_destino = er.cd_filial_movimento)
			) then 'TRANSFERENCIA' else convert(char(8), er.dh_movimento, 112) end as dh_bucket_calc
		from (
			select
				me.dh_movimento, me.nr_nf, me.de_especie, me.de_serie, me.cd_filial_movimento,
				case when tme.id_entrada_saida='E' then 1 else -1 end
				* case when tme.id_cancelamento='S' then -1 else 1 end * me.qt_movimento as qt_sinalizada
			from movimento_estoque me
			inner join tipo_movimento_estoque tme on tme.cd_tipo_movimento = me.cd_tipo_movimento
			where me.cd_produto = @cd_produto
			and me.dh_movimento >= '<dt_ini>' and me.dh_movimento <= '<dt_fim>'
			and me.cd_filial_movimento in (<FILIAIS>)
		) er
	) er2
	group by isnull(nr_nf,0), isnull(de_especie,''), isnull(de_serie,''), dh_bucket_calc
) e
where not exists (
	select 1 from (
		select isnull(nr_nf,0) as nr_nf, isnull(de_especie,'') as de_especie, isnull(de_serie,'') as de_serie,
		       dh_bucket_calc as dh_bucket
		from (
			select
				evt.*,
				case when exists (
				   select 1 from item_nf_transferencia tr
				   where tr.nr_nf = evt.nr_nf and tr.de_especie = evt.de_especie
				   and tr.de_serie = evt.de_serie and tr.cd_produto = @cd_produto
				   and (tr.cd_filial_origem = evt.cd_filial_amostra or tr.cd_filial_destino = evt.cd_filial_amostra)
				) then 'TRANSFERENCIA' else convert(char(8), evt.dh_movimento, 112) end as dh_bucket_calc
			from (
				select
					wme.cd_chave_movimento,
					min(wme.dh_movimento) as dh_movimento,
					max(case when wb.id_utiliza_saldo='S' then 1 else 0 end) as toca_zona_revenda,
					max(case when wb.id_utiliza_saldo='N' then 1 else 0 end) as toca_zona_segregado,
					max(case when wme.cd_endereco_localizacao='F910010A' then 1 else 0 end) as toca_transito,
					max(isnull(wme.nr_nf,0)) as nr_nf,
					max(isnull(wme.de_especie,'')) as de_especie,
					max(isnull(wme.de_serie,'')) as de_serie,
					max(wme.cd_filial) as cd_filial_amostra
				from wms_movimento_estoque wme
				left join wms_endereco we2 on we2.cd_endereco = wme.cd_endereco_localizacao
				left join wms_bairro wb on wb.cd_bairro = we2.cd_bairro
				inner join wms_tipo_movimento_estoque wtme on wtme.cd_tipo_movimento = wme.cd_tipo_movimento
				where wme.cd_produto = @cd_produto
				and wme.dh_movimento >= '<dt_ini>' and wme.dh_movimento <= '<dt_fim>'
				and wme.cd_tipo_movimento not in (24,25)
				and <FILTRO_CD_WMS>
				group by wme.cd_chave_movimento
			) evt
			where (toca_zona_revenda = 1 and toca_zona_segregado = 1 <CRUZA_ZONA>)
			   or toca_transito = 1
			   or nr_nf <> 0
		) evt2
	) w
	where w.nr_nf=e.nr_nf and w.de_especie=e.de_especie and w.de_serie=e.de_serie and w.dh_bucket=e.dh_bucket
)
```

Para produto/CD/periodo pequenos (o uso normal desta skill, ja que RF-01
exige produto), essa consulta unica ja cobre as 3 categorias de
classificacao (OK/QUANTIDADE_DIVERGENTE, SEM_CONTRAPARTIDA_ERP,
SEM_CONTRAPARTIDA_WMS) com os sinalizadores de "Atencao"
(`sem_endereco_mapeado`, `transferencia_sem_confirmacao`) e a consolidacao
de transferencia multi-dia (R-06) inclusos.

### Observacoes sobre o script

- **Chave de bucket sem `nr_nf` (`nr_nf = 0`):** ajustes/correcoes sem nota
  fiscal usam so `produto + dia` como chave — mais fraca que quando ha NF.
  Se o relatorio mostrar muitos falsos "sem contrapartida" justamente nesses
  casos, revisar a chave de fallback antes de confiar no resultado (risco
  conhecido, ver ARCH-001 do projeto `auditor-saldo-wms`, R-04).
- **Transferencia via `F910010A` (RN-05):** confirmada via
  `item_nf_transferencia` no Passo 4, usando `NOT EXISTS` (nunca `JOIN`
  direto, para nao arriscar multiplicar linha se houver mais de um item
  para a mesma NF) — eventos que tocam transito sem essa confirmacao
  aparecem na secao "Atencao" do relatorio, nao sao tratados como
  transferencia normal silenciosamente.
- **`qt_caixa_padrao`:** a conversao `qt_movimento * qt_caixa_padrao` do
  lado WMS foi validada como necessaria (sem ela a soma nao bate com o
  ERP), mas o fator exato pode ter uma diferenca pequena e sistematica —
  confirmado com dado real (produto 750723, NF 3188937, 01/07/2025: WMS
  liquido 2397 x ERP 2400, diferenca de 3). Se a categoria "quantidade
  divergente" aparecer com diferencas pequenas e sistematicas, suspeitar
  desse fator primeiro, nao de erro de dado.
- **Tipos de movimento fora da amostra testada:** a maior parte da logica
  (zona, transito, NF) foi validada com dados reais para os tipos mais
  comuns; tipos raros (familia 46–56, transferencia entre CDs) podem se
  comportar de forma inesperada — tratar qualquer resultado estranho
  desses tipos como sinal para investigar, nao como bug garantido da skill.
- **`wms_bairro` e uma tabela pequena e especifica (18 linhas no total),
  nao um mapa geral de filial por endereco:** so cobre os armazens fisicos
  de WMS 534 e 294. Um evento WMS "destinado" a outro CD (ex. 353) fica
  fisicamente dentro do armazem de 534 e resolve `wb.cd_filial = 534` via
  endereco — por isso `<FILTRO_CD_WMS>` so troca pra essa logica quando o
  `CD` sob investigacao e 534; qualquer outro CD continua usando
  `wme.cd_filial` direto (RN-07). Ver caso de referencia 741851/CD 534 na
  tabela acima para o achado real que motivou essa distincao.

## Passo 3 — Gerar o relatorio

Gravar em markdown, **sempre em arquivo** (nao so no chat):

```
<raiz do projeto auditor-saldo-wms>/relatorios/<slug>.md
```

Para achar a raiz do projeto: usar `%CLAMED_DEV_ROOT%` /
`$env:CLAMED_DEV_ROOT` se estiver definida
(`%CLAMED_DEV_ROOT%\01-PROJECTS\ACTIVE\auditor-saldo-wms\relatorios\`). Se a
variavel nao existir nesta maquina, perguntar ao usuario o caminho do
projeto `auditor-saldo-wms` antes de gravar — nunca supor um caminho fixo de
usuario/maquina. `<slug>` sugerido: `<cd_produto>-cd<CD>-<dt_ini>-<dt_fim>`,
com sufixo `-prd` quando a execucao foi em producao (ex.:
`750723-cd534-20250701-20250702-prd.md`) para nao confundir com um
relatorio de homologacao do mesmo produto/CD/periodo.

Formato do relatorio:

```markdown
# Validacao de movimentacao WMS x ERP — produto <cd_produto>, CD <CD>

- Ambiente: <Homologacao | Producao>
- Periodo: <dh_ini> a <dh_fim>
- Filial(is) resolvida(s): <lista> (RN-07)
- Executado em: <timestamp>

## Resumo

| Categoria | Qtd. de eventos |
|-----------|------------------|
| OK (com contrapartida) | N |
| Sem contrapartida no ERP | N |
| Sem contrapartida no WMS | N |
| Quantidade divergente | N |
| Correcao de lote (informativo, nao conta) | N |
| Total avaliado | N |

## Sem contrapartida no ERP

| nr_nf | especie/serie | dia | qt WMS (liquida) | registros WMS envolvidos |
|-------|-----------------|-----|--------------------|-----------------------------|
| ... | ... | ... | ... | (linhas brutas de wms_movimento_estoque do bucket, consulta 7 do §2) |

## Sem contrapartida no WMS

(mesma estrutura, lado ERP, linhas brutas de movimento_estoque)

## Quantidade divergente

| nr_nf | especie/serie | dia | qt WMS | qt ERP | diferenca | registros envolvidos |
|-------|-----------------|-----|--------|--------|-----------|-------------------------|

## Atencao (nao e erro, mas fora do padrao)

- Buckets com liquido batendo mas numero de linhas WMS/ERP muito diferente
  (possivel cancelamento de sinais mascarando problema real).
- Eventos WMS com endereco sem bairro mapeado (`sem_endereco_mapeado`).
- Transferencias (tocam F910010A) sem confirmacao em
  `item_nf_transferencia` (`transferencia_sem_confirmacao`).
- Pares de correcao de lote (tipo 24/25) orfaos — `qt_entradas <> qt_saidas`
  no mesmo produto+data+quantidade.

## Correcao de lote (informativo)

Pares tipo 24/25 identificados no periodo — nao contam como divergencia.
```

Se nenhum movimento for encontrado nos dois sistemas no periodo, gravar o
relatorio mesmo assim, informando isso explicitamente (nao e erro).

Se qualquer consulta falhar (erro de sintaxe, timeout), **nao gravar
relatorio parcial** — reportar o erro ao usuario.

## Casos de referencia conhecidos (para conferir a skill, nao sao regra de negocio)

Uteis para verificar se a skill continua funcionando depois de qualquer
ajuste — todos observados em homologacao:

| Caso | Produto | CD | O que esperar |
|------|---------|----|-----------------|
| NF reaproveitada em dois eventos distintos | 741213 | 534 | NF 13061 aparece em duas datas bem separadas — nao devem ser tratadas como um so evento |
| Compra com contrapartida completa (com diferenca pequena esperada) | 750723 | 534 | NF 3188937, 01/07/2025 — WMS liquido 2397 x ERP 2400 (diferenca 3, ver observacao sobre `qt_caixa_padrao`); mesma janela tem NF 1622972 com WMS=-1/1 linha x ERP=-4/3 linhas — um caso real de "quantidade divergente" |
| Transferencia via endereco de transito, com confirmacao | 740472 | 534 | Movimentos de transferencia confirmados em `item_nf_transferencia` devem casar sem aparecer como divergencia so por estarem em filiais diferentes |
| Correcao/troca de lote | 29478, 665533, 665541, 693916, 695769 | (a que o produto usar) | Pares tipo 24/25 — devem aparecer so na secao informativa, nunca como divergencia de quantidade |
| Transferencia entre CDs cancelada (familia de tipos 46-56) | 636 | 294 | Periodo 2026-04-01 a 2026-07-31 — NF 6, tipos 49 (SAIDA TRANSF CD) + 51 (CANCELAMENTO SAIDA TRANSF CD): WMS liquido 0 (ciclo cancelado corretamente), ERP liquido -200 na mesma filial/NF — caso real de "quantidade divergente" nesta familia de tipos, ainda sem causa raiz explicada. Mesmo periodo/CD tambem tem 3 casos `OK` (NFs 2164868, 2165039, 2164647). Confirma tambem que CD 294 (individual, sem split) resolve corretamente via RN-07. |
| CD individual (sem split 534/1) | 636 ou 740472 (ver casos acima, CDs 294 e 353) | 294 ou 353 | RN-07: CD diferente de 534 usa a propria filial, sem aplicar a logica de "cruza zona revenda/segregado" (essa so vale para 534) |
| Filtro de CD no WMS (`<FILTRO_CD_WMS>`), caso CD=534 | 741851 | 534 | 01-05/07/2026 (`wme.dh_movimento`) — com `wme.cd_filial in (534, 1)` direto (bug), a skill via 200 linhas (limite da consulta) todas `SEM_CONTRAPARTIDA_WMS`, sugerindo falsamente que o WMS quase nao movimenta esse produto. Corrigido para `wb.cd_filial = 534` (via `wms_endereco`/`wms_bairro`), o resultado vira 1 `QUANTIDADE_DIVERGENTE`, 0 `SEM_CONTRAPARTIDA_ERP` e 301 `SEM_CONTRAPARTIDA_WMS` — ainda um numero alto, mas agora um achado real de negocio (a investigar por causa raiz depois), nao um artefato do filtro. Reexecutar tambem 740472/CD 353 (transferencia) apos qualquer ajuste neste filtro — usa o outro branch (CD<>534) e nao pode regredir. |

## Restricoes (nao negociaveis)

- Homologacao (`mcp__sybase-hmg`) e o padrao. So rodar contra producao
  (`mcp__sybase-prd`) se o usuario pedir explicitamente, e so depois de
  confirmar com ele a consulta (produto, CD, periodo) que sera executada.
- Nunca escrever em nenhuma tabela, em nenhum ambiente — a skill e so
  leitura (`SELECT`).
- Nunca fazer `SELECT` sem `cd_produto` no filtro, em nenhum ambiente.
- Nunca gravar relatorio parcial se uma consulta falhar.
- Nunca colar parametro do usuario direto na query sem checar que
  `cd_produto`/`CD` sao inteiros e `dh_ini`/`dh_fim` sao datas validas.



