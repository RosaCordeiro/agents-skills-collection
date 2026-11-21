# ADR-007: O endereço da janela de login nunca sai pelo MCP

- **Status:** aceito em 2026-11-19
- **Data:** 2026-11-19
- **Contexto:** A janela de login usa endereço com token de uso único (RN-10). A SPEC prevê exibir o endereço quando o navegador não abre, mas uma resposta de tool vai para o chat.

## Decisao

As respostas de MCP e das sete operações REST informam só `janela: { aberta, expira_em, navegador_aberto }`. O endereço completo fica na rota operacional `GET /v1/sessao/janela` (protegida por token), consumida pelo comando `npm run entrar`, que o imprime no terminal do usuário.

## Alternativas consideradas

| Alternativa | Por que nao |
|-------------|-------------|
| Devolver o endereço na resposta da tool | Coloca um token no chat e no contexto do modelo |
| Rota fixa sem token que redireciona para a janela | Qualquer página poderia provocar a abertura do formulário |

## Consequencias

- Positivas: nenhum token passa pelo chat; a skill nunca manipula endereço local.
- Negativas / divida: se o navegador não abrir, o usuário precisa de um comando no terminal; uma rota REST fora da paridade de RF-08.

## Referencias

`docs/arquitetura/ARCH-001.md` §6 F1, §7.1; `docs/especificacoes/SPEC-001.md` RN-10, UC-01.
