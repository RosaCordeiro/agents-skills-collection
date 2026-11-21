import type { Config } from '../../src/core/domain/entities/config';
import { CODIGOS_ERRO, type CodigoErro } from '../../src/core/domain/errors/erro-softdesk';
import {
  NotificadorWindows,
  TEXTOS_BALAO,
  montarScriptBalao,
} from '../../src/infraestructure/notificacao/notificador-windows';
import { NotificadorNulo } from '../../src/infraestructure/notificacao/notificador-nulo';
import { montarContainer } from '../../src/shared/container';
import { criarLoggerEspiao } from '../simulador/apoio';
import { configTeste } from '../simulador/sessao-apoio';

/** Notificador do Windows (ARCH §8.4, RF-07): sempre com executor falso; nenhum balão real. */
describe('NotificadorWindows', () => {
  const dormir = (): Promise<void> => new Promise((r) => setImmediate(r));

  it('mostra um balão por código de destaque, com powershell -NoProfile -Command e o texto fixo', () => {
    const chamadas: string[][] = [];
    const logger = criarLoggerEspiao();
    const n = new NotificadorWindows({ logger, executar: async (a) => void chamadas.push(a) });
    n.alertar('CONTRATO_ROTA_MUDOU');
    n.alertar('LAYOUT_LOGIN_MUDOU');
    expect(chamadas).toHaveLength(2);
    for (const a of chamadas) {
      expect(a.slice(0, 1)).toEqual(['-NoProfile']);
      expect(a).toContain('-Command');
      expect(a[a.indexOf('-Command') + 1]).toContain('System.Windows.Forms.NotifyIcon');
      expect(a[a.indexOf('-Command') + 1]).toContain('ShowBalloonTip');
    }
    const rota = chamadas[0][chamadas[0].indexOf('-Command') + 1];
    const login = chamadas[1][chamadas[1].indexOf('-Command') + 1];
    expect(rota).toContain(TEXTOS_BALAO.CONTRATO_ROTA_MUDOU?.titulo);
    expect(rota).toContain(TEXTOS_BALAO.CONTRATO_ROTA_MUDOU?.texto);
    expect(login).toContain(TEXTOS_BALAO.LAYOUT_LOGIN_MUDOU?.titulo);
    expect(rota).not.toEqual(login);
    expect(logger.registros).toHaveLength(0);
  });

  it('só os códigos de destaque e a deriva têm balão; os demais não executam nada', () => {
    const chamadas: string[][] = [];
    const n = new NotificadorWindows({ logger: criarLoggerEspiao(), executar: async (a) => void chamadas.push(a) });
    const outros = CODIGOS_ERRO.filter((c: CodigoErro) => c !== 'LAYOUT_LOGIN_MUDOU' && c !== 'CONTRATO_ROTA_MUDOU');
    expect(outros.length).toBeGreaterThan(5);
    for (const c of outros) n.alertar(c);
    expect(chamadas).toHaveLength(0);
    expect(Object.keys(TEXTOS_BALAO).sort()).toEqual(['CONTRATO_ROTA_MUDOU', 'DERIVA', 'LAYOUT_LOGIN_MUDOU']);
    n.alertar('DERIVA');
    expect(chamadas).toHaveLength(1);
  });

  it('os textos são fixos e seguros para ir entre aspas simples no PowerShell (sem aspa simples, cifrão, crase, quebra de linha)', () => {
    for (const balao of Object.values(TEXTOS_BALAO)) {
      for (const parte of [balao?.titulo ?? '', balao?.texto ?? '']) {
        expect(parte.length).toBeGreaterThan(10);
        expect(/['$`\r\n"]/.test(parte)).toBe(false);
        // sem dado de chamado nem de pessoa: nada de dígitos (códigos, matrículas) no texto
        expect(/\d/.test(parte)).toBe(false);
      }
      const script = montarScriptBalao(balao as { titulo: string; texto: string });
      expect(script).toContain(`'${balao?.titulo}'`);
      expect(script).toContain(`'${balao?.texto}'`);
    }
  });

  it('falha síncrona do executor é engolida e vira warn sem a mensagem da exceção', () => {
    const logger = criarLoggerEspiao();
    const n = new NotificadorWindows({
      logger,
      executar: () => {
        throw new Error('SEGREDO-NA-MENSAGEM-DA-EXCECAO');
      },
    });
    expect(() => n.alertar('CONTRATO_ROTA_MUDOU')).not.toThrow();
    expect(logger.registros).toHaveLength(1);
    expect(logger.registros[0].nivel).toBe('warn');
    expect(logger.registros[0].campos.codigo_erro).toBe('CONTRATO_ROTA_MUDOU');
    expect(logger.texto().includes('SEGREDO-NA-MENSAGEM-DA-EXCECAO')).toBe(false);
  });

  it('rejeição assíncrona (powershell ausente, timeout) é engolida e vira warn', async () => {
    const logger = criarLoggerEspiao();
    const n = new NotificadorWindows({
      logger,
      executar: () => Promise.reject(new Error('SEGREDO-DA-REJEICAO')),
    });
    expect(() => n.alertar('LAYOUT_LOGIN_MUDOU')).not.toThrow();
    await dormir();
    await dormir();
    expect(logger.registros).toHaveLength(1);
    expect(logger.registros[0].nivel).toBe('warn');
    expect(logger.texto().includes('SEGREDO-DA-REJEICAO')).toBe(false);
  });

  it('falha ao registrar o warn também não derruba', () => {
    const n = new NotificadorWindows({
      logger: {
        info: () => undefined,
        warn: () => {
          throw new Error('log quebrado');
        },
        error: () => undefined,
      },
      executar: () => {
        throw new Error('x');
      },
    });
    expect(() => n.alertar('CONTRATO_ROTA_MUDOU')).not.toThrow();
  });
});

describe('container: notificador conforme notificarWindows', () => {
  it('ligado: NotificadorWindows; desligado: NotificadorNulo; substituto de teste vence', () => {
    const logger = criarLoggerEspiao();
    const ligado: Config = { ...configTeste('http://127.0.0.1:1'), notificarWindows: true };
    const desligado: Config = { ...configTeste('http://127.0.0.1:1'), notificarWindows: false };
    expect(montarContainer(ligado, { logger }).notificador).toBeInstanceOf(NotificadorWindows);
    expect(montarContainer(desligado, { logger }).notificador).toBeInstanceOf(NotificadorNulo);
    const falso = { alertar: () => undefined };
    expect(montarContainer(ligado, { logger, notificador: falso }).notificador).toBe(falso);
  });
});
