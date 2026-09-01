# Modelos de descrição SoftDesk (HTML)

O campo `descricao` é **HTML**. O que faltar: uma pergunta objetiva **ou** a linha `A confirmar.` Não deixar seção vazia.

Título (texto puro, uma linha): padrão de cada tipo.

---

## 1. Incidente / report de bug

**Título:** `[Sistema/tela] — o que quebra`  
Ex.: `WMS WS046 — quantidade divergente ao gravar conferência`

```html
<p><strong>Sintoma</strong><br>
O que aconteceu, em uma frase.</p>
<p><strong>Onde</strong><br>
Sistema, tela/job/API, ambiente (prod/homolog), usuário afetado se relevante.</p>
<p><strong>Como reproduzir</strong></p>
<ol>
<li>Passo 1</li>
<li>Passo 2</li>
<li>Passo 3</li>
</ol>
<p><strong>Esperado</strong><br>
O que deveria ocorrer.</p>
<p><strong>Atual</strong><br>
O que ocorre de fato (incluir recado de erro se houver).</p>
<p><strong>Impacto</strong><br>
Quem/o quê para; volume; se tem workaround.</p>
<p><strong>Evidência</strong><br>
Print, número de documento, horário, log — ou não tenho.</p>
<p><strong>O que já conferimos (PB/Sybase)</strong><br>
Omitir se não consultou. Senão: tela/objeto, coluna/status, amostra do documento. Separar fato de hipótese.</p>
```

Não omitir pergunta de tela, documento ou esperado vs atual — ver [critico.md](critico.md).

---

## 2. Causa raiz

**Título:** `Causa raiz — [evento/incidente]`

```html
<p><strong>Evento</strong><br>
O que foi observado e quando (data/hora, chamado de incidente se existir).</p>
<p><strong>Impacto observado</strong><br>
Duração, volume, quem sentiu.</p>
<p><strong>Hipóteses iniciais</strong><br>
O que já se suspeita (pode ser ainda não sei).</p>
<p><strong>O que já se sabe</strong><br>
Fatos, não achismo. Logs, métricas, mudança recente.</p>
<p><strong>O que investigar</strong><br>
Fila, job, tela, deploy, dado — lista curta.</p>
<p><strong>Resultado esperado deste chamado</strong><br>
Ex.: documento com causa, evidência e ação preventiva.</p>
```

---

## 3. Projeto

**Título:** `Projeto — [nome curto do resultado]`

```html
<p><strong>Objetivo</strong><br>
O que a área passa a conseguir quando o projeto terminar.</p>
<p><strong>Por quê agora</strong><br>
Dor ou oportunidade (uma ou duas frases).</p>
<p><strong>Escopo</strong><br>
O que entra nesta entrega.</p>
<p><strong>Fora de escopo</strong><br>
O que alguém poderia meter e não deve.</p>
<p><strong>Sistemas / donos</strong><br>
Sistemas, telas, filas, times se souber.</p>
<p><strong>Premissas e dependências</strong><br>
O que precisa existir antes.</p>
<p><strong>Como saber que acabou</strong><br>
Critérios de aceite em lista.</p>
```

Se existir pasta em `Projetos/Especificações/...`, citar o path no último `<p>`.

---

## 4. Melhoria

**Título:** `Melhoria — [o que muda para o usuário]`

```html
<p><strong>Situação atual</strong><br>
Como é hoje.</p>
<p><strong>Situação desejada</strong><br>
Como deve ficar.</p>
<p><strong>Benefício</strong><br>
Tempo, erro evitado, clareza — uma frase.</p>
<p><strong>Escopo</strong><br>
O que muda (tela, regra, relatório). Curto.</p>
<p><strong>Fora de escopo</strong><br>
O que não entra.</p>
<p><strong>Como validar</strong><br>
Passo simples de aceite.</p>
```
