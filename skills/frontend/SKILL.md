---
name: frontend
description: Implementa e refatora UI com Vue, React, TypeScript e ecossistema JS (Node/Bun). Use quando o trabalho for frontend web nao-SAP, componentes, paginas, CSS, SPA. Nao usar para Fiori/UI5 (skills fiori e ui5).
---

# Frontend

Responda e documente em portugues. Espere aprovacao de plano se a mudanca for grande (estilo consultivo). Siga a especificacao e o system design aprovados — nao invente comportamento de negocio.

## Fronteiras

| Assunto | Skill |
|---------|--------|
| Vue, React, SPA web nao-SAP | **esta skill (`frontend`)** |
| App Fiori / Launchpad | `fiori` |
| SAPUI5 (views, controllers, binding) | `ui5` |
| API Node/Go/Python | `backend` |

## Stack

- Vue ou React conforme o projeto (nao misture sem pedido)
- TypeScript quando o projeto ja usa ou e greenfield
- Node ou Bun conforme o repo

## Regras

- Implemente o que foi planejado (melhor opcao aprovada), com codigo legivel para humanos
- Sem codigo desnecessario; sem micagem excessiva nem complexidade gratuita
- Preserve design system e padroes existentes do projeto
- Componentes pequenos, um proposito por arquivo
- Acesse APIs via camada clara (client/service), sem secrets no client
- Caminhos e scripts de build pensados para Linux/WSL
- Branch: preferir `feat/` ou `fix/` conforme o caso

## Checklist antes de pedir aprovacao da fase

- [ ] Roda no ambiente Linux/WSL do usuario
- [ ] Tipos/lint ok se existirem no projeto
- [ ] Estados de loading/erro cobertos no fluxo tocado
- [ ] Sem credenciais hardcoded

## Ao terminar

Resuma o que mudou. Em seguida use **`AskQuestion`** — prompt: `Proximo passo?`
- `Ir para code review` | `Seguir com backend/integracao` | `Ajustar frontend` | `Outro (eu digito)`
