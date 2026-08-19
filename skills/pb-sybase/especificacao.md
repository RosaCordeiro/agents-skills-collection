# Especificação PB + Sybase (para outro desenvolvedor)

Usar quando o pedido for **spec / chamado / tela nova / mock / DOCX** para WMS ou outro sistema PB — não só consulta.

Consulta continua em [consulta.md](consulta.md). Este arquivo é o pipeline de **entrega de spec**.

Referência de qualidade: chamado 2405580 (dimensão caixa / endereços flowrack).

---

## Pipeline (ordem)

1. **Consultar e entender** (MCP PBG + Sybase + sybase-objects). Não especular schema.
2. **Especificar em Markdown** na pasta do chamado. Iterar com o usuário até o modelo fechar.
3. **Mocks HTML** se houver tela (layout tipo PB12). Atualizar mock junto com o MD.
4. **DOCX por último**, só depois do usuário dizer que MD/mock estão ok.
5. **Limpar** o que ficou obsoleto (HTML antigo, mock de fluxo descartado).

Não inverter: não gerar DOCX no rascunho. Não implementar PB nesta fase (isso é `/pbg`), salvo pedido explícito.

---

## Pasta e arquivos

```
Projetos/Especificações/Chamado <n>/
  SPEC-<n>.md                 # fonte da verdade
  mock-*.html                 # só os vigentes
  SPEC-<n>.docx               # só após ok do usuário
```

Se o número do chamado existir: tentar SoftDesk (`user-softdesk`) para contexto; se não achar, seguir com o que o usuário descreveu e o legado PB/Sybase.

Sistema PB: `path` absoluto (`C:\Sistemas_PB12\WMS`, etc.). Tela nova: **WSxxx** até o número na inclusão; citar até onde o sistema já vai (ex. WS191).

---

## O que consultar antes de escrever

Cruzar as três fontes (skill principal). No mínimo:

| Precisa saber | Onde
|---------------|------
| Tela/menu/ancestor (genérica dw_1/dw_2) | `user-pbg` — search + trecho |
| Campo já existente vs coluna nova | `sybase_describe_table` |
| Formato que o usuário já conhece (ex. flow `XX.XXX`) | DW/SQL de tela irmã (ex. WS046) |
| Histórico / trigger | `tu_`/`ti_`/`td_` em sybase-objects |
| Catálogo já existente | tela + tabela (não recriar WS114 se já existe) |

Não inventar coluna, PK, nome de SP ou “herança” invertida. Se o usuário corrigir o modelo (ex.: tipo é do endereço, quantidade é do produto × tipo), **reescrever o MD** — não deixar frase do modelo antigo.

---

## Documento autocontido

A spec é lida por **outro desenvolvedor**, que **não viu o chat**.

- Toda decisão traz o **porquê** no próprio texto (“a quantidade fica em produto × tipo porque o mesmo produto em outro endereço com a mesma dimensão reaproveita o valor”).
- Não deixar conclusão órfã (“isso é pesado”, “não usar X”) sem o contexto que a justifica.
- Não gravar idas e vindas da conversa (“antes era bin, agora é…”, “o que mudou nesta revisão”).
- Não listar alternativas descartadas como se fossem requisito.
- Vocabulário **do sistema** (tela/tabela existentes), não jargão da conversa.
- Fora de escopo só o que o implementador poderia meter nesta entrega — cada item com uma linha de motivo.

Teste: um colega abre só o MD e consegue implementar sem perguntar “por que está escrito isso?”.

---

## Conteúdo mínimo do MD

Público: desenvolvimento PB. Linguagem da área (keyuser) + nomes técnicos de tabela/tela o suficiente para gravar.

1. Objetivo (o que a área precisa fazer).
2. O que já existe vs o que esta entrega faz.
3. Dono de cada dado (quem grava onde, e por quê).
4. Tela: ancestor, dw_1, dw_2, menu da genérica, botões extras.
5. Banco: DDL das tabelas/colunas novas, o que não muda, histórico no padrão já existente (`wms_historico_*` = snapshot + `dh_alteracao` + `id_alteracao` I/A/E, sem coluna ant/depois, se for o caso).
6. Lógica: retrieve, itemchanged, gravar, filtros (retrieve vs `SetFilter` no header da dw_2).
7. Critérios de aceite.
8. Anexos (mocks vigentes).

### O que **não** escrever na spec (instrução do agent)

O documento é para o desenvolvedor Clamed. **Não** copiar para o MD/DOCX:

- limite de identificador ASE (“nomes ≤ 30 caracteres”) — respeitar **ao nomear**, sem transformar em requisito do chamado;
- tooling (“MCP Sybase não aplica DDL”, “script vai para o DBA”, “sybase-objects”).

O SQL na spec é o modelo a criar. Deploy/DBA fica no chat ou no runbook, não no chamado.

---

## Mocks HTML

Quando a entrega tem tela:

- Visual tipo PB12 (titlebar, genérica, grade) **só para ilustrar** o fluxo. No mock e no MD: **os mocks são meramente ilustrativos; o padrão a seguir é o padrão CLAMED** (genéricas, menu, fontes, DDDW, cores das telas irmãs do sistema).
- Só o que a spec pede; mock e MD **não divergem** no conteúdo de negócio.
- Exemplos de produto **genéricos** (não citar medicamento se o WMS trata qualquer produto).
- Filtro de retrieve na dw_1; filtro local (ex. divergentes) no **header da dw_2**, não na dw_1.
- Consultar/Gravar: menu da genérica, não botões duplicados, se essa for a regra do sistema.

---

## DOCX

Só após ok explícito do usuário no MD/mock.

1. HTML da spec vigente (conteúdo = MD).
2. Word COM: copiar para `C:\Temp\...` (path com acento em `Especificações` quebra o COM).
3. Anexar os HTML de mock (OLE, ícone, duplo clique).
4. Copiar o `.docx` de volta para a pasta do chamado.
5. Se `SPEC-*.docx` estiver aberto no Word, gravar nome alternativo e avisar.
6. Apagar HTML de spec intermediário se não for mais útil; não deixar spec antiga sem aviso.

Não commitar sem pedido.

---

## Iteração

Cada ajuste do usuário: atualizar **MD + mock vigente** no mesmo turno. Não acumular “versões” no texto. Arquivo morto: excluir ou marcar desatualizado no topo.
