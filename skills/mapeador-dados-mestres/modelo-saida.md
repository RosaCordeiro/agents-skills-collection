# Modelo de saída — mapeador de dados mestres

**Entrega obrigatória: dois arquivos, mesma pasta, mesmo `<tabela>`:**

- `MAPA-<tabela>.md` — narrativa (escopo, resumo executivo, lacunas, próximo passo). Curto, sem tabelão de campo.
- `MAPA-<tabela>.xlsx` — todo o detalhe tabular, **uma aba por eixo**, sempre as mesmas 5 abas com os mesmos títulos e colunas (é o padrão desta skill até adotarmos uma forma mais profissional de fazer esse mapeamento). O `.md` **sempre cita** o nome do `.xlsx` — não gerar um sem o outro.

Gerar o `.xlsx` com **Python (`openpyxl`)** — ver skeleton no fim deste arquivo. Sobrescrever ambos os arquivos a cada atualização (não versionar por data no nome).

## `.md` — narrativa

```markdown
# MAPA — tabela `<tabela>`

| Metadado | Valor |
|----------|-------|
| Gerado em | YYYY-MM-DD |
| PK | … |
| Colunas | N |
| Skill | mapeador-dados-mestres |
| Detalhe tabular | `MAPA-<tabela>.xlsx` (5 abas — ver abaixo) |

## Escopo
- Tabela(s):
- PK / FK principais:
- Total de colunas (homolog):
- Sistemas PB com gravação encontrada:

## Resumo executivo
[3–6 bullets: cadastro principal, quantas colunas têm tela PB, principais consumidores, triggers relevantes]

Campo a campo, telas de gravação, triggers e tabelas relacionadas: ver `MAPA-<tabela>.xlsx`.

## Lacunas
- [ ] Colunas sem evidência de gravação PB
- [ ] Consumidores não mapeados (se grep truncado)

## Próximo passo
- Mapa encerrado / aprofundar coluna X / spec / implementação
```

## `.xlsx` — as 5 abas obrigatórias (mesmo nome e mesmas colunas em toda tabela mapeada)

### 1. `Cadastro principal (gravação)`
| Tela | Objeto PB | O que grava | Observação |
|------|-----------|-------------|------------|
| GE063 | w_ge063_cadastro_filial / dw_ge063_cadastro_filial | Subconjunto de `filial` | Cadastro mestre de loja |

### 2. `Mapa por campo`
| Campo | Tipo | Domínio | Gravação | Uso principal | Por quê |
|-------|------|---------|----------|---------------|---------|
| cd_filial | int | PK sequencial | GE063 (insert); trigger `ti_filial` cria `filial_auxiliar`, centro_custo | Chave em pedido, NF, estoque, login | Identificador único da loja no ecossistema |
| nm_fantasia | varchar(40) | texto | GE063 | NF, etiquetas, telas de seleção filial | Nome exibido ao usuário e em documentos |

Uma linha por campo (agrupar só se gravação **e** uso forem idênticos para todo um bloco homogêneo, ex. `nr_ddd_telefone`/`nr_telefone`). Sem subseções de Excel — se quiser preservar agrupamento temático (Identificação, Endereço, Flags…), ordenar as linhas por esse critério; não criar aba por grupo.

### 3. `Campos sem tela PB`
| Campo | Gravação inferida | Uso principal | Por quê |
|-------|-------------------|---------------|---------|
| dh_ultimo_saldo | Processo batch saldo | Relatórios estoque | Data do último fechamento de saldo |

### 4. `Triggers e efeitos colaterais (sybase-objects)`
| Objeto | Evento | Efeito | Por quê |
|--------|--------|--------|---------|
| ti_filial | INSERT | `int_controle`, `filial_auxiliar`, `centro_custo` | Integração e estrutura financeira da nova loja |
| tu_filial | UPDATE | `int_controle`, histórico gerente | Propagar mudança para integrações |

### 5. `Relacionados (outras tabelas)`
| Campo lógico | Tabela real | Gravação | Uso | Por quê |
|--------------|-------------|----------|-----|---------|
| id_liberada_nfe | parametro_loja ID_NFE_LIBERADA | GE063 (wf_grava) | Emissão NFe | Liberar loja para NFe sem coluna em `filial` |

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
- ❌ Gerar o `.md` sem o `.xlsx` (ou vice-versa), ou mudar o nome/ordem das 5 abas.
- ❌ Colar as tabelas de detalhe no corpo do `.md` — elas vivem só no `.xlsx`.

## Skeleton Python (openpyxl) — manter o mesmo padrão de estilo em toda tabela

```python
import openpyxl
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

SHEETS = {
    "Cadastro principal (gravação)": ["Tela", "Objeto PB", "O que grava", "Observação"],
    "Mapa por campo": ["Campo", "Tipo", "Domínio", "Gravação", "Uso principal", "Por quê"],
    "Campos sem tela PB": ["Campo", "Gravação inferida", "Uso principal", "Por quê"],
    "Triggers e efeitos colaterais (sybase-objects)": ["Objeto", "Evento", "Efeito", "Por quê"],
    "Relacionados (outras tabelas)": ["Campo lógico", "Tabela real", "Gravação", "Uso", "Por quê"],
}

# dados[nome_da_aba] = lista de tuplas/listas na mesma ordem das colunas acima
def montar_xlsx(caminho_saida, dados: dict):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="305496")

    for nome_aba, colunas in SHEETS.items():
        ws = wb.create_sheet(nome_aba[:31])  # limite do Excel para nome de aba
        ws.append(colunas)
        for cell in ws[1]:
            cell.font = header_font
            cell.fill = header_fill
        for row in dados.get(nome_aba, []):
            ws.append(list(row))
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        for i, col in enumerate(colunas, start=1):
            largura = max(len(col), *(len(str(r[i-1])) for r in dados.get(nome_aba, [])), default=len(col))
            ws.column_dimensions[get_column_letter(i)].width = min(largura + 2, 60)

    wb.save(caminho_saida)
```

Não precisa ser exatamente este código, mas manter: as 5 abas com esses nomes exatos e nessas colunas/ordem, cabeçalho em negrito, `freeze_panes` na primeira linha e `auto_filter` — mesma aparência em toda tabela mapeada.
