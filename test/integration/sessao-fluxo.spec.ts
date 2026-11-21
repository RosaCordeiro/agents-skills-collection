import { ErroSoftdesk } from '../../src/core/domain/errors/erro-softdesk';
import type { Container } from '../../src/shared/container';
import { capturarErro, descreverErro, sentinela } from '../simulador/apoio';
import { gerarMassa } from '../simulador/dados';
import {
  janelaFechada,
  montarAmbiente,
  postarLogin,
  requisitar,
  type Ambiente,
} from '../simulador/sessao-apoio';
import { SoftdeskSimulado } from '../simulador/softdesk-simulado';

/** Caso de uso provisório de teste: a consulta real vem no fragmento 4. */
const consultar = (c: Container) =>
  c.exigirSessao((sessao) => c.gateway.pesquisar(sessao, { atendente: [c.config.cdAtendente] }));

const esperarAte = async (cond: () => boolean): Promise<void> => {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
};

describe('sessão, entrar e exigirSessao (fragmento 3)', () => {
  let sim: SoftdeskSimulado;
  let amb: Ambiente;
  const usuario = sentinela('USU');
  const senha = sentinela('SENHA');

  beforeEach(async () => {
    sim = await SoftdeskSimulado.iniciar({
      chamados: gerarMassa([{ cdAtendente: 393, status: 1, quantidade: 4 }]),
      credenciais: { usuario, senha },
    });
    amb = montarAmbiente(sim);
  });
  afterEach(async () => {
    amb.c.janelaLogin.fechar();
    await sim.fechar();
  });

  /** Faz o login completo pela janela e devolve o endereço usado. */
  async function logar(): Promise<string> {
    const espera = amb.c.entrar.executar();
    await esperarAte(() => amb.abridor.urls.length > 0);
    const url = amb.abridor.urls[amb.abridor.urls.length - 1];
    const r = await postarLogin(url, { u: usuario, s: senha });
    expect(r.status).toBe(200);
    await espera;
    return url;
  }

  const erroDe = async (fn: () => Promise<unknown>): Promise<ErroSoftdesk> => {
    const e = await capturarErro(fn);
    expect(e).toBeInstanceOf(ErroSoftdesk);
    return e as ErroSoftdesk;
  };

  describe('VAL-14: janela única e espera do login', () => {
    it('duas consultas sem sessão (em sequência) → AGUARDANDO_LOGIN, abridor chamado uma vez, SoftDesk nem foi consultado', async () => {
      const e1 = await erroDe(() => consultar(amb.c));
      const e2 = await erroDe(() => consultar(amb.c));
      expect(e1.codigo).toBe('AGUARDANDO_LOGIN');
      expect(e2.codigo).toBe('AGUARDANDO_LOGIN');
      expect(e1.janela).toEqual({ aberta: true });
      expect(amb.abridor.urls).toHaveLength(1);
      expect(sim.registro).toHaveLength(0);
      expect(amb.c.sessaoStore.estado()).toBe('AGUARDANDO_LOGIN');
    });

    it('duas consultas simultâneas → ainda uma só janela', async () => {
      const [a, b] = await Promise.allSettled([consultar(amb.c), consultar(amb.c)]);
      expect(a.status).toBe('rejected');
      expect(b.status).toBe('rejected');
      expect(amb.abridor.urls).toHaveLength(1);
    });

    it('"entrar" com espera reduzida → AGUARDANDO_LOGIN e a janela ainda responde', async () => {
      amb = montarAmbiente(sim, { esperaLoginMs: 60 });
      const t0 = Date.now();
      const e = await erroDe(() => amb.c.entrar.executar());
      expect(Date.now() - t0).toBeLessThan(3000);
      expect(e.codigo).toBe('AGUARDANDO_LOGIN');
      expect(e.janela).toEqual({ aberta: true });
      expect(amb.c.janelaLogin.info()?.aberta).toBe(true);
      const r = await requisitar(amb.abridor.urls[0]);
      expect(r.status).toBe(200);
      expect(amb.abridor.urls).toHaveLength(1);
      // Uma consulta depois do "entrar" estourado continua na mesma janela.
      await erroDe(() => consultar(amb.c));
      expect(amb.abridor.urls).toHaveLength(1);
    });

    it('consulta e "entrar" juntos compartilham a janela', async () => {
      amb = montarAmbiente(sim, { esperaLoginMs: 60 });
      await erroDe(() => consultar(amb.c));
      await erroDe(() => amb.c.entrar.executar());
      expect(amb.abridor.urls).toHaveLength(1);
    });
  });

  describe('entrar (RF-01)', () => {
    it('abre a janela, espera o login e devolve o estado autenticado sem credenciais', async () => {
      const estado = await (async () => {
        const espera = amb.c.entrar.executar();
        await esperarAte(() => amb.abridor.urls.length > 0);
        await postarLogin(amb.abridor.urls[0], { u: usuario, s: senha, p: 'T' });
        return espera;
      })();
      expect(estado).toMatchObject({ estado: 'AUTENTICADA', autenticada: true, usuario, perfil: 'T' });
      expect(estado.janela).toEqual({ aberta: false, expira_em: null, navegador_aberto: null });
      expect(JSON.stringify(estado)).not.toContain(senha);
    });

    it('já autenticada: devolve o estado sem abrir janela e sem chamar o SoftDesk', async () => {
      await logar();
      const urls = amb.abridor.urls.length;
      const reqs = sim.registro.length;
      const estado = await amb.c.entrar.executar();
      expect(estado.autenticada).toBe(true);
      expect(amb.abridor.urls).toHaveLength(urls);
      expect(sim.registro).toHaveLength(reqs);
    });

    it.each([
      ['status_falso', 'CREDENCIAL'],
      ['500', 'REDE'],
      ['html', 'LAYOUT_LOGIN_MUDOU'],
    ] as const)('login recusado (%s) → o "entrar" lança %s', async (cenario, codigo) => {
      sim.login = cenario;
      const espera = erroDe(() => amb.c.entrar.executar());
      await esperarAte(() => amb.abridor.urls.length > 0);
      await postarLogin(amb.abridor.urls[0], { u: usuario, s: senha });
      const e = await espera;
      expect(e.codigo).toBe(codigo);
      expect(amb.c.estadoSessao.executar().estado).toBe('SEM_SESSAO');
      expect(descreverErro(e)).not.toContain(senha);
      expect(descreverErro(e)).not.toContain(usuario);
    });
  });

  describe('estado da sessão (RF-02)', () => {
    it('SEM_SESSAO no começo; AGUARDANDO_LOGIN com a janela; AUTENTICADA depois do login', async () => {
      const inicial = amb.c.estadoSessao.executar();
      expect(inicial).toEqual({
        estado: 'SEM_SESSAO',
        autenticada: false,
        usuario: null,
        perfil: null,
        desde: null,
        janela: { aberta: false, expira_em: null, navegador_aberto: null },
        ultimo_alerta: null,
      });
      await erroDe(() => consultar(amb.c));
      const aguardando = amb.c.estadoSessao.executar();
      expect(aguardando.estado).toBe('AGUARDANDO_LOGIN');
      expect(aguardando.janela.aberta).toBe(true);
      expect(aguardando.janela.navegador_aberto).toBe(true);
      expect(typeof aguardando.janela.expira_em).toBe('string');
      await logar();
      const dep = amb.c.estadoSessao.executar();
      expect(dep.estado).toBe('AUTENTICADA');
      expect(dep.usuario).toBe(usuario);
      expect(dep.perfil).toBe('A');
      expect(typeof dep.desde).toBe('string');
    });

    it('o estado nunca expõe porta, token ou endereço da janela', async () => {
      await erroDe(() => consultar(amb.c));
      const texto = JSON.stringify(amb.c.estadoSessao.executar());
      const url = amb.abridor.urls[0];
      expect(texto).not.toContain(new URL(url).searchParams.get('t') as string);
      expect(texto).not.toContain('127.0.0.1');
    });

    it('traz o último alerta de contrato quando existe', () => {
      const quando = new Date('2026-11-19T10:00:00Z');
      const a = montarAmbiente(sim, { ultimoAlerta: () => ({ codigo: 'CONTRATO_ROTA_MUDOU', quando }) });
      expect(a.c.estadoSessao.executar().ultimo_alerta).toEqual({
        codigo: 'CONTRATO_ROTA_MUDOU',
        quando: quando.toISOString(),
      });
    });
  });

  describe('sessão ativa', () => {
    it('com sessão, a consulta provisória passa por exigirSessao e devolve a lista', async () => {
      await logar();
      const r = await consultar(amb.c);
      expect(r.lista).toHaveLength(4);
      expect(sim.requisicoes('/chamado/json')).toHaveLength(1);
    });

    it('erro que não é de sessão (REDE) passa direto e não derruba a sessão', async () => {
      await logar();
      sim.pesquisa = '500';
      const e = await erroDe(() => consultar(amb.c));
      expect(e.codigo).toBe('REDE');
      expect(amb.c.sessaoStore.estado()).toBe('AUTENTICADA');
      expect(amb.c.janelaLogin.info()).toBeNull();
      sim.pesquisa = 'ok';
      expect((await consultar(amb.c)).lista).toHaveLength(4);
    });

    it('CONTRATO_ROTA_MUDOU passa direto, sem confundir com sessão expirada', async () => {
      await logar();
      sim.pesquisa = 'sem_lista';
      const e = await erroDe(() => consultar(amb.c));
      expect(e.codigo).toBe('CONTRATO_ROTA_MUDOU');
      expect(amb.c.sessaoStore.estado()).toBe('AUTENTICADA');
    });
  });

  describe('VAL-16: senha não retida', () => {
    it('após expirarSessao(): nenhum POST /login novo; a janela fica aberta', async () => {
      await logar();
      expect(sim.requisicoes('/login', 'POST')).toHaveLength(1);
      sim.expirarSessao();
      const e = await erroDe(() => consultar(amb.c));
      expect(e.codigo).toBe('SESSAO_EXPIRADA');
      expect(sim.requisicoes('/login', 'POST')).toHaveLength(1); // só o do login original
      expect(sim.requisicoes('/login', 'GET')).toHaveLength(1);
      expect(amb.c.janelaLogin.info()?.aberta).toBe(true);
      expect(amb.c.sessaoStore.estado()).toBe('AGUARDANDO_LOGIN');
      expect(amb.c.sessaoStore.obter()).toBeNull();
      const url = amb.abridor.urls[amb.abridor.urls.length - 1];
      expect((await requisitar(url)).status).toBe(200);
    });

    it('as consultas seguintes não fazem login sozinhas, mesmo depois de muitas tentativas', async () => {
      await logar();
      sim.expirarSessao();
      await erroDe(() => consultar(amb.c));
      for (let i = 0; i < 3; i++) {
        const e = await erroDe(() => consultar(amb.c));
        expect(e.codigo).toBe('AGUARDANDO_LOGIN');
      }
      expect(sim.requisicoes('/login', 'POST')).toHaveLength(1);
    });

    it('o login pela nova janela volta a autenticar, e a consulta repetida funciona', async () => {
      await logar();
      sim.expirarSessao();
      await erroDe(() => consultar(amb.c));
      const url = amb.abridor.urls[amb.abridor.urls.length - 1];
      await postarLogin(url, { u: usuario, s: senha });
      expect(amb.c.sessaoStore.estado()).toBe('AUTENTICADA');
      expect((await consultar(amb.c)).lista).toHaveLength(4);
      expect(sim.requisicoes('/login', 'POST')).toHaveLength(2);
    });
  });

  describe('VAL-08: sessão expirada no meio do uso', () => {
    it('redirect_login → SESSAO_EXPIRADA, janela aberta, uma só requisição de pesquisa depois da expiração', async () => {
      await logar();
      expect((await consultar(amb.c)).lista).toHaveLength(4);
      const antes = sim.requisicoes('/chamado/json').length;
      sim.expirarSessao('redirect_login');
      sim.pesquisa = 'redirect_login';
      const urlsAntes = amb.abridor.urls.length;
      const e = await erroDe(() => consultar(amb.c));
      expect(e.codigo).toBe('SESSAO_EXPIRADA');
      expect(e.janela).toEqual({ aberta: true });
      expect(e.destaque).toBe(false);
      expect(sim.requisicoes('/chamado/json').length - antes).toBe(1); // sem repetição automática
      expect(amb.c.janelaLogin.info()?.aberta).toBe(true);
      expect(amb.abridor.urls).toHaveLength(urlsAntes + 1);
      expect(amb.c.sessaoStore.obter()).toBeNull();
    });

    it.each(['401', '403'] as const)('expiração por %s também vira SESSAO_EXPIRADA com a janela aberta', async (forma) => {
      await logar();
      sim.expirarSessao(forma);
      const e = await erroDe(() => consultar(amb.c));
      expect(e.codigo).toBe('SESSAO_EXPIRADA');
      expect(e.janela).toEqual({ aberta: true });
      expect(amb.c.janelaLogin.info()?.aberta).toBe(true);
    });

    it('duas consultas simultâneas sobre sessão expirada abrem uma só janela', async () => {
      await logar();
      const urlsAntes = amb.abridor.urls.length;
      sim.expirarSessao();
      const r = await Promise.allSettled([consultar(amb.c), consultar(amb.c)]);
      expect(r.map((x) => x.status)).toEqual(['rejected', 'rejected']);
      expect(amb.abridor.urls).toHaveLength(urlsAntes + 1);
    });
  });

  describe('parada', () => {
    it('descartar("parada") apaga a sessão e fechar() encerra a janela', async () => {
      const url = await logar();
      expect(await janelaFechada(url)).toBe(true);
      amb.c.sessaoStore.descartar('parada');
      expect(amb.c.sessaoStore.estado()).toBe('SEM_SESSAO');
      expect(amb.c.sessaoStore.resumo()).toBeNull();
      const e = await erroDe(() => consultar(amb.c));
      expect(e.codigo).toBe('AGUARDANDO_LOGIN');
    });
  });

  it('nenhuma senha, usuário, cookie ou token de janela em log ao longo do fluxo completo', async () => {
    await logar();
    sim.expirarSessao();
    await erroDe(() => consultar(amb.c));
    const log = amb.logger.texto();
    expect(log).not.toContain(senha);
    expect(log).not.toContain(usuario);
    for (const cookie of sim.cookiesEmitidos()) expect(log).not.toContain(cookie);
    for (const u of amb.abridor.urls) expect(log).not.toContain(new URL(u).searchParams.get('t') as string);
  });
});
