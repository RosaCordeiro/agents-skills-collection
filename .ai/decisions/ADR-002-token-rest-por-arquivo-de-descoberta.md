# ADR-002: Token do REST entregue por arquivo de descoberta no perfil do usuário

- **Status:** aceito em 2026-11-19
- **Data:** 2026-11-19
- **Contexto:** O REST local exige token gerado a cada início (RNF-02) e a SPEC deixou em aberto como entregá-lo (Q-03). O token não pode ir para o chat nem para arquivo versionado.

## Decisao

A cada início o serviço gera 32 bytes aleatórios e grava `%LOCALAPPDATA%\softdesk-local\servico.json` com porta, token e pid, restringe a ACL ao usuário (`icacls`, melhor esforço) e apaga o arquivo na parada. MCP, CLI e testes leem o arquivo e enviam `Authorization: Bearer`. O REST usa porta fixa configurável (47821), confere `Host`, recusa requisições com `Origin` e compara o token em tempo constante.

## Alternativas consideradas

| Alternativa | Por que nao |
|-------------|-------------|
| Token impresso no terminal | Copiado à mão, acabaria no chat |
| Token em variável de ambiente do MCP | Muda a cada início do serviço; a configuração do MCP é arquivo |
| Named pipe com ACL | A SPEC pede REST em 127.0.0.1; seria um segundo transporte |

## Consequencias

- Positivas: nenhum segredo na configuração do MCP nem no repositório; clientes locais descobrem porta e token sozinhos; a porta fixa garante instância única.
- Negativas / divida: outro programa rodando como o mesmo usuário consegue ler o arquivo (aceito); existe um arquivo em disco que VAL-19 precisa reconhecer como esperado.

## Referencias

`docs/arquitetura/ARCH-001.md` §7.2; `docs/especificacoes/SPEC-001.md` RNF-02, Q-03.
