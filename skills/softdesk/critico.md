# SoftDesk — ser crítico (perguntar + PB/Sybase)

O usuário manda texto preguiçoso. **Não** transformar isso em chamado na hora. Extraia, **desconfie**, complete fato, só então rascunhe.

Não perguntar solicitante nem área a cada chamado. **Perguntar categorização** (padrão Comercial/Estoque vs outra categoria/atendente) — ver [defaults.md](defaults.md) e fluxo da skill.

## Atitude

- Separar **fato** (o que a tela/dado mostra) de **dúvida** (se vai faltar NF, se “é problema”).
- Se o relato mistura incidente + “quero entender”, dizer isso e usar **um** `AskQuestion`: incidente vs causa raiz vs os dois (dois chamados).
- Não preencher seção com “A confirmar.” só para fechar. Se o dado muda o chamado, **perguntar**.
- Desafiar prioridade Média se o impacto for filial/NF/parada: um `AskQuestion` Média vs Alta.
- Título com tela/sistema reais (`WS160`, não “impressão” genérico) depois de confirmar.

Máximo **um** `AskQuestion` por mensagem. Perguntas abertas (número do pedido, print) em prosa, **2 a 4** por turno. Não virar interrogatório infinito: depois de uma rodada útil, rascunhar o que já dá e marcar só o que ainda é hipótese.

## O que perguntar (incidente)

Falta típica — cobrir o que o texto não trouxe:

1. Sistema e **código da tela** (WSxxx / ROxxx / job).
2. **Documento** (pedido, NF, carga) e **filial**.
3. Ambiente: prod vs homolog.
4. Esperado vs atual em uma frase cada (sem misturar opinião).
5. Impacto: quem para, volume, workaround; ou “só confusão visual”.
6. Mais exemplos além do primeiro número.

Causa raiz: o que já se sabe vs o que investigar. Projeto/melhoria: aceite e fora de escopo.

## Cruzar com PB + Sybase (neste chat)

Quando o assunto for WMS/Fiscal, tela `WS`/`RO`, pedido, NF, cor de status, estoque, SP/trigger:

1. Ler `~/.cursor/skills/pb-sybase/consulta.md` (formato) e usar as **mesmas fontes** — **não** lançar Task `/pb-sybase` nem escrever SPEC/DOCX.
2. **PB:** MCP `user-pbg-wms` ou `user-pbg-fiscal`. `pbg_search` ≤ 20; `pbg_read_object` ~80 linhas. Achar a window/DW e, se possível, de onde vem a cor/status.
3. **Homolog:** MCP `user-sybase-hmg`. `sybase_describe_table` / `sybase_query_readonly` (`maxRows` baixo) no documento que o usuário citou. Só SELECT.
4. **Git:** Grep curto em `sybase-objects` se houver trigger/SP óbvio.
5. No chat: 5–10 linhas do que achou (tela, coluna, valor do pedido). **Não** inventar schema. Se a tool falhar, dizer e seguir com pergunta.

Colocar no HTML do chamado uma seção:

```html
<p><strong>O que já conferimos (PB/Sybase)</strong><br>
Fato consultado. Hipótese separada. Se não consultou: omitir a seção.</p>
```

Spec longa para outro dev continua `/pb-sybase` **depois** do chamado, se o usuário pedir.

## Abrir só depois

Rascunho (HTML) + payload. Ok explícito. `criar_chamado` → se `atendente` vier vazio, `editar_chamado` com 393. Conferir `usuario.nome` = Guilherme.
