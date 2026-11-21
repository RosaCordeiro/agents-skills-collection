import { autenticar, tokenConfere } from '../../src/presentation/rest/autenticacao';
import { Roteador } from '../../src/presentation/rest/roteador';
import { ROTAS } from '../../src/presentation/rest/servidor';

const esperado = { porta: 47821, token: 'f'.repeat(64) };
const req = (headers: Record<string, string>) => ({ headers });

describe('autenticação do REST', () => {
  const bom = { host: '127.0.0.1:47821', authorization: `Bearer ${esperado.token}` };

  it('aceita Host exato, sem Origin, com Bearer certo (esquema sem diferenciar maiúsculas)', () => {
    expect(autenticar(req(bom), esperado)).toEqual({ ok: true });
    expect(autenticar(req({ ...bom, authorization: `bearer ${esperado.token}` }), esperado)).toEqual({ ok: true });
  });

  it('Host diferente → 403 host (antes de olhar o token)', () => {
    expect(autenticar(req({ ...bom, host: 'localhost:47821' }), esperado)).toEqual({ ok: false, status: 403, motivo: 'host' });
    expect(autenticar(req({ authorization: bom.authorization }), esperado)).toEqual({ ok: false, status: 403, motivo: 'host' });
  });

  it('Origin presente → 403 origin', () => {
    expect(autenticar(req({ ...bom, origin: 'http://x' }), esperado)).toEqual({ ok: false, status: 403, motivo: 'origin' });
  });

  it('sem Authorization, esquema errado ou token errado → 401', () => {
    expect(autenticar(req({ host: bom.host }), esperado)).toEqual({ ok: false, status: 401, motivo: 'sem_token' });
    expect(autenticar(req({ host: bom.host, authorization: `Basic ${esperado.token}` }), esperado)).toEqual({
      ok: false,
      status: 401,
      motivo: 'sem_token',
    });
    expect(autenticar(req({ host: bom.host, authorization: 'Bearer outro' }), esperado)).toEqual({
      ok: false,
      status: 401,
      motivo: 'token_errado',
    });
  });

  it('tokenConfere compara por igualdade exata, sem erro para tamanhos diferentes', () => {
    expect(tokenConfere('abc', 'abc')).toBe(true);
    expect(tokenConfere('abc', 'abd')).toBe(false);
    expect(tokenConfere('abc', 'abcd')).toBe(false);
    expect(tokenConfere('', 'abc')).toBe(false);
  });
});

describe('roteador e catálogo de rotas (§7.1)', () => {
  const r = new Roteador([...ROTAS]);

  it('as dez rotas de §7.1 existem com o método certo', () => {
    const pares = ROTAS.map((x) => `${x.metodo} ${x.caminho}`).sort();
    expect(pares).toEqual(
      [
        'POST /v1/sessao/entrar',
        'GET /v1/sessao',
        'GET /v1/sessao/janela',
        'GET /v1/fila',
        'POST /v1/chamados/pesquisa',
        'GET /v1/chamados/{codigo}',
        'GET /v1/chamados/{codigo}/atividades',
        'GET /v1/saude',
        'GET /v1/servico',
        'POST /v1/servico/parar',
      ].sort(),
    );
  });

  it('captura o código e distingue /pesquisa de /{codigo}', () => {
    const a = r.resolver('GET', '/v1/chamados/123');
    expect(a.tipo === 'rota' && a.params).toEqual({ codigo: '123' });
    const b = r.resolver('POST', '/v1/chamados/pesquisa');
    expect(b.tipo).toBe('rota');
    const c = r.resolver('GET', '/v1/chamados/pesquisa'); // GET /{codigo} com "pesquisa": a validação recusa depois
    expect(c.tipo === 'rota' && c.params).toEqual({ codigo: 'pesquisa' });
    const d = r.resolver('GET', '/v1/chamados/7/atividades');
    expect(d.tipo === 'rota' && d.params).toEqual({ codigo: '7' });
  });

  it('método errado e caminho desconhecido', () => {
    expect(r.resolver('POST', '/v1/fila').tipo).toBe('metodo_nao_permitido');
    expect(r.resolver('GET', '/v1/servico/parar').tipo).toBe('metodo_nao_permitido');
    expect(r.resolver('GET', '/v1/outra').tipo).toBe('nao_encontrada');
    expect(r.resolver('GET', '/v1/chamados/1/2/3').tipo).toBe('nao_encontrada');
    expect(r.resolver('GET', '/v1/fila/').tipo).toBe('nao_encontrada');
  });
});
