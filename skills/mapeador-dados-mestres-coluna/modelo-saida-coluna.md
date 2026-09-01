# Modelo — MAPA `<tabela>.<coluna>.md`

```markdown
# Coluna `<coluna>` — tabela `<tabela>`

| | |
|--|--|
| Tipo | … |
| Domínio | … |
| Cadastro (onde altera) | … |

## Em uma frase

[O que esse campo significa para o negócio — 1–2 frases]

## Onde você altera esse valor

- **Tela X (CÓDIGO)** — …
- **Processo automático** — … (se houver)
- **Não tem tela** — … (carga legado / só TI)

## Onde o sistema usa (e para quê)

### [Nome do processo — ex.: Emissão de nota fiscal]

- O que acontece: …
- Por que usa este campo: …
- Telas/sistemas envolvidos: …

### [Outro processo — ex.: Pedido da loja no CD]

…

## O que o banco faz ao gravar

- Trigger **ti_/tu_** … (linguagem simples)
- Procedure **sp_** … (se aplicável)

## Cuidados e exceções

- …

## Evidência técnica (referência)

| Sistema | Objeto | Papel |
|---------|--------|-------|
| Gestão Filiais | w_ge063… | gravação |
| WMS | … | leitura |
| sybase-objects | tu_filial.sql | trigger |

_Gerado em YYYY-MM-DD — skill mapeador-dados-mestres-coluna_
```
