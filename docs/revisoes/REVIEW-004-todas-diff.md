# REVIEW-004: re-revisão das correções da REVIEW-003 (modo `todas`)

| Campo | Valor |
|-------|-------|
| Data | 2026-11-21 |
| Revisor | Claude (subagente revisor, somente leitura) |
| Escopo | Só o diff das correções da REVIEW-003: teto 300 + parada por tamanho (A-01), fim real (A-04), seção Todas da skill (A-03/A-05), testes novos |
| Arquivos | `src/core/domain/services/fila.service.ts`, `src/core/application/useCases/listar-fila.use-case.ts`, `src/core/application/useCases/pesquisar.use-case.ts`, `src/shared/container/index.ts`, `src/presentation/mcp/tools.ts`, `test/unit/fila-todas.spec.ts`, `test/integration/consultas-todas.spec.ts` (grupo "teto real de 300 itens..."), skill `softdesk/SKILL.md:108-118` |
| Suíte | Cópia na scratchpad: `tsc --noEmit` limpo; `jest --runInBand` 45 suítes, 748 passaram, 1 pulado |

## Resultado

Nenhum achado BLOQUEANTE nem ALTO. A lógica de tamanho, o `proximo_inicio` e a precedência dos tetos estão certos, e os testes pegam as três mutações pedidas. Ficam dois MÉDIOS (folga do limite de 80 KB em tokens e volume de 10 blocos na skill) e alguns BAIXOS.

## Achados

### B-01 MÉDIO: 80.000 bytes ficam no limite do teto padrão de tool MCP

- **Onde:** `src/core/domain/services/fila.service.ts:19`, `src/presentation/mcp/tools.ts:56,64`.
- **Cenário:** um item real (`paraBasico`, 11 campos, título de uns 70 caracteres, nome do solicitante, status "Em atendimento") tem uns 280–300 bytes; 80 KB dão uns 270 itens. JSON com chaves repetidas e texto em português rende uns 3 a 3,5 bytes por token, ou seja 23k a 27k tokens só nos itens, mais o envelope. O teto padrão do Claude Code é 25k tokens por resposta de tool MCP (`MAX_MCP_OUTPUT_TOKENS`). A REVIEW-003 sugeriu 60–80 KB; foi escolhido o topo da faixa. Não conferi no cliente real.
- **Correção:** baixar `MAX_BYTES_TODAS` para 60.000 (uns 18–20k tokens) ou medir uma resposta real de 300 itens no cliente MCP antes de liberar. O teste de 700 abertas não mede isso: com os títulos curtos do simulador, 300 itens cabem em 80 KB e a parada é por `itens` (a mutação "limite de bytes ignorado" não o quebra).

### B-02 MÉDIO: a skill encadeia até 10 blocos sem perguntar (até ~250k tokens no contexto)

- **Onde:** `03-LIBRARIES/INTERNAL/agents-skills-collection-import/skills/softdesk/SKILL.md:110`.
- **Cenário:** "Teto de segurança de 10 blocos" × até 80 KB = até 800 KB de JSON entrando no contexto, mais uma tabela por bloco na saída. Na fila do atendente (centenas de abertas) são 1–3 blocos e está bem; numa `softdesk_pesquisar` com `todas` e filtro largo (ou sem filtro: varre o SoftDesk inteiro) chega aos 10 blocos e estoura o contexto antes de perguntar.
- **Correção:** teto de 3 blocos (uns 900 itens) e então perguntar se segue, ou perguntar antes de encadear quando o primeiro bloco já vier com `incompleto` numa pesquisa sem filtro de atendente.

### B-03 BAIXO: a seção Todas e a linha "Listas no chat" se contradizem, e a regra de `prazo` é ambígua

- **Onde:** `SKILL.md:110` e `:118`.
- **Cenário:** a linha 118 manda "limitar volume" e "refinar em novas chamadas em vez de despejar a lista"; a 110 manda mostrar todos os blocos. A 110 diz "Nos demais pedidos, manter 50", mas a 118 não ressalva o modo `todas`. Na 110, "se `incompleto: true` persistir sem `proximo_inicio` útil" descreve um caso que o código não produz (todo `incompleto` traz `proximo_inicio` e avança, ver "Conferido"); e "ou o serviço parar por `prazo`, avisar" não diz se continua (o `prazo` traz `proximo_inicio`).
- **Correção:** na 118, "(exceto o modo `todas`, seção acima)"; na 110, "parada por `prazo`: avisar e continuar com `proximo_inicio` (conta como bloco)"; trocar "persistir sem `proximo_inicio` útil" por "se o teto de blocos chegar com `proximo_inicio` ainda preenchido".

### B-04 BAIXO: o JSON da lista pode passar 1 byte do limite

- **Onde:** `fila.service.ts:120-121`.
- **Cenário:** cada item soma `bytes(JSON) + 1` (vírgula). O array serializado tem `soma(bytes) + (n - 1) + 2` = `acumulador.bytes + 1`. Com a soma exatamente igual a `maxBytes`, `JSON.stringify(itens)` dá `maxBytes + 1`. Os testes afirmam `<= limite`, então no caso exato falhariam por 1 byte. Sem efeito prático.
- **Correção:** começar `bytes` em 1 (colchetes) em `novoAcumulador`, ou comparar com `>=`.

### B-05 BAIXO: fim real cobre o último item da página curta, mas não "o resto da página curta foi todo filtrado"

- **Onde:** `fila.service.ts:138`.
- **Cenário:** o 300º aceito não é o último da página curta, mas os itens seguintes dessa página são fechados (ou de outro atendente / não casam o texto). `proximo < total`, então vem `incompleto: true`, `parada_por: 'itens'` e uma continuação que volta com 0 itens e `null`. Acontece até com o total atualizado (o total inclui os fechados). Nada se perde nem se repete; custa uma chamada extra.
- **Correção (opcional):** em página curta, tratar como fim quando nenhum item de `indice + 1` em diante passa em `aceita()` e não está em `vistos`.

### B-06 BAIXO: nenhum teste prova que a medida é em bytes e não em caracteres

- **Onde:** `test/unit/fila-todas.spec.ts`, `test/integration/consultas-todas.spec.ts:352-401`.
- **Cenário:** a mutação `Buffer.byteLength(...)` → `JSON.stringify(...).length` passa nos 50 testes. O código está certo (`Buffer.byteLength`, UTF-8, e o REST serializa com `JSON.stringify` compacto, sem escapar acentos, `src/presentation/rest/envelope.ts:18`); só falta a trava.
- **Correção:** teste unitário com títulos acentuados (por exemplo `'Solicitação ção ção'` repetido) e `maxBytes` em que a contagem por caracteres caberia e a por bytes não, afirmando o `proximoInicio` exato.

### B-07 BAIXO (informativo): o fim real também muda o modo sem `todas`

- **Onde:** `fila.service.ts:138-139`.
- **Cenário:** sem `todas`, no mesmo caso de borda (limite atingido no último item de página curta com total desatualizado), `proximo_inicio` passa de um número (continuação vazia) para `null`. É coerente com a regra do laço (página curta = fim) e a suíte inteira passa; registro só porque a REVIEW-003 exigia "sem `todas` nada muda".

## Mutações (cópia em scratchpad, original intacto)

Rodadas contra `test/unit/fila-todas.spec.ts`, `test/integration/consultas-todas.spec.ts` e `test/e2e/todas-mcp.spec.ts` (50 testes):

| # | Mutação | Resultado |
|---|---------|-----------|
| M1 | limite de bytes ignorado (`> Number.POSITIVE_INFINITY`) | **Pega**: 4 falhas (2 unitários de tamanho, parada por tamanho na fila e na pesquisa) |
| M2 | `proximoInicio` da parada por tamanho com off-by-one (`posicao + indice + 1`) | **Pega**: 4 falhas (os mesmos; a continuação perde o item que não coube) |
| M3 | `MAX_ITENS_TODAS = 1000` | **Pega**: 2 falhas (constantes no unitário e no teste do container sem opção). O teste de 700 abertas sozinho não pega (a parada vira `tamanho` e o encadeamento continua completo) |
| M4 (extra) | caracteres em vez de bytes | **Não pega** (B-06) |
| M5 (extra) | sem `fimReal` (A-04 desfeito) | **Pega**: 1 falha (A-04 unitário) |
| M6 (extra) | sem a guarda `itens.length > 0` (1 item maior que o limite) | **Pega**: 1 falha ("um único item maior que o limite é aceito") |

## Conferido e correto

- **Off-by-one da parada por tamanho:** o item que não cabe não entra em `itens` nem em `vistos`; `proximoInicio = posicao + indice` aponta exatamente para ele. Itens pulados antes dele (repetidos, filtrados) ficam antes da continuação, como no modo por partes. M2 provou que os testes pegam o erro.
- **Encadeamento nunca trava:** cada parada avança. `tamanho` sempre aceita ao menos 1 item (guarda `itens.length > 0`), então `proximo_inicio > inicio`; `itens` continua depois do último aceito; `paginas` e `prazo` continuam depois de ao menos uma página completa (`paradaPorPrazo` exige `paginasLidas >= 1`). Não há `incompleto: true` com `proximo_inicio` nulo. Um item sozinho maior que o limite sai sozinho numa resposta e a seguinte segue dele em diante (M6).
- **Mesma medida do envelope:** os itens medidos são o mesmo objeto `paraBasico` que vai para `dados.itens` (fila e pesquisa, sem projeção posterior); o REST serializa com `JSON.stringify` compacto e o MCP repassa o texto da resposta REST sem reformatar (`cliente-servico.ts:103`, `servidor-mcp.ts:51`). `Buffer.byteLength` mede bytes UTF-8. Diferença de no máximo 1 byte (B-04) mais o envelope fixo.
- **Precedência:** dentro da página, por item, o tamanho é testado antes de aceitar (o item que estoura dá `tamanho`, mesmo se seria o 300º); o teto de itens depois de aceitar (o 300º que cabe dá `itens`); páginas no fim da página; prazo entre páginas e no `catch`. Coerente com SPEC RN-09 e ARCH §F3.
- **Escopo:** `maxBytes` só é passado com `todas` (`listar-fila.use-case.ts:226`, `pesquisar.use-case.ts:139`); sem `maxBytes` o tamanho nunca para (teste unitário). Container repassa `maxBytesTodas` com padrão 80.000 e `maxItensTodas` com padrão 300 (teste do container sem opção).
- **A-04:** `fimReal` corrige o caso descrito (último item de página curta com total desatualizado), com teste que falha sem a correção (M5).
- **Skill:** encadeia `todas: true` com `inicio = proximo_inicio` até `null`, sem `limite`, tabela compacta por bloco com descarte de repetidos por código, total no fim, teto de 10 blocos e aviso por `parada_por`; a linha 112 agora ressalva que com `todas` vale a seção Todas (contradição da REVIEW-003 resolvida). Ressalvas em B-02 e B-03.
- **Teste de 700 abertas:** honesto quanto a completude e ausência de repetidos com os tetos reais (falha se a continuação perder ou repetir item), mas não exercita a parada por tamanho com os valores reais (ver B-01).
- **Docs:** SPEC-001 RN-09, ARCH-001 §F3/§8.3 e ACEITE-001 citam 300 itens, 80.000 bytes, `parada_por: 'tamanho'` e o item que não coube ficar para a continuação.
