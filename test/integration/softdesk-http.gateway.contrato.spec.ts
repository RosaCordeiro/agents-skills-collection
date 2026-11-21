import { paraBasico } from '../../src/core/domain/entities/chamado';
import { ErroSoftdesk } from '../../src/core/domain/errors/erro-softdesk';
import type { SessaoHttp } from '../../src/core/domain/entities/sessao';
import { capturarErro, descreverErro, entrar, montarGateway, sentinela, type Montagem } from '../simulador/apoio';
import { SoftdeskHttpGateway } from '../../src/infraestructure/softdesk/softdesk-http.gateway';
import { gerarMassa } from '../simulador/dados';
import { SoftdeskSimulado } from '../simulador/softdesk-simulado';

/**
 * Mitigação da rota não oficial (ARCH §17): VAL-29, VAL-30 e VAL-31 (integração), mais o teste
 * obrigatório do repositório (nenhuma resposta, erro ou log contém senha ou cookie).
 */
describe('SoftdeskHttpGateway · deriva do contrato', () => {
  let sim: SoftdeskSimulado;
  let m: Montagem;
  let sessao: SessaoHttp;

  const massa = gerarMassa([{ cdAtendente: 393, status: 1, quantidade: 6, solicitantes: ['Marlene Figueira', 'Tobias Albuquerque'] }]);

  beforeEach(async () => {
    sim = await SoftdeskSimulado.iniciar({ chamados: massa });
    m = montarGateway(sim);
    sessao = await entrar(m);
  });
  afterEach(async () => {
    await sim.fechar();
  });

  async function erroDe(fn: () => Promise<unknown>): Promise<ErroSoftdesk> {
    const e = await capturarErro(fn);
    expect(e).toBeInstanceOf(ErroSoftdesk);
    return e as ErroSoftdesk;
  }

  const logsDo = (keyword: string) =>
    m.logger.registros.filter((r) => (r.campos.keywords ?? []).includes(keyword));

  describe('VAL-29: campo usado ausente ou de tipo trocado', () => {
    it('sem nm_usuario → itens com o campo nulo, deriva com o nome e log só com o nome', async () => {
      sim.aplicarDeriva({ remover: ['nm_usuario'] });
      const r = await m.gateway.pesquisar(sessao, { atendente: [393] });
      expect(r.lista).toHaveLength(6);
      expect(r.deriva).toEqual(['nm_usuario']);
      expect(r.lista.map((i) => paraBasico(i).solicitante)).toEqual(Array(6).fill(null));
      // o resto do item segue normal
      expect(paraBasico(r.lista[0]).codigo).toBe(massa[0].cd_chamado);
      expect(paraBasico(r.lista[0]).titulo).toBe(`Chamado fictício ${massa[0].cd_chamado}`);

      const logs = logsDo('softdesk_deriva');
      expect(logs).toHaveLength(1);
      expect(logs[0].nivel).toBe('warn');
      expect(logs[0].campos.campos_deriva).toEqual(['nm_usuario']);
      expect(logs[0].campos.event).toEqual({ name: 'softdesk_http', action: 'deriva', outcome: 'success' });
      expect(m.logger.texto()).not.toContain('Marlene');
      expect(m.logger.texto()).not.toContain('Albuquerque');
    });

    it('tipo trocado (qtd_interacoes em texto, ds_status número) → também deriva, nunca erro', async () => {
      sim.aplicarDeriva({ alterar: { qtd_interacoes: 'muitas', ds_status: 123 } });
      const r = await m.gateway.pesquisar(sessao, { atendente: [393] });
      expect([...(r.deriva ?? [])].sort()).toEqual(['ds_status', 'qtd_interacoes']);
      const basico = paraBasico(r.lista[0]);
      expect(basico.interacoes).toBeNull();
      expect(basico.status).toBeNull();
      expect(basico.status_codigo).toBe(1);
    });

    it('a deriva é avisada em toda resposta, não só na primeira', async () => {
      sim.aplicarDeriva({ remover: ['tt_chamado'] });
      const a = await m.gateway.pesquisar(sessao, { atendente: [393] });
      const b = await m.gateway.pesquisar(sessao, { atendente: [393] });
      expect(a.deriva).toEqual(['tt_chamado']);
      expect(b.deriva).toEqual(['tt_chamado']);
    });

    it('o nome do campo aparece uma vez por resposta, mesmo com todos os itens afetados', async () => {
      sim.aplicarDeriva({ remover: ['ha_chamado', 'da_chamado'] });
      const r = await m.gateway.pesquisar(sessao, { atendente: [393] });
      expect([...(r.deriva ?? [])].sort()).toEqual(['da_chamado', 'ha_chamado']);
    });
  });

  describe('VAL-30: campo essencial ausente ou de tipo trocado', () => {
    it('sem cd_atendente → CONTRATO_ROTA_MUDOU com o nome do campo', async () => {
      sim.aplicarDeriva({ remover: ['cd_atendente'] });
      const e = await erroDe(() => m.gateway.pesquisar(sessao, { atendente: [393] }));
      expect(e.codigo).toBe('CONTRATO_ROTA_MUDOU');
      expect(e.destaque).toBe(true);
      expect(e.campos).toEqual(['cd_atendente']);
    });

    it('st_chamado em texto → CONTRATO_ROTA_MUDOU com o nome do campo', async () => {
      sim.aplicarDeriva({ alterar: { st_chamado: 'EM_ATENDIMENTO' } });
      const e = await erroDe(() => m.gateway.pesquisar(sessao, { atendente: [393] }));
      expect(e.codigo).toBe('CONTRATO_ROTA_MUDOU');
      expect(e.campos).toEqual(['st_chamado']);
      expect(e.evidencia).toEqual({ http_status: 200, content_type: 'application/json' });
    });

    it('vários essenciais juntos → todos os nomes; cd_chamado também conta', async () => {
      sim.aplicarDeriva({ remover: ['cd_chamado'], alterar: { st_chamado: null } });
      const e = await erroDe(() => m.gateway.pesquisar(sessao, { atendente: [393] }));
      expect(e.codigo).toBe('CONTRATO_ROTA_MUDOU');
      expect([...(e.campos ?? [])].sort()).toEqual(['cd_chamado', 'st_chamado']);
    });

    it('essencial junto de usado: o erro vence, com só os essenciais', async () => {
      sim.aplicarDeriva({ remover: ['cd_atendente', 'nm_usuario'] });
      const e = await erroDe(() => m.gateway.pesquisar(sessao, { atendente: [393] }));
      expect(e.campos).toEqual(['cd_atendente']);
    });

    it('o log do erro leva só os nomes dos campos (campos_deriva) e o código', async () => {
      sim.aplicarDeriva({ remover: ['cd_atendente'] });
      await erroDe(() => m.gateway.pesquisar(sessao, { atendente: [393] }));
      const falha = m.logger.registros.filter((r) => r.campos.codigo_erro === 'CONTRATO_ROTA_MUDOU');
      expect(falha).toHaveLength(1);
      expect(falha[0].campos.campos_deriva).toEqual(['cd_atendente']);
      expect(falha[0].campos.rota).toBe('pesquisa');
      expect(falha[0].campos.http_status).toBe(200);
      expect(m.logger.texto()).not.toContain('Marlene');
    });
  });

  describe('VAL-31: campo novo no SoftDesk', () => {
    it('resposta normal; o nome vai ao log uma vez por processo; nenhum valor no log', async () => {
      const valorSecreto = sentinela('VALOR');
      sim.aplicarDeriva({ adicionar: { campo_novo_xpto: valorSecreto } });
      const a = await m.gateway.pesquisar(sessao, { atendente: [393] });
      expect(a.lista).toHaveLength(6);
      expect(a.deriva).toBeUndefined();
      expect(a.lista[0].campo_novo_xpto).toBe(valorSecreto); // o item passa como veio

      const b = await m.gateway.pesquisar(sessao, { atendente: [393] });
      expect(b.deriva).toBeUndefined();

      const logs = logsDo('softdesk_campo_novo');
      expect(logs).toHaveLength(1);
      expect(logs[0].nivel).toBe('info');
      expect(logs[0].campos.campos_deriva).toEqual(['campo_novo_xpto']);
      expect(m.logger.texto()).not.toContain(valorSecreto);
      expect(m.logger.registros.every((r) => r.nivel !== 'error')).toBe(true);
    });

    it('um segundo campo novo depois é logado; o primeiro não se repete', async () => {
      sim.aplicarDeriva({ adicionar: { novo_um: 1 } });
      await m.gateway.pesquisar(sessao, { atendente: [393] });
      sim.aplicarDeriva({ adicionar: { novo_dois: 'x' } });
      await m.gateway.pesquisar(sessao, { atendente: [393] });
      const nomes = logsDo('softdesk_campo_novo').flatMap((r) => r.campos.campos_deriva as string[]);
      expect(nomes).toEqual(['novo_um', 'novo_dois']);
    });

    it('campo novo junto de campo usado ausente: aviso de deriva só com o usado', async () => {
      sim.aplicarDeriva({ adicionar: { novo_tres: true }, remover: ['ds_prioridade'] });
      const r = await m.gateway.pesquisar(sessao, { atendente: [393] });
      expect(r.deriva).toEqual(['ds_prioridade']);
      expect(logsDo('softdesk_campo_novo')[0].campos.campos_deriva).toEqual(['novo_tres']);
      expect(logsDo('softdesk_deriva')[0].campos.campos_deriva).toEqual(['ds_prioridade']);
    });
  });

  describe('diagnóstico só quando pedido (B-12)', () => {
    it('sem a opção a página não traz diagnostico; com ela, traz', async () => {
      sim.aplicarDeriva({ adicionar: { campo_novo_x: 1 }, remover: ['cd_area'] });
      const sem = await m.gateway.pesquisar(sessao, { atendente: [393] });
      expect(sem.diagnostico).toBeUndefined();
      const com = await m.gateway.pesquisar(sessao, { atendente: [393] }, undefined, { diagnosticar: true });
      expect(com.diagnostico).toEqual({ novos: ['campo_novo_x'], ausentes: ['cd_area'], tipo_trocado: [] });
    });
  });

  describe('campos "outro" do contrato', () => {
    it('sumir ou mudar de tipo não gera aviso nem erro', async () => {
      sim.aplicarDeriva({ remover: ['cd_cliente'], alterar: { nr_anexo: 'texto' } });
      const r = await m.gateway.pesquisar(sessao, { atendente: [393] });
      expect(r.deriva).toBeUndefined();
      expect(logsDo('softdesk_deriva')).toHaveLength(0);
    });
  });

  describe('logs da chamada (§8.3)', () => {
    it('cada chamada deixa um log com rota, status e duração; só campos da lista de permissão', async () => {
      m.logger.registros.length = 0;
      await m.gateway.pesquisar(sessao, { atendente: [393], palavra_chave: 'NAO-VAI-PARA-O-LOG' });
      expect(m.logger.registros).toHaveLength(1);
      const [log] = m.logger.registros;
      expect(log.nivel).toBe('info');
      expect(log.campos.event).toEqual({ name: 'softdesk_http', action: 'request', outcome: 'success' });
      expect(log.campos.rota).toBe('pesquisa');
      expect(log.campos.http_status).toBe(200);
      expect(typeof log.campos.duracao_ms).toBe('number');
      expect(Object.keys(log.campos).sort()).toEqual(['duracao_ms', 'event', 'http_status', 'rota']);
      expect(m.logger.texto()).not.toContain('NAO-VAI-PARA-O-LOG');
      expect(m.logger.texto()).not.toContain('/chamado/json'); // nem URL
    });

    it('falhas levam codigo_erro, keyword e evidência; REDE sem status quando não houve resposta', async () => {
      sim.pesquisa = 'redirect_login';
      await erroDe(() => m.gateway.pesquisar(sessao, { atendente: [393] }));
      const exp = m.logger.registros.filter((r) => r.campos.codigo_erro === 'SESSAO_EXPIRADA');
      expect(exp).toHaveLength(1);
      expect(exp[0].campos.keywords).toEqual(['softdesk_sessao_expirada']);
      expect(exp[0].campos.evidencia).toEqual({ http_status: 302, location_path: '/login' });

      const rapido = montarGateway(sim, { timeoutMs: 80 });
      sim.pesquisa = { lento: 2000 };
      await erroDe(() => rapido.gateway.pesquisar(sessao, { atendente: [393] }));
      const rede = rapido.logger.registros.filter((r) => r.campos.codigo_erro === 'REDE');
      expect(rede).toHaveLength(1);
      expect(rede[0].campos.keywords).toEqual(['softdesk_rede']);
      expect(rede[0].campos.http_status).toBeUndefined();

      sim.login = '401';
      await erroDe(() => m.gateway.autenticar('u', sentinela(), 'A'));
      const cred = m.logger.registros.filter((r) => r.campos.codigo_erro === 'CREDENCIAL');
      expect(cred).toHaveLength(1);
      expect(cred[0].campos.keywords).toEqual(['softdesk_login_recusado']);
      expect(cred[0].campos.rota).toBe('login_post');
    });

    it('um logger que lança não derruba a chamada', async () => {
      const quebra = (): void => {
        throw new Error('log quebrou');
      };
      const logger = { info: quebra, warn: quebra, error: quebra };
      const g = new SoftdeskHttpGateway({ baseUrl: sim.url, logger });
      const s = await g.autenticar('u', sentinela(), 'A');
      await expect(g.pesquisar(s, { atendente: [393] })).resolves.toBeDefined();
    });
  });
});

describe('teste obrigatório: nenhuma resposta, erro ou log contém senha ou cookie', () => {
  let sim: SoftdeskSimulado;

  const massa = gerarMassa([{ cdAtendente: 393, status: 1, quantidade: 4 }]);

  beforeEach(async () => {
    sim = await SoftdeskSimulado.iniciar({ chamados: massa, rotacionarCookie: true });
  });
  afterEach(async () => {
    await sim.fechar();
  });

  it('login, pesquisa e falhas de todo tipo não deixam senha, usuário nem cookie em erro ou log', async () => {
    const senha = sentinela('SENHA');
    const usuario = sentinela('USUARIO');
    const m = montarGateway(sim, { timeoutMs: 150 });
    const textos: string[] = [];

    // 1) caminho feliz: a sessão devolvida carrega os cookies por definição; o resto não pode
    const sessao = await m.gateway.autenticar(usuario, senha, 'A');
    const pagina = await m.gateway.pesquisar(sessao, { atendente: [393] });
    textos.push(JSON.stringify(pagina));

    // 2) falhas de login
    for (const cenario of ['status_falso', '401', 'html', 'sem_xsrf', '500', 'pagina_500'] as const) {
      sim.login = cenario;
      const e = await capturarErro(() => m.gateway.autenticar(usuario, senha, 'A'));
      textos.push(descreverErro(e));
    }
    sim.login = 'ok';

    // 3) falhas de pesquisa (com a sessão boa, depois de ela receber cookies rotativos)
    for (const cenario of ['sem_lista', 'sem_total', 'html', 'redirect_login', '401', '403', '500', { lento: 3000 }] as const) {
      sim.pesquisa = cenario;
      const e = await capturarErro(() => m.gateway.pesquisar(sessao, { atendente: [393] }));
      textos.push(descreverErro(e));
    }
    sim.pesquisa = 'ok';
    sim.aplicarDeriva({ remover: ['cd_atendente'] });
    textos.push(descreverErro(await capturarErro(() => m.gateway.pesquisar(sessao, { atendente: [393] }))));

    // 4) conexão recusada
    const outro = await SoftdeskSimulado.iniciar();
    const url = outro.url;
    await outro.fechar();
    const semServidor = montarGateway({ url });
    textos.push(descreverErro(await capturarErro(() => semServidor.gateway.autenticar(usuario, senha, 'A'))));
    textos.push(semServidor.logger.texto());

    const tudo = `${textos.join('\n')}\n${m.logger.texto()}`;
    expect(tudo).not.toContain(senha);
    expect(tudo).not.toContain(usuario);
    const cookies = sim.cookiesEmitidos();
    expect(cookies.length).toBeGreaterThan(5);
    for (const valor of cookies) {
      expect(tudo).not.toContain(valor);
      expect(tudo).not.toContain(decodeURIComponent(valor));
    }
    // a prova de que a busca vale: o simulador realmente recebeu a senha e os cookies
    expect(sim.logins.length).toBeGreaterThanOrEqual(5);
    expect(sim.logins.some((l) => l.usuario === usuario)).toBe(true);
    expect(sim.registro.some((r) => Object.values(r.cookies).some((v) => cookies.includes(v)))).toBe(true);
  });

  it('o erro tipado não expõe o `message` de nenhuma exceção interna', async () => {
    sim.login = 'html';
    const m = montarGateway(sim);
    const e = (await capturarErro(() => m.gateway.autenticar('u', sentinela(), 'A'))) as ErroSoftdesk;
    // `message` é só o código; o corpo HTML ("Novo login") nunca entra
    expect(e.message).toBe('LAYOUT_LOGIN_MUDOU');
    expect(descreverErro(e)).not.toContain('Novo login');
  });
});
