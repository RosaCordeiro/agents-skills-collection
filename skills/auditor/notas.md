# Notas 0-10

Julgamento com evidencia. Nao transformar isto em Sonar (contagem de violations ≠ nota).

## Escala (todas as dimensoes)

| Nota | Significado |
|------|-------------|
| 0–1 | Ausente ou perigoso (secrets no git, suite inexistente em sistema critico, regra de negocio invertida) |
| 2–3 | Precario: quase nao atende o padrao que **este** sistema precisa |
| 4–5 | Fragil: existe, mas lacunas doem no dia a dia ou na proxima mudanca |
| 6–7 | Aceitavel: essencial coberto; debitos claros e sobreviviveis |
| 8 | Solido: alinhado as skills/ARCH deste time; poucos nits |
| 9 | Excelente: consistente, evidencias fortes, gaps menores e conscientes |
| 10 | Referencia: ensinavel a outro time — **raro**. Nao inflar. |

Regras:

- **Nunca** dar 10 sem dizer por que e referencia (nao “esta ok”).
- **Nunca** dar 8+ numa dimensao se as validacoes principais dela tem `FAIL`.
- `PARCIAL` puxa para 5–7 conforme gravidade, nao para 8.
- Nota e inteira ou `.5` na dimensao (6, 6.5, 7…). Final do sistema: **uma casa decimal**.

Cada dimensao no AUD leva (bloco obrigatorio, nao uma linha):

1. Nota
2. **Por que N e nao N+1** — o gap concreto, com link de arquivo
3. **Por que N e nao N-1** — o que ja segura a nota
4. “O que faltaria para +1”

Quem discorda da nota tem que achar o argumento, nao um adjetivo.

## Dimensoes e pesos

Pesos somam 100. Dimensao `N/A` **sai da media**: renormalizar os pesos restantes para 100.

| ID | Dimensao | Peso | Validacoes ancora |
|----|----------|------|-------------------|
| D1 | Arquitetura | 12 | V3 V5 V6 (V4 so da **entrega vigente**) |
| D2 | Modelagem de dados | 10 | V7 V8 V9 |
| D3 | Qualidade de codigo | 12 | V10 V12 |
| D4 | Seguranca | 12 | V14 V15 V16 |
| D5 | Observabilidade | 8 | V17 V18 |
| D6 | Testes | 14 | V19 V20 V21 V22 |
| D7 | Documentacao | 10 | V23 V24 V25 V26 |
| D8 | Resiliencia | 8 | V13 (+ filas/timeout se V33+) |
| D9 | Operacao | 6 | V27 V28 V29 |
| D10 | Aderencia SPEC/ARCH | 8 | V4 V10 V21 V24 |

Exemplos de `N/A` legitimo: D2 sem banco; D10 sem SPEC/ARCH em script one-off minimo; D5 metricas em CLI que so imprime e sai.

`N/A` **ilegítimo**: “nao olhei testes” — a dimensao existe; a nota fica baixa.

## Nota final

```text
nota_final = soma(nota_d * peso_d) / soma(pesos das dimensoes aplicaveis)
```

Arredondar para 1 casa decimal (0.05 → cima).

### Rotulo do sistema

| Nota final | Veredito |
|------------|----------|
| 0.0 – 3.9 | Critico |
| 4.0 – 5.9 | Fragil |
| 6.0 – 7.4 | Aceitavel |
| 7.5 – 8.9 | Solido |
| 9.0 – 10 | Excelente |

Uma linha de leitura para humano, nao substituicao da tabela de dimensoes.

## Tetos (caps) — aplicar depois da media bruta

Aplicar o **mais restritivo** que couber. Anotar no AUD qual cap disparou.

| Condicao | Efeito |
|----------|--------|
| V19 `FAIL` porque **nao ha suite** ou a suite **quebra** | D6 (Testes) ≤ 3. Nota final ≤ 6.0 |
| V19 `PARCIAL` (ambiente nao subiu, usuario seguiu sem suite) | D6 ≤ 5. Nota final ≤ 7.0 |
| V14 `FAIL` (secret real no git / codigo) | D4 (Seguranca) ≤ 2. Nota final ≤ 5.0 |
| Achado **bloqueante** em V15 ou V16 | D4 ≤ 4. Nota final ≤ 5.5 |
| V10 `FAIL` (fluxo critico errado vs RN) | D3 ≤ 4 e D10 ≤ 4. Nota final ≤ 6.0 |
| README inoperante em sistema que se opera (V23 `FAIL`) | D7 ≤ 4. Nota final ≤ 7.0 |

Caps existem para o auditor nao compensar um buraco grave com notas altas em outro canto (“docs bonitos, teste nao roda, nota 8”).

## Independencia entre dimensoes

- Testes verdes nao inflacionam Arquitetura.
- ARCH **antigo** divergente do codigo de hoje: **nao** derruba D1/D10 (historia). ARCH **da entrega vigente** divergente: D10 cai.
- Pastas por feat (`users/`, `softdesk/`) **nao** valem nota alta de Arquitetura se o SQL vive no handler HTTP.

## Rubrica extra — D1 Arquitetura (camadas)

Julgar o codigo, nao o organograma de pastas.

| Nota D1 | O que se ve no codigo |
|---------|------------------------|
| 8–9 | Handler fino; dominio sem Express/`req`; persistencia isolada (repo/query module); SQL nao no `routes.ts` |
| 6–7 | Dominio extraido em partes; **ainda** ha SQL em alguns handlers, fronteira visivel e em expansao |
| 4–5 | A maioria dos fluxos: `Router` monta SQL/`query($1)` no mesmo arquivo. Sem camada de repositorio. “Service” que e route. |
| 2–3 | Um `routes.ts` god-object, dependencias circulares, UI falando com SQL |

**Proibido** dar 7+ em D1 so porque existem pastas `softdesk/` e `uat/` se `users/routes.ts`, `chamados/routes.ts` e `routes.ts` executam SQL direto. Origem historica (MVP) explica, **nao** pontua.

- Muita suite testando mocks irrelevantes: D6 nao passa de 6 mesmo com V19 `PASS`.

## Comparacao entre auditorias

O `INDICE.md` guarda a serie. Na auditoria N+1, 3–5 linhas: o que subiu/desceu vs AUD anterior no **mesmo** repo. Nao comparar xml-translog com clamed.dev.








