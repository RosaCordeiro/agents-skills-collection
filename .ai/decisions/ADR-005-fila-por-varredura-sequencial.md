# ADR-005: Fila por leitura progressiva, uma por vez, com semáforo de 2 vagas

- **Status:** aceito em 2026-11-19
- **Data:** 2026-11-19 (revisado após o teste em contexto zerado)
- **Contexto:** A fila é tudo que não está fechado (RN-04) e só o status EM_ATENDIMENTO é validado como filtro de servidor. O total do SoftDesk para o atendente inclui fechados, e o atendente tem mais de 200 chamados abertos. A carga é limitada por RNF-04.

## Decisao

A fila é lida por partes, sem estado entre chamadas. Cada chamada recebe `inicio` (posição no SoftDesk) e `limite` (padrão 50, teto 200), lê páginas de 200 do atendente configurado em sequência, até 15 páginas, filtra os abertos no cliente e descarta repetidos por código. Devolve os primeiros `limite` abertos e `proximo_inicio` (a posição para continuar, `null` quando acabou); se as 15 páginas foram lidas e ainda há itens, `incompleto` vira `true`. Leituras idênticas simultâneas compartilham o resultado; outras leituras de fila aguardam a vez. Toda chamada ao SoftDesk passa por um semáforo de 2 vagas com timeout de 20 s. Cada leitura tem prazo total de 90 s (`REDE`) e é cancelada por `AbortController`. A pesquisa com filtro de status no cliente usa a mesma leitura progressiva.

## Alternativas consideradas

| Alternativa | Por que nao |
|-------------|-------------|
| Filtrar status no servidor | Nomes dos outros status não confirmados (Q-01) |
| Devolver a fila inteira de uma vez, com teto de 200 | A fila aberta passa de 200; a utilidade cairia e o total de abertos só seria conhecido lendo tudo |
| Guardar a fila lida em memória e paginar sobre ela | Cria estado e prazo de validade para dados de chamado; a leitura progressiva é sem estado |
| Ler 2 páginas em paralelo | Ocuparia as 2 vagas e bloquearia pesquisas avulsas; fica como alavanca se a medição passar de 30 s (Q-04) |
| Recusar a segunda fila com erro de ocupado | Criaria código de erro novo sem ganho para quem chama |

## Consequencias

- Positivas: carga previsível no SoftDesk; uma vaga sempre livre para pesquisa; sem estado entre chamadas; sem código de erro novo.
- Negativas / divida: não existe "total de abertos" (só o total do SoftDesk, que inclui fechados); chamado novo durante o uso desloca posições e quem chama descarta repetidos por código; item reatribuído durante a leitura pode faltar numa execução; o tempo de cada leitura cresce com o histórico do atendente (12 páginas para 2.394 chamados); o prazo de 90 s está em RNF-05 da SPEC.

## Nota de 2026-11-21: modo `todas`

A leitura progressiva ganhou o modo `todas` (parâmetro opcional da fila e da pesquisa): o serviço lê as páginas de 200 sozinho, até o fim ou até 15 páginas, 300 itens, 60.000 bytes de itens e 90 s, e devolve parcial com `incompleto`, `proximo_inicio` e `parada_por` ao atingir um teto (pedido do usuário depois da validação em produção). Continua sem estado entre chamadas, com uma varredura por vez e sem código de erro novo; "Devolver a fila inteira de uma vez" segue descartada como padrão (sem `todas` nada muda). Ver ARCH-001 §6 F3 e SPEC-001 RN-09.

## Referencias

`docs/arquitetura/ARCH-001.md` §6 F3; `docs/especificacoes/SPEC-001.md` RN-04, RN-09, RNF-03 a RNF-05.
