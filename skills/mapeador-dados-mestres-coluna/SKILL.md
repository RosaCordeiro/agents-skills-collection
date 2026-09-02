---
name: mapeador-dados-mestres-coluna
description: >-
  Aprofunda o uso de uma coluna de tabela mestre Sybase: varre todos os
  sistemas PB, triggers, views e SPs e explica em linguagem de usuário onde o
  campo aparece e para que serve. Use após MAPA-<tabela>.md, quando o usuário
  pedir aprofundar coluna, onde usa campo X, para que serve, ou
  /mapeador-dados-mestres-coluna.
disable-model-invocation: true
---

# Aprofundar coluna — dados mestres

Responda em **português claro**, para quem conhece o negócio (loja, NF, pedido, estoque) — não para DBA. Evite jargão (`srw`, `updatewhere`) no corpo; cite objeto técnico só em bloco **Evidência** no final.

Pré-requisito: existe `MAPA-<tabela>.md` em dados-mestres (skill `mapeador-dados-mestres`). Se não existir, mapear a tabela antes ou ler só a coluna pedida.

## Entrega obrigatória em arquivo

Gravar **sempre** em:

```
99-ARCHIVE/Projetos/Especificações/dados-mestres/MAPA-<tabela>.<coluna>.md
```

Path absoluto Windows: `%CLAMED_DEV_ROOT%\99-ARCHIVE\Projetos\Especificações\dados-mestres\`

**Fallback de ambiente**: se `%CLAMED_DEV_ROOT%` não existir, gravar no projeto irmão **`mapa-dados`** (mesmo diretório pai onde `agents-skills-collection-import` foi clonado; criar se não existir). **Nunca** gravar dentro do repositório de skills/agents — é compartilhado via git com o time.

No chat: resumo de 5–8 linhas + link/caminho do arquivo.

## Pipeline

1. **Contexto** — ler `MAPA-<tabela>.md` (gravação/domínio já mapeados).
2. **Schema** — tipo, FK, domínio na homolog.
3. **Gravação** — telas/processos (repetir do MAPA se ok; detalhar se faltar).
4. **Varredura uso** — [receitas-varredura.md](receitas-varredura.md):
   - Todos os apps em `C:\Sistemas_PB12\` (WMS, Fiscal, Gestao_Filiais, Retaguarda_*, Exportacao, …)
   - `sybase-objects`: triggers, `vw_*`, `sp_*`, `fn_*` que referenciam a coluna
5. **Agrupar por “para que”** — não listar 200 arquivos; agrupar por **processo de negócio**.
6. **Redigir** — [modelo-saida-coluna.md](modelo-saida-coluna.md).
7. **Gravar arquivo** `MAPA-<tabela>.<coluna>.md`.

## Tom (linguagem usuário)

| Evitar | Preferir |
|--------|----------|
| `dw_ge063_cadastro_filial update=yes` | “Na tela **GE063 – Cadastro de Filiais** você altera esse campo” |
| `JOIN filial f ON ...` | “Quando o sistema monta a nota fiscal, lê esse dado da filial” |
| `tu_filial dispara int_controle` | “Ao salvar a filial, o banco avisa os sistemas integrados” |

## Regras

- Separar **Onde altera** vs **Onde só aparece (leitura)** vs **O que o banco faz sozinho (trigger/SP)**.
- Para cada grupo de uso: **o que o usuário vê** + **por que importa**.
- Se a coluna não aparece em nenhuma tela mas só em relatório/exportação, dizer isso explicitamente.
- Não implementar código. Não inventar uso sem grep/leitura.
- Limite prático: até ~30 referências PB agrupadas; se houver mais, “+ N ocorrências similares em …”.

## Handoff

| Situação | Destino |
|----------|---------|
| Falta mapa da tabela inteira | `mapeador-dados-mestres` |
| Implementar mudança | `/pb` ou `/pbg` |
| Alterar trigger/SP | `sybase-objects` + deploy DBA |
