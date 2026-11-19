# Infografico executivo (formato dos tres artefatos de aprovacao)

Usado nas Fases 3 (plano), 9 (resultado) e 11 (encerramento) da skill `entrega-autonoma`.
Quem gera assume o papel de Senior Product Designer, Solution Architect e
especialista em comunicacao visual executiva.

## Objetivo
Um diretor entende o valor da entrega em poucos minutos; um profissional de
tecnologia entende os principais componentes e o funcionamento. Parece
material de equipe profissional de design e de arquitetura de produto
(product showcase, technology solution overview, editorial com data
visualization), e nao um slide generico.

## Evitar
Aparencia de PowerPoint, excesso de caixas, fluxograma tradicional como
unica linguagem, diagrama simplificado demais, parede de texto.

## Narrativa antes do layout
Antes de desenhar, analise o conteudo e escolha a narrativa visual mais
adequada. **Nao force secoes sem conteudo.** Secoes possiveis, usar so as
pertinentes:

| Secao | Conteudo |
|-------|----------|
| A. Identidade | nome, frase de posicionamento, problema ou oportunidade |
| B. Visao geral | o que e, o que resolve, quem usa, onde se encaixa |
| C. Funcionalidades | principais, com demonstracao visual e exemplo pratico |
| D. Funcionamento | jornada do usuario, etapas, entradas, processamento e saidas |
| E. Tecnologia, arquitetura e objetos | stack, estrutura e componentes, contratos, integracoes e a lista de objetos **criados, alterados e nao tocados** (arquivos, telas, tabelas, colunas, triggers, procedures, APIs), com a acao de cada um. **Obrigatoria no plano e no resultado**; no plano vem da secao 4-A do pacote |
| F. Beneficios | ganhos, automacao, seguranca e rastreabilidade; indicadores so se existirem |
| G. Visao futura | so o que esta planejado e tem fonte |

Por tipo de artefato:
- **Plano** (antes de implementar): pedido, jornada, o que muda (com mockup),
  tecnologia e objetos (criados, alterados, nao tocados), banco e
  integracoes, riscos e perguntas abertas, o que fica de fora, caixa
  "O que voce decide".
- **Resultado** (antes da aprovacao do desenvolvido): feito contra o prometido,
  objetos realmente alterados (conferidos no codigo, nao copiados do plano),
  numeros reais de testes e revisoes, mockup da tela real, como testar, o que
  ficou de fora, caixa "O que voce decide".
- **Encerramento**: o que foi entregue, onde estao os arquivos, decisoes
  tomadas, pendencias, proximos passos, registros feitos (ids do card e da
  GMUD no Agil, quando houver).

## Linguagem visual
- Titulos fortes e objetivos; cards com hierarquia; textos curtos.
- Numeros e indicadores em destaque (numero grande, com escala ou origem ao
  lado).
- Mockup da interface quando houver tela; demonstracao visual no lugar de
  descricao.
- Proporcoes em visualizacao de dados (por exemplo, barra de composicao),
  marcadas como ilustracao quando derivadas dos valores padrao.
- Jornada e fluxo **integrados a composicao** (conectores, numeracao), nunca
  como unica linguagem; o fluxograma so entra quando o usuario o pediu ou o
  conteudo e o proprio fluxo.
- Pictogramas **funcionais**: geometricos simples, em SVG com os tokens, so
  para identificar o tipo de conteudo. Nunca ornamento.
- Parte tecnica: stack em marcas curtas; estrutura do artefato em **camadas
  empilhadas** (nao em fluxograma), com as funcoes ou rotinas de cada camada;
  entra, processa e sai em tres cartoes; e os objetos da entrega em um quadro
  com tres marcas, **Novo** (verde), **Alterado** (ambar) e **Nao tocado**
  (neutro), com contagens em destaque (por exemplo, 1 arquivo novo, 0
  alterados, 0 objetos de banco).
- Espaco em branco para nao poluir.
- Identidade: skill `padrao-artefatos-clamed` (casca de marca, tokens,
  semantica de cores, sem emoji). Esta e a unica excecao ao "icone so
  ilustrativo" do padrao: o pictograma funcional.

## Regras de verdade
- **Nao inventar** funcionalidade, metrica, integracao ou resultado. Todo
  numero vem do pacote ou do registro de testes, ou e derivado, conferido e
  marcado como ilustracao.
- Diferenciar com marca visivel o que **ja existe**, o que **sera
  desenvolvido**, o que e **possibilidade futura** e o que **fica de fora de
  proposito**. Usar so as marcas que tenham fonte no pacote; nao criar visao
  futura sem fonte.
- Precisao tecnica acima de efeito visual.

## Formato
Vertical, pagina unica de rolagem unica, HTML autocontido (sem rede). Sem
abas e sem o modo apresentar (`.pres`). A decisao e dada no chat, nunca no
artefato: a caixa "O que voce decide" so informa a pergunta e as opcoes.
Montar por script (colar `base.css`, `logos_datauri.css` e `app.js` da skill
de padrao) e rodar o teste de fumaca da skill de padrao.

Duas regras aprendidas na pratica:
- **Testar comportamento, nao so o console.** Menu abre, tema alterna, escala
  de texto e largura mudam, e Imprimir/PDF chama `print` (aguardar ~800 ms: o
  `app.js` chama depois). O console do painel do app acumula entre recargas
  e engana.
- **Patch do `app.js` na montagem.** Sem nenhum `[data-node]` na pagina, o
  bloco de aprovacoes do `app.js` falha (`b-rst` nulo) e aborta os blocos
  seguintes, deixando menu e tema mortos. O script de montagem acrescenta
  `if(!nodes.length) return;` logo depois de
  `var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-node]'));`
  e remove a chamada `drawRadar()` (sem radar ela tambem quebra o resto).
- Cartoes em grade: nunca deixar um cartao sozinho na ultima linha (5 campos
  em 4 colunas); ajustar as colunas ao numero de cartoes.
