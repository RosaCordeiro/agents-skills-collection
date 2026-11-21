# ADR-001: Serviço local de longa duração, iniciado pelo próprio MCP, com MCP stdio fino

- **Status:** aceito em 2026-11-19
- **Data:** 2026-11-19 (revisado duas vezes: o MCP inicia o serviço e o serviço não encerra por ociosidade)
- **Contexto:** A sessão do SoftDesk precisa ser única e compartilhada entre MCP e REST (RF-08), mas o Claude inicia um processo MCP stdio por chat e o encerra ao fechar. O usuário quer usar como o `mcp-sybase-readonly`: registrar e usar, sem iniciar nada à mão, e sem perder o login por ficar um tempo parado.

## Decisao

Um processo `servico` é o único dono da sessão, da janela de login, do cliente do SoftDesk e do REST em 127.0.0.1. O MCP stdio não tem regra nem sessão: cada tool chama o REST e devolve o mesmo envelope. Quando o serviço não está rodando, o MCP o inicia em segundo plano (`detached`, oculto) e espera até 10 s; a porta fixa garante uma só instância mesmo com vários MCPs concorrentes. O serviço **não encerra por ociosidade**: só para por comando (`npm run servico:parar`), ao reiniciar o Windows ou quando o usuário sai; a sessão do SoftDesk só termina quando o SoftDesk a rejeita. Se o serviço não subir, o MCP responde `SERVICO_INDISPONIVEL` com o caminho do log.

## Alternativas consideradas

| Alternativa | Por que nao |
|-------------|-------------|
| Um processo que é MCP e REST ao mesmo tempo | A sessão morre quando o chat "líder" fecha (novo login a cada troca de chat); exige eleição de líder e dois modos no mesmo binário; logs e janela de login dividem processo com o stdout do protocolo |
| Usuário inicia o serviço à mão (`npm run servico:iniciar`) | Foi a primeira versão; o usuário a recusou: o uso deve ser o mesmo de um MCP comum |
| Encerrar o serviço após 8 h sem pedidos | Foi a segunda versão; o usuário a recusou: não quer perder o login por ficar parado |
| Iniciar o serviço com o Windows | Não resolve o primeiro uso nem a reinicialização do serviço; o início pelo MCP cobre os dois |

## Consequencias

- Positivas: login uma vez só; paridade MCP x REST por construção; stdout do MCP limpo; senha e cookies em um único processo; sem passo manual para o usuário.
- Negativas / divida: o serviço continua rodando depois que o chat fecha e até o Windows reiniciar (risco R11, aceito pelo usuário); abrir o navegador a partir de um processo oculto precisa ser validado (R4, com plano B no ARCH §13); código de erro novo `SERVICO_INDISPONIVEL`, incluído na SPEC §11.

## Referencias

`docs/arquitetura/ARCH-001.md` §2, §6 F9, §8; `docs/especificacoes/SPEC-001.md` RN-15, RF-10, CA-24, VAL-27, VAL-28.
