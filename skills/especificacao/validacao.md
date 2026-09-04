# Checklist de validacao da especificacao

Executar **depois** de redigir e **antes** de pedir aprovacao ao usuario.  
Corrigir falhas; so entao apresentar o resultado.

Marcar cada item: `PASS` | `FAIL` | `N/A`.

## A. Completude do template

- [ ] Todas as secoes do [modelo-feat.md](modelo-feat.md) preenchidas ou com `N/A` + motivo
- [ ] Tipo = feat; branch `feat/<slug>` registrada e existente
- [ ] Identificacao com titulo, objetivo, atores, status, versao
- [ ] Escopo em e fora definidos
- [ ] Pelo menos uma RN **ou** justificativa de N/A
- [ ] Pelo menos um RF **ou** justificativa de N/A
- [ ] Pelo menos uma user story com criterios Given/When/Then (ou N/A justificado em pedido puramente normativo)
- [ ] Pontos de investigacao tecnica preenchidos ou `N/A` justificado (secao para o analista)

## B. Qualidade dos requisitos (IEEE / boa pratica)

- [ ] Requisitos atomicos (um comportamento por ID)
- [ ] Linguagem testavel (evita "rapido", "facil", "etc.", "adequado" sem metrica)
- [ ] IDs unicos e estaveis (`RN-`, `RF-`, `RNF-`, `US-`, `CA-`, `VAL-`)
- [ ] Sem contradicao entre RNs, RFs e criterios de aceite
- [ ] Excecoes/erros de negocio cobrem caminhos felizes e principais falhas
- [ ] RNFs (se existirem) tem metrica ou criterio verificavel

## C. Rastreabilidade

- [ ] Tabela de rastreabilidade preenchida (US → RF/RN → CA) ou N/A justificado
- [ ] Cada criterio de aceite referencia RF e/ou RN
- [ ] Cenarios VAL-* cobrem as RNs obrigatorias do MVP

## D. Escopo e riscos

- [ ] Fora de escopo impede scope creep obvio
- [ ] Assumptions explicitas
- [ ] Perguntas abertas criticas listadas (nao escondidas no texto)
- [ ] Se stack **Node.js**: decisao sobre `@clamed/logger` e/ou `light-node-metrics` registrada (Sim ambos / so um / Nao / Outro). Sem decisao → **FAIL** (nao pedir aprovacao da spec)

## E. Documento autocontido

O desenvolvedor **nao leu o chat**. A spec precisa se sustentar sozinha.

- [ ] Cada decisao relevante traz o **porquê** no texto (nao so o resultado)
- [ ] Nao ha conclusao orfã (*“isso e pesado”*, *“nao usar X”* sem motivo)
- [ ] Nao ha diario da conversa (*“o que mudou nesta revisao”*, *“como combinamos”*)
- [ ] Fora de escopo tem motivo (o implementador sabe o que **nao** fazer nesta entrega)
- [ ] Vocabulario do dominio; sem apelido que so existiu no chat

Qualquer `FAIL` aqui: reescrever o MD **antes** de pedir aprovacao.

## F. Resultado

```text
Validacao: PASS | FAIL
Itens FAIL: (listar IDs/secoes)
Acao: corrigido automaticamente | aguarda resposta do usuario (perguntas Q-xx)
```

Regras:

1. Qualquer `FAIL` em A/B/C/E deve ser corrigido no documento antes do pedido de aprovacao — salvo se depender de pergunta aberta ao usuario.
2. Nao marcar `Status: aprovado` sem confirmacao explicita do usuario.
3. Mostrar este resultado (resumo) ao usuario junto com a especificacao.








