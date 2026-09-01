# Checklist de validacao — correcao de erro (FIX)

Executar **depois** de redigir e **antes** de pedir aprovacao para arquitetura.  
Itens: `PASS` | `FAIL` | `N/A`.

## A0. Tipo e branch

- [ ] Tipo = fix; documento segue [modelo-fix.md](modelo-fix.md)
- [ ] Branch `fix/<slug>` registrada e existente

## A. Fidelidade ao ocorrido

- [ ] Sintoma descrito sem misturar causa
- [ ] Ha evidencias concretas (nao so relato vago)
- [ ] Linha do tempo coerente com as evidencias
- [ ] Afirmacoes inferidas estao marcadas ou sustentadas
- [ ] Descartes de hipoteses tem motivo ligado a evidencia (o leitor do CORR nao viu o chat)

## B. Causa raiz

- [ ] Causa raiz e uma afirmacao clara e testavel
- [ ] Cadeia `gatilho → falha → sintoma` esta preenchida
- [ ] Nivel de confianca declarado (Alta/Media/Baixa)
- [ ] Se confianca Baixa: nao ha proposta de fix definitivo sem nova evidencia

## C. Justificativa da correcao

- [ ] Correcao ataca a causa raiz (nao so mascara sintoma)
- [ ] Justificativa explicita
- [ ] Alternativas consideradas e motivo da escolha
- [ ] Riscos e fora de escopo definidos

## D. Verificacao

- [ ] Pelo menos um V-xx reproduz a ausencia do erro
- [ ] Ha verificacao de regressao minima do fluxo afetado

## E. Resultado

```text
Validacao: PASS | FAIL
Itens FAIL: ...
Pode seguir para arquitetura?: Sim (apos aprovacao humana) | Nao (falta evidencia/aprovacao)
```

Regras:

1. `FAIL` em A0/A/B impede pedir aprovacao como se estivesse pronto.
2. Confianca Baixa → coletar mais evidencia ou fix apenas paliativo, declarado como tal.
3. Nao marcar `Status: verificado` sem executar os V-xx nas fases de teste.
4. Aprovacao desta fase **nao** autoriza codigo — autoriza seguir para `arquitetura`.
