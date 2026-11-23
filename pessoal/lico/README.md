# Lico, a lontra mascote (pessoal)

Persona, voz e painel animado do Claude. **Uso pessoal do Guilherme**: não faz parte dos plugins `clamed-dev` / `clamed-pb` e não entra no `build-plugin.ps1`.

| Peça | Arquivo | O que faz |
|------|---------|-----------|
| Personalidade | `output-styles/lico.md` | Estilo de saída: irmão esperto, irônico, que ensina e aprende. Código, commits e documentos ficam neutros. Termina cada resposta com a linha `🔊 ...` |
| Voz | `hooks/lico-voz.ps1` | Hooks Stop e Notification: "iip-iip" gerado por script + voz Maria (pt-BR) aguda. Arquivo `MUDO` ao lado do script silencia |
| Memória | `~/.claude/aprendizado-lico.md` | Criada vazia na instalação; o Lico anota o que aprende. Fica fora do repositório |
| Painel | `mod/lico-mascote` | Painel lateral (desktop) com a lontra em SVG animado: humor por turno (de boa, trabalhando, terminei, preciso de você) e roupa sorteada a cada sessão (mago, dev, cientista, herói, pijama). Um ✨ discreto sorteia outra |

## Instalar

```powershell
.\instalar.ps1
```

O script copia os arquivos para `~/.claude`, mescla `outputStyle` e os hooks no `settings.json` (com backup em `backups/`), importa a memória no `CLAUDE.md` global e registra o painel em `CLAUDE_CODE_PLUGIN_DIRS` (variável de usuário). **Reinicie o app** depois. Teste sem tocar no seu `~/.claude`: `.\instalar.ps1 -Destino C:\temp\teste -SemEnv`.

## Desligar

- Persona: tirar `outputStyle` do `settings.json`.
- Voz: criar `~/.claude/hooks/MUDO`.
- Painel: tirar o caminho de `CLAUDE_CODE_PLUGIN_DIRS`.

## Pendências

- Voz mais natural (Piper) só com homologação da Segurança da Informação.
- O painel só desenha SVG no app desktop; no terminal cai num 🦦.
