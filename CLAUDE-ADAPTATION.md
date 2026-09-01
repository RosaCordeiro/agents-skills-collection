# Adaptação para Claude Code

Esta branch contém a versão dos agents, skills e rules adaptados para Claude Code.

## Estrutura

- **agents-claude/** - Agents com referências ~/.claude/ (em vez de ~/.cursor/)
- **skills-claude/** - Skills sincronizadas com adaptações Claude
- **rules-claude/** - Rules sincronizadas

## Como usar

### No Claude Code:

\\\powershell
# Copiar para seu workspace
Copy-Item agents-claude/* -Destination ~/.claude/agents/ -Recurse -Force
Copy-Item skills-claude/* -Destination ~/.claude/skills/ -Recurse -Force
Copy-Item rules-claude/* -Destination ~/.claude/rules/ -Recurse -Force
\\\

### Sincronização automática:

Use o script sync-agents-skills.ps1 para manter ambas versões (Cursor + Claude) sincronizadas.

## Origem

Adaptado de: https://github.com/RosaCordeiro/agents-skills-collection

## Data

Criado em: 2026-09-01
