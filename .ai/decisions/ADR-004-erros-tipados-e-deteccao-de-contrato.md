# ADR-004: Erros tipados no domínio e detecção de contrato no adaptador do SoftDesk

- **Status:** aceito em 2026-11-19
- **Data:** 2026-11-19
- **Contexto:** As rotas do SoftDesk não são oficiais. A quebra de formato precisa ser distinguida de sessão expirada, senha errada e rede (RN-07, RN-08).

## Decisao

A taxonomia `ErroSoftdesk { codigo, mensagem, acao, destaque }` mora no domínio. A classificação das respostas mora em `infraestructure/softdesk/contrato.ts`, como funções puras em tabela de decisão avaliada em ordem (rede, depois credencial ou sessão, depois contrato). A pesquisa nunca segue redirecionamento. `LAYOUT_LOGIN_MUDOU` e `CONTRATO_ROTA_MUDOU` saem com `destaque: true`, bloco `alerta` no envelope (igual em MCP e REST), log com keyword `softdesk_contrato_mudou`, registro de `ultimo_alerta` e notificação do Windows opcional.

## Alternativas consideradas

| Alternativa | Por que nao |
|-------------|-------------|
| Classificar nos casos de uso | Espalharia conhecimento do formato de fio fora do adaptador |
| Tratar resposta não JSON como sessão expirada (como o `mcp-softdesk`) | Esconde a quebra real de rota |
| Repassar a mensagem do SoftDesk no erro de credencial | Pode conter o nome de usuário |

## Consequencias

- Positivas: ajustar uma regra é mudar uma linha de tabela; o alerta é idêntico nas duas portas.
- Negativas / divida: se a expiração real vier como HTML com HTTP 200 sem redirecionamento, haverá alarme falso de contrato até ajustar (Q-02).

## Referencias

`docs/arquitetura/ARCH-001.md` §7.3, §7.4, F8; `docs/especificacoes/SPEC-001.md` RN-07, RN-08.
