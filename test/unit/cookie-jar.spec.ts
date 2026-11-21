import { inspect } from 'node:util';
import { CookieJar, analisarSetCookie } from '../../src/infraestructure/softdesk/cookie-jar';

function cabecalhos(...linhas: string[]): Headers {
  const h = new Headers();
  for (const l of linhas) h.append('set-cookie', l);
  return h;
}

describe('analisarSetCookie', () => {
  it('lê nome e valor e ignora os atributos', () => {
    expect(analisarSetCookie('sessao=abc123; Path=/; HttpOnly; Secure; SameSite=Lax')).toEqual({
      nome: 'sessao',
      valor: 'abc123',
      apagar: false,
    });
  });

  it('mantém `=` e `%` dentro do valor (token XSRF codificado)', () => {
    expect(analisarSetCookie('XSRF-TOKEN=eyJ%3D%3D=; Path=/')?.valor).toBe('eyJ%3D%3D=');
  });

  it('Max-Age <= 0 e Expires no passado apagam; no futuro, não', () => {
    expect(analisarSetCookie('a=1; Max-Age=0')?.apagar).toBe(true);
    expect(analisarSetCookie('a=1; max-age=-5')?.apagar).toBe(true);
    expect(analisarSetCookie('a=1; Max-Age=3600')?.apagar).toBe(false);
    expect(analisarSetCookie('a=; Expires=Thu, 01 Jan 1970 00:00:00 GMT')?.apagar).toBe(true);
    expect(analisarSetCookie('a=1; Expires=Fri, 31 Dec 2100 23:59:59 GMT')?.apagar).toBe(false);
    expect(analisarSetCookie('a=1; Expires=lixo')?.apagar).toBe(false);
  });

  it('linha sem nome=valor aproveitável é ignorada', () => {
    expect(analisarSetCookie('')).toBeNull();
    expect(analisarSetCookie('semigual')).toBeNull();
    expect(analisarSetCookie('=valor')).toBeNull();
    expect(analisarSetCookie('  =x')).toBeNull();
  });
});

describe('CookieJar (guarda o Set-Cookie de toda resposta, §7.4)', () => {
  it('guarda todos os cookies de uma resposta e monta o cabeçalho Cookie', () => {
    const jar = new CookieJar();
    jar.guardarDe(cabecalhos('sessao=aaa; Path=/; HttpOnly', 'XSRF-TOKEN=bbb%3D; Path=/'));
    expect(jar.tamanho).toBe(2);
    expect(jar.obter('sessao')).toBe('aaa');
    expect(jar.obter('XSRF-TOKEN')).toBe('bbb%3D');
    expect(jar.cabecalho()).toBe('sessao=aaa; XSRF-TOKEN=bbb%3D');
  });

  it('uma resposta posterior renova o valor (o SoftDesk pode renovar o token)', () => {
    const jar = new CookieJar();
    jar.guardarDe(cabecalhos('XSRF-TOKEN=velho', 'sessao=s1'));
    jar.guardarDe(cabecalhos('XSRF-TOKEN=novo'));
    expect(jar.obter('XSRF-TOKEN')).toBe('novo');
    expect(jar.obter('sessao')).toBe('s1');
  });

  it('cookie expirado pelo servidor sai do jar', () => {
    const jar = new CookieJar();
    jar.guardarDe(cabecalhos('a=1', 'b=2'));
    jar.guardarDe(cabecalhos('a=; Max-Age=0'));
    expect(jar.tem('a')).toBe(false);
    expect(jar.cabecalho()).toBe('b=2');
  });

  it('resposta sem Set-Cookie não muda nada; jar vazio gera cabeçalho vazio', () => {
    const jar = new CookieJar();
    expect(jar.cabecalho()).toBe('');
    jar.guardarDe(new Headers({ 'content-type': 'text/html' }));
    jar.guardarDe({});
    expect(jar.tamanho).toBe(0);
  });

  it('com um mapa existente escreve nele (a sessão acompanha as renovações)', () => {
    const mapa = new Map([['sessao', 'antiga']]);
    const jar = new CookieJar(mapa);
    expect(jar.mapa).toBe(mapa);
    jar.guardarDe(cabecalhos('sessao=nova', 'extra=1'));
    expect(mapa.get('sessao')).toBe('nova');
    expect(mapa.get('extra')).toBe('1');
    jar.definir('x', 'y');
    jar.apagar('extra');
    expect([...mapa.keys()]).toEqual(['sessao', 'x']);
  });

  it('inspect e JSON mostram só um marcador, nunca os valores', () => {
    const jar = new CookieJar();
    jar.guardarDe(cabecalhos('sessao=VALOR-SECRETO-1'));
    expect(inspect(jar, { depth: 5 })).toBe('[CookieJar]');
    expect(JSON.stringify({ jar })).toBe('{"jar":"[CookieJar]"}');
    expect(`${inspect({ aninhado: jar }, { depth: 5 })}`).not.toContain('VALOR-SECRETO');
  });
});
