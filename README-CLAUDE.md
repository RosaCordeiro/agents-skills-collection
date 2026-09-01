# Branch: claude-version

Versão adaptada para Claude Code com referências ~/.claude/

## Como usar

```powershell
Copy-Item agents-claude-temp/* -Destination ~/.claude/agents/ -Recurse -Force
Copy-Item skills-claude-temp/* -Destination ~/.claude/skills/ -Recurse -Force
Copy-Item rules-claude-temp/* -Destination ~/.claude/rules/ -Recurse -Force
```

Ou use o sync script:
```powershell
.\sync-agents-skills.ps1 -Commit
```

---
Versão: Claude Code Adapted
Data: 2026-09-01
