# Exemplo de referência — tabela `filial`

Trecho ilustrativo do formato esperado (não é mapa completo dos 93 campos). Mostra **gravação ≠ uso**.

> Desde a padronização MD+XLSX, cada tabela abaixo (Identificação, Endereço, Contato, …) vira **linhas da aba `Mapa por campo`** no `.xlsx` — não texto solto no `.md`. Estrutura de colunas mantida como referência de conteúdo.

## Cadastro principal (gravação)

| Tela | Objeto | Escopo |
|------|--------|--------|
| GE063 | `w_ge063_cadastro_filial` / `dw_ge063_cadastro_filial` | Maioria dos campos editáveis de `filial` |
| WS022 | `w_ws022_cadastro_prioridade_faturamento` | Prioridade, rota, frete, período faturamento |
| GE168 | `dw_ge168_lista_filiais_novo_calculo_eb` | Perfil estoque, movimento EB, remanejamento |
| GF006 | `w_gf006_manutencao_bloqueio_controlados` | `id_bloqueia_pedido_psico` |
| RL014 | `w_rl014_parametro_sistema` | Só `id_abre_domingo` (UPDATE direto) |
| RO036 | `uo_rateio_estoque_central` | `nr_prioridade_rateio` (batch) |

## Identificação

| Campo | Tipo | Domínio | Gravação | Uso principal | Por quê |
|-------|------|---------|----------|---------------|---------|
| cd_filial | int | PK | GE063 (nova filial); `ti_filial` dispara estruturas filhas | Login, pedido, NF, estoque — sempre como FK | Identificador único da loja |
| nm_fantasia | varchar(40) | texto | GE063 | Cabeçalho NF (`uo_nota_fiscal`), seleção filial (`w_ge009`), relatórios | Nome operacional visível |
| nm_razao_social | varchar(40) | texto | GE063 | NF, SPED, exportações fiscais | Razão social legal do estabelecimento |
| cd_empresa | smallint | FK empresa grupo | GE063 (`initial="1"`) | Filtros multi-empresa, integração SAP | Vincula filial à empresa do conglomerado |
| nr_cgc | varchar(14) | CNPJ 14 dígitos | GE063 (máscara) | NF-e, SNGPC, validações fiscais | Documento federal do emitente |
| nr_inscricao_estadual | varchar(15) | IE UF sede | GE063 | NF, GIA-ST, Bloco X | Inscrição estadual da loja na UF do endereço |

## Endereço

| Campo | Tipo | Domínio | Gravação | Uso principal | Por quê |
|-------|------|---------|----------|---------------|---------|
| cd_cidade | int | FK → `cidade` | GE063 via `uo_cidade` / `wf_localiza_cidade` | Join para `cd_uf` (ICMS, CFOP, SPED) | Define município e UF |
| de_endereco | varchar(40) | texto | GE063 | NF, etiquetas transporte | Logradouro no documento fiscal |
| de_bairro | varchar(20) | texto | GE063 | NF, cadastro ANVISA | Bairro do estabelecimento |
| nr_cep | char(8) | CEP | GE063 | NF, cálculo frete, geocode | CEP da loja |
| nr_endereco | int | número | GE063 | NF (número do imóvel) | Complementa endereço fiscal |
| de_complemento_endereco | varchar(40) | texto | GE063 | NF quando preenchido | Sala, bloco, referência |

## Contato

| Campo | Tipo | Domínio | Gravação | Uso principal | Por quê |
|-------|------|---------|----------|---------------|---------|
| nr_ddd_telefone / nr_telefone | char | DDD + fone | GE063; telefones extras via `ds_ge063_telefones` | Cadastro, eventual exibição em relatórios | Contato da loja |
| nr_ddd_fax / nr_fax | char | idem | GE063 (tipo fax na lista telefones) | Legado / pouco uso | Fax do estabelecimento |
| nr_ddd_telefone_cobranca / nr_telefone_cobranca | char | idem | GE063 | Cobrança / financeiro | Telefone para assuntos financeiros |
| nm_contato | varchar(40) | texto | GE063 | Referência humana na loja | Pessoa de contato |

## Classificação

| Campo | Tipo | Domínio | Gravação | Uso principal | Por quê |
|-------|------|---------|----------|---------------|---------|
| cd_regiao | smallint | FK → `regiao` | GE063 (obrigatório na validação) | Rateio comercial, gerente regional (`vw_filial`) | Agrupa lojas por região de vendas |
| cd_perfil_filial | smallint | FK perfil | GE063; na inclusão forçado `0` após update | Regras comerciais por perfil de loja | Classificação comercial da filial |
| cd_transportadora | smallint | FK transportadora | GE063 (`initial="1"`) | Expedição, romaneio | Transportadora padrão da loja |
| nr_funcionarios | smallint | inteiro | GE063 | Indicadores / cadastro | Tamanho da equipe |
| de_regiao_celos | char(3) | código legado | GE063 | Integrações legadas Celos | Região sistema antigo |

## Vínculos

| Campo | Tipo | Domínio | Gravação | Uso principal | Por quê |
|-------|------|---------|----------|---------------|---------|
| cd_filial_centralizadora | int | FK → `filial` | GE063 + `uo_filial` | Pedidos centralizados | Loja que concentra pedidos de outras |
| cd_filial_centro_distribuicao | int | FK → `filial` | GE063; default **534** na inclusão | WMS abastecimento, pedido filial | CD que abastece a loja |

## Pessoas

| Campo | Tipo | Domínio | Gravação | Uso principal | Por quê |
|-------|------|---------|----------|---------------|---------|
| nr_matricula_gerente | char(6) | FK → `usuario` | GE063 | `tu_filial` → `historico_gerente_filial`; organograma | Responsável pela loja |
| nr_matric_responsavel_anvisa | char(6) | FK → `usuario` | GE063 | SNGPC, XML ANVISA (RL098) | Responsável técnico regulatório |

## Regulatório

| Campo | Tipo | Domínio | Gravação | Uso principal | Por quê |
|-------|------|---------|----------|---------------|---------|
| nr_inscricao_junta_comercial | varchar(11) | texto | GE063 | Documentos legais | Registro na junta comercial |
| dh_inscricao_junta_comercial | datetime | data | GE063 | Cadastro legal | Data do registro |
| nr_licenca_vig_sanitaria | varchar(10) | texto | GE063 | Fiscalização sanitária | Licença da vigilância |
| qt_impressora_fiscal | smallint | inteiro | GE063 | Legado ECF / parametrização fiscal | Qtd. impressoras fiscais |
| vl_maximo_caixa | decimal | valor | GE063 | Controle de caixa PDV | Limite de valor em caixa |

## Datas

| Campo | Tipo | Domínio | Gravação | Uso principal | Por quê |
|-------|------|---------|----------|---------------|---------|
| dh_reinauguracao | datetime | data | GE063 | Relatórios operacionais, EL001 | Data de reabertura da loja |

## Flags `id_*` (amostra — padrão S/N salvo exceção)

| Campo | Valores | Gravação | Uso principal | Por quê |
|-------|---------|----------|---------------|---------|
| id_situacao | A / I | GE063 | `WHERE id_situacao='A'` em listas operacionais | Ativa/inativa no cadastro |
| id_24horas | S / N | GE063; leitura WS022 | Priorização faturamento | Loja 24 horas |
| id_rede_filial | CD, DC, PP, … | GE063 + espelho `parametro_loja` | `vw_filial`, ecommerce, branding | Marca/rede da loja |
| id_aberta | S / N | GE063 | Operação loja aberta/fechada | Status operacional do dia |
| id_periodo_faturamento | M / T / vazio | WS022 | Grade de faturamento CD | Turno preferencial de faturamento |

## Sem tela PB (exemplos)

| Campo | Gravação | Uso | Por quê |
|-------|----------|-----|---------|
| dh_ultimo_saldo | Processo batch | Controle estoque | Última data de saldo processado |
| nr_latitude / nr_longitude | Sem tela PB | Export SAP (EL100) | Geolocalização para integrações |
