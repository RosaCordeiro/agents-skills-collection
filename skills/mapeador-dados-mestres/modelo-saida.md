# Modelo de saída — mapeador de dados mestres

**Arquivo obrigatório:** `99-ARCHIVE/Projetos/Especificações/dados-mestres/MAPA-<tabela>.md`

Copiar/adaptar o conteúdo abaixo nesse arquivo. **Uma linha por campo** nas tabelas de detalhe (ou agrupar só se gravação/uso forem idênticos para todo o grupo). No chat: só resumo + caminho.

```markdown
# MAPA — tabela `<tabela>`

| Metadado | Valor |
|----------|-------|
| Gerado em | YYYY-MM-DD |
| PK | … |
| Colunas | N |
| Skill | mapeador-dados-mestres |

## Escopo
- Tabela(s):
- PK / FK principais:
- Total de colunas (homolog):
- Sistemas PB com gravação encontrada:

## Resumo executivo
[3–6 bullets: cadastro principal, quantas colunas têm tela PB, principais consumidores, triggers relevantes]

## Cadastro principal (gravação)
| Tela | Objeto PB | O que grava | Observação |
|------|-----------|-------------|------------|
| GE063 | w_ge063_cadastro_filial / dw_ge063_cadastro_filial | Subconjunto de `filial` | Cadastro mestre de loja |

## Mapa por campo

### Identificação
| Campo | Tipo | Domínio | Gravação | Uso principal | Por quê |
|-------|------|---------|----------|---------------|---------|
| cd_filial | int | PK sequencial | GE063 (insert); trigger `ti_filial` cria `filial_auxiliar`, centro_custo | Chave em pedido, NF, estoque, login | Identificador único da loja no ecossistema |
| nm_fantasia | varchar(40) | texto | GE063 | NF, etiquetas, telas de seleção filial | Nome exibido ao usuário e em documentos |
| ... | | | | | |

### Endereço
| Campo | Tipo | Domínio | Gravação | Uso principal | Por quê |
|-------|------|---------|----------|---------------|---------|
| cd_cidade | int | FK → `cidade` | GE063 (lookup `uo_cidade`) | Join UF para ICMS, SPED, endereço NF | Define município e UF da filial |
| ... | | | | | |

### Flags `id_*`
| Campo | Valores | Gravação | Uso principal | Por quê |
|-------|---------|----------|---------------|---------|
| id_situacao | A ativa / I inativa | GE063 | Filtro `WHERE id_situacao='A'` em rateio, listas | Excluir lojas fechadas de operação |
| ... | | | | |

### Campos sem tela PB
| Campo | Gravação inferida | Uso principal | Por quê |
|-------|-------------------|---------------|---------|
| dh_ultimo_saldo | Processo batch saldo | Relatórios estoque | Data do último fechamento de saldo |
| ... | | | |

## Triggers e efeitos colaterais (sybase-objects)
| Objeto | Evento | Efeito | Por quê |
|--------|--------|--------|---------|
| ti_filial | INSERT | `int_controle`, `filial_auxiliar`, `centro_custo` | Integração e estrutura financeira da nova loja |
| tu_filial | UPDATE | `int_controle`, histórico gerente | Propagar mudança para integrações |

## Relacionados (outras tabelas — não são colunas da tabela alvo)
| Campo lógico | Tabela real | Gravação | Uso | Por quê |
|--------------|-------------|----------|-----|---------|
| id_liberada_nfe | parametro_loja ID_NFE_LIBERADA | GE063 (wf_grava) | Emissão NFe | Liberar loja para NFe sem coluna em `filial` |

## Lacunas
- [ ] Colunas sem evidência de gravação PB
- [ ] Consumidores não mapeados (se grep truncado)

## Próximo passo
- Mapa encerrado / aprofundar coluna X / spec / implementação
```

## Colunas da tabela de campo (obrigatórias)

| Coluna | Conteúdo |
|--------|----------|
| **Gravação** | Tela/código (`GE063`, `WS022`, `UPDATE` em `w_rl014`, `RO036` batch, **sem tela PB**) |
| **Uso principal** | 1–3 objetos PB ou views/SPs (não dump de 50 arquivos) |
| **Por quê** | Uma frase de negócio — o motivo do campo existir ou ser lido ali |
| **Domínio** | `values=` do DW, FK, ou tabela de códigos; omitir se óbvio (varchar livre) |

## Anti-padrões (não fazer)

- ❌ "GE063" na coluna Uso quando o campo é **gravado** lá — usar coluna Gravação.
- ❌ Listar WMS/Fiscal como "cadastro" só porque fazem `SELECT filial`.
- ❌ Misturar `parametro_loja` com colunas da tabela sem seção Relacionados.
- ❌ Domínio `S/N` sem confirmar no DW ou homolog.
