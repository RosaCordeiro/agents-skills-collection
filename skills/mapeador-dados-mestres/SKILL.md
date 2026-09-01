---
name: mapeador-dados-mestres
description: >-
  Mapeia tabelas mestre Sybase (ex. filial, produto, cliente): onde cada campo
  é criado/alterado no PB, domínios/valores, e onde é consumido com breve
  motivo de negócio. Sempre grava MAPA-<tabela>.md em dados-mestres. Cruza MCP
  Sybase homolog, PBG e sybase-objects. Use when the user asks mapear tabela,
  dados mestres, onde grava, onde usa, domínio de campo, cadastro de
  filial/produto, ou /mapeador-dados-mestres. Coluna: skill
  mapeador-dados-mestres-coluna.
---

# Mapeador de dados mestres (PB + Sybase)

Responda em português. Objetivo: **mapear colunas de tabela(s) mestre** com três eixos distintos — nunca misturar gravação com uso na mesma coluna sem rótulo.

| Eixo | Pergunta que responde |
|------|------------------------|
| **Gravação** | Onde o valor **entra ou muda** no banco? (tela PB, `UPDATE` embutido, processo batch, trigger) |
| **Domínio** | Quais valores são válidos? (`values=` no DW, tabela de domínio, FK) |
| **Uso** | Onde o campo é **lido** e **para quê**? (retrieve, join, filtro, NF, integração) |

Consulta pontual (uma coluna): usar skill **`mapeador-dados-mestres-coluna`** (varredura completa + linguagem usuário).

Agent dedicado: **`/mapeador-dados-mestres`**. Não implementar PB/SQL neste fluxo — só mapear. Patch depois: `/pbg` ou Pro.

## Entrega obrigatória em arquivo

**Sempre** gravar o mapa completo em disco **antes** de encerrar o turno:

```
99-ARCHIVE/Projetos/Especificações/dados-mestres/MAPA-<tabela>.md
```

- `<tabela>` = nome Sybase em minúsculas (ex. `filial`, `produto`).
- Path absoluto: `%CLAMED_DEV_ROOT%\99-ARCHIVE\Projetos\Especificações\dados-mestres\` (ver `README.md` do workspace).
- Criar a pasta `dados-mestres/` se não existir.
- No chat: resumo executivo (5–8 bullets) + caminho do arquivo — **não** colar o mapa inteiro de 90+ linhas no chat.

Atualização: **sobrescrever** o mesmo `MAPA-<tabela>.md` (incluir data no cabeçalho do arquivo).

## Fontes (cruzar sempre que couber)

| Fonte | O que prova |
|-------|-------------|
| MCP `user-sybase-hmg` | Schema vivo, PK/FK, amostra, tabelas de domínio |
| MCP `user-pbg-wms` / `user-pbg-fiscal` | DW com `update="tabela"`, `dbname="tabela.col"`, `values=`, SQL em `.srw` |
| Snapshots `.pbg/snapshots` em `C:\Sistemas_PB12` | Fallback se MCP PBG indisponível — Grep em `*.srd`/`*.srw` |
| `02-KNOWLEDGE/SYBASE/sybase-objects` | `ti_`/`tu_`/`td_`, views `vw_*`, SPs que tocam a tabela |

Não inventar coluna, tela nem domínio. Campo sem evidência de gravação PB → marcar **sem tela PB** (carga/legado/DBA/processo externo).

## Pipeline

1. **Escopo** — tabela(s), sistema PB se o usuário indicar (senão buscar em todos).
2. **Schema** — `sybase_describe_table`; contar colunas; PK/FK.
3. **Gravação PB** — ver [receitas-busca.md](receitas-busca.md) § Gravação.
4. **Domínios** — `values=` no DW; FK → descrever tabela pai; `id_*` → S/N ou tabela de códigos.
5. **Uso PB** — retrieve/join/filtro; priorizar consumidores principais (NF, WMS, Fiscal, integração).
6. **Banco** — triggers Git: efeitos em insert/update (histórico, `int_controle`, tabelas filhas).
7. **Gravar** — `99-ARCHIVE/Projetos/Especificações/dados-mestres/MAPA-<tabela>.md` ([modelo-saida.md](modelo-saida.md)).
8. **Chat** — resumo + caminho do arquivo. Exemplo: [exemplo-filial.md](exemplo-filial.md) / `MAPA-filial.md` gravado.

## Regras de qualidade

- **Separar gravação e uso** em cada campo (ou bloco de campos homogêneos). Nunca listar só "GE063" sem dizer se grava ou só lê.
- **Gravação** exige evidência: `update=yes` no DW, `update="tabela"`, ou `UPDATE tabela SET coluna` em `.srw`/`.sru`.
- **Uso** exige evidência: coluna no `SELECT`/`WHERE`/`JOIN` com papel claro + **por quê** em uma linha.
- Campos em **outra tabela** (ex. `parametro_loja`) → seção **Relacionados**, não misturar com colunas da tabela alvo.
- `id_*`: domínio obrigatório quando existir `values=` ou tabela de domínio.
- Não listar os 93 campos em prosa se a tabela for grande — usar **tabela markdown por campo** no modelo.
- Priorizar campos que o usuário citou; demais: resumo por grupo + "sem tela PB" quando aplicável.

## Limites

- MCP Sybase só leitura.
- Grep PB: limitar a ~15–20 consumidores por coluna (telas principais + integrações); indicar se há mais.
- Tabela sem objeto PB: entregar schema + triggers + uso em SP/views Git.

## Handoff

| Depois do mapa | Agent/skill |
|----------------|-------------|
| Aprofundar **uma coluna** (todos PB + triggers, tom usuário) | `mapeador-dados-mestres-coluna` → `MAPA-<tabela>.<coluna>.md` |
| Spec de tela/campo novo | `/pb-sybase` |
| Implementar PB | `/pb` ou `/pbg` |
| Alterar trigger/SP | editar `sybase-objects` + aviso deploy DBA |
| Teste de mesa SQL | `/teste-mesa-sybase` |
