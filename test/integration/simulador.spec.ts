import { CONTRATO_DOURADO, conferirItem } from '../../src/infraestructure/softdesk/contrato';
import { gerarMassa, montarItem, valorPadrao } from '../simulador/dados';
import { SoftdeskSimulado } from '../simulador/softdesk-simulado';

/** O próprio simulador precisa ser confiável: os outros testes se apoiam nele. */
describe('SoftdeskSimulado (ARCH §10)', () => {
  let sim: SoftdeskSimulado;

  afterEach(async () => {
    await sim.fechar();
  });

  async function logar(): Promise<string> {
    const get = await fetch(`${sim.url}/login`);
    const cookies = get.headers.getSetCookie().map((c) => c.split(';')[0]);
    const xsrf = decodeURIComponent((cookies.find((c) => c.startsWith('XSRF-TOKEN=')) as string).slice(11));
    const post = await fetch(`${sim.url}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': xsrf, Cookie: cookies.join('; ') },
      body: JSON.stringify({ lg_usuario: 'u', sh_usuario: 's', tp_usuario: 'A', resposta: '', redirect_by_url: '' }),
    });
    const novos = post.headers.getSetCookie().map((c) => c.split(';')[0]);
    return [...novos].join('; ');
  }

  it('só tem três rotas; qualquer outra responde 404 e fica registrada', async () => {
    sim = await SoftdeskSimulado.iniciar();
    sim.toleraRotasExtras = true;
    expect((await fetch(`${sim.url}/`)).status).toBe(404);
    expect((await fetch(`${sim.url}/chamado/json`, { method: 'POST' })).status).toBe(404);
    expect((await fetch(`${sim.url}/chamado/1`, { method: 'DELETE' })).status).toBe(404);
    expect((await fetch(`${sim.url}/login`, { method: 'PUT' })).status).toBe(404);
    expect(sim.registro.map((r) => `${r.metodo} ${r.caminho}`)).toEqual([
      'GET /',
      'POST /chamado/json',
      'DELETE /chamado/1',
      'PUT /login',
    ]);
  });

  it('POST /login exige o X-XSRF-TOKEN do cookie (senão 419 em HTML)', async () => {
    sim = await SoftdeskSimulado.iniciar();
    const get = await fetch(`${sim.url}/login`);
    const cookies = get.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const sem = await fetch(`${sim.url}/login`, { method: 'POST', headers: { Cookie: cookies }, body: '{}' });
    expect(sem.status).toBe(419);
    expect(sem.headers.get('content-type')).toContain('text/html');
    const errado = await fetch(`${sim.url}/login`, {
      method: 'POST',
      headers: { Cookie: cookies, 'X-XSRF-TOKEN': 'outro' },
      body: '{}',
    });
    expect(errado.status).toBe(419);
    expect(sim.sessoesAbertas).toBe(0);
  });

  it('a página de login emite o XSRF-TOKEN codificado; sem_xsrf não o emite', async () => {
    sim = await SoftdeskSimulado.iniciar();
    let r = await fetch(`${sim.url}/login`);
    const xsrf = r.headers.getSetCookie().find((c) => c.startsWith('XSRF-TOKEN='));
    expect(xsrf).toBeDefined();
    expect(xsrf).toMatch(/%3D/);
    sim.login = 'sem_xsrf';
    r = await fetch(`${sim.url}/login`);
    expect(r.headers.getSetCookie().some((c) => c.startsWith('XSRF-TOKEN='))).toBe(false);
  });

  it('pesquisa sem sessão redireciona a /login; com sessão pagina e filtra', async () => {
    const massa = gerarMassa([
      { cdAtendente: 393, status: 1, quantidade: 30 },
      { cdAtendente: 393, status: 2, quantidade: 20 },
      { cdAtendente: 809, status: 1, quantidade: 25 },
    ]);
    sim = await SoftdeskSimulado.iniciar({ chamados: massa });
    const anon = await fetch(`${sim.url}/chamado/json`, { redirect: 'manual' });
    expect(anon.status).toBe(302);
    expect(anon.headers.get('location')).toBe('/login');

    const cookie = await logar();
    const buscar = async (q: string) =>
      (await (await fetch(`${sim.url}/chamado/json?${q}`, { headers: { Cookie: cookie } })).json()) as {
        lista: { cd_chamado: number; cd_atendente: number; st_chamado: number }[];
        treeview: { total: number };
      };

    const todos = await buscar('start=0&limit=1000');
    expect(todos.treeview.total).toBe(75);
    expect(todos.lista).toHaveLength(75);
    expect(todos.lista.map((i) => i.cd_chamado)).toEqual(massa.map((c) => c.cd_chamado));

    const meus = await buscar('pesq_cd_atendente%5B%5D=393&start=0&limit=1000');
    expect(meus.treeview.total).toBe(50);
    expect(meus.lista.every((i) => i.cd_atendente === 393)).toBe(true);

    const pagina2 = await buscar('pesq_cd_atendente%5B%5D=393&start=20&limit=20');
    expect(pagina2.lista).toHaveLength(20);
    expect(pagina2.treeview.total).toBe(50);
    expect(pagina2.lista.map((i) => i.cd_chamado)).toEqual(meus.lista.slice(20, 40).map((i) => i.cd_chamado));

    const emAtendimento = await buscar('pesq_cd_atendente%5B%5D=393&pesq_st_chamado%5B%5D=EM_ATENDIMENTO&limit=1000');
    expect(emAtendimento.treeview.total).toBe(30);
    expect(emAtendimento.lista.every((i) => i.st_chamado === 1)).toBe(true);

    const outroNome = await buscar('pesq_st_chamado%5B%5D=ALGUM_NOME&limit=10');
    expect(outroNome.treeview.total).toBe(0);

    const porCodigo = await buscar(`pesq_cd_chamado=${massa[7].cd_chamado}&limit=10`);
    expect(porCodigo.lista.map((i) => i.cd_chamado)).toEqual([massa[7].cd_chamado]);
    const vazio = await buscar('pesq_cd_chamado=&limit=3');
    expect(vazio.lista).toHaveLength(3);
  });

  it('expirarSessao derruba a sessão na forma pedida', async () => {
    sim = await SoftdeskSimulado.iniciar({ chamados: gerarMassa([{ cdAtendente: 393, status: 1, quantidade: 3 }]) });
    const cookie = await logar();
    const ir = () => fetch(`${sim.url}/chamado/json`, { headers: { Cookie: cookie }, redirect: 'manual' });
    expect((await ir()).status).toBe(200);
    sim.expirarSessao();
    expect((await ir()).status).toBe(302);
    sim.expirarSessao('403');
    expect((await ir()).status).toBe(403);
    sim.expirarSessao('401');
    expect((await ir()).status).toBe(401);
  });

  it('cenários de pesquisa mudam a resposta como descrito', async () => {
    sim = await SoftdeskSimulado.iniciar({ chamados: gerarMassa([{ cdAtendente: 393, status: 1, quantidade: 3 }]) });
    const cookie = await logar();
    const ir = async () => {
      const r = await fetch(`${sim.url}/chamado/json`, { headers: { Cookie: cookie }, redirect: 'manual' });
      const texto = await r.text();
      let corpo: Record<string, unknown> | null = null;
      try {
        corpo = JSON.parse(texto);
      } catch {
        corpo = null;
      }
      return { status: r.status, corpo, location: r.headers.get('location') };
    };
    sim.pesquisa = 'sem_lista';
    let r = await ir();
    expect(r.corpo).not.toHaveProperty('lista');
    expect((r.corpo?.treeview as { total: number }).total).toBe(3);
    sim.pesquisa = 'sem_total';
    r = await ir();
    expect(r.corpo?.lista).toHaveLength(3);
    expect(r.corpo?.treeview).not.toHaveProperty('total');
    sim.pesquisa = 'html';
    r = await ir();
    expect(r.status).toBe(200);
    expect(r.corpo).toBeNull();
    sim.pesquisa = 'redirect_login';
    r = await ir();
    expect([r.status, r.location]).toEqual([302, '/login']);
    for (const s of ['401', '403', '500'] as const) {
      sim.pesquisa = s;
      expect((await ir()).status).toBe(Number(s));
    }
  });

  it('o cenário lento atrasa a resposta e mede o pico de simultâneas', async () => {
    sim = await SoftdeskSimulado.iniciar({ chamados: gerarMassa([{ cdAtendente: 393, status: 1, quantidade: 3 }]) });
    const cookie = await logar();
    sim.pesquisa = { lento: 150 };
    sim.zerarPico();
    const t0 = Date.now();
    await Promise.all(Array.from({ length: 4 }, () => fetch(`${sim.url}/chamado/json`, { headers: { Cookie: cookie } }).then((r) => r.text())));
    expect(Date.now() - t0).toBeGreaterThanOrEqual(140);
    expect(sim.picoSimultaneas).toBe(4);
    sim.pesquisa = 'ok';
    sim.zerarPico();
    await fetch(`${sim.url}/chamado/json`, { headers: { Cookie: cookie } }).then((r) => r.text());
    expect(sim.picoSimultaneas).toBe(1);
  });

  it('o item é derivado do contrato dourado e confere com ele', () => {
    const item = montarItem({ cd_chamado: 1, st_chamado: 8, cd_atendente: 393 });
    expect(Object.keys(item).sort()).toEqual(Object.keys(CONTRATO_DOURADO.pesquisa.item).sort());
    expect(conferirItem(item)).toEqual({ essenciais: [], usados: [], novos: [] });
    expect(item.ds_status).toBe('Aguardando solicitante');
    expect(valorPadrao(['null', 'string'])).toBe('');
    expect(valorPadrao(['null'])).toBeNull();
    expect(valorPadrao(['array'])).toEqual([]);
  });

  it('deriva remove, altera e adiciona campos; limparDeriva restaura', async () => {
    sim = await SoftdeskSimulado.iniciar({ chamados: gerarMassa([{ cdAtendente: 393, status: 1, quantidade: 1 }]) });
    const cookie = await logar();
    const um = async () => ((await (await fetch(`${sim.url}/chamado/json`, { headers: { Cookie: cookie } })).json()) as { lista: Record<string, unknown>[] }).lista[0];
    sim.aplicarDeriva({ remover: ['nm_usuario'], alterar: { st_chamado: 'x' }, adicionar: { novo_campo: 1 } });
    const derivado = await um();
    expect(derivado).not.toHaveProperty('nm_usuario');
    expect(derivado.st_chamado).toBe('x');
    expect(derivado.novo_campo).toBe(1);
    sim.limparDeriva();
    const normal = await um();
    expect(conferirItem(normal)).toEqual({ essenciais: [], usados: [], novos: [] });
  });

  describe('gerarMassa', () => {
    it('é reprodutível, do mais novo para o mais antigo, com os grupos misturados', () => {
      const grupos = [
        { cdAtendente: 1, status: 1, quantidade: 10 },
        { cdAtendente: 1, status: 2, quantidade: 10 },
      ];
      const a = gerarMassa(grupos);
      const b = gerarMassa(grupos);
      expect(a).toEqual(b);
      expect(a).toHaveLength(20);
      expect(a.map((c) => c.cd_chamado)).toEqual([...a.map((c) => c.cd_chamado)].sort((x, y) => y - x));
      const primeiros10 = a.slice(0, 10).map((c) => c.st_chamado);
      expect(new Set(primeiros10).size).toBe(2);
      expect(gerarMassa(grupos, { embaralhar: false }).slice(0, 10).every((c) => c.st_chamado === 1)).toBe(true);
    });
  });
});
