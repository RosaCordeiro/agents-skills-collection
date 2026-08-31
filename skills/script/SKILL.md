---
name: script
description: Cria e mantem CLIs, scripts e automacao em Linux/WSL (bash, Python, Node/TS, Go). Use quando o usuario pedir script, CLI, automacao, job one-off, makefile, ou a orquestracao all-in-one encaminhar para script.
---

# Script / CLI

Responda em portugues. Prefira Linux/WSL; evite PowerShell e cmd Windows. Siga a especificacao aprovada quando houver regra de negocio. Codigo legivel; sem complexidade gratuita.

## Escolha de ferramenta

| Caso | Preferencia |
|------|-------------|
| Automacao curta / glue | bash |
| Parsing/dados / APIs | Python ou Node/TS |
| CLI distribuivel / binario | Go ou Node |
| Repo ja tem padrao | seguir o padrao |

## Requisitos de CLI/script

- Uso via `--help` ou comentario de cabecalho em portugues
- Exit codes significativos (0 ok, !=0 erro)
- Flags claras; defaults seguros
- Nao pedir paths Windows (`C:\`); usar paths POSIX / WSL
- Se depender de Docker/DB, documentar pre-requisitos

## Estrutura minima sugerida

```text
tool-name/
  .ai/               # obrigatorio em greenfield (projeto-ai)
  README.md          # como rodar (pt)
  scripts/ ou cmd/   # entrypoints
  .env.example       # se precisar de secrets
```

## Checklist

- [ ] `.ai/` criada em greenfield (`projeto-ai`)
- [ ] Roda no WSL/Linux
- [ ] Help/uso documentado em portugues
- [ ] Sem secrets no codigo
- [ ] Idempotente quando fizer sentido

## Ao terminar

Mostre comando de uso. Em seguida use **`AskQuestion`** — prompt: `Proximo passo?`
- `Ir para code review` | `Ajustar script` | `Outro (eu digito)`
