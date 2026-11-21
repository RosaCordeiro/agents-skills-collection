import { execFile, execFileSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { lerDescoberta } from '../../src/infraestructure/descoberta/arquivo-descoberta';
import { dormir } from '../simulador/consulta-apoio';
import { pararServicoDoDiretorio, processosNode, RAIZ, SERVICO_JS, vivo } from '../simulador/mcp-apoio';
import { pastaTemporaria, portaFechada, portaLivre, removerPasta } from '../simulador/rest-apoio';
import { SoftdeskSimulado } from '../simulador/softdesk-simulado';

/**
 * Scripts de operação do Windows (ARCH §8.1): `iniciar-servico.ps1`, `parar-servico.ps1` e
 * `estado-servico.ps1` chamados de verdade com `powershell -File`, contra o serviço real (`dist/servico.js`)
 * numa pasta temporária e porta alternativa. Nenhuma janela de login, navegador ou balão é aberto.
 */

const SCRIPTS = path.join(RAIZ, 'scripts');

interface ResultadoPs {
  codigo: number;
  saida: string;
}

/** Espera ativa (até 20 s) até o processo existir e a linha de comando aparecer no Windows (o script lê dali). */
async function aguardarVisivel(pid: number): Promise<void> {
  const fim = Date.now() + 20_000;
  while (Date.now() < fim) {
    try {
      const linha = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`],
        { encoding: 'utf8', timeout: 30_000, windowsHide: true },
      ).trim();
      if (linha !== '') return;
    } catch {
      // tenta de novo até o prazo
    }
    await dormir(100);
  }
  throw new Error(`o processo ${pid} não apareceu na lista de processos em 20 s`);
}

/** Ambiente limpo: só o necessário, nada herdado (nem credenciais reais da máquina). */
function envLimpo(extra: Record<string, string> = {}): Record<string, string> {
  return {
    PATH: process.env.PATH ?? '',
    SystemRoot: process.env.SystemRoot ?? '',
    windir: process.env.windir ?? process.env.SystemRoot ?? '',
    // O PowerShell só resolve "node" para node.exe com o PATHEXT.
    PATHEXT: process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD',
    ComSpec: process.env.ComSpec ?? '',
    TEMP: process.env.TEMP ?? '',
    TMP: process.env.TMP ?? '',
    SOFTDESK_LOCAL_NOTIFICAR: 'false',
    ...extra,
  };
}

function rodarPs(script: string, args: string[], env: Record<string, string>): Promise<ResultadoPs> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(SCRIPTS, script), ...args],
      { env, timeout: 60_000, windowsHide: true },
      (erro, stdout, stderr) => {
        const codigo = erro ? (typeof (erro as NodeJS.ErrnoException & { code?: unknown }).code === 'number' ? ((erro as unknown as { code: number }).code) : 99) : 0;
        resolve({ codigo, saida: `${stdout}${stderr}` });
      },
    );
  });
}

describe('scripts .ps1 de operação (ARCH §8.1)', () => {
  jest.setTimeout(120_000);
  let sim: SoftdeskSimulado;
  const dirs: string[] = [];
  const filhos: ChildProcess[] = [];

  let preexistentes = new Set<number>();

  beforeAll(() => {
    preexistentes = new Set(processosNode(SERVICO_JS).map((p) => p.pid));
    execFileSync(process.execPath, [path.join(RAIZ, 'node_modules', 'typescript', 'bin', 'tsc')], { cwd: RAIZ, timeout: 120_000 });
  }, 130_000);

  beforeEach(async () => {
    sim = await SoftdeskSimulado.iniciar();
  });

  afterEach(async () => {
    for (const f of filhos.splice(0)) if (f.exitCode === null) f.kill();
    for (const d of dirs.splice(0)) {
      await pararServicoDoDiretorio(d);
      removerPasta(d);
    }
    await sim.fechar();
  });

  const novaPasta = (): string => {
    const d = pastaTemporaria();
    dirs.push(d);
    return d;
  };

  async function envServico(dir: string): Promise<{ env: Record<string, string>; porta: number }> {
    const porta = await portaLivre();
    return {
      porta,
      env: envLimpo({ SOFTDESK_LOCAL_DIR: dir, SOFTDESK_LOCAL_BASE_URL: sim.url, SOFTDESK_LOCAL_PORTA: String(porta) }),
    };
  }

  it('iniciar → já roda → estado → parar: ciclo completo contra o serviço real', async () => {
    const dir = novaPasta();
    const { env, porta } = await envServico(dir);

    // parar sem nada rodando: sem erro
    const vazio = await rodarPs('parar-servico.ps1', [], env);
    expect(vazio.codigo).toBe(0);
    expect(vazio.saida).toContain('nao esta rodando');
    const estadoParado = await rodarPs('estado-servico.ps1', [], env);
    expect(estadoParado.codigo).toBe(0);
    expect(estadoParado.saida).toContain('parado');

    // iniciar
    const inicio = await rodarPs('iniciar-servico.ps1', [], env);
    expect(inicio.saida).toContain('Servico iniciado');
    expect(inicio.codigo).toBe(0);
    const desc = lerDescoberta(dir);
    expect(desc).not.toBeNull();
    expect(desc?.porta).toBe(porta);
    expect(vivo(desc?.pid as number)).toBe(true);
    // o processo é o serviço de verdade (dist\servico.js), e o PS não deixou o token na saída
    expect(processosNode(SERVICO_JS).map((p) => p.pid)).toContain(desc?.pid);
    expect(inicio.saida.includes(desc?.token as string)).toBe(false);

    // iniciar de novo: só avisa
    const outra = await rodarPs('iniciar-servico.ps1', [], env);
    expect(outra.codigo).toBe(0);
    expect(outra.saida).toContain('ja esta rodando');
    expect(outra.saida).toContain(String(desc?.pid));
    expect(lerDescoberta(dir)).toEqual(desc);

    // estado: serviço e sessão, sem o token
    const estado = await rodarPs('estado-servico.ps1', [], env);
    expect(estado.codigo).toBe(0);
    expect(estado.saida).toContain('Servico:');
    expect(estado.saida).toContain('Sessao:');
    expect(estado.saida).toMatch(new RegExp('"pid":\\s+' + String(desc?.pid) + '\\b'));
    expect(estado.saida).toContain('SEM_SESSAO');
    expect(estado.saida.includes(desc?.token as string)).toBe(false);

    // parar: pela rota, processo some, arquivo apagado, porta livre
    const parada = await rodarPs('parar-servico.ps1', [], env);
    expect(parada.codigo).toBe(0);
    expect(parada.saida).toContain('Servico parado');
    expect(lerDescoberta(dir)).toBeNull();
    expect(vivo(desc?.pid as number)).toBe(false);
    expect(await portaFechada(porta)).toBe(true);
    // Só os processos criados por este teste (o serviço real do usuário pode estar rodando do mesmo dist).
    expect(processosNode(SERVICO_JS).filter((p) => !preexistentes.has(p.pid))).toEqual([]);
  });

  it('REVIEW-002 achado 2: iniciar-servico.ps1 passa ao serviço só a lista de permissão (CA, proxy, NODE_OPTIONS sem --require), sem credenciais do terminal', async () => {
    const dir = novaPasta();
    const saida = path.join(dir, 'ambiente.json');
    const stub = path.join(dir, 'servico-stub.js');
    fs.writeFileSync(
      stub,
      `const e = process.env; require('fs').writeFileSync(${JSON.stringify(saida)}, JSON.stringify({ outro: Boolean(e.OUTRO_TOKEN_TESTE_SD), senha: Boolean(e.SOFTDESK_SENHA), ca: e.NODE_EXTRA_CA_CERTS === 'ca.pem', proxy: e.HTTPS_PROXY === 'http://proxy:3128', noproxy: e.NO_PROXY === 'x', ssl: e.SSL_CERT_FILE === 's.pem', opcoes: e.NODE_OPTIONS || '', local: e.SOFTDESK_LOCAL_TESTE === 'ok' }));`,
    );
    const { env } = await envServico(dir);
    await rodarPs('iniciar-servico.ps1', ['-Servico', stub, '-TempoMaxSegundos', '3'], {
      ...env,
      OUTRO_TOKEN_TESTE_SD: 'valor',
      SOFTDESK_SENHA: 'valor',
      NODE_EXTRA_CA_CERTS: 'ca.pem',
      HTTPS_PROXY: 'http://proxy:3128',
      NO_PROXY: 'x',
      SSL_CERT_FILE: 's.pem',
      SOFTDESK_LOCAL_TESTE: 'ok',
      NODE_OPTIONS: '--use-openssl-ca --require ./nao-pode.js',
    });
    for (let i = 0; i < 100 && !fs.existsSync(saida); i++) await dormir(50);
    const v = JSON.parse(fs.readFileSync(saida, 'utf8')) as Record<string, unknown>;
    expect(v).toEqual({ outro: false, senha: false, ca: true, proxy: true, noproxy: true, ssl: true, opcoes: '--use-openssl-ca', local: true });
  });

  it('iniciar sem dist\\servico.js: código 1 e orientação; iniciar com serviço que sai logo: código 1', async () => {
    const dir = novaPasta();
    const { env } = await envServico(dir);
    const semArquivo = await rodarPs('iniciar-servico.ps1', ['-Servico', path.join(dir, 'nao-existe', 'servico.js')], env);
    expect(semArquivo.codigo).toBe(1);
    expect(semArquivo.saida).toContain('npm run build');

    // serviço que sai na hora (config inválida): o script não espera os 10 s inteiros e diz o que houve
    const invalido = await rodarPs('iniciar-servico.ps1', [], { ...env, SOFTDESK_LOCAL_PERFIL_PADRAO: 'ZZ' });
    expect(invalido.codigo).toBe(1);
    expect(invalido.saida).toContain('saiu logo ao iniciar');
    expect(lerDescoberta(dir)).toBeNull();
  });

  it('segunda instância na mesma porta: iniciar reconhece a que já roda (instância única, porta fixa)', async () => {
    const dirA = novaPasta();
    const { env, porta } = await envServico(dirA);
    expect((await rodarPs('iniciar-servico.ps1', [], env)).codigo).toBe(0);
    // outra pasta, mesma porta: o serviço novo sai (porta ocupada) e o script avisa o erro
    const dirB = novaPasta();
    const envB = { ...env, SOFTDESK_LOCAL_DIR: dirB };
    const r = await rodarPs('iniciar-servico.ps1', [], envB);
    expect(r.codigo).toBe(1);
    expect(r.saida).toContain('saiu logo ao iniciar');
    expect(lerDescoberta(dirB)).toBeNull();
    expect(lerDescoberta(dirA)).not.toBeNull();
    expect(await portaFechada(porta)).toBe(false);
  });

  it('parar com serviço que não responde: encerra o pid SÓ se a linha de comando é dist\\servico.js', async () => {
    const dir = novaPasta();
    const { env } = await envServico(dir);
    // "serviço" que travou: um node cuja linha de comando termina em dist\servico.js, sem porta nenhuma
    const falsa = path.join(novaPasta(), 'dist');
    fs.mkdirSync(falsa, { recursive: true });
    const falsoServico = path.join(falsa, 'servico.js');
    fs.writeFileSync(falsoServico, 'setInterval(() => {}, 1000);\n', 'utf8');
    const proc = spawn(process.execPath, [falsoServico], { stdio: 'ignore', windowsHide: true, env: envLimpo() });
    filhos.push(proc);
    const portaMorta = await portaLivre();
    fs.writeFileSync(
      path.join(dir, 'servico.json'),
      JSON.stringify({ porta: portaMorta, token: 'token-de-teste-sem-valor', pid: proc.pid, iniciado_em: new Date().toISOString(), versao: '0.0.0' }),
      'utf8',
    );
    await aguardarVisivel(proc.pid as number);
    expect(vivo(proc.pid as number)).toBe(true);

    const r = await rodarPs('parar-servico.ps1', [], env);
    expect(r.codigo).toBe(0);
    expect(r.saida).toContain('foi encerrado');
    for (let i = 0; i < 50 && vivo(proc.pid as number); i++) await dormir(100);
    expect(vivo(proc.pid as number)).toBe(false);
    expect(lerDescoberta(dir)).toBeNull();
  });

  it('parar serviço travado iniciado com barra normal (node dist/servico.js, como npm run servico): encerra o pid e limpa o arquivo (A-7)', async () => {
    const dir = novaPasta();
    const { env } = await envServico(dir);
    const falsa = path.join(novaPasta(), 'dist');
    fs.mkdirSync(falsa, { recursive: true });
    const falsoServico = path.join(falsa, 'servico.js');
    fs.writeFileSync(falsoServico, 'setInterval(() => {}, 1000);\n', 'utf8');
    const proc = spawn(process.execPath, [falsoServico.replace(/\\/g, '/')], { stdio: 'ignore', windowsHide: true, env: envLimpo() });
    filhos.push(proc);
    fs.writeFileSync(
      path.join(dir, 'servico.json'),
      JSON.stringify({ porta: await portaLivre(), token: 'token-de-teste-sem-valor', pid: proc.pid, iniciado_em: new Date().toISOString(), versao: '0.0.0' }),
      'utf8',
    );
    await aguardarVisivel(proc.pid as number);
    const r = await rodarPs('parar-servico.ps1', [], env);
    expect(r.codigo).toBe(0);
    expect(r.saida).toContain('foi encerrado');
    for (let i = 0; i < 50 && vivo(proc.pid as number); i++) await dormir(100);
    expect(vivo(proc.pid as number)).toBe(false);
    expect(lerDescoberta(dir)).toBeNull();
  });

  it('parar com pid reaproveitado por OUTRO node de caminho dist\\servico.js: processo criado depois do iniciado_em não é encerrado (A-7)', async () => {
    const dir = novaPasta();
    const { env } = await envServico(dir);
    const falsa = path.join(novaPasta(), 'dist');
    fs.mkdirSync(falsa, { recursive: true });
    const falsoServico = path.join(falsa, 'servico.js');
    fs.writeFileSync(falsoServico, 'setInterval(() => {}, 1000);\n', 'utf8');
    const outro = spawn(process.execPath, [falsoServico], { stdio: 'ignore', windowsHide: true, env: envLimpo() });
    filhos.push(outro);
    fs.writeFileSync(
      path.join(dir, 'servico.json'),
      JSON.stringify({ porta: await portaLivre(), token: 'token-de-teste-sem-valor', pid: outro.pid, iniciado_em: new Date(Date.now() - 3600_000).toISOString(), versao: '0.0.0' }),
      'utf8',
    );
    await aguardarVisivel(outro.pid as number);
    const r = await rodarPs('parar-servico.ps1', [], env);
    expect(r.codigo).toBe(0);
    expect(r.saida).toContain('pertence a outro programa');
    await dormir(500);
    expect(vivo(outro.pid as number)).toBe(true);
  });

  it('parar com pid reaproveitado por outro programa: NÃO encerra o processo e limpa o arquivo antigo', async () => {
    const dir = novaPasta();
    const { env } = await envServico(dir);
    const outro = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true, env: envLimpo() });
    filhos.push(outro);
    fs.writeFileSync(
      path.join(dir, 'servico.json'),
      JSON.stringify({ porta: await portaLivre(), token: 'token-de-teste-sem-valor', pid: outro.pid, iniciado_em: new Date().toISOString(), versao: '0.0.0' }),
      'utf8',
    );
    await aguardarVisivel(outro.pid as number);
    expect(vivo(outro.pid as number)).toBe(true);

    const r = await rodarPs('parar-servico.ps1', [], env);
    expect(r.codigo).toBe(0);
    expect(r.saida).toContain('pertence a outro programa');
    await dormir(500);
    expect(vivo(outro.pid as number)).toBe(true); // continua vivo: o script não o encerrou
    expect(lerDescoberta(dir)).toBeNull();
  });

  it('parar com arquivo antigo de um processo que já não existe: limpa e sai com 0; estado com serviço morto sai com 1', async () => {
    const dir = novaPasta();
    const { env } = await envServico(dir);
    const efemero = spawn(process.execPath, ['-e', '0'], { stdio: 'ignore', windowsHide: true, env: envLimpo() });
    await new Promise((r) => efemero.once('exit', r));
    fs.writeFileSync(
      path.join(dir, 'servico.json'),
      JSON.stringify({ porta: await portaLivre(), token: 'token-de-teste-sem-valor', pid: efemero.pid, iniciado_em: new Date().toISOString(), versao: '0.0.0' }),
      'utf8',
    );
    const estado = await rodarPs('estado-servico.ps1', [], env);
    expect(estado.codigo).toBe(1);
    expect(estado.saida).toContain('nao responde');
    const r = await rodarPs('parar-servico.ps1', [], env);
    expect(r.codigo).toBe(0);
    expect(r.saida).toContain('antigo removido');
    expect(lerDescoberta(dir)).toBeNull();
  });

  it('iniciar com arquivo antigo (processo morto): não confunde com serviço rodando e sobe um novo', async () => {
    const dir = novaPasta();
    const { env, porta } = await envServico(dir);
    fs.writeFileSync(
      path.join(dir, 'servico.json'),
      JSON.stringify({ porta: await portaLivre(), token: 'token-antigo-de-teste', pid: 1, iniciado_em: new Date().toISOString(), versao: '0.0.0' }),
      'utf8',
    );
    const r = await rodarPs('iniciar-servico.ps1', [], env);
    expect(r.codigo).toBe(0);
    expect(r.saida).toContain('Servico iniciado');
    const d = lerDescoberta(dir);
    expect(d?.porta).toBe(porta);
    expect(d?.token).not.toBe('token-antigo-de-teste');
  });
});
