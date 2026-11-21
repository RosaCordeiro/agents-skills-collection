import { executarEntrar } from '../../src/cli-entrar';
import { ClienteServico } from '../../src/presentation/mcp/cliente-servico';
import { sentinela } from '../simulador/apoio';
import { dormir } from '../simulador/consulta-apoio';
import { pastaTemporaria, removerPasta, subirServico, type Servico } from '../simulador/rest-apoio';
import { AbridorEspiao, postarLogin } from '../simulador/sessao-apoio';
import { SoftdeskSimulado } from '../simulador/softdesk-simulado';

/** `npm run entrar` (ARCH §8.1): contra o serviço no processo do teste; nenhum navegador real. */
describe('cli-entrar', () => {
  jest.setTimeout(30_000);
  let sim: SoftdeskSimulado;
  let svc: Servico | undefined;
  const pastas: string[] = [];
  const usuario = sentinela('USU');
  const senha = sentinela('SENHA');

  beforeEach(async () => {
    sim = await SoftdeskSimulado.iniciar({ credenciais: { usuario, senha } });
  });

  afterEach(async () => {
    await svc?.encerrar();
    svc = undefined;
    for (const p of pastas.splice(0)) removerPasta(p);
    await sim.fechar();
  });

  const cliente = (dir: string): ClienteServico => new ClienteServico({ diretorio: dir, iniciar: async () => false, timeoutMs: 20_000 });

  async function esperar(condicao: () => boolean, ms = 10_000): Promise<void> {
    const fim = Date.now() + ms;
    while (!condicao() && Date.now() < fim) await dormir(10);
    if (!condicao()) throw new Error('condição não atendida a tempo');
  }

  it('navegador não abriu: imprime o endereço da janela (só no terminal) e termina com 0 depois do login', async () => {
    const abridor = new AbridorEspiao(false);
    svc = await subirServico(sim, { substitutos: { abridorNavegador: abridor } });
    const linhas: string[] = [];
    const codigo = executarEntrar({
      cliente: cliente(svc.dir),
      saida: (l) => linhas.push(l),
      primeiraVerificacaoMs: 10,
      intervaloMs: 10,
    });
    await esperar(() => linhas.some((l) => l.startsWith('http://127.0.0.1:')));
    const url = linhas.find((l) => l.startsWith('http://127.0.0.1:')) as string;
    // é o endereço da janela que o serviço abriu (o mesmo que o abridor recebeu)
    expect(abridor.urls).toEqual([url]);
    expect(svc.svc.container.janelaLogin.enderecoManual()).toBe(url);
    expect(linhas.join('\n')).toContain('O navegador nao abriu sozinho');
    expect((await postarLogin(url, { u: usuario, s: senha })).status).toBe(200);
    expect(await codigo).toBe(0);
    const t = linhas.join('\n');
    expect(t).toContain('Sessao autenticada (perfil A).');
    // nunca senha nem usuário no terminal; o endereço aparece uma vez só
    expect(t.includes(senha)).toBe(false);
    expect(t.includes(usuario)).toBe(false);
    expect(linhas.filter((l) => l === url)).toHaveLength(1);
  });

  it('navegador abriu: não imprime endereço nenhum', async () => {
    svc = await subirServico(sim, { substitutos: { abridorNavegador: new AbridorEspiao(true) } });
    const linhas: string[] = [];
    const codigo = executarEntrar({
      cliente: cliente(svc.dir),
      saida: (l) => linhas.push(l),
      primeiraVerificacaoMs: 10,
      intervaloMs: 10,
    });
    await esperar(() => linhas.some((l) => l.includes('abriu no navegador')));
    let url: string | null = null;
    await esperar(() => (url = svc?.svc.container.janelaLogin.enderecoManual() ?? null) !== null);
    await postarLogin(url as unknown as string, { u: usuario, s: senha });
    expect(await codigo).toBe(0);
    expect(linhas.join('\n')).not.toContain('http://');
  });

  it('senha errada: código 1 com a mensagem fixa de CREDENCIAL, sem repetir senha nem usuário', async () => {
    svc = await subirServico(sim, { substitutos: { abridorNavegador: new AbridorEspiao(true) } });
    const linhas: string[] = [];
    const errada = sentinela('SENHA-ERRADA');
    const codigo = executarEntrar({ cliente: cliente(svc.dir), saida: (l) => linhas.push(l), primeiraVerificacaoMs: 10, intervaloMs: 10 });
    let url: string | null = null;
    await esperar(() => (url = svc?.svc.container.janelaLogin.enderecoManual() ?? null) !== null);
    await postarLogin(url as unknown as string, { u: usuario, s: errada });
    expect(await codigo).toBe(1);
    const t = linhas.join('\n');
    expect(t).toContain('Nao foi possivel entrar: CREDENCIAL.');
    expect(t.includes(errada)).toBe(false);
    expect(t.includes(usuario)).toBe(false);
  });

  it('já autenticado: devolve 0 sem abrir janela', async () => {
    const abridor = new AbridorEspiao(true);
    svc = await subirServico(sim, { substitutos: { abridorNavegador: abridor } });
    svc.svc.container.sessaoStore.guardar(await svc.svc.container.gateway.autenticar(usuario, senha, 'A'), {
      usuario,
      perfil: 'A',
      desde: new Date(),
    });
    const linhas: string[] = [];
    expect(await executarEntrar({ cliente: cliente(svc.dir), saida: (l) => linhas.push(l), primeiraVerificacaoMs: 10 })).toBe(0);
    expect(abridor.urls).toHaveLength(0);
  });

  it('serviço indisponível: código 1 com SERVICO_INDISPONIVEL e a orientação de como iniciar', async () => {
    const dir = pastaTemporaria();
    pastas.push(dir);
    const linhas: string[] = [];
    const codigo = await executarEntrar({ cliente: cliente(dir), saida: (l) => linhas.push(l), primeiraVerificacaoMs: 10, intervaloMs: 10 });
    expect(codigo).toBe(1);
    expect(linhas.join('\n')).toContain('SERVICO_INDISPONIVEL');
    expect(linhas.join('\n')).toContain('npm run servico');
  });
});
