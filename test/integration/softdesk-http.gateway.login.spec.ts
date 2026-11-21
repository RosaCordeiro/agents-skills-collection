import { ErroSoftdesk } from '../../src/core/domain/errors/erro-softdesk';
import { TIMEOUT_PADRAO_MS } from '../../src/infraestructure/softdesk/softdesk-http.gateway';
import { capturarErro, entrar, montarGateway, sentinela } from '../simulador/apoio';
import { SoftdeskSimulado } from '../simulador/softdesk-simulado';

/**
 * Gateway de login contra o SoftDesk simulado: VAL-06, VAL-09 (login), VAL-13 (login), VAL-16 (apoio).
 */
describe('SoftdeskHttpGateway · login', () => {
  let sim: SoftdeskSimulado;

  beforeEach(async () => {
    sim = await SoftdeskSimulado.iniciar();
  });
  afterEach(async () => {
    await sim.fechar();
  });

  async function erroDe(fn: () => Promise<unknown>): Promise<ErroSoftdesk> {
    const e = await capturarErro(fn);
    expect(e).toBeInstanceOf(ErroSoftdesk);
    return e as ErroSoftdesk;
  }

  describe('login aceito', () => {
    it('devolve a sessão com os cookies e usa só GET /login e POST /login', async () => {
      const m = montarGateway(sim, { relogio: { agora: () => new Date('2026-11-19T12:00:00Z') } });
      const sessao = await m.gateway.autenticar('atendente.teste', sentinela('SENHA'), 'A');
      expect(sessao.criadaEm.toISOString()).toBe('2026-11-19T12:00:00.000Z');
      expect([...sessao.cookies.keys()].sort()).toEqual(['XSRF-TOKEN', 'softdesk_session']);
      expect(sim.registro.map((r) => `${r.metodo} ${r.caminho}`)).toEqual(['GET /login', 'POST /login']);
      expect(sim.sessoesAbertas).toBe(1);
    });

    it('manda o corpo certo e o X-XSRF-TOKEN decodificado do cookie', async () => {
      const m = montarGateway(sim);
      await m.gateway.autenticar('maria.teste', sentinela('SENHA'), 'T');
      expect(sim.logins).toHaveLength(1);
      expect(sim.logins[0]).toEqual({
        usuario: 'maria.teste',
        perfil: 'T',
        chaves: ['lg_usuario', 'sh_usuario', 'tp_usuario', 'resposta', 'redirect_by_url'],
        xsrfOk: true,
      });
    });

    it('o POST leva os cookies recebidos no GET (jar entre as duas chamadas)', async () => {
      const m = montarGateway(sim);
      await entrar(m);
      const post = sim.requisicoes('/login', 'POST')[0];
      expect(Object.keys(post.cookies).sort()).toEqual(['XSRF-TOKEN', 'softdesk_session']);
    });

    it('conferirPaginaLogin faz só GET /login e não autentica', async () => {
      const m = montarGateway(sim);
      await expect(m.gateway.conferirPaginaLogin()).resolves.toBeUndefined();
      expect(sim.registro.map((r) => `${r.metodo} ${r.caminho}`)).toEqual(['GET /login']);
      expect(sim.sessoesAbertas).toBe(0);
    });

    it('credenciais corretas passam e erradas viram CREDENCIAL, quando o simulador confere', async () => {
      const senha = sentinela('SENHA');
      sim.credenciais = { usuario: 'ana.teste', senha };
      const m = montarGateway(sim);
      await expect(m.gateway.autenticar('ana.teste', senha, 'A')).resolves.toBeDefined();
      const e = await erroDe(() => m.gateway.autenticar('ana.teste', `${senha}x`, 'A'));
      expect(e.codigo).toBe('CREDENCIAL');
    });
  });

  describe('VAL-06: layout do login mudou', () => {
    it('página de login sem XSRF-TOKEN → LAYOUT_LOGIN_MUDOU com destaque, sem tentar o POST', async () => {
      sim.login = 'sem_xsrf';
      const m = montarGateway(sim);
      const e = await erroDe(() => m.gateway.autenticar('u', sentinela(), 'A'));
      expect(e.codigo).toBe('LAYOUT_LOGIN_MUDOU');
      expect(e.destaque).toBe(true);
      expect(e.evidencia).toEqual({ http_status: 200, content_type: 'text/html' });
      expect(sim.requisicoes('/login', 'POST')).toHaveLength(0);
    });

    it('conferirPaginaLogin sem XSRF → LAYOUT_LOGIN_MUDOU com destaque (saúde, VAL-22 apoio)', async () => {
      sim.login = 'sem_xsrf';
      const m = montarGateway(sim);
      const e = await erroDe(() => m.gateway.conferirPaginaLogin());
      expect(e.codigo).toBe('LAYOUT_LOGIN_MUDOU');
      expect(e.destaque).toBe(true);
    });

    it('resposta HTML ao POST /login → LAYOUT_LOGIN_MUDOU com destaque', async () => {
      sim.login = 'html';
      const m = montarGateway(sim);
      const e = await erroDe(() => m.gateway.autenticar('u', sentinela(), 'A'));
      expect(e.codigo).toBe('LAYOUT_LOGIN_MUDOU');
      expect(e.destaque).toBe(true);
      expect(e.evidencia?.content_type).toBe('text/html');
      expect(e.evidencia?.http_status).toBe(200);
      // a evidência não leva corpo nem cabeçalhos
      expect(Object.keys(e.evidencia ?? {}).sort()).toEqual(['content_type', 'http_status']);
    });

    it('GET /login que redireciona dentro da origem é seguido (até 5 saltos)', async () => {
      sim.login = 'pagina_redireciona';
      const m = montarGateway(sim);
      await expect(entrar(m)).resolves.toBeDefined();
      expect(sim.requisicoes('/login', 'GET')).toHaveLength(2);
    });

    it('redirecionamento sem fim no GET /login → LAYOUT_LOGIN_MUDOU depois de 5 saltos', async () => {
      sim.login = 'pagina_redireciona_sempre';
      const m = montarGateway(sim);
      const e = await erroDe(() => m.gateway.conferirPaginaLogin());
      expect(e.codigo).toBe('LAYOUT_LOGIN_MUDOU');
      expect(e.evidencia?.http_status).toBe(302);
      expect(sim.requisicoes('/login', 'GET')).toHaveLength(6);
    });

    it('redirecionamento para outra origem não é seguido (os cookies não saem do SoftDesk)', async () => {
      sim.login = 'pagina_redireciona_externo';
      const m = montarGateway(sim);
      const e = await erroDe(() => m.gateway.conferirPaginaLogin());
      expect(e.codigo).toBe('LAYOUT_LOGIN_MUDOU');
      expect(sim.registro).toHaveLength(1);
    });
  });

  describe('VAL-13 (classificação): credencial', () => {
    it('status falso → CREDENCIAL, sem destaque, mensagem fixa', async () => {
      sim.login = 'status_falso';
      const m = montarGateway(sim);
      const usuario = sentinela('USU');
      const e = await erroDe(() => m.gateway.autenticar(usuario, sentinela(), 'A'));
      expect(e.codigo).toBe('CREDENCIAL');
      expect(e.destaque).toBe(false);
      expect(e.mensagem).toBe('O SoftDesk recusou o login.');
      expect(`${e.mensagem} ${e.acao}`).not.toContain(usuario);
      expect(`${e.mensagem} ${e.acao}`).not.toContain('Credenciais inválidas'); // texto do SoftDesk
      expect(sim.sessoesAbertas).toBe(0);
    });

    it('HTTP 401 no POST → CREDENCIAL', async () => {
      sim.login = '401';
      const m = montarGateway(sim);
      const e = await erroDe(() => m.gateway.autenticar('u', sentinela(), 'A'));
      expect(e.codigo).toBe('CREDENCIAL');
      expect(e.destaque).toBe(false);
    });
  });

  describe('VAL-09 (login): rede', () => {
    it('HTTP 500 no POST → REDE (não é credencial nem layout)', async () => {
      sim.login = '500';
      const m = montarGateway(sim);
      const e = await erroDe(() => m.gateway.autenticar('u', sentinela(), 'A'));
      expect(e.codigo).toBe('REDE');
      expect(e.destaque).toBe(false);
    });

    it('HTTP 500 no GET /login → REDE', async () => {
      sim.login = 'pagina_500';
      const m = montarGateway(sim);
      const e = await erroDe(() => m.gateway.conferirPaginaLogin());
      expect(e.codigo).toBe('REDE');
    });

    it('servidor fora do ar (conexão recusada) → REDE', async () => {
      const m = montarGateway(sim);
      await sim.fechar();
      const e = await erroDe(() => m.gateway.conferirPaginaLogin());
      expect(e.codigo).toBe('REDE');
      sim = await SoftdeskSimulado.iniciar(); // para o afterEach
    });

    it('cancelamento pelo chamador → REDE com mensagem de cancelamento', async () => {
      const m = montarGateway(sim);
      const ctl = new AbortController();
      ctl.abort();
      const e = await erroDe(() => m.gateway.autenticar('u', sentinela(), 'A', ctl.signal));
      expect(e.codigo).toBe('REDE');
      expect(e.mensagem).toMatch(/cancelada/);
      expect(sim.registro).toHaveLength(0);
    });
  });

  it('o prazo padrão por chamada é 20 s (ARCH §4)', () => {
    expect(TIMEOUT_PADRAO_MS).toBe(20_000);
  });
});
