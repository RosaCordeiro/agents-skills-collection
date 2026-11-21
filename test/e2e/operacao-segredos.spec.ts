import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { lerDescoberta } from '../../src/infraestructure/descoberta/arquivo-descoberta';
import { sentinela } from '../simulador/apoio';
import { dormir } from '../simulador/consulta-apoio';
import { gerarMassa } from '../simulador/dados';
import {
  chamarTool,
  conectarMcp,
  pararServicoDoDiretorio,
  processosNode,
  RAIZ,
  SERVICO_JS,
  type McpConectado,
} from '../simulador/mcp-apoio';
import { pastaTemporaria, portaFechada, portaLivre, removerPasta } from '../simulador/rest-apoio';
import { postarLogin } from '../simulador/sessao-apoio';
import { ROTAS_PERMITIDAS, SoftdeskSimulado } from '../simulador/softdesk-simulado';

/**
 * e2e de operação (ARCH §10): o serviço de verdade como processo filho (logger real, arquivos reais,
 * REST real) e o MCP de verdade falado por um cliente do SDK, contra o SoftDesk simulado.
 * Fecha VAL-01 (senha e cookies em lugar nenhum), VAL-19 (nada pessoal em log; só servico.json,
 * config.json e logs/ na pasta) e VAL-10 (o SoftDesk só recebe GET /login, POST /login e GET /chamado/json).
 * O navegador é substituído por um que não abre nada (`servico-sem-navegador.js`); o teste faz o POST do
 * formulário como o usuário faria.
 */

const MEU = 393;
const LANCADOR = path.join(RAIZ, 'test', 'simulador', 'servico-sem-navegador.js');

interface Filho {
  proc: ChildProcess;
  saida: { stdout: string; stderr: string };
  codigo: Promise<number | null>;
}

/** Ambiente limpo: só o necessário, nada herdado (nem credenciais reais da máquina). */
function lancar(env: Record<string, string>): Filho {
  const proc = spawn(process.execPath, [LANCADOR], {
    env: {
      PATH: process.env.PATH ?? '',
      SystemRoot: process.env.SystemRoot ?? '',
      TEMP: process.env.TEMP ?? '',
      TMP: process.env.TMP ?? '',
      SOFTDESK_LOCAL_NOTIFICAR: 'false',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const saida = { stdout: '', stderr: '' };
  proc.stdout?.on('data', (c: Buffer) => (saida.stdout += c.toString()));
  proc.stderr?.on('data', (c: Buffer) => (saida.stderr += c.toString()));
  const codigo = new Promise<number | null>((resolve) => proc.once('exit', (c) => resolve(c)));
  return { proc, saida, codigo };
}

function arquivosDe(dir: string): string[] {
  const achados: string[] = [];
  const visitar = (d: string): void => {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) visitar(p);
      else achados.push(p);
    }
  };
  if (fs.existsSync(dir)) visitar(dir);
  return achados;
}

describe('e2e: operação sem vazar segredo nem dado pessoal (VAL-01, VAL-10, VAL-19)', () => {
  jest.setTimeout(180_000);

  let sim: SoftdeskSimulado;
  let dir: string;
  let filho: Filho | undefined;
  let mcp: McpConectado | undefined;

  const usuario = sentinela('USU');
  const senhaCerta = sentinela('SENHA-CERTA');
  const senhaErrada = sentinela('SENHA-ERRADA');
  const senhaRede = sentinela('SENHA-REDE');
  const titulo = sentinela('TITULO-SECRETO');
  const pessoa = sentinela('PESSOA');

  beforeAll(() => {
    execFileSync(process.execPath, [path.join(RAIZ, 'node_modules', 'typescript', 'bin', 'tsc')], { cwd: RAIZ, timeout: 120_000 });
  }, 130_000);

  beforeEach(async () => {
    sim = await SoftdeskSimulado.iniciar({
      chamados: gerarMassa([
        { cdAtendente: MEU, status: 1, quantidade: 5, titulo, solicitantes: [pessoa] },
        { cdAtendente: MEU, status: 3, quantidade: 2, titulo, solicitantes: [pessoa] },
        { cdAtendente: 555, status: 1, quantidade: 2, titulo, solicitantes: [pessoa] },
      ]),
      credenciais: { usuario, senha: senhaCerta },
    });
    dir = pastaTemporaria();
  });

  afterEach(async () => {
    await mcp?.fechar().catch(() => undefined);
    mcp = undefined;
    await pararServicoDoDiretorio(dir);
    if (filho && filho.proc.exitCode === null) filho.proc.kill();
    filho = undefined;
    await sim.fechar();
    removerPasta(dir);
  });

  async function esperarDescoberta(ms = 20_000): Promise<NonNullable<ReturnType<typeof lerDescoberta>>> {
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
      const d = lerDescoberta(dir);
      if (d) return d;
      await dormir(50);
    }
    throw new Error('o serviço não gravou o arquivo de descoberta');
  }

  it('login certo, senha errada e rede fora: nenhuma senha, cookie, título, nome ou usuário em log, stdout, stderr, respostas ou arquivos', async () => {
    const porta = await portaLivre();
    // config.json é parte do que pode existir na pasta (VAL-19); o conteúdo é válido e sem segredo.
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ cdAtendente: MEU }), 'utf8');
    filho = lancar({ SOFTDESK_LOCAL_DIR: dir, SOFTDESK_LOCAL_BASE_URL: sim.url, SOFTDESK_LOCAL_PORTA: String(porta) });
    const desc = await esperarDescoberta();
    const rest = async (caminho: string, metodo = 'GET'): Promise<string> => {
      const r = await fetch(`http://127.0.0.1:${desc.porta}${caminho}`, {
        method: metodo,
        headers: { Authorization: `Bearer ${desc.token}` },
      });
      return r.text();
    };

    mcp = await conectarMcp({
      SOFTDESK_LOCAL_DIR: dir,
      SOFTDESK_LOCAL_BASE_URL: sim.url,
      SOFTDESK_LOCAL_PORTA: String(porta),
      SOFTDESK_LOCAL_NOTIFICAR: 'false',
    });

    /** Tudo o que voltou por REST ou MCP (e o que a janela devolveu ao "navegador"). */
    const respostas: string[] = [];
    /** Respostas em que o usuário aparece por desenho (estado da sessão, RN-13: só ali). */
    const respostasComUsuario: string[] = [];

    async function entrarPeloMcp(senha: string): Promise<{ sucesso: boolean; codigo?: string }> {
      const pedido = chamarTool(mcp!.client, 'softdesk_entrar', {}, 150_000);
      let url: string | null = null;
      for (let i = 0; i < 500 && !url; i++) {
        const j = JSON.parse(await rest('/v1/sessao/janela')) as { dados?: { url?: string | null } };
        url = j.dados?.url ?? null;
        if (!url) await dormir(20);
      }
      if (!url) throw new Error('a janela de login não abriu');
      respostas.push((await postarLogin(url, { u: usuario, s: senha })).corpo);
      const r = await pedido;
      // O login aceito devolve o estado da sessão, onde o usuário aparece por desenho (RN-13).
      (r.isError ? respostas : respostasComUsuario).push(r.texto);
      return { sucesso: !r.isError, codigo: r.json?.error?.code };
    }

    // 1. Senha errada → CREDENCIAL.
    const errada = await entrarPeloMcp(senhaErrada);
    expect(errada).toEqual({ sucesso: false, codigo: 'CREDENCIAL' });

    // 2. Rede fora (o SoftDesk responde 500 ao login) → REDE.
    sim.login = '500';
    const rede = await entrarPeloMcp(senhaRede);
    expect(rede).toEqual({ sucesso: false, codigo: 'REDE' });
    sim.login = 'ok';

    // 3. Login certo, e as consultas que mexem com título e nome de pessoa.
    expect(await entrarPeloMcp(senhaCerta)).toEqual({ sucesso: true, codigo: undefined });
    const fila = await chamarTool(mcp.client, 'softdesk_minha_fila', { limite: 50 });
    respostas.push(fila.texto);
    expect(fila.isError).toBe(false);
    const itens = fila.json.dados.itens as Array<{ codigo: number; titulo: string; solicitante: string }>;
    expect(itens.length).toBe(5);
    // as respostas trazem mesmo título e nome (a busca nos logs não é vazia de sentido)
    expect(itens.every((i) => i.titulo.includes(titulo) && i.solicitante === pessoa)).toBe(true);
    for (const args of [
      { solicitante_nome: pessoa.slice(0, 8) },
      { titulo_contem: titulo.slice(0, 10) },
    ]) {
      const r = await chamarTool(mcp.client, 'softdesk_pesquisar', { atendente: [MEU], ...args });
      respostas.push(r.texto);
    }
    respostas.push((await chamarTool(mcp.client, 'softdesk_chamado_completo', { codigo: itens[0].codigo })).texto);
    respostas.push((await chamarTool(mcp.client, 'softdesk_saude')).texto);
    respostasComUsuario.push((await chamarTool(mcp.client, 'softdesk_estado_sessao')).texto);
    respostas.push(await rest('/v1/saude'));
    respostas.push(await rest('/v1/chamados/' + itens[0].codigo));
    respostasComUsuario.push(await rest('/v1/sessao'));

    // 4. Parada limpa pela rota; só então se lê o que ficou em disco.
    await mcp.fechar();
    const stderrMcp = mcp.stderr();
    mcp = undefined;
    expect((JSON.parse(await rest('/v1/servico/parar', 'POST')) as { dados: unknown }).dados).toEqual({ parando: true });
    expect(await filho.codigo).toBe(0);
    expect(await portaFechada(desc.porta)).toBe(true);

    // --- VAL-19: o que há na pasta ---
    const nomes = fs.readdirSync(dir).sort();
    expect(nomes.every((n) => ['servico.json', 'config.json', 'logs'].includes(n))).toBe(true);
    expect(nomes).toEqual(expect.arrayContaining(['config.json', 'logs']));
    const arquivos = arquivosDe(dir);
    const arquivosDeLog = arquivos.filter((p) => path.relative(dir, p).startsWith('logs'));
    expect(arquivosDeLog.length).toBeGreaterThan(0);
    const textoLogs = arquivosDeLog.map((p) => fs.readFileSync(p, 'utf8')).join('\n');
    // O log existe e tem conteúdo de verdade (a busca abaixo não é vácuo).
    expect(textoLogs).toContain('softdesk_http');
    expect(textoLogs).toContain('softdesk_login_recusado');
    expect(textoLogs).toContain('softdesk_rede');

    const doProcesso = [filho.saida.stdout, filho.saida.stderr, stderrMcp];
    const emDisco = arquivos.map((p) => fs.readFileSync(p, 'utf8'));
    const cookies = sim.cookiesEmitidos();
    expect(cookies.length).toBeGreaterThan(3);

    // --- VAL-01: senha e cookies em lugar nenhum ---
    const lugaresSenha = [...doProcesso, ...emDisco, ...respostas, ...respostasComUsuario];
    for (const segredo of [senhaCerta, senhaErrada, senhaRede, ...cookies]) {
      expect(lugaresSenha.some((t) => t.includes(segredo))).toBe(false);
    }

    // --- VAL-19: sem título, nome, usuário nem cookie em log, stdout, stderr nem arquivo ---
    for (const dado of [titulo, pessoa, usuario, ...cookies]) {
      expect([...doProcesso, ...emDisco].some((t) => t.includes(dado))).toBe(false);
    }
    // O token do REST não vai para log nem para saída (só existe em servico.json).
    const semDescoberta = arquivos.filter((p) => path.basename(p) !== 'servico.json').map((p) => fs.readFileSync(p, 'utf8'));
    expect([...doProcesso, ...semDescoberta].some((t) => t.includes(desc.token))).toBe(false);
    // O usuário só aparece onde o desenho manda (estado da sessão), e a senha jamais.
    expect(respostas.some((t) => t.includes(usuario))).toBe(false);

    // --- VAL-10: o SoftDesk só viu as três chamadas somente leitura ---
    const vistas = [...new Set(sim.registro.map((r) => `${r.metodo} ${r.caminho}`))].sort();
    expect(vistas).toEqual([...ROTAS_PERMITIDAS].sort());
    expect(sim.logins.length).toBe(3); // errada, rede, certa: o resto nunca fez login
  });

  it('nenhum processo do serviço fica de pé depois dos testes', async () => {
    // Ignora serviços que já existiam na máquina (por exemplo o serviço real do usuário, iniciado pelo MCP dele):
    // o teste só prova que o serviço que ELE iniciou não fica de pé.
    const jaExistiam = new Set(processosNode(SERVICO_JS).map((p) => p.pid));
    const porta = await portaLivre();
    filho = lancar({ SOFTDESK_LOCAL_DIR: dir, SOFTDESK_LOCAL_BASE_URL: sim.url, SOFTDESK_LOCAL_PORTA: String(porta) });
    const desc = await esperarDescoberta();
    await pararServicoDoDiretorio(dir);
    expect(await filho.codigo).toBe(0);
    expect(await portaFechada(desc.porta)).toBe(true);
    expect(processosNode(SERVICO_JS).filter((p) => !jaExistiam.has(p.pid))).toEqual([]);
    expect(processosNode(LANCADOR).filter((p) => p.pid === desc.pid)).toEqual([]);
  });
});
