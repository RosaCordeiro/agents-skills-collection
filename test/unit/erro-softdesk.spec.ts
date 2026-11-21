import {
  CODIGOS_ERRO,
  DEFINICOES_ERRO,
  ehErroSoftdesk,
  ErroSoftdesk,
  type CodigoErro,
} from '../../src/core/domain/errors/erro-softdesk';

describe('ErroSoftdesk (taxonomia §7.3)', () => {
  it('tem exatamente os 12 códigos da tabela', () => {
    expect([...CODIGOS_ERRO].sort()).toEqual(
      [
        'AGUARDANDO_LOGIN',
        'SESSAO_EXPIRADA',
        'CREDENCIAL',
        'REDE',
        'LAYOUT_LOGIN_MUDOU',
        'CONTRATO_ROTA_MUDOU',
        'NAO_ENCONTRADO',
        'FILTRO_INVALIDO',
        'NAO_AUTORIZADO',
        'SERVICO_INDISPONIVEL',
        'ERRO_INTERNO',
        'NAO_DISPONIVEL',
      ].sort(),
    );
  });

  it('status HTTP sugerido de cada código bate com a tabela', () => {
    const esperado: Record<CodigoErro, number | null> = {
      AGUARDANDO_LOGIN: 409,
      SESSAO_EXPIRADA: 409,
      CREDENCIAL: 422,
      REDE: 502,
      LAYOUT_LOGIN_MUDOU: 502,
      CONTRATO_ROTA_MUDOU: 502,
      NAO_ENCONTRADO: 404,
      FILTRO_INVALIDO: 400,
      NAO_AUTORIZADO: 401,
      SERVICO_INDISPONIVEL: null,
      ERRO_INTERNO: 500,
      NAO_DISPONIVEL: 501,
    };
    for (const codigo of CODIGOS_ERRO) {
      expect(new ErroSoftdesk(codigo).statusHttp).toBe(esperado[codigo]);
    }
  });

  it('destaque só em LAYOUT_LOGIN_MUDOU e CONTRATO_ROTA_MUDOU', () => {
    const destacados = CODIGOS_ERRO.filter((c) => new ErroSoftdesk(c).destaque);
    expect(destacados.sort()).toEqual(['CONTRATO_ROTA_MUDOU', 'LAYOUT_LOGIN_MUDOU']);
  });

  it('todo código tem mensagem e ação não vazias; as de destaque dizem que não é senha nem sessão', () => {
    for (const codigo of CODIGOS_ERRO) {
      const e = new ErroSoftdesk(codigo);
      expect(e.mensagem.trim().length).toBeGreaterThan(10);
      expect(e.acao.trim().length).toBeGreaterThan(10);
      expect(DEFINICOES_ERRO[codigo].mensagem).toBe(e.mensagem);
    }
    expect(new ErroSoftdesk('LAYOUT_LOGIN_MUDOU').acao).toMatch(/não é problema de senha/i);
    expect(new ErroSoftdesk('CONTRATO_ROTA_MUDOU').acao).toMatch(/não é problema de sessão/i);
  });

  it('CREDENCIAL tem texto fixo (não repassa mensagem do SoftDesk)', () => {
    const e = new ErroSoftdesk('CREDENCIAL');
    expect(e.mensagem).toBe('O SoftDesk recusou o login.');
  });

  it('é Error e instanceof funciona; ehErroSoftdesk distingue de Error comum', () => {
    const e = new ErroSoftdesk('REDE');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(ErroSoftdesk);
    expect(ehErroSoftdesk(e)).toBe(true);
    expect(ehErroSoftdesk(new Error('REDE'))).toBe(false);
    expect(ehErroSoftdesk({ codigo: 'REDE' })).toBe(false);
  });

  it('o `message` do Error é só o código, mesmo com mensagem personalizada (nada de texto livre em stack/log)', () => {
    const e = new ErroSoftdesk('REDE', { mensagem: 'leitura excedeu o tempo' });
    expect(e.message).toBe('REDE');
    expect(e.mensagem).toBe('leitura excedeu o tempo');
    expect(e.stack ?? '').not.toContain('leitura excedeu o tempo');
  });

  it('carrega evidência e nomes de campos sem alterar o destaque do código', () => {
    const e = new ErroSoftdesk('CONTRATO_ROTA_MUDOU', {
      evidencia: { http_status: 302, location_path: '/outra' },
      campos: ['cd_atendente'],
    });
    expect(e.evidencia).toEqual({ http_status: 302, location_path: '/outra' });
    expect(e.campos).toEqual(['cd_atendente']);
    expect(e.destaque).toBe(true);
  });

  it('a ação pode ser substituída', () => {
    expect(new ErroSoftdesk('NAO_DISPONIVEL', { acao: 'outra' }).acao).toBe('outra');
  });
});
