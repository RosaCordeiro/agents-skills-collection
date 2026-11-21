import type { Config } from '../../src/core/domain/entities/config';
import type { ISoftdeskGateway } from '../../src/core/domain/ports/softdesk.gateway';
import { ErroSoftdesk } from '../../src/core/domain/errors/erro-softdesk';
import { SoftdeskHttpGateway } from '../../src/infraestructure/softdesk/softdesk-http.gateway';
import { montarContainer } from '../../src/shared/container';
import { capturarErro, criarLoggerEspiao, sentinela } from '../simulador/apoio';
import { gerarMassa } from '../simulador/dados';
import { SoftdeskSimulado } from '../simulador/softdesk-simulado';

const configDe = (baseUrl: string): Config => ({
  baseUrl,
  cdAtendente: 393,
  perfilPadrao: 'A',
  esperaLoginSegundos: 120,
  porta: 47821,
  prazoVarreduraSegundos: 90,
  notificarWindows: false,
  nivelLog: 'info',
  diretorio: 'nao-usado',
});

describe('container + gateway', () => {
  let sim: SoftdeskSimulado;

  beforeEach(async () => {
    sim = await SoftdeskSimulado.iniciar({ chamados: gerarMassa([{ cdAtendente: 393, status: 1, quantidade: 5 }]) });
  });
  afterEach(async () => {
    await sim.fechar();
  });

  it('monta o gateway HTTP com a baseUrl da configuração e o logger do container', async () => {
    const logger = criarLoggerEspiao();
    const c = montarContainer(configDe(sim.url), { logger });
    expect(c.gateway).toBeInstanceOf(SoftdeskHttpGateway);
    const sessao = await c.gateway.autenticar('u', sentinela(), 'A');
    const r = await c.gateway.pesquisar(sessao, { atendente: [c.config.cdAtendente] });
    expect(r.lista).toHaveLength(5);
    expect(sim.registro.length).toBe(3);
    expect(logger.registros.length).toBe(3); // login_get, login_post, pesquisa
  });

  it('o prazo da chamada é reduzido pelo container (VAL-09)', async () => {
    const c = montarContainer(configDe(sim.url), { logger: criarLoggerEspiao() }, { timeoutSoftdeskMs: 120 });
    const sessao = await c.gateway.autenticar('u', sentinela(), 'A');
    sim.pesquisa = { lento: 3000 };
    const t0 = Date.now();
    const e = await capturarErro(() => c.gateway.pesquisar(sessao, { atendente: [393] }));
    expect(e).toBeInstanceOf(ErroSoftdesk);
    expect((e as ErroSoftdesk).codigo).toBe('REDE');
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('aceita um gateway substituto', () => {
    const falso: ISoftdeskGateway = {
      conferirPaginaLogin: async () => undefined,
      autenticar: async () => ({ cookies: new Map(), criadaEm: new Date() }),
      pesquisar: async () => ({ lista: [], total: 0 }),
    };
    const c = montarContainer(configDe(sim.url), { logger: criarLoggerEspiao(), gateway: falso });
    expect(c.gateway).toBe(falso);
  });

  // VAL-09 com os 20 s reais: custa 20 s, por isso só roda com SOFTDESK_TESTE_LENTO=1.
  const casoLento = process.env.SOFTDESK_TESTE_LENTO === '1' ? it : it.skip;
  casoLento(
    'resposta que nunca chega → REDE depois dos 20 s reais',
    async () => {
      const c = montarContainer(configDe(sim.url), { logger: criarLoggerEspiao() });
      const sessao = await c.gateway.autenticar('u', sentinela(), 'A');
      sim.pesquisa = { lento: 60_000 };
      const t0 = Date.now();
      const e = await capturarErro(() => c.gateway.pesquisar(sessao, { atendente: [393] }));
      expect((e as ErroSoftdesk).codigo).toBe('REDE');
      const gasto = Date.now() - t0;
      expect(gasto).toBeGreaterThanOrEqual(19_000);
      expect(gasto).toBeLessThan(25_000);
    },
    40_000,
  );
});
