# Projeto

## O que é

Serviço **local** (roda só no computador do atendente) que consulta chamados do SoftDesk usando a **sessão web do próprio usuário** e os expõe por duas portas sobre o mesmo núcleo: **MCP** (para o Claude e a skill `/softdesk`) e **REST em 127.0.0.1**. Existe porque as ferramentas atuais só listam os chamados que o usuário abriu; o serviço traz a **fila do atendente** e qualquer **pesquisa avançada** do SoftDesk.

## Usuários / personas

- Atendente de TI da Clamed que usa o Claude no próprio computador (primeiro usuário: atendente código 393).
- Agentes de IA (Claude Code, skill `/softdesk`) chamando as tools MCP em nome desse usuário.

## Escopo

Somente leitura: listar a fila, pesquisa avançada, ver um chamado completo, estado da sessão e verificação de saúde (detecta mudança de layout/rota do SoftDesk). Login por janela local, sem senha no chat.

## Fora de escopo

- Escrever no SoftDesk (registrar atividade, editar, criar): o MCP oficial já faz.
- Espelhar chamados em banco: o `clamed.dev` já faz.
- Guardar senha em disco ou reter senha para relogin automático.
- Acesso direto ao banco MySQL do SoftDesk: liberado só por IP fixo.
- Alterar o repositório `mcp-softdesk`: pertence a outro time.

## Integrações

- SoftDesk web (`https://helpdesk.clamed.com.br`): rotas **não oficiais** `/login` e `/chamado/json`. Podem mudar sem aviso.
- Navegador padrão do usuário: abre a janela de login local.
- Skill `/softdesk`: consumidora (alteração no fim da entrega, via `agents-skills-collection-import`).

## Premissas

- O usuário tem login pessoal no SoftDesk e a rede da Clamed (ou VPN) ativa.
- O código de atendente não vem na resposta de login; fica em configuração local (padrão 393).
- A norma de uso de IA (SIN-NOR-000021, item 6.1.1) veda senha no prompt: toda a autenticação acontece fora do chat.
