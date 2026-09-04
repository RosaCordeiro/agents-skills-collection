# Modelo — AUD-NNN.md

Copiar e preencher. Substituir NNN / campos. Gravado em `docs/auditoria/AUD-NNN.md`.

```markdown
# AUD-NNN — Auditoria do sistema

| Campo | Valor |
|-------|-------|
| Data | YYYY-MM-DD |
| Repo | `nome` |
| Recorte | sistema inteiro / `path` |
| Branch | `…` |
| Commit | `abcdef1` |
| Auditor | agent `auditor` (model: …) |
| Suite | comando + passou/falhou/nao executada |
| **Nota final** | **X.Y / 10** |
| Veredito | Critico / Fragil / Aceitavel / Solido / Excelente |
| Cap aplicado | nenhum / descricao do teto |

## 1. Mapa do sistema

- O que faz:
- Caixas (API / worker / UI / DB / fila / externos):
- Como sobe:
- Fluxos criticos caminhados:
- Amostragem (o que nao foi lido em profundidade):

## 2. Suite automatizada

- Comando:
- Ambiente (Compose/local/WSL):
- Resultado (exit code, passou/falhou, testes relevantes):
- Observacao:

## 3. Validacoes

| # | Validacao | Status | Evidencia | Impacto |
|---|-----------|--------|-----------|---------|
| 1 | Mapa do sistema | PASS/FAIL/PARCIAL/N/A | | |
| 2 | Inventario de artefatos | | | |
| 3 | Camadas e responsabilidades | | | |
| 4 | Aderencia ARCH vs codigo | | | |
| 5 | Acoplamento e fronteiras | | | |
| 6 | Stack e runtime | | | |
| 7 | Tipos e identificadores | | | |
| 8 | Integridade | | | |
| 9 | Evolucao do schema | | | |
| 10 | Fluxos criticos | | | |
| 11 | Contratos | | | |
| 12 | Qualidade de codigo | | | |
| 13 | Erros e resiliencia | | | |
| 14 | Secrets | | | |
| 15 | Auth e dados | | | |
| 16 | Injecao | | | |
| 17 | Logs | | | |
| 18 | Metricas e health | | | |
| 19 | Execucao da suite | | | |
| 20 | Cobertura dos fluxos criticos | | | |
| 21 | VAL / V de regra de negocio | | | |
| 22 | Higiene da suite | | | |
| 23 | README operacional | | | |
| 24 | Docs de fase vs realidade | | | |
| 25 | CHANGELOG e indice | | | |
| 26 | Docs stale | | | |
| 27 | Docker / processo | | | |
| 28 | Variaveis de ambiente | | | |
| 29 | Paths e scripts | | | |
| 30 | Fronteiras SAP | | | |
| 31 | Debito visivel | | | |
| 32 | Mudanca grande vs regressao | | | |
| 33 | (especifica, se houver) | | | |

Detalhar abaixo so as que forem `FAIL` ou `PARCIAL` (ou `PASS` surpreendente). 1–5 linhas cada, com path.

### Validacao K — titulo

- Status:
- Evidencia:
- Por que importa:

## 4. Notas por dimensao

| Dimensao | Peso | Nota | Por que nao +1 | Por que nao -1 | Para +1 ponto |
|----------|------|------|----------------|----------------|---------------|
| Arquitetura | 12 | | | | |
| Modelagem de dados | 10 | | | | |
| Qualidade de codigo | 12 | | | | |
| Seguranca | 12 | | | | |
| Observabilidade | 8 | | | | |
| Testes | 14 | | | | |
| Documentacao | 10 | | | | |
| Resiliencia | 8 | | | | |
| Operacao | 6 | | | | |
| Aderencia SPEC/ARCH | 8 | | | | |

Dimensoes `N/A`: listar e **nao** entrar na media.

Calculo: `nota_final = …` (mostrar a conta resumida, pesos renormalizados se houve N/A).

## 5. Achados

| Severidade | Onde | Problema | Correcao sugerida (nao aplicada) |
|------------|------|----------|----------------------------------|
| bloqueante | `path` | | |
| importante | | | |
| nit | | | |

(Se nenhum: `Nenhum achado.`.)

## 6. Backlog sugerido (nao implementado)

| Prioridade | Dimensao | O que fazer | Impacto esperado na nota |
|------------|----------|-------------|--------------------------|
| 1 | Testes | | D6 3 → 6 |
| 2 | | | |

Quem implementa: agent de desenvolvimento (Pro ou Simples), **nao** este auditor.

## 7. Comparacao com auditoria anterior

- AUD anterior: `AUD-NNN` (ou “primeira auditoria”)
- Subiu:
- Desceu:
- Estavel:

## 8. Limites desta auditoria

- O que nao foi exercitado (carga, Pentest, ambiente prod, etc.)
- Dependencia de ambiente nao subido
```

## INDICE.md (mesmo diretorio)

Criar ou atualizar `docs/auditoria/INDICE.md`:

```markdown
# Indice de auditorias

| AUD | Data | Recorte | Commit | Nota | Veredito | Cap |
|-----|------|---------|--------|------|----------|-----|
| [AUD-001](./AUD-001.md) | YYYY-MM-DD | sistema | `abcdef1` | X.Y | Aceitavel | nenhum |
```

Linha mais recente no topo.








