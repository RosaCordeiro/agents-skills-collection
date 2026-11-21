import { ROTAS_PERMITIDAS, simuladoresCriados } from './softdesk-simulado';

/**
 * VAL-10 / RN-01 em toda a suíte (jest `setupFilesAfterEnv`): ao fim de cada arquivo de teste,
 * o registro de todo SoftDesk simulado criado nele só pode ter GET /login, POST /login e
 * GET /chamado/json. Qualquer outra chamada (escrita ou rota desconhecida) derruba o arquivo.
 */
afterAll(() => {
  const fora: string[] = [];
  for (const sim of simuladoresCriados.splice(0)) {
    if (sim.toleraRotasExtras) continue;
    for (const r of sim.registro) {
      const chamada = `${r.metodo} ${r.caminho}`;
      if (!ROTAS_PERMITIDAS.includes(chamada)) fora.push(chamada);
    }
  }
  if (fora.length > 0) {
    throw new Error(`o SoftDesk simulado recebeu chamadas fora do contrato somente leitura: ${[...new Set(fora)].join(', ')}`);
  }
});
