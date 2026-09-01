# Modelo FEAT — especificacao de regra de negocio (padrao de mercado)

**Tipo:** `feat` apenas. Bugs/fixes usam `correcao-erro` + [modelo-fix.md](../correcao-erro/modelo-fix.md).

Base: **IEEE 29148** (SRS) + **BRD/FRD** + **user stories / Gherkin**.  
Preencha todos os blocos. Se nao se aplicar: `N/A` + motivo em uma linha.

---

## 1. Identificacao do documento

| Campo | Valor |
|-------|-------|
| Tipo | **feat** |
| Titulo | |
| Codigo / versao | ex.: SPEC-001 / v0.1 |
| Branch | `feat/<slug>` (criar **antes** de gravar o doc) |
| Objetivo (1-2 frases) | |
| Solicitante / stakeholders | |
| Atores / personas | |
| Prioridade | MVP / completo |
| Status | rascunho / em revisao / aprovado |
| Data | |

## 2. Contexto e problema (BRD)

Escrever para quem **nao viu o chat**. Cada fato relevante inclui o porquê (skill `especificacao` § Documento autocontido). Nao usar *“como combinamos”* nem diario de revisoes.

- Situacao atual
- Dor / oportunidade
- Por que agora
- Restricoes de negocio conhecidas (prazo, compliance, legado)

## 3. Objetivos e metrica de sucesso

| Objetivo | Como medir (negocio) |
|----------|----------------------|
| ... | ... |

## 4. Escopo

### 4.1 Em escopo

- ...

### 4.2 Fora de escopo

- ...

### 4.3 Premissas e dependencias

- Premissas: ...
- Dependencias externas: ...
- **Se stack Node.js:** observabilidade — se o projeto **ja** usa `@clamed/logger` / `light-node-metrics`, **herdar** (nao perguntar de novo). So perguntar em greenfield Node. Registrar no doc.

## 5. Glossario

| Termo | Definicao de negocio |
|-------|----------------------|
| ... | ... |

## 6. Regras de negocio (RN)

Regras atomicas, numeradas, sem ambiguidade.

| ID | Regra | Obrigatoria? |
|----|-------|--------------|
| RN-01 | ... | Sim / Nao |

## 7. Requisitos funcionais (RF / FRD)

Comportamentos do sistema observaveis pelo usuario ou por outro sistema.

| ID | Requisito | Prioridade (MoSCoW) | RNs relacionados |
|----|-----------|---------------------|------------------|
| RF-01 | O sistema deve ... | Must / Should / Could / Won't | RN-01 |

## 8. Requisitos nao funcionais (RNF)

Performance, seguranca, auditoria, disponibilidade, usabilidade, conformidade, etc.  
Cada RNF deve ter metrica ou criterio verificavel.

| ID | Categoria | Requisito | Criterio / metrica |
|----|-----------|-----------|--------------------|
| RNF-01 | ... | ... | ... |

## 9. User stories e criterios de aceite (Gherkin)

### US-01 — \<titulo\>

**Como** \<ator\>, **quero** \<acao\>, **para** \<beneficio\>.

| ID | Criterio (Given / When / Then) | RFs / RNs |
|----|--------------------------------|-----------|
| CA-01 | **Dado** ... **Quando** ... **Entao** ... | RF-01, RN-01 |

(Repetir bloco US-xx conforme necessario.)

## 10. Fluxos / casos de uso principais

### Fluxo: \<nome\> (opcionalmente UC-xx)

- **Ator primario:**
- **Pre-condicoes:**
- **Fluxo basico (passos):**
- **Fluxos alternativos:**
- **Fluxos de excecao:**
- **Pos-condicoes:**

## 11. Excecoes e erros de negocio

| Situacao | Comportamento esperado | Mensagem / codigo (se houver) |
|----------|------------------------|-------------------------------|
| ... | ... | ... |

## 12. Dados de negocio

Entidades, atributos criticos, relacionamentos (nivel de negocio — sem DDL obrigatorio).

| Entidade | Atributos criticos | Regras / validade |
|----------|--------------------|-------------------|
| ... | ... | ... |

## 13. Integracoes (se houver)

| Sistema | Direcao | Objetivo de negocio | Dados trocados (resumo) |
|---------|---------|---------------------|-------------------------|
| ... | In / Out / Bi | ... | ... |

## 14. Rastreabilidade (minima)

| User story | RFs | RNs | Criterios de aceite |
|------------|-----|-----|---------------------|
| US-01 | RF-01 | RN-01 | CA-01 |

## 15. Cenarios de validacao de regra de negocio (fase dedicada pos-review)

Lista aqui; **execucao** fica na skill `teste-regra-negocio`.

| ID | Cenario | Entrada | Resultado esperado | RN/RF |
|----|---------|---------|--------------------|-------|
| VAL-01 | | | | RN-01 |

## 16. Assumptions e perguntas abertas

| ID | Tipo (assumption / pergunta) | Texto | Impacto se errado |
|----|------------------------------|-------|-------------------|
| Q-01 | pergunta | ... | Alto / Medio / Baixo |

## 17. Historico de revisao

| Versao | Data | Autor | Mudanca |
|--------|------|-------|---------|
| 0.1 | | | Rascunho inicial |

