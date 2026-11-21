import { paraBasico } from '../../src/core/domain/entities/chamado';
import { ErroSoftdesk } from '../../src/core/domain/errors/erro-softdesk';
import type { SessaoHttp } from '../../src/core/domain/entities/sessao';
import { capturarErro, entrar, montarGateway, type Montagem } from '../simulador/apoio';
import { gerarMassa } from '../simulador/dados';
import { SoftdeskSimulado } from '../simulador/softdesk-simulado';

/**
 * Gateway de pesquisa contra o SoftDesk simulado:
 * VAL-07, VAL-09, VAL-13 (classificação), VAL-16 (apoio), VAL-29, VAL-30, VAL-31 e a forma da requisição.
 */
describe('SoftdeskHttpGateway · pesquisa', () => {
  let sim: SoftdeskSimulado;
  let m: Montagem;
  let sessao: SessaoHttp;

  const massa = gerarMassa([
    { cdAtendente: 393, status: 1, quantidade: 120 },
    { cdAtendente: 393, status: 8, quantidade: 60 },
    { cdAtendente: 393, status: 2, quantidade: 150 },
    { cdAtendente: 809, status: 1, quantidade: 80 },
  ]);
  const meus = massa.filter((c) => c.cd_atendente === 393);

  beforeEach(async () => {
    sim = await SoftdeskSimulado.iniciar({ chamados: massa });
    m = montarGateway(sim);
    sessao = await entrar(m);
  });
  afterEach(async () => {
    await sim.fechar();
  });

  const pesquisas = () => sim.requisicoes('/chamado/json');

  async function erroDe(fn: () => Promise<unknown>): Promise<ErroSoftdesk> {
    const e = await capturarErro(fn);
    expect(e).toBeInstanceOf(ErroSoftdesk);
    return e as ErroSoftdesk;
  }

  describe('requisição e resposta normais', () => {
    it('filtra por atendente no servidor, pagina e devolve lista e total', async () => {
      const r = await m.gateway.pesquisar(sessao, { atendente: [393], inicio: 0, limite: 200 });
      expect(r.lista).toHaveLength(200);
      expect(r.lista.every((i) => i.cd_atendente === 393)).toBe(true);
      expect(r.total).toBe(meus.length);
      expect(r.deriva).toBeUndefined();
      const q = pesquisas()[0].query;
      expect(q['pesq_cd_atendente[]']).toEqual(['393']);
      expect(q.start).toEqual(['0']);
      expect(q.limit).toEqual(['200']);
      expect(q.cd_pasta).toEqual(['8']);
      expect(q['pesq_st_chamado[]']).toBeUndefined();
    });

    it('páginas seguidas por início/limite não repetem itens e juntam a lista inteira', async () => {
      const a = await m.gateway.pesquisar(sessao, { atendente: [393], inicio: 0, limite: 200 });
      const b = await m.gateway.pesquisar(sessao, { atendente: [393], inicio: 200, limite: 200 });
      const codigos = [...a.lista, ...b.lista].map((i) => i.cd_chamado);
      expect(new Set(codigos).size).toBe(codigos.length);
      expect(codigos).toEqual(meus.map((c) => c.cd_chamado));
      expect(b.total).toBe(meus.length);
    });

    it('limite acima de 200 é enviado como 200', async () => {
      const r = await m.gateway.pesquisar(sessao, { atendente: [393], limite: 500 });
      expect(pesquisas()[0].query.limit).toEqual(['200']);
      expect(r.lista).toHaveLength(200);
    });

    it('padrão de página: início 0 e 50 itens', async () => {
      const r = await m.gateway.pesquisar(sessao, { atendente: [393] });
      expect(r.lista).toHaveLength(50);
      expect(pesquisas()[0].query.start).toEqual(['0']);
    });

    it('status {1} vai ao servidor como EM_ATENDIMENTO; outros conjuntos, não (VAL-24 apoio)', async () => {
      const em = await m.gateway.pesquisar(sessao, { atendente: [393], status: [1], limite: 200 });
      expect(pesquisas()[0].query['pesq_st_chamado[]']).toEqual(['EM_ATENDIMENTO']);
      expect(em.lista.length).toBeGreaterThan(0);
      expect(em.lista.every((i) => i.st_chamado === 1)).toBe(true);

      const outro = await m.gateway.pesquisar(sessao, { atendente: [393], status: [8], limite: 200 });
      expect(pesquisas()[1].query['pesq_st_chamado[]']).toBeUndefined();
      // o servidor não filtrou: voltam itens de outros status, quem filtra é o cliente
      expect(new Set(outro.lista.map((i) => i.st_chamado)).size).toBeGreaterThan(1);
      expect(outro.total).toBe(meus.length);

      await m.gateway.pesquisar(sessao, { atendente: [393], status: [1, 8] });
      expect(pesquisas()[2].query['pesq_st_chamado[]']).toBeUndefined();
    });

    it('pesquisa por código devolve só o chamado pedido', async () => {
      const alvo = meus[10].cd_chamado;
      const r = await m.gateway.pesquisar(sessao, { codigo: alvo, limite: 10 });
      expect(pesquisas()[0].query.pesq_cd_chamado).toEqual([String(alvo)]);
      expect(r.lista).toHaveLength(1);
      expect(r.lista[0].cd_chamado).toBe(alvo);
      expect(r.total).toBe(1);
      const nenhum = await m.gateway.pesquisar(sessao, { codigo: 12, limite: 10 });
      expect(nenhum.lista).toEqual([]);
      expect(nenhum.total).toBe(0);
    });

    it('o item volta como o SoftDesk mandou (todos os campos do contrato)', async () => {
      const r = await m.gateway.pesquisar(sessao, { atendente: [393], limite: 1 });
      expect(Object.keys(r.lista[0]).length).toBeGreaterThan(60);
      expect(paraBasico(r.lista[0]).codigo).toBe(meus[0].cd_chamado);
    });

    it('parâmetro de paginação inválido → FILTRO_INVALIDO sem chamar o SoftDesk (VAL-20 apoio)', async () => {
      const antes = sim.registro.length;
      const e = await erroDe(() => m.gateway.pesquisar(sessao, { limite: 0 }));
      expect(e.codigo).toBe('FILTRO_INVALIDO');
      expect(sim.registro).toHaveLength(antes);
    });

    it('guarda o Set-Cookie de toda resposta e o devolve nas chamadas seguintes', async () => {
      await sim.fechar();
      sim = await SoftdeskSimulado.iniciar({ chamados: massa, rotacionarCookie: true });
      m = montarGateway(sim);
      sessao = await entrar(m);
      await m.gateway.pesquisar(sessao, { atendente: [393], limite: 1 });
      const primeiro = sessao.cookies.get('softdesk_rotativo');
      expect(primeiro).toBeDefined();
      await m.gateway.pesquisar(sessao, { atendente: [393], limite: 1 });
      const segundo = sessao.cookies.get('softdesk_rotativo');
      expect(segundo).toBeDefined();
      expect(segundo).not.toBe(primeiro);
      // a segunda requisição já foi com o valor guardado da primeira resposta
      expect(pesquisas()[1].cookies.softdesk_rotativo).toBe(primeiro);
    });
  });

  describe('VAL-07: rota de pesquisa mudou', () => {
    it.each(['sem_lista', 'sem_total'] as const)('%s → CONTRATO_ROTA_MUDOU com destaque', async (cenario) => {
      sim.pesquisa = cenario;
      const e = await erroDe(() => m.gateway.pesquisar(sessao, { atendente: [393] }));
      expect(e.codigo).toBe('CONTRATO_ROTA_MUDOU');
      expect(e.destaque).toBe(true);
      expect(e.evidencia).toEqual({ http_status: 200, content_type: 'application/json' });
      expect(e.campos).toBeUndefined();
    });

    it('resposta HTML → CONTRATO_ROTA_MUDOU (não é sessão expirada)', async () => {
      sim.pesquisa = 'html';
      const e = await erroDe(() => m.gateway.pesquisar(sessao, { atendente: [393] }));
      expect(e.codigo).toBe('CONTRATO_ROTA_MUDOU');
      expect(e.destaque).toBe(true);
      expect(e.evidencia?.content_type).toBe('text/html');
    });

    it('a quebra de contrato nunca derruba a sessão: o jar fica intacto', async () => {
      const antes = [...sessao.cookies];
      sim.pesquisa = 'sem_lista';
      await erroDe(() => m.gateway.pesquisar(sessao, { atendente: [393] }));
      expect([...sessao.cookies]).toEqual(antes);
    });
  });

  describe('VAL-13 (classificação): sessão', () => {
    it.each(['401', '403'] as const)('pesquisa com HTTP %s → SESSAO_EXPIRADA', async (cenario) => {
      sim.pesquisa = cenario;
      const e = await erroDe(() => m.gateway.pesquisar(sessao, { atendente: [393] }));
      expect(e.codigo).toBe('SESSAO_EXPIRADA');
      expect(e.destaque).toBe(false);
      expect(e.evidencia?.http_status).toBe(Number(cenario));
    });

    it('redirecionamento para /login → SESSAO_EXPIRADA, sem seguir o redirecionamento (VAL-08 apoio)', async () => {
      sim.pesquisa = 'redirect_login';
      const antes = sim.registro.length;
      const e = await erroDe(() => m.gateway.pesquisar(sessao, { atendente: [393] }));
      expect(e.codigo).toBe('SESSAO_EXPIRADA');
      expect(e.evidencia).toEqual({ http_status: 302, location_path: '/login' });
      // uma só requisição, e nenhuma ao /login
      expect(sim.registro.slice(antes).map((r) => `${r.metodo} ${r.caminho}`)).toEqual(['GET /chamado/json']);
    });

    it.each(['redirect_login', '401', '403'] as const)(
      'sessão derrubada pelo servidor (%s) → SESSAO_EXPIRADA e nenhum POST /login (VAL-16 apoio)',
      async (forma) => {
        sim.expirarSessao(forma);
        const postsAntes = sim.requisicoes('/login', 'POST').length;
        const e = await erroDe(() => m.gateway.pesquisar(sessao, { atendente: [393] }));
        expect(e.codigo).toBe('SESSAO_EXPIRADA');
        expect(sim.requisicoes('/login', 'POST')).toHaveLength(postsAntes);
        expect(pesquisas()).toHaveLength(1);
      },
    );

    it('sessão que nunca entrou (jar vazio) também volta como SESSAO_EXPIRADA', async () => {
      const vazia: SessaoHttp = { cookies: new Map(), criadaEm: new Date() };
      const e = await erroDe(() => m.gateway.pesquisar(vazia, { atendente: [393] }));
      expect(e.codigo).toBe('SESSAO_EXPIRADA');
    });
  });

  describe('VAL-09: rede', () => {
    it('HTTP 500 → REDE', async () => {
      sim.pesquisa = '500';
      const e = await erroDe(() => m.gateway.pesquisar(sessao, { atendente: [393] }));
      expect(e.codigo).toBe('REDE');
      expect(e.destaque).toBe(false);
    });

    it('resposta lenta além do prazo (reduzido por parâmetro) → REDE, sem esperar a resposta', async () => {
      const rapido = montarGateway(sim, { timeoutMs: 120 });
      sim.pesquisa = { lento: 3000 };
      const t0 = Date.now();
      const e = await erroDe(() => rapido.gateway.pesquisar(sessao, { atendente: [393] }));
      expect(e.codigo).toBe('REDE');
      expect(e.destaque).toBe(false);
      expect(Date.now() - t0).toBeLessThan(2000);
    });

    it('resposta lenta mas dentro do prazo passa', async () => {
      sim.pesquisa = { lento: 60 };
      const r = await m.gateway.pesquisar(sessao, { atendente: [393], limite: 3 });
      expect(r.lista).toHaveLength(3);
    });

    it('cancelamento do chamador no meio da chamada → REDE de cancelamento', async () => {
      sim.pesquisa = { lento: 3000 };
      const ctl = new AbortController();
      const promessa = m.gateway.pesquisar(sessao, { atendente: [393] }, ctl.signal);
      setTimeout(() => ctl.abort(), 50);
      const e = await erroDe(() => promessa);
      expect(e.codigo).toBe('REDE');
      expect(e.mensagem).toMatch(/cancelada/);
    });

    it('servidor fora do ar → REDE', async () => {
      await sim.fechar();
      const e = await erroDe(() => m.gateway.pesquisar(sessao, { atendente: [393] }));
      expect(e.codigo).toBe('REDE');
      sim = await SoftdeskSimulado.iniciar();
    });
  });

  describe('somente leitura (RN-01, VAL-10 apoio)', () => {
    it('a sequência login → pesquisas só toca as três rotas, com os métodos certos', async () => {
      await m.gateway.pesquisar(sessao, { atendente: [393] });
      await m.gateway.pesquisar(sessao, { codigo: 5 });
      await m.gateway.conferirPaginaLogin();
      const usados = new Set(sim.registro.map((r) => `${r.metodo} ${r.caminho}`));
      expect([...usados].sort()).toEqual(['GET /chamado/json', 'GET /login', 'POST /login']);
    });
  });

  describe('semáforo de 2 vagas (VAL-23 apoio)', () => {
    it('cinco pesquisas ao mesmo tempo com o servidor lento nunca passam de 2 simultâneas', async () => {
      sim.pesquisa = { lento: 120 };
      sim.zerarPico();
      const r = await Promise.all(
        Array.from({ length: 5 }, (_, i) => m.gateway.pesquisar(sessao, { atendente: [393], inicio: i * 10, limite: 10 })),
      );
      expect(r.every((p) => p.lista.length === 10)).toBe(true);
      expect(sim.picoSimultaneas).toBe(2);
      expect(m.gateway.picoSimultaneas).toBe(2);
      expect(pesquisas()).toHaveLength(5);
    });
  });
});
