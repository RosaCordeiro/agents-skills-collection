import type { ResumoSessao, SessaoHttp } from '../../src/core/domain/entities/sessao';
import { SessaoMemoriaStore } from '../../src/infraestructure/sessao/sessao-memoria.store';

const sessao = (): SessaoHttp => ({ cookies: new Map([['softdesk_session', 'abc']]), criadaEm: new Date() });
const resumo: ResumoSessao = { usuario: 'fulano', perfil: 'A', desde: new Date('2026-11-19T10:00:00Z') };

describe('SessaoMemoriaStore (máquina de §6 F1)', () => {
  it('começa em SEM_SESSAO, sem sessão nem resumo', () => {
    const s = new SessaoMemoriaStore();
    expect(s.estado()).toBe('SEM_SESSAO');
    expect(s.obter()).toBeNull();
    expect(s.resumo()).toBeNull();
  });

  it('SEM_SESSAO → AGUARDANDO_LOGIN → AUTENTICANDO → AUTENTICADA', () => {
    const s = new SessaoMemoriaStore();
    s.marcarAguardando();
    expect(s.estado()).toBe('AGUARDANDO_LOGIN');
    s.marcarAguardando(); // reaproveita a janela: continua igual
    expect(s.estado()).toBe('AGUARDANDO_LOGIN');
    s.marcarAutenticando();
    expect(s.estado()).toBe('AUTENTICANDO');
    const http = sessao();
    s.guardar(http, resumo);
    expect(s.estado()).toBe('AUTENTICADA');
    expect(s.obter()).toBe(http);
    expect(s.resumo()).toEqual(resumo);
  });

  it('o resumo devolvido é cópia: alterar não muda o guardado', () => {
    const s = new SessaoMemoriaStore();
    s.guardar(sessao(), resumo);
    const r = s.resumo() as ResumoSessao;
    r.usuario = 'outro';
    expect(s.resumo()?.usuario).toBe('fulano');
  });

  it('AUTENTICANDO → SEM_SESSAO quando o login falha (login_falhou)', () => {
    const s = new SessaoMemoriaStore();
    s.marcarAguardando();
    s.marcarAutenticando();
    s.descartar('login_falhou');
    expect(s.estado()).toBe('SEM_SESSAO');
    expect(s.obter()).toBeNull();
  });

  it('AUTENTICADA → EXPIRADA (expirada) apaga os cookies; EXPIRADA → AGUARDANDO_LOGIN ao abrir a janela', () => {
    const s = new SessaoMemoriaStore();
    const http = sessao();
    s.guardar(http, resumo);
    s.descartar('expirada');
    expect(s.estado()).toBe('EXPIRADA');
    expect(s.obter()).toBeNull();
    expect(s.resumo()).toBeNull();
    expect(http.cookies.size).toBe(0);
    s.marcarAguardando();
    expect(s.estado()).toBe('AGUARDANDO_LOGIN');
  });

  it('parada leva a SEM_SESSAO e apaga os cookies', () => {
    const s = new SessaoMemoriaStore();
    const http = sessao();
    s.guardar(http, resumo);
    s.descartar('parada');
    expect(s.estado()).toBe('SEM_SESSAO');
    expect(http.cookies.size).toBe(0);
  });

  it('janelaEncerrada volta AGUARDANDO_LOGIN e AUTENTICANDO a SEM_SESSAO, mas não mexe em AUTENTICADA nem em EXPIRADA', () => {
    const s = new SessaoMemoriaStore();
    s.marcarAguardando();
    s.janelaEncerrada();
    expect(s.estado()).toBe('SEM_SESSAO');
    s.marcarAguardando();
    s.marcarAutenticando();
    s.janelaEncerrada();
    expect(s.estado()).toBe('SEM_SESSAO');
    s.guardar(sessao(), resumo);
    s.janelaEncerrada();
    expect(s.estado()).toBe('AUTENTICADA');
    s.descartar('expirada');
    s.janelaEncerrada();
    expect(s.estado()).toBe('EXPIRADA');
  });

  it('marcarAguardando não derruba uma sessão autenticada; marcarAutenticando só vale com a janela aberta', () => {
    const s = new SessaoMemoriaStore();
    s.marcarAutenticando();
    expect(s.estado()).toBe('SEM_SESSAO');
    s.guardar(sessao(), resumo);
    s.marcarAguardando();
    expect(s.estado()).toBe('AUTENTICADA');
    s.marcarAutenticando();
    expect(s.estado()).toBe('AUTENTICADA');
  });

  it('marcarAguardando durante AUTENTICANDO não volta o estado para AGUARDANDO_LOGIN', () => {
    const s = new SessaoMemoriaStore();
    s.marcarAguardando();
    s.marcarAutenticando();
    expect(s.estado()).toBe('AUTENTICANDO');
    s.marcarAguardando();
    expect(s.estado()).toBe('AUTENTICANDO');
  });
});
