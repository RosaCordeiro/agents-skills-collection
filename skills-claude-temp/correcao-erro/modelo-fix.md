# Modelo FIX — especificacao de correcao de erro

**Tipo:** `fix` apenas. Features usam `especificacao` + [modelo-feat.md](../especificacao/modelo-feat.md).

Preencha todos os blocos. `N/A` + motivo se nao aplicar.  
Linguagem factual. Separar **observado** de **inferido**.

---

## 1. Identificacao

| Campo | Valor |
|-------|-------|
| Tipo | **fix** |
| Codigo | CORR-001 |
| Titulo | |
| Branch | `fix/<slug>` (criar **antes** de gravar o doc) |
| Severidade | critica / alta / media / baixa |
| Ambiente | prod / homolog / local |
| Status | rascunho / entendimento aprovado / corrigido / verificado |
| Data do incidente | |
| Data deste documento | |
| Relator | |

## 2. Sintoma (o que o usuario / sistema viu)

Descricao objetiva do comportamento inadequado — **sem** explicar causa ainda.

- Mensagem de erro / cStat / codigo HTTP (se houver):
- Onde apareceu (tela, log, job, API):
- Frequencia / desde quando:

## 3. Evidencias (fatos)

Anexar trechos relevantes (log, stack, CSV, PID, horario). Citar arquivo/caminho.

| # | Tipo | Evidencia (fato) | Fonte |
|---|------|------------------|-------|
| 1 | log / traceback / dado | ... | path ou comando |

## 4. Linha do tempo (entendimento fiel)

Ordem cronologica do que **aconteceu de verdade** (nao o plano ideal).

| Quando | O que ocorreu | Evidencia # |
|--------|---------------|-------------|
| ... | ... | 1 |

## 5. Impacto

- Quem/o que foi afetado:
- Dados corrompidos / perda / bloqueio:
- Trabalho interrompido (sim/nao):

## 6. Causa raiz

### 6.1 Causa raiz (afirmacao)

Uma frase clara e verificavel.

### 6.2 Cadeia causal

`gatilho → falha tecnica → sintoma observado`

### 6.3 O que **nao** e a causa (descartes)

| Hipotese descartada | Por que descartou (evidencia) |
|---------------------|-------------------------------|
| ... | ... |

### 6.4 Confianca

| Nivel | Condicao |
|-------|----------|
| Alta | Reproduzido ou comprovado por evidencia direta |
| Media | Evidencia forte, reproducao parcial |
| Baixa | Inferencia — **nao corrigir em definitivo ate elevar** |

Nivel deste caso: **Alta / Media / Baixa** — justificativa em 1 linha.

## 7. Correcao proposta

### 7.1 Mudanca

O que sera alterado (comportamento + arquivos/modulos provaveis).

### 7.2 Justificativa

Por que esta correcao elimina a **causa raiz** (nao so o sintoma).

### 7.3 Alternativas consideradas

| Alternativa | Por que nao foi escolhida |
|-------------|---------------------------|
| ... | ... |

### 7.4 Riscos da correcao

| Risco | Mitigacao |
|-------|-----------|
| ... | ... |

### 7.5 Escopo consciente

- Entra nesta correcao:
- **Nao** entra (evitar piggyback):

## 8. Plano de verificacao (V-xx)

Sera executado na fase `teste-regra-negocio` (e regressao em `teste-automatizado`).

| ID | Como validar | Resultado esperado |
|----|--------------|-------------------|
| V-01 | ... | ... |
| V-02 | Regressao minima do fluxo afetado | ... |

## 9. Apos a correcao (preencher nas fases de teste / docs)

| Campo | Valor |
|-------|-------|
| Commit(s) | |
| O que mudou de fato | |
| Verificacoes executadas (V-xx) | |
| Status final | verificado / reopen |

## 10. Licoes / prevencao (opcional)

O que evita repetir (teste, alerta, validacao, doc).
