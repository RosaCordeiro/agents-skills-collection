# Checklist de Seguranca da Informacao — aplicacoes internas CLAMED

Fonte: documento de validacao da Seguranca da Informacao. Cada item recebe
`OK`, `N/A` (com justificativa) ou `PENDENTE`. Qualquer `PENDENTE` bloqueia o
deploy em producao, exceto com aceite registrado da SI. Regras de uso e
relatorio: [SKILL.md](SKILL.md).

## SI-1 Desenho (antes de desenvolver)

- SI-1.1 Responsavel tecnico e responsavel pelo negocio identificados.
- SI-1.2 Dados tratados listados e classificados: dado pessoal, financeiro,
  estoque/compras ou publico. Com dado pessoal, so os campos necessarios
  (minimizacao, LGPD).
- SI-1.3 Integracoes listadas (SAP, WMS, Sybase, bancos, APIs externas) com o
  tipo de acesso a cada uma: leitura ou escrita.
- SI-1.4 Exposicao definida. Padrao: somente rede interna. Acesso externo exige
  avaliacao previa da SI.
- SI-1.5 Perfis de acesso definidos, com o que cada perfil ve e faz.

## SI-2 Autenticacao e autorizacao

- SI-2.1 Toda rota de API exige token. Sem token, token invalido ou expirado: `401`.
- SI-2.2 Rota sem autenticacao so quando nao retorna dado de negocio nem
  pessoal e nao executa consulta pesada (ex.: healthcheck), e documentada no
  Backstage.
- SI-2.3 Token com assinatura assimetrica (ex.: RS256), validade curta; o
  backend valida assinatura, `exp`, `iss` e `aud`; rejeita `alg: none`.
  (Implementacao do time: `autenticacao-api`, ver nota no SKILL.md.)
- SI-2.4 Autorizacao por rota: alem de autenticado, o perfil pode acessar o
  recurso.
- SI-2.5 Autorizacao por objeto: trocar um ID na URL ou no corpo nao devolve
  dado de outro usuario ou registro.
- SI-2.6 Login integrado ao AD (LDAPS) ou SSO corporativo, para que o
  desligamento remova o acesso. Com base propria de usuarios: hash forte
  (bcrypt ou argon2), bloqueio apos tentativas invalidas e processo de remocao
  de acesso no desligamento.

## SI-3 Segredos e contas de integracao

- SI-3.1 Nenhuma senha, chave, token ou string de conexao no codigo-fonte, no
  front-end ou no Git. Variavel de ambiente ou cofre.
- SI-3.2 Uma conta de servico por sistema para cada integracao, com privilegio
  minimo (somente leitura quando possivel). Nunca conta pessoal.
- SI-3.3 Segredo exposto por engano e **trocado** imediatamente, nao so
  removido do codigo.

## SI-4 API e dados

- SI-4.1 CORS restrito a origem do proprio front-end. Nunca `*`.
- SI-4.2 A resposta devolve so os campos que a tela usa.
- SI-4.3 Erro sem stack trace, nome de tabela ou mensagem do banco.
- SI-4.4 Consulta pesada com paginacao, limite de registros e timeout.
- SI-4.5 Todo parametro de entrada validado; queries parametrizadas; nunca
  concatenar SQL.
- SI-4.6 Sem busca de URL informada pelo usuario sem lista de destinos
  permitidos (SSRF).
- SI-4.7 Dado recebido de API de terceiros validado e tratado antes do uso,
  como qualquer entrada externa.
- SI-4.8 Rota de metricas sem dado sensivel, variavel de ambiente ou caminho
  interno; de preferencia restrita ao IP do monitoramento.

## SI-5 Pre-validacao local

O pipeline do DevOps executa estas verificacoes e pode bloquear o deploy.
Rodar antes do push evita retrabalho. Rodar no WSL, conforme a regra
`execucao-wsl`.

- SI-5.1 Trivy no projeto: `trivy fs --scanners vuln,secret .`
- SI-5.2 Trivy na imagem, quando ha container: `trivy image <imagem>`
- SI-5.3 `npm audit` (ou equivalente da linguagem), com vulnerabilidades
  criticas e altas corrigidas.
- SI-5.4 SAST local quando disponivel: `semgrep scan --config auto`.
- SI-5.5 Dockerfile com usuario nao root e imagem base enxuta.
- SI-5.6 Achado que nao puder ser corrigido antes do deploy alinhado com o
  DevOps e a SI.

## SI-6 Build e ambientes

- SI-6.1 Homologacao e producao separadas. Sem dado real de producao em
  homologacao, salvo autorizacao da SI.
- SI-6.2 Build de producao sem referencia a localhost, enderecos de homologacao
  (hmg) nem source maps.
- SI-6.3 HTTPS com certificado valido; HTTP redireciona para HTTPS no proprio
  host.

## SI-7 Logs e monitoramento

- SI-7.1 Monitoramento de disponibilidade e desempenho ativo.
- SI-7.2 Log de auditoria com login, falhas de login e acoes relevantes
  (quem, quando, o que).
- SI-7.3 Nunca registrar senha, token ou dado pessoal desnecessario em log.
- SI-7.4 Aplicacao registrada no Backstage, com responsavel, rotas publicas e
  integracoes documentadas.

## SI-8 Go-live

- SI-8.1 Antes de divulgar aplicacao nova, chamado aberto para a SI fazer o
  reteste.
- SI-8.2 Cada rota GET da API testada: sem token (esperado `401`), com token
  invalido (esperado `401`) e com token valido (esperado `200`).
- SI-8.3 Rotas POST, PUT e DELETE confirmadas como protegidas pelo time de
  desenvolvimento, sem teste destrutivo.
- SI-8.4 API descontinuada desligada, nao so removida do front-end.

Exemplo de teste de rota (PowerShell):

```
curl.exe -s -o NUL -w "sem token: %{http_code}\n" https://<api>/<rota>
curl.exe -s -o NUL -w "token falso: %{http_code}\n" -H "Authorization: Bearer teste123" https://<api>/<rota>
```
