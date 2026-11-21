'use strict';
// Só para os testes e2e: sobe o serviço de verdade (dist/servico.js: logger real, REST real,
// arquivo de descoberta, config por variável de ambiente) trocando UMA coisa, o abridor de
// navegador, que aqui não abre nada. Assim o login dos testes acontece sem navegador real.
const path = require('node:path');
const { iniciarServico } = require(path.join(__dirname, '..', '..', 'dist', 'servico.js'));

iniciarServico({
  tratarSinais: true,
  substitutos: { abridorNavegador: { abrir: async () => true } },
})
  .then((servico) => servico.aguardarParada())
  .then(() => setTimeout(() => process.exit(0), 200))
  .catch(() => process.exit(1));
