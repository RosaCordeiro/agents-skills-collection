import type { Config } from '../../src/core/domain/entities/config';
import type { ILogger } from '../../src/core/domain/ports/logger';
import { RelogioSistema } from '../../src/infraestructure/relogio/relogio-sistema';
import { montarContainer } from '../../src/shared/container';

const config: Config = {
  baseUrl: 'http://127.0.0.1:1',
  cdAtendente: 393,
  perfilPadrao: 'A',
  esperaLoginSegundos: 120,
  porta: 47821,
  prazoVarreduraSegundos: 90,
  notificarWindows: false,
  nivelLog: 'info',
  diretorio: 'nao-usado',
};

describe('montarContainer', () => {
  it('usa os substitutos em vez de criar logger real (nada é gravado em disco)', () => {
    const chamadas: string[] = [];
    const logger: ILogger = {
      info: (m) => chamadas.push(m),
      warn: () => undefined,
      error: () => undefined,
    };
    const relogio = { agora: () => new Date('2026-01-01T00:00:00Z') };
    const c = montarContainer(config, { logger, relogio });
    expect(c.config).toBe(config);
    expect(c.logger).toBe(logger);
    expect(c.relogio.agora().toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('o relógio padrão é o real', () => {
    const logger: ILogger = { info: () => undefined, warn: () => undefined, error: () => undefined };
    const c = montarContainer(config, { logger });
    expect(c.relogio).toBeInstanceOf(RelogioSistema);
    expect(Math.abs(c.relogio.agora().getTime() - Date.now())).toBeLessThan(1000);
  });
});
