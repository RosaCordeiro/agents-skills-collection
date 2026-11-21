import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { lerDescoberta } from '../../src/infraestructure/descoberta/arquivo-descoberta';
import { MENSAGEM_PORTA_OCUPADA } from '../../src/presentation/rest/servidor';
import { dormir } from '../simulador/consulta-apoio';
import { pastaTemporaria, portaFechada, portaLivre, removerPasta } from '../simulador/rest-apoio';
import { SoftdeskSimulado } from '../simulador/softdesk-simulado';

/**
 * e2e (ARCH §10): o serviço como processo filho (`dist/servico.js`), com diretório temporário e o
 * simulador no processo do teste. Nada aqui abre a janela de login nem o navegador.
 */

const RAIZ = path.resolve(__dirname, '..', '..');
const SERVICO_JS = path.join(RAIZ, 'dist', 'servico.js');

interface Filho {
  proc: ChildProcess;
  saida: { stdout: string; stderr: string };
  codigo: Promise<number | null>;
}

function lancar(env: Record<string, string>): Filho {
  const proc = spawn(process.execPath, [SERVICO_JS], {
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

async function esperarDescoberta(dir: string, ms = 15_000): Promise<ReturnType<typeof lerDescoberta>> {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    const d = lerDescoberta(dir);
    if (d) return d;
    await dormir(50);
  }
  return null;
}

describe('e2e: servico.js como processo filho', () => {
  jest.setTimeout(60_000);
  let sim: SoftdeskSimulado;
  const dirs: string[] = [];
  const filhos: Filho[] = [];

  beforeAll(() => {
    // Garante o dist atualizado (o `npm test` não compila sozinho).
    execFileSync(process.execPath, [path.join(RAIZ, 'node_modules', 'typescript', 'bin', 'tsc')], {
      cwd: RAIZ,
      timeout: 120_000,
    });
  }, 130_000);

  beforeEach(async () => {
    sim = await SoftdeskSimulado.iniciar();
  });

  afterEach(async () => {
    for (const f of filhos.splice(0)) {
      if (f.proc.exitCode === null) f.proc.kill();
    }
    await sim.fechar();
    for (const d of dirs.splice(0)) removerPasta(d);
  });

  function ambiente(porta: number, dir: string): Record<string, string> {
    return {
      SOFTDESK_LOCAL_DIR: dir,
      SOFTDESK_LOCAL_BASE_URL: sim.url,
      SOFTDESK_LOCAL_PORTA: String(porta),
    };
  }

  const rest = (porta: number, token: string, caminho: string, metodo = 'GET') =>
    fetch(`http://127.0.0.1:${porta}${caminho}`, { method: metodo, headers: { Authorization: `Bearer ${token}` } });

  it('sobe, grava a descoberta, atende o REST, recusa segunda instância na mesma porta e para limpo pela rota', async () => {
    const dir = pastaTemporaria();
    dirs.push(dir);
    const porta = await portaLivre();
    const a = lancar(ambiente(porta, dir));
    filhos.push(a);

    const desc = await esperarDescoberta(dir);
    expect(desc).not.toBeNull();
    expect(desc?.porta).toBe(porta);
    expect(desc?.pid).toBe(a.proc.pid);
    expect(desc?.token).toMatch(/^[0-9a-f]{64}$/);
    expect(desc?.versao).toBe(JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8')).version);
    const token = desc?.token as string;

    const info = await (await rest(porta, token, '/v1/servico')).json();
    expect(info.dados.pid).toBe(a.proc.pid);
    // Sem token: 401.
    expect((await fetch(`http://127.0.0.1:${porta}/v1/servico`)).status).toBe(401);

    // Saúde sem sessão: confere a página de login no simulador, sem abrir janela.
    const saude = await (await rest(porta, token, '/v1/saude')).json();
    expect(saude.dados.modo).toBe('login');

    // Instância única: a segunda, na mesma porta, sai com a mensagem; o arquivo da primeira fica intacto.
    const dir2 = pastaTemporaria();
    dirs.push(dir2);
    const b = lancar(ambiente(porta, dir2));
    filhos.push(b);
    expect(await b.codigo).toBe(1);
    expect(b.saida.stderr).toContain(MENSAGEM_PORTA_OCUPADA);
    expect(lerDescoberta(dir2)).toBeNull();
    expect(lerDescoberta(dir)).toEqual(desc);
    expect((await rest(porta, token, '/v1/servico')).status).toBe(200);

    // Parada limpa pela rota: arquivo apagado, porta liberada, processo sai com 0.
    const parar = await rest(porta, token, '/v1/servico/parar', 'POST');
    expect((await parar.json()).dados).toEqual({ parando: true });
    expect(await a.codigo).toBe(0);
    expect(lerDescoberta(dir)).toBeNull();
    expect(await portaFechada(porta)).toBe(true);
  });

  it('RNF-02: o token do REST é novo a cada início do serviço (dois inícios no mesmo diretório, tokens diferentes)', async () => {
    const dir = pastaTemporaria();
    dirs.push(dir);
    const porta = await portaLivre();
    const tokens: string[] = [];
    for (let i = 0; i < 2; i++) {
      const f = lancar(ambiente(porta, dir));
      filhos.push(f);
      const desc = await esperarDescoberta(dir);
      expect(desc).not.toBeNull();
      tokens.push(desc?.token as string);
      await rest(porta, desc?.token as string, '/v1/servico/parar', 'POST');
      expect(await f.codigo).toBe(0);
      expect(lerDescoberta(dir)).toBeNull();
    }
    expect(tokens[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens[1]).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens[1]).not.toBe(tokens[0]);
  });

  it('o diretório só tem servico.json e logs/; nenhum token em log, stdout ou stderr; só GET /login ao SoftDesk (RN-01)', async () => {
    const dir = pastaTemporaria();
    dirs.push(dir);
    const porta = await portaLivre();
    const f = lancar(ambiente(porta, dir));
    filhos.push(f);
    const desc = await esperarDescoberta(dir);
    const token = desc?.token as string;
    expect(token).toBeTruthy();
    await rest(porta, token, '/v1/saude');
    await fetch(`http://127.0.0.1:${porta}/v1/servico`, { headers: { Authorization: 'Bearer errado-enviado-pelo-teste' } });
    await rest(porta, token, '/v1/servico/parar', 'POST');
    expect(await f.codigo).toBe(0);

    const nomes = fs.readdirSync(dir).sort();
    expect(nomes.every((n) => ['logs', 'servico.json'].includes(n))).toBe(true);
    const arquivosDeLog: string[] = [];
    const logs = path.join(dir, 'logs');
    if (fs.existsSync(logs)) for (const n of fs.readdirSync(logs)) arquivosDeLog.push(path.join(logs, n));
    const textos = [f.saida.stdout, f.saida.stderr, ...arquivosDeLog.map((p) => fs.readFileSync(p, 'utf8'))].join('\n');
    expect(textos).not.toContain(token);
    expect(textos).not.toContain('errado-enviado-pelo-teste');
    for (const c of sim.cookiesEmitidos()) expect(textos).not.toContain(c);

    for (const r of sim.registro) expect(['GET /login', 'POST /login', 'GET /chamado/json']).toContain(`${r.metodo} ${r.caminho}`);
    expect(sim.registro.every((r) => r.metodo === 'GET' && r.caminho === '/login')).toBe(true);
  });

  it('configuração inválida impede o início, com mensagem sobre a chave (sem valor) e código 1', async () => {
    const dir = pastaTemporaria();
    dirs.push(dir);
    const f = lancar({ ...ambiente(await portaLivre(), dir), SOFTDESK_LOCAL_PERFIL_PADRAO: 'ZZ' });
    filhos.push(f);
    expect(await f.codigo).toBe(1);
    expect(f.saida.stderr).toContain('SOFTDESK_LOCAL_PERFIL_PADRAO');
    expect(lerDescoberta(dir)).toBeNull();
  });
});
