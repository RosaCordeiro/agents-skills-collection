# Dados mestres — mapas PB + Sybase

Artefatos gerados pelos agents/skills `mapeador-dados-mestres` e `mapeador-dados-mestres-coluna`.

## Convenção de nomes

| Arquivo | Conteúdo |
|---------|----------|
| `MAPA-<tabela>.md` | Mapa completo da tabela (gravação, domínio, uso por campo) |
| `MAPA-<tabela>.<coluna>.md` | Aprofundamento de uma coluna (varredura PB + triggers/SPs, linguagem usuário) |

`<tabela>` = nome Sybase em minúsculas.

## Índice

| Tabela | Mapa | Colunas aprofundadas | Atualizado |
|--------|------|----------------------|------------|
| `filial` | [MAPA-filial.md](MAPA-filial.md) | [dh_ultimo_saldo](MAPA-filial.dh_ultimo_saldo.md) | 2026-09-01 |

## Invocação

- `/mapeador-dados-mestres mapear tabela <nome>`
- `/mapeador-dados-mestres-coluna aprofundar <tabela>.<coluna>`
