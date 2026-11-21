import { ErroSoftdesk } from '../../src/core/domain/errors/erro-softdesk';
import {
  montarEnvelopeErro,
  montarEnvelopeSucesso,
  statusHttpDoErro,
} from '../../src/shared/envelope/envelope';

const CID = '0f8b3d9e-1c2a-4b5d-8e6f-7a8b9c0d1e2f';

describe('envelope de resposta (§7.3)', () => {
  it('sucesso: success, dados e correlation_id; sem aviso_deriva quando não há', () => {
    expect(montarEnvelopeSucesso({ a: 1 }, CID)).toEqual({ success: true, dados: { a: 1 }, correlation_id: CID });
    expect(montarEnvelopeSucesso({ a: 1 }, CID, { campos: [] })).not.toHaveProperty('aviso_deriva');
  });

  it('sucesso com deriva: aviso_deriva só com os nomes', () => {
    const e = montarEnvelopeSucesso({}, CID, { campos: ['nm_usuario'] });
    expect(e.aviso_deriva).toEqual({ campos: ['nm_usuario'] });
  });

  it('erro de destaque: error.destaque, alerta com título e o que fazer; sem janela', () => {
    const e = montarEnvelopeErro(new ErroSoftdesk('CONTRATO_ROTA_MUDOU', { campos: ['cd_chamado'] }), CID);
    expect(e.success).toBe(false);
    expect(e.error.code).toBe('CONTRATO_ROTA_MUDOU');
    expect(e.error.destaque).toBe(true);
    expect(e.error.campos).toEqual(['cd_chamado']);
    expect(e.alerta?.titulo).toContain('ATENÇÃO');
    expect(e.alerta?.o_que_fazer).toBe(e.error.acao);
    expect(e).not.toHaveProperty('janela');
    expect(e.correlation_id).toBe(CID);
  });

  it('LAYOUT_LOGIN_MUDOU também leva alerta, com título próprio', () => {
    const e = montarEnvelopeErro(new ErroSoftdesk('LAYOUT_LOGIN_MUDOU'), CID);
    expect(e.alerta?.titulo).toContain('login');
  });

  it('erro de sessão: bloco janela e nenhum alerta', () => {
    const e = montarEnvelopeErro(new ErroSoftdesk('AGUARDANDO_LOGIN', { janela: { aberta: true } }), CID);
    expect(e.janela).toEqual({ aberta: true });
    expect(e).not.toHaveProperty('alerta');
    expect(e.error.destaque).toBe(false);
  });

  it('erro comum não tem alerta nem janela', () => {
    const e = montarEnvelopeErro(new ErroSoftdesk('NAO_ENCONTRADO'), CID);
    expect(Object.keys(e).sort()).toEqual(['correlation_id', 'error', 'success']);
  });

  it('exceção inesperada vira ERRO_INTERNO sem o texto da exceção', () => {
    const e = montarEnvelopeErro(new Error('SENHA-VAZADA-123'), CID);
    expect(e.error.code).toBe('ERRO_INTERNO');
    expect(JSON.stringify(e)).not.toContain('SENHA-VAZADA-123');
    expect(statusHttpDoErro(new Error('x'))).toBe(500);
  });

  it('status HTTP sugerido por código', () => {
    expect(statusHttpDoErro(new ErroSoftdesk('NAO_ENCONTRADO'))).toBe(404);
    expect(statusHttpDoErro(new ErroSoftdesk('FILTRO_INVALIDO'))).toBe(400);
    expect(statusHttpDoErro(new ErroSoftdesk('AGUARDANDO_LOGIN'))).toBe(409);
    expect(statusHttpDoErro(new ErroSoftdesk('REDE'))).toBe(502);
  });
});
