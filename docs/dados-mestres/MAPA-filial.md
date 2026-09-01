# MAPA — tabela `filial`

| Metadado | Valor |
|----------|-------|
| Gerado em | 2026-09-01 |
| Fonte schema | Sybase homolog (`dbo.filial`) |
| PK | `cd_filial` (int) |
| Colunas | 93 |
| Skill | `mapeador-dados-mestres` |

## Resumo executivo

- **GE063** (Gestão de Filiais) é o cadastro principal — ~48 colunas editáveis em `dw_ge063_cadastro_filial`.
- **WS022** (WMS) / **GE310** (Contas a Receber) mantém logística: prioridade faturamento, rota, frete, período, bacia.
- **GE168** mantém estoque base: perfil estoque, movimento EB, remanejamento.
- **GE212** (`ds_076_filial`, Troca Dados Loja) replica matriz→loja, incluindo campos que o GE063 não grava (subgerente, loja polo, CD, manipulação).
- **~35 colunas** sem tela PB identificada (legado, batch, carga externa).
- Triggers **`ti_filial`** / **`tu_filial`**: integração (`int_controle`), histórico, efeitos colaterais.
- Uso transversal: **`uo_filial`**, **`vw_filial`**, **`uo_nota_fiscal`** — chave em pedido, NF, estoque, login.

## Cadastro principal (gravação)

| Tela | Objeto PB | O que grava |
|------|-----------|-------------|
| **GE063** | `w_ge063_cadastro_filial` / `dw_ge063_cadastro_filial` | Identificação, endereço, contato, flags operacionais, vínculos, regulatório básico |
| **WS022** | `w_ws022_cadastro_prioridade_faturamento` / `dw_ws022_prioridade_faturamento` | Prioridade faturamento, rota, frete, dias entrega, bacia, período |
| **GE168** | `w_ge168_manutencao_novo_estoque_base` / `dw_ge168_lista_filiais_novo_calculo_eb` | Perfil estoque, início movimento EB, remanejamento |
| **GF006** | `w_gf006_manutencao_bloqueio_controlados` | `id_bloqueia_pedido_psico` (UPDATE direto) |
| **RL014** | `w_rl014_parametro_sistema` | `id_abre_domingo` (UPDATE direto) |
| **GE212** | `ds_076_filial` (Troca Dados Loja) | Réplica matriz: subgerente, sede DrogaExpress, loja polo, portador, transportadoras, flags CD/manipulação |
| **RO036** | `uo_rateio_estoque_central` | `nr_prioridade_rateio` (batch rateio CD) |
| **RO112** | `uo_ro112_carga_pdv_java` | `id_bloqueia_pedido_psico` (carga PDV Java) |

Legenda **Uso** (consumidores recorrentes):

- **FK universal** — chave em pedido, estoque, NF, login, parâmetros
- **uo_filial** — lookup (`uo_ge009`)
- **uo_nota_fiscal** — cabeçalho NF
- **vw_filial** — view filiais ativas (integração)
- **WMS/GE259** — pedido filial, picking, romaneio
- **Fiscal/RL** — SPED, transferência, SNGPC

---

## Mapa por campo

### Identificação (1–6)

| # | Campo | Domínio | Gravação | Uso principal | Por quê |
|---|-------|---------|----------|---------------|---------|
| 1 | `cd_filial` | PK int | GE063 insert; `ti_filial` | FK universal, `uo_filial` | Identificador único da loja |
| 2 | `nm_fantasia` | varchar(40) | GE063; GE212 | `uo_nota_fiscal`, `w_ge009`, `vw_filial` | Nome operacional em telas e documentos |
| 3 | `nm_razao_social` | varchar(40) | GE063; GE212 | NF, SPED, exportações (EL009) | Razão social legal |
| 4 | `cd_empresa` | FK smallint | GE063 (`initial=1`); GE212 | Multi-empresa, SAP | Empresa do grupo |
| 5 | `nr_cgc` | varchar(14) CNPJ | GE063; GE212 | `uo_nota_fiscal`, SNGPC (RL098) | CNPJ do estabelecimento |
| 6 | `nr_inscricao_estadual` | varchar(15) | GE063; GE212 | NF, GIA-ST (FI070), Bloco X | IE da UF sede |

### Classificação e endereço (7–12, 64, 80)

| # | Campo | Domínio | Gravação | Uso principal | Por quê |
|---|-------|---------|----------|---------------|---------|
| 7 | `cd_perfil_filial` | FK smallint | GE063 (`initial=0` na inclusão) | Regras comerciais por perfil | Classificação comercial |
| 8 | `cd_regiao` | FK → `regiao` | GE063 (obrigatório); GE212 | `vw_filial`, rateio regional | Região comercial + gerente regional |
| 9 | `cd_cidade` | FK → `cidade` | GE063 (`uo_cidade`) | UF/ICMS (`gf_uf_filial`), NF | Município e UF |
| 10 | `de_endereco` | varchar(40) | GE063; GE212 | `uo_nota_fiscal`, etiquetas WMS | Logradouro fiscal |
| 11 | `de_bairro` | varchar(20) | GE063; GE212 | NF, cadastros regulatórios | Bairro |
| 12 | `nr_cep` | char(8) | GE063; GE212 | NF, frete | CEP |
| 64 | `nr_endereco` | int | GE063; GE212 | NF | Número do imóvel |
| 80 | `de_complemento_endereco` | varchar(40) | GE063 | NF | Complemento endereço |

### Contato (13–16, 30, 60–61)

| # | Campo | Domínio | Gravação | Uso principal | Por quê |
|---|-------|---------|----------|---------------|---------|
| 13 | `nr_ddd_telefone` | char(3) | GE063; `ds_ge063_telefones` | Cadastro, relatórios | DDD telefone |
| 14 | `nr_telefone` | char(15) | GE063; lista telefones | Idem | Telefone |
| 15 | `nr_ddd_fax` | char(3) | GE063; lista telefones | Legado | Fax DDD |
| 16 | `nr_fax` | char(15) | GE063; lista telefones | Legado | Fax |
| 30 | `nm_contato` | varchar(40) | GE063; GE212 | Referência na loja | Contato |
| 60 | `nr_ddd_telefone_cobranca` | char(3) | GE063 | Financeiro | DDD cobrança |
| 61 | `nr_telefone_cobranca` | char(15) | GE063 | Financeiro | Telefone cobrança |

### Operacional básico (17–18, 31)

| # | Campo | Domínio | Gravação | Uso principal | Por quê |
|---|-------|---------|----------|---------------|---------|
| 17 | `nr_funcionarios` | smallint | GE063; GE212 | Indicadores | Tamanho da equipe |
| 18 | `cd_transportadora` | FK smallint | GE063 (`initial=1`); GE212 | Expedição, romaneio | Transportadora padrão |
| 31 | `de_regiao_celos` | char(3) | GE063; GE212 | Legado Celos | Região sistema antigo |

### Flags `id_*` (19–27, 38, 45–46, 56–59, 62, 66, 82–85)

| # | Campo | Domínio | Gravação | Uso principal | Por quê |
|---|-------|---------|----------|---------------|---------|
| 19 | `id_situacao` | `A` / `I` | GE063; GE212 | Filtro ativas (WS022, `vw_filial`) | Ativa/inativa |
| 20 | `id_regional` | `S` / `N` | GE063; GE212 | Classificação regional | Flag regional |
| 21 | `id_24horas` | `S` / `N` | GE063; GE212 | WS022, priorização | Loja 24h |
| 22 | `id_auto_servico` | `S` / `N` | GE063; GE212 | Formato loja | Auto-serviço |
| 23 | `id_drugstore` | `S` / `N` | GE063; GE212 | Formato loja | Drugstore |
| 24 | `id_abre_domingo` | `S` / `N` | GE063; GE212; RL014 | Parâmetro loja | Abre domingo |
| 25 | `id_possui_estoque` | `S` / `N` | GE063 | WMS, pedido filial | Tem estoque próprio |
| 26 | `id_loja_polo` | `S` / `N` | GE212 | Hierarquia polo | Loja polo |
| 27 | `id_carregado_as400` | `S` / `N` | sem tela PB | Legado | AS/400 |
| 38 | `id_pedido_centralizado` | `S` / `N` | sem tela PB | Pedidos centralizados | Pedido via centralizadora |
| 45 | `id_pedido_santacruz_sp` | `S` / `N` | sem tela PB | Integração SP | Santa Cruz SP |
| 46 | `id_projeto_conexao` | `S` / `N` | GE063 | Legado | Projeto Conexão |
| 56 | `id_aberta` | `S` / `N` | GE063 | `vw_filial`, operação diária | Aberta/fechada hoje |
| 58 | `id_centro_distribuicao` | `S` / `N` | GE212 | Login WMS | Filial é CD |
| 59 | `id_manipulacao` | `S` / `N` | GE212 | RL058 manipulados | Loja manipulação |
| 62 | `id_ecommerce` | `S` / `N` | sem tela PB | `ecommerce_*`, VTEX | Ecommerce |
| 66 | `id_periodo_faturamento` | `M` / `T` / vazio | WS022 | Grade faturamento CD | Turno faturamento |
| 82 | `id_recebe_nf_transferencia` | `S` / `N` | sem tela PB | GE134, `vw_filial` | Recebe NF transferência |
| 84 | `id_receb_remanejto` | `S` / `N` | GE168 | Estoque base | Aceita remanejamento |
| 85 | `id_sistema_novo` | `S` / `N` | sem tela PB (GE537/509) | PDV Java | Migração PDV |

### Pessoas (28–29, 47, 52, 92)

| # | Campo | Domínio | Gravação | Uso principal | Por quê |
|---|-------|---------|----------|---------------|---------|
| 28 | `nr_matricula_gerente` | FK `usuario` | GE063; GE212 | `historico_gerente_filial` | Gerente |
| 29 | `nr_matricula_subgerente` | FK `usuario` | GE212 (não GE063) | `historico_subgerente_filial` | Subgerente |
| 47 | `nr_matric_responsavel_anvisa` | FK `usuario` | GE063 | SNGPC (RL098) | Responsável ANVISA |
| 52 | `nr_matricula_radar` | char(6) | sem tela PB | Controle radar | Responsável radar |
| 92 | `nr_matricula_supervisor` | varchar(6) | sem tela PB | Hierarquia | Supervisor |

### Vínculos entre filiais (34–35, 41, 51, 57)

| # | Campo | Domínio | Gravação | Uso principal | Por quê |
|---|-------|---------|----------|---------------|---------|
| 34 | `cd_filial_centralizadora` | FK `filial` | GE063 | Pedidos centralizados | Centralizadora |
| 35 | `cd_filial_sede_drogaexpress` | FK `filial` | GE212 | DrogaExpress | Sede |
| 41 | `cd_filial_estoque_estrategico` | FK `filial` | sem tela PB | Estoque estratégico | CD estratégico |
| 51 | `cd_filial_radar` | int | sem tela PB | Radar | Código Radar |
| 57 | `cd_filial_centro_distribuicao` | FK `filial` | GE063 (default 534) | WMS, `uo_ge259_pedido_filial` | CD abastecedor |

### Regulatório (32–33, 44, 48–50, 93)

| # | Campo | Domínio | Gravação | Uso principal | Por quê |
|---|-------|---------|----------|---------------|---------|
| 32 | `nr_inscricao_junta_comercial` | varchar(11) | GE063; GE212 | Documentos legais | Junta comercial |
| 33 | `dh_inscricao_junta_comercial` | datetime | GE063 | Cadastro legal | Data inscrição |
| 44 | `nr_licenca_vig_sanitaria` | varchar(10) | GE063; GE212 | Vigilância sanitária | Licença |
| 48 | `de_login_sngpc` | varchar(40) | sem tela PB | SNGPC | Login |
| 49 | `de_senha_sngpc` | char(10) | sem tela PB | SNGPC | Senha |
| 50 | `vl_maximo_caixa` | decimal | GE063; GE212 | Caixa PDV | Limite caixa |
| 93 | `nr_inscricao_municipal` | varchar(30) | sem tela PB | NF (EL009) | IM |

### Estoque e logística (39–40, 53–55, 63, 67–70, 77, 83)

| # | Campo | Domínio | Gravação | Uso principal | Por quê |
|---|-------|---------|----------|---------------|---------|
| 39 | `cd_perfil_estoque` | FK perfil | GE168 | Estoque base | Perfil reposição |
| 40 | `qt_impressora_fiscal` | smallint | GE063 | Fiscal legado | Impressoras fiscais |
| 53 | `id_bloqueia_pedido_psico` | 0/1/2/3 | GF006; RO112 | Pedido controlados | Bloqueio psico/antibiótico |
| 54 | `cd_transportadora_entrada` | varchar(9) | GE212 | Recebimento | Transp. entrada |
| 55 | `cd_transportadora_saida` | varchar(9) | GE212 | Expedição | Transp. saída |
| 63 | `nr_prioridade_rateio` | int | RO036 batch | Rateio CD | Prioridade rateio |
| 67 | `nr_rota_entrega` | int | WS022 | RL058, GE259 picking | Rota entrega |
| 68 | `dh_reinauguracao` | datetime | GE063 | Relatórios (EL001) | Reinauguração |
| 69 | `nr_dias_entrega` | int | WS022 | Prazo entrega | Dias entrega |
| 70 | `cd_grupo_feriado` | FK smallint | sem tela PB | Feriados loja | Grupo feriado |
| 77 | `pc_frete` | decimal | WS022 | Frete pedido | % frete |
| 83 | `nr_ordem_bacia` | int | WS022 | Separação CD | Ordem bacia picking |

### Faturamento e rede (37, 73–74, 91)

| # | Campo | Domínio | Gravação | Uso principal | Por quê |
|---|-------|---------|----------|---------------|---------|
| 37 | `nr_prioridade_faturamento` | smallint | WS022 | Fila faturamento, RO037 | Prioridade faturamento |
| 73 | `id_rede_filial` | CD/DC/PP/FA/MP/PF/CP | GE063 (+ `parametro_loja`) | `vw_filial`, ecommerce | Marca/rede |
| 74 | `cd_porte` | FK porte | sem tela PB (`filial_porte`) | `vw_filial` | Porte loja |
| 91 | `id_agrupamento` | char(1) | sem tela PB | `tu_filial` porte | Agrupamento porte |

### Geolocalização e marketing (71–72, 75–76, 87–90)

| # | Campo | Domínio | Gravação | Uso principal | Por quê |
|---|-------|---------|----------|---------------|---------|
| 71 | `nr_latitude` | decimal | sem tela PB | EL100 SAP | Geolocalização |
| 72 | `nr_longitude` | decimal | sem tela PB | EL100 | Geolocalização |
| 75 | `nr_latitude_distancia` | decimal | sem tela PB | Distância logística | Lat. distância |
| 76 | `nr_longitude_distancia` | decimal | sem tela PB | Idem | Long. distância |
| 87 | `de_link_avaliacao_google` | varchar(150) | sem tela PB | Marketing | Link Google |
| 89 | `de_link_reduzido_google` | varchar(50) | sem tela PB | Marketing | Link curto |
| 90 | `cd_gln` | varchar(15) | sem tela PB | Logística GLN | Código GLN |

### Estoque base, PDV e datas (36, 42–43, 65, 78–79, 81, 86, 88)

| # | Campo | Domínio | Gravação | Uso principal | Por quê |
|---|-------|---------|----------|---------------|---------|
| 36 | `dh_ultimo_saldo` | datetime | sem tela PB (batch) | Controle saldo | Último saldo |
| 42 | `qt_pontos_limite_credito` | smallint | sem tela PB | Crédito loja | Limite crédito |
| 43 | `cd_portador` | FK smallint | GE212 | Financeiro | Portador |
| 65 | `cd_micro_regiao` | FK smallint | sem tela PB | Micro-região | Subdivisão região |
| 78 | `dh_inicio_movimento_calculo_eb` | datetime | GE168 | Cálculo EB | Início movimento EB |
| 79 | `de_motivo_inicio_movto_calc_eb` | varchar(60) | GE168 | Auditoria EB | Motivo alteração |
| 81 | `nr_agencia_celos` | char(2) | sem tela PB | Legado Celos | Agência |
| 86 | `dh_inicio_pdv_novo` | datetime | sem tela PB | Migração PDV | Início PDV novo |
| 88 | `dh_abertura` | datetime | sem tela PB | EL001 | Abertura loja |

---

## Triggers (sybase-objects)

| Objeto | Evento | Efeito | Por quê |
|--------|--------|--------|---------|
| `ti_filial` | INSERT | `int_controle`, `filial_auxiliar`, `centro_custo`, `parametro_loja`, log VTEX | Estruturar filial nova |
| `tu_filial` | UPDATE | `int_controle`, histórico gerente/subgerente/filial, reação `id_agrupamento` | Propagar mudanças |
| `td_filial` | DELETE | Restrito | Exclusão rara |

## Lacunas

- 35 colunas sem tela PB de cadastro.
- Consumidores de leitura: centenas de objetos PB — mapa lista principais.
- Aprofundar coluna: skill `mapeador-dados-mestres-coluna` → `MAPA-filial.<coluna>.md`
