---
name: jfx-windows
description: >-
  Client desktop JavaFX para rodar em estações Windows fixas (ex. chão de
  CD/depósito): estrutura de projeto Maven+JavaFX, FXML, empacotamento com
  jpackage (MSI/EXE com JVM embutida), e como habilitar/testar o Java Access
  Bridge para acessibilidade no Windows. Ler `java` antes desta. Use quando o
  projeto for um app desktop Java para Windows. Não usar para serviço
  HTTP/worker (skill springboot) nem para acesso a banco (skill jdbc-windows,
  ler as duas juntas quando o client falar com SQLite local).
---

# JavaFX em estação Windows (padrão Clamed)

Responda em português. Pressupõe a skill `java` já lida.

## Fronteiras

| Assunto | Skill |
|---------|--------|
| Convenção Java genérica | `java` |
| Acesso a banco (SQLite local, Sybase/jTDS) a partir do client | `jdbc-windows` — ler junto sempre que o client tocar banco |
| Serviço backend Java (não é desktop) | `springboot` |
| Equivalente .NET WPF do mesmo tipo de app | fora do escopo desta skill — ver ARCH do projeto |

## Estrutura de projeto

```text
src/main/java/br/com/clamed/<projeto>/
  presentation/
    view/                 # controllers FXML: <Tela>Controller.java
    viewmodel/             # estado observável da tela (Property/ObservableList), sem lógica de negócio
  core/...                 # igual à skill java (domain/application)
  infrastructure/...       # igual à skill java
src/main/resources/br/com/clamed/<projeto>/
  view/
    <Tela>.fxml
    <Tela>.css            # equivalente ao QSS/CSS — JavaFX aceita CSS quase padrão
```

- **FXML + Controller** é o padrão (equivalente ao XAML+code-behind do WPF). UI 100% programática só se a tela for trivial (poucos elementos, sem justificativa pra separar arquivo).
- **ViewModel fino**: expõe `Property`/`ObservableList` que o Controller faz bind; nunca chama use case direto do Controller sem passar pelo ViewModel — mantém a tela testável sem instanciar JavaFX.
- Controller nunca acessa `infrastructure` diretamente — sempre via use case, injetado no ViewModel.

## Thread de UI — regra que não pode quebrar

- **Toda chamada que pode bloquear (JDBC, I/O de arquivo, rede) roda fora da JavaFX Application Thread.** Usar `javafx.concurrent.Task` submetido a um `ExecutorService` próprio, nunca `Thread` solta sem controle de ciclo de vida.
- Atualizar a UI só de volta na Application Thread: `Platform.runLater(...)` ou os callbacks do próprio `Task` (`setOnSucceeded`, etc.) — nunca mutar uma `Property`/`ObservableList` ligada à UI a partir de outra thread diretamente (lança exceção em runtime, e é exatamente o tipo de bug que só aparece sob carga).
- Ver `jdbc-windows` para a regra equivalente do lado do banco.

## Empacotamento (jpackage)

- `jpackage` (JDK 14+) gera o instalador nativo — **precisa rodar numa máquina Windows** para gerar `.msi`/`.exe` (não roda cross-platform).
- Padrão mínimo de comando (ajustar módulo/main-class ao projeto):

```powershell
jpackage `
  --name Conferi `
  --input target/ `
  --main-jar app.jar `
  --main-class br.com.clamed.conferi.Main `
  --type msi `
  --win-dir-chooser `
  --win-shortcut `
  --icon app.ico `
  --app-version 1.0.0
```

- Usar `jlink` antes, com módulos customizados (`--module-path`, `--add-modules`), para reduzir o tamanho do runtime embutido em vez de empacotar o JDK inteiro — sem isso o instalador fica maior do que precisa.
- **Sem mecanismo de atualização automática de fábrica** (diferente de Electron): a estratégia de atualização (MSIX+gestão de patch, ou verificação de versão própria) é decisão de infra do projeto, não desta skill — só documentar que o `jpackage` sozinho não resolve isso.

## Acessibilidade — Java Access Bridge

Este é o ponto que a equipe esquece se não estiver escrito: **sem isso habilitado na estação, NVDA/JAWS não enxergam a aplicação JavaFX**, mesmo que o código use os componentes nativos corretamente.

1. Habilitar no Windows: rodar `jabswitch.exe /enable` (ferramenta que vem com o JDK, em `%JAVA_HOME%\bin`) — é o método confiável em Windows 10/11. O item equivalente no Painel de Controle (Facilidade de Acesso → Usar o Computador sem uma Tela → "Ativar Assistente de Acesso Java") existe em versões mais antigas do Windows; não confiar só nele em imagem/versão recente.
2. Confirmar que `WindowsAccessBridge-64.dll` está registrada — normalmente já vem certo com `jabswitch /enable`; se não, checar `%JAVA_HOME%\bin\WindowsAccessBridge-64.dll`.
3. Isso é **configuração de máquina**, não de código — precisa entrar no checklist de setup de cada estação nova do CD (mesmo lugar onde entraria a instalação do driver do leitor de código de barras).
4. Testar de verdade com um leitor de tela real (NVDA é gratuito) antes de considerar a tela "acessível" — não confiar só em revisão visual do código.
5. No código: usar os componentes nativos do JavaFX (`Button`, `Label`, `TextField`, etc.) com `setAccessibleText`/`setAccessibleHelp` quando o texto visível não for suficiente; nunca construir um "botão" a partir de um `Pane` genérico sem role de acessibilidade.

## Leitor de código de barras (USB HID)

- A maioria dos leitores emula teclado (HID keyboard) — captura via `KeyEvent`/`TextField` normal, sem SDK especial.
- Se o leitor for configurado em modo HID puro (não-teclado), usar uma biblioteca HID nativa (ex. `hid4java`) — caso raro, confirmar com o hardware antes de assumir essa complexidade.

## Checklist

- [ ] FXML + Controller + ViewModel, sem lógica de negócio no Controller
- [ ] Nenhuma chamada bloqueante na Application Thread (JDBC, I/O) — sempre via `Task`
- [ ] `jpackage` gerando `.msi` numa máquina/runner Windows, com `jlink` reduzindo o runtime
- [ ] Java Access Bridge habilitado e testado com leitor de tela real na estação de referência
- [ ] Componentes nativos JavaFX usados (não `Pane` genérico fingindo de botão)

