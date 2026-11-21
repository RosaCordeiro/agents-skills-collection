import { AlertaContrato, INTERVALO_BALAO_MS } from '../../src/core/application/services/alerta-contrato';
import { ErroSoftdesk } from '../../src/core/domain/errors/erro-softdesk';
import { criarLoggerEspiao } from '../simulador/apoio';
import { NotificadorEspiao } from '../simulador/consulta-apoio';
import { RelogioTeste } from '../simulador/sessao-apoio';

function montar() {
  const logger = criarLoggerEspiao();
  const relogio = new RelogioTeste();
  const notificador = new NotificadorEspiao();
  const alerta = new AlertaContrato({ logger, relogio, notificador });
  return { logger, relogio, notificador, alerta };
}

describe('AlertaContrato (RF-07, F8)', () => {
  it('erro com destaque: log error com a keyword, ultimo_alerta guardado e um balão', () => {
    const { logger, relogio, notificador, alerta } = montar();
    alerta.registrarErro(
      new ErroSoftdesk('CONTRATO_ROTA_MUDOU', { campos: ['cd_chamado'], evidencia: { http_status: 200 } }),
    );
    const erros = logger.registros.filter((r) => r.nivel === 'error');
    expect(erros).toHaveLength(1);
    expect(erros[0].campos.keywords).toEqual(['softdesk_contrato_mudou']);
    expect(erros[0].campos.codigo_erro).toBe('CONTRATO_ROTA_MUDOU');
    expect(erros[0].campos.campos_deriva).toEqual(['cd_chamado']);
    expect(alerta.ultimo()).toEqual({ codigo: 'CONTRATO_ROTA_MUDOU', quando: relogio.agora() });
    expect(notificador.codigos).toEqual(['CONTRATO_ROTA_MUDOU']);
  });

  it.each(['REDE', 'NAO_ENCONTRADO', 'SESSAO_EXPIRADA', 'FILTRO_INVALIDO', 'CREDENCIAL'] as const)(
    'erro sem destaque (%s) não gera log, alerta nem balão',
    (codigo) => {
      const { logger, notificador, alerta } = montar();
      alerta.registrarErro(new ErroSoftdesk(codigo));
      expect(logger.registros).toHaveLength(0);
      expect(alerta.ultimo()).toBeNull();
      expect(notificador.codigos).toHaveLength(0);
    },
  );

  it('no máximo um balão por código a cada 10 min; o log e o ultimo_alerta continuam', () => {
    const { logger, relogio, notificador, alerta } = montar();
    const erro = () => new ErroSoftdesk('LAYOUT_LOGIN_MUDOU');
    alerta.registrarErro(erro());
    relogio.avancar(INTERVALO_BALAO_MS - 1000);
    alerta.registrarErro(erro());
    expect(notificador.codigos).toHaveLength(1);
    expect(logger.registros.filter((r) => r.nivel === 'error')).toHaveLength(2);
    expect(alerta.ultimo()?.quando).toEqual(relogio.agora());
    relogio.avancar(2000);
    alerta.registrarErro(erro());
    expect(notificador.codigos).toHaveLength(2);
  });

  it('o limite de 10 min é por código: outro código ganha o próprio balão', () => {
    const { notificador, alerta } = montar();
    alerta.registrarErro(new ErroSoftdesk('LAYOUT_LOGIN_MUDOU'));
    alerta.registrarErro(new ErroSoftdesk('CONTRATO_ROTA_MUDOU'));
    expect(notificador.codigos).toEqual(['LAYOUT_LOGIN_MUDOU', 'CONTRATO_ROTA_MUDOU']);
  });

  it('notificador que lança não derruba a operação', () => {
    const logger = criarLoggerEspiao();
    const alerta = new AlertaContrato({
      logger,
      relogio: new RelogioTeste(),
      notificador: {
        alertar: () => {
          throw new Error('falhou');
        },
      },
    });
    expect(() => alerta.registrarErro(new ErroSoftdesk('CONTRATO_ROTA_MUDOU'))).not.toThrow();
    expect(alerta.ultimo()?.codigo).toBe('CONTRATO_ROTA_MUDOU');
  });

  it('deriva: devolve aviso com nomes sem repetidos e registra warn só com nomes', () => {
    const { logger, alerta } = montar();
    expect(alerta.avisoDeriva(['nm_usuario', 'nm_usuario', 'tt_chamado'])).toEqual({
      campos: ['nm_usuario', 'tt_chamado'],
    });
    const avisos = logger.registros.filter((r) => r.nivel === 'warn');
    expect(avisos).toHaveLength(1);
    expect(avisos[0].campos.campos_deriva).toEqual(['nm_usuario', 'tt_chamado']);
    expect(avisos[0].campos.keywords).toEqual(['softdesk_deriva']);
  });

  it('deriva (RF-07, B-4): log softdesk_deriva só com nomes, ultimo_alerta DERIVA e um balão; no máximo 1 por 10 min', () => {
    const { logger, relogio, notificador, alerta } = montar();
    alerta.avisoDeriva(['nm_usuario']);
    expect(alerta.ultimo()).toEqual({ codigo: 'DERIVA', quando: relogio.agora() });
    expect(notificador.codigos).toEqual(['DERIVA']);
    relogio.avancar(INTERVALO_BALAO_MS - 1000);
    alerta.avisoDeriva(['nm_usuario']);
    expect(notificador.codigos).toHaveLength(1);
    expect(logger.registros.filter((r) => r.campos.keywords?.includes('softdesk_deriva'))).toHaveLength(2);
    relogio.avancar(2000);
    alerta.avisoDeriva(['tt_chamado']);
    expect(notificador.codigos).toEqual(['DERIVA', 'DERIVA']);
  });

  it('a deriva nunca encobre um alerta de erro de contrato já guardado, e notificador que lança não derruba a consulta', () => {
    const logger = criarLoggerEspiao();
    const alerta = new AlertaContrato({
      logger,
      relogio: new RelogioTeste(),
      notificador: {
        alertar: () => {
          throw new Error('x');
        },
      },
    });
    alerta.registrarErro(new ErroSoftdesk('LAYOUT_LOGIN_MUDOU'));
    expect(() => alerta.avisoDeriva(['nm_usuario'])).not.toThrow();
    expect(alerta.ultimo()?.codigo).toBe('LAYOUT_LOGIN_MUDOU');
  });

  it('derivaDiagnostico: mesmo efeito (log, ultimo_alerta, balão) e sem efeito quando vazio', () => {
    const { logger, notificador, alerta } = montar();
    alerta.derivaDiagnostico([]);
    alerta.derivaDiagnostico(undefined);
    expect(logger.registros).toHaveLength(0);
    alerta.derivaDiagnostico(['cd_area', 'cd_area']);
    expect(logger.registros[0].campos.campos_deriva).toEqual(['cd_area']);
    expect(alerta.ultimo()?.codigo).toBe('DERIVA');
    expect(notificador.codigos).toEqual(['DERIVA']);
  });

  it('sem deriva: nenhum aviso e nenhum log', () => {
    const { logger, alerta } = montar();
    expect(alerta.avisoDeriva(undefined)).toBeUndefined();
    expect(alerta.avisoDeriva([])).toBeUndefined();
    expect(logger.registros).toHaveLength(0);
  });
});
