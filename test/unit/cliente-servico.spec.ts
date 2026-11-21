import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { ClienteServico, TIMEOUT_PADRAO_MS } from '../../src/presentation/mcp/cliente-servico';
import { TEMPO_MAX_INICIO_MS, ambienteMinimo, iniciarServicoEmSegundoPlano, opcoesNodeSeguras } from '../../src/presentation/mcp/iniciar-servico';
import { gravarDescoberta } from '../../src/infraestructure/descoberta/arquivo-descoberta';
import { pastaTemporaria, portaLivre, removerPasta } from '../simulador/rest-apoio';

/**
 * Cliente REST do MCP e início automático (ARCH §6 F9, §7.2): cabeçalhos enviados, corpo devolvido sem
 * alterar, descoberta lida a cada chamada, 401 e conexão recusada disparam o início, e a falha do início
 * vira `SERVICO_INDISPONIVEL` no formato do envelope, dentro do tempo configurado.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Visto {
  metodo: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  corpo: string;
}

describe('cliente do serviço (MCP) e início automático', () => {
  const dirs: string[] = [];
  const servidores: http.Server[] = [];

  afterEach(async () => {
    for (const s of servidores.splice(0)) {
      s.closeAllConnections();
      await new Promise<void>((r) => s.close(() => r()));
    }
    for (const d of dirs.splice(0)) removerPasta(d);
  });

  const dirNovo = (): string => {
    const d = pastaTemporaria();
    dirs.push(d);
    return d;
  };

  async function falso(
    responder: (v: Visto) => { status: number; texto: string },
  ): Promise<{ porta: number; vistos: Visto[] }> {
    const vistos: Visto[] = [];
    const s = http.createServer((req, res) => {
      const partes: Buffer[] = [];
      req.on('data', (c: Buffer) => partes.push(c));
      req.on('end', () => {
        const v: Visto = { metodo: req.method ?? '', url: req.url ?? '', headers: req.headers, corpo: Buffer.concat(partes).toString() };
        vistos.push(v);
        const r = responder(v);
        res.writeHead(r.status, { 'Content-Type': 'application/json' });
        res.end(r.texto);
      });
    });
    servidores.push(s);
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
    return { porta: (s.address() as AddressInfo).port, vistos };
  }

  const gravar = (dir: string, porta: number, token: string): Promise<unknown> =>
    gravarDescoberta(dir, { porta, token, pid: process.pid, iniciado_em: new Date().toISOString(), versao: 't' }, { restringirAcl: false });

  it('o timeout padrão (310 s) fica acima do teto de 280 s da espera de login', () => {
    expect(TIMEOUT_PADRAO_MS).toBe(310_000);
    expect(TIMEOUT_PADRAO_MS).toBeGreaterThan(280_000);
  });

  it('ECONNRESET no meio do pedido NÃO inicia outro serviço nem repete o pedido: SERVICO_INDISPONIVEL (achado A-3)', async () => {
    const dir = dirNovo();
    let pedidos = 0;
    const s = http.createServer((req) => {
      pedidos++;
      req.socket.resetAndDestroy(); // RST: o cliente vê ECONNRESET depois de o pedido ter sido entregue
    });
    servidores.push(s);
    await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
    await gravar(dir, (s.address() as AddressInfo).port, 't');
    let inicios = 0;
    const cliente = new ClienteServico({ diretorio: dir, iniciar: async () => (inicios++, true) });
    const r = await cliente.chamar({ metodo: 'POST', caminho: '/v1/sessao/entrar' });
    expect(JSON.parse(r.texto).error.code).toBe('SERVICO_INDISPONIVEL');
    expect(inicios).toBe(0);
    expect(pedidos).toBe(1);
  });

  it('envia Bearer e X-Correlation-Id (UUID novo por chamada) e devolve o corpo recebido SEM alterar', async () => {
    const dir = dirNovo();
    const corpoServico = '{"success":true,  "dados":{"x":1},"correlation_id":"abc"}';
    const f = await falso(() => ({ status: 200, texto: corpoServico }));
    await gravar(dir, f.porta, 'token-do-teste');
    let iniciou = 0;
    const cliente = new ClienteServico({ diretorio: dir, iniciar: async () => (iniciou++, false) });

    const a = await cliente.chamar({ metodo: 'GET', caminho: '/v1/sessao' });
    const b = await cliente.chamar({ metodo: 'POST', caminho: '/v1/chamados/pesquisa', corpo: { codigo: 5 } });

    expect(a.texto).toBe(corpoServico);
    expect(a.sucesso).toBe(true);
    expect(iniciou).toBe(0);
    expect(f.vistos[0].headers.authorization).toBe('Bearer token-do-teste');
    expect(f.vistos[0].headers['x-correlation-id']).toMatch(UUID);
    expect(f.vistos[1].headers['x-correlation-id']).toMatch(UUID);
    expect(f.vistos[1].headers['x-correlation-id']).not.toBe(f.vistos[0].headers['x-correlation-id']);
    expect(f.vistos[1].metodo).toBe('POST');
    expect(JSON.parse(f.vistos[1].corpo)).toEqual({ codigo: 5 });
    expect(b.texto).toBe(corpoServico);
  });

  it('success=false do serviço vira sucesso=false e o texto continua o mesmo (404, 409 etc.)', async () => {
    const dir = dirNovo();
    const corpoErro = '{"success":false,"error":{"code":"NAO_ENCONTRADO"},"correlation_id":"c"}';
    const f = await falso(() => ({ status: 404, texto: corpoErro }));
    await gravar(dir, f.porta, 't');
    const r = await new ClienteServico({ diretorio: dir, iniciar: async () => false }).chamar({ metodo: 'GET', caminho: '/v1/chamados/1' });
    expect(r.sucesso).toBe(false);
    expect(r.texto).toBe(corpoErro);
  });

  it('lê o arquivo de descoberta a CADA chamada (porta e token novos valem na chamada seguinte)', async () => {
    const dir = dirNovo();
    const f1 = await falso(() => ({ status: 200, texto: '{"success":true,"dados":1,"correlation_id":"1"}' }));
    const f2 = await falso(() => ({ status: 200, texto: '{"success":true,"dados":2,"correlation_id":"2"}' }));
    const cliente = new ClienteServico({ diretorio: dir, iniciar: async () => false });
    await gravar(dir, f1.porta, 'um');
    expect(JSON.parse((await cliente.chamar({ metodo: 'GET', caminho: '/v1/sessao' })).texto).dados).toBe(1);
    await gravar(dir, f2.porta, 'dois');
    expect(JSON.parse((await cliente.chamar({ metodo: 'GET', caminho: '/v1/sessao' })).texto).dados).toBe(2);
    expect(f2.vistos[0].headers.authorization).toBe('Bearer dois');
  });

  it('arquivo ausente, conexão recusada e 401 disparam o início uma vez e repetem o pedido', async () => {
    const dir = dirNovo();
    const bom = await falso((v) =>
      v.headers.authorization === 'Bearer certo'
        ? { status: 200, texto: '{"success":true,"dados":"ok","correlation_id":"x"}' }
        : { status: 401, texto: '{"success":false,"error":{"code":"NAO_AUTORIZADO"},"correlation_id":"x"}' },
    );
    const fechada = await portaLivre();
    let inicios = 0;
    const cliente = new ClienteServico({
      diretorio: dir,
      iniciar: async () => {
        inicios++;
        await gravar(dir, bom.porta, 'certo');
        return true;
      },
    });

    // 1) arquivo ausente
    expect(JSON.parse((await cliente.chamar({ metodo: 'GET', caminho: '/v1/sessao' })).texto).dados).toBe('ok');
    expect(inicios).toBe(1);
    // 2) conexão recusada (arquivo aponta para porta sem ninguém)
    await gravar(dir, fechada, 'certo');
    expect(JSON.parse((await cliente.chamar({ metodo: 'GET', caminho: '/v1/sessao' })).texto).dados).toBe('ok');
    expect(inicios).toBe(2);
    // 3) 401 (token de um início anterior)
    await gravar(dir, bom.porta, 'velho');
    expect(JSON.parse((await cliente.chamar({ metodo: 'GET', caminho: '/v1/sessao' })).texto).dados).toBe('ok');
    expect(inicios).toBe(3);
  });

  it('início que falha: SERVICO_INDISPONIVEL no envelope §7.3, com a ação do log e sem token nem caminho', async () => {
    const dir = dirNovo();
    const cliente = new ClienteServico({ diretorio: dir, iniciar: async () => false });
    const r = await cliente.chamar({ metodo: 'GET', caminho: '/v1/sessao' }, 'cid-fixo');
    expect(r.sucesso).toBe(false);
    const j = JSON.parse(r.texto);
    expect(j.success).toBe(false);
    expect(j.error.code).toBe('SERVICO_INDISPONIVEL');
    expect(j.error.acao).toContain('%LOCALAPPDATA%\\softdesk-local\\logs');
    expect(j.correlation_id).toBe('cid-fixo');
    expect(j.janela).toBeUndefined();
  });

  it('resposta que não é envelope (corpo qualquer) vira SERVICO_INDISPONIVEL, sem repassar o corpo', async () => {
    const dir = dirNovo();
    const f = await falso(() => ({ status: 200, texto: 'SEGREDO-no-corpo <html>' }));
    await gravar(dir, f.porta, 't');
    const r = await new ClienteServico({ diretorio: dir, iniciar: async () => false }).chamar({ metodo: 'GET', caminho: '/v1/sessao' });
    expect(JSON.parse(r.texto).error.code).toBe('SERVICO_INDISPONIVEL');
    expect(r.texto).not.toContain('SEGREDO');
  });

  it('pedidos simultâneos no mesmo MCP compartilham um único início', async () => {
    const dir = dirNovo();
    const bom = await falso(() => ({ status: 200, texto: '{"success":true,"dados":1,"correlation_id":"x"}' }));
    let inicios = 0;
    const cliente = new ClienteServico({
      diretorio: dir,
      iniciar: async () => {
        inicios++;
        await new Promise((r) => setTimeout(r, 150));
        await gravar(dir, bom.porta, 't');
        return true;
      },
    });
    const rs = await Promise.all([1, 2, 3].map(() => cliente.chamar({ metodo: 'GET', caminho: '/v1/sessao' })));
    expect(rs.every((r) => r.sucesso)).toBe(true);
    expect(inicios).toBe(1);
  });

  describe('iniciarServicoEmSegundoPlano (tempo e executável injetáveis, CA-17)', () => {
    it('RN-15 / VAL-27: o prazo padrão do início automático é de 10 s', () => {
      expect(TEMPO_MAX_INICIO_MS).toBe(10_000);
    });

    it('executável inexistente: falha logo (antes do tempo máximo) e não grava nada', async () => {
      const dir = dirNovo();
      const t0 = Date.now();
      const ok = await iniciarServicoEmSegundoPlano({
        diretorio: dir,
        executavel: path.join(dir, 'nao-existe.exe'),
        caminhoServico: __filename,
        tempoMaxMs: 5_000,
      });
      expect(ok).toBe(false);
      // Falha imediata (sem esperar os 5 s do prazo); folga larga para máquina carregada.
      expect(Date.now() - t0).toBeLessThan(4_500);
      expect(fs.readdirSync(dir)).toEqual([]);
    });

    it('caminho do serviço inexistente: falha logo', async () => {
      const dir = dirNovo();
      const t0 = Date.now();
      const ok = await iniciarServicoEmSegundoPlano({ diretorio: dir, caminhoServico: path.join(dir, 'servico.js'), tempoMaxMs: 5_000 });
      expect(ok).toBe(false);
      expect(Date.now() - t0).toBeLessThan(4_500);
    });

    it('serviço que sobe mas nunca grava a descoberta: desiste no tempo máximo configurado (não antes, não muito depois)', async () => {
      const dir = dirNovo();
      const script = path.join(dir, 'morre.js');
      fs.writeFileSync(script, 'process.exit(0);\n');
      const t0 = Date.now();
      const ok = await iniciarServicoEmSegundoPlano({ diretorio: dir, caminhoServico: script, tempoMaxMs: 1_200, intervaloMs: 50 });
      const gasto = Date.now() - t0;
      expect(ok).toBe(false);
      expect(gasto).toBeGreaterThanOrEqual(1_100);
      expect(gasto).toBeLessThan(6_000);
    });

    it('o serviço sobe com cwd na pasta do repo do serviço (pai do dist) e sem as credenciais de outros MCPs (A-5, A-6)', async () => {
      const dir = dirNovo();
      const repo = path.join(dir, 'repo');
      fs.mkdirSync(path.join(repo, 'dist'), { recursive: true });
      const saida = path.join(dir, 'saida.json');
      fs.writeFileSync(
        path.join(repo, 'dist', 'servico.js'),
        `require('fs').writeFileSync(${JSON.stringify(saida)}, JSON.stringify({cwd: process.cwd(), outro: Boolean(process.env.OUTRO_TOKEN_TESTE_SD), mantida: process.env.SOFTDESK_LOCAL_TESTE_SD === 'x', path: Boolean(process.env.PATH || process.env.Path)}));`,
      );
      process.env.OUTRO_TOKEN_TESTE_SD = 'valor-qualquer';
      process.env.SOFTDESK_LOCAL_TESTE_SD = 'x';
      try {
        await iniciarServicoEmSegundoPlano({
          diretorio: path.join(dir, 'sem-descoberta'),
          caminhoServico: path.join(repo, 'dist', 'servico.js'),
          tempoMaxMs: 3_000,
          intervaloMs: 50,
        });
        // Espera ativa com prazo: o processo destacado pode demorar a subir em máquina carregada.
        const fim = Date.now() + 15_000;
        while (!fs.existsSync(saida) && Date.now() < fim) await new Promise((r) => setTimeout(r, 50));
        if (!fs.existsSync(saida)) throw new Error('o serviço destacado não gravou saida.json em 15 s');
      } finally {
        delete process.env.OUTRO_TOKEN_TESTE_SD;
        delete process.env.SOFTDESK_LOCAL_TESTE_SD;
      }
      const v = JSON.parse(fs.readFileSync(saida, 'utf8')) as { cwd: string; outro: boolean; mantida: boolean; path: boolean };
      expect(fs.realpathSync(v.cwd)).toBe(fs.realpathSync(repo));
      expect(v.outro).toBe(false);
      expect(v.mantida).toBe(true);
      expect(v.path).toBe(true);
    });

    it('ambienteMinimo: só variáveis da lista de permissão, sem diferenciar maiúsculas', () => {
      const r = ambienteMinimo({ Path: 'p', SystemRoot: 'c', SOFTDESK_LOCAL_DIR: 'd', LOG_LEVEL: 'info', TOKEN_X: 't', Foo: 'f' });
      expect(Object.keys(r).sort()).toEqual(['LOG_LEVEL', 'Path', 'SOFTDESK_LOCAL_DIR', 'SystemRoot']);
    });

    it('ambienteMinimo (REVIEW-002 achado 2): preserva CA corporativa e proxy (NODE_EXTRA_CA_CERTS, SSL_CERT_FILE, HTTP(S)_PROXY, NO_PROXY, NODE_OPTIONS) sem credenciais', () => {
      const r = ambienteMinimo({
        NODE_EXTRA_CA_CERTS: 'a', SSL_CERT_FILE: 'b', https_proxy: 'c', HTTP_PROXY: 'd', no_proxy: 'e', NODE_OPTIONS: '--use-openssl-ca',
        SOFTDESK_SENHA: 'x', SOFTDESK_USUARIO: 'y', GITLAB_TOKEN: 'z',
      });
      expect(Object.keys(r).sort()).toEqual(['HTTP_PROXY', 'NODE_EXTRA_CA_CERTS', 'NODE_OPTIONS', 'SSL_CERT_FILE', 'https_proxy', 'no_proxy']);
      expect(r.NODE_OPTIONS).toBe('--use-openssl-ca');
      expect('SOFTDESK_SENHA' in r || 'SOFTDESK_USUARIO' in r || 'GITLAB_TOKEN' in r).toBe(false);
    });

    it('NODE_OPTIONS segue sem as opções que carregam código (--require, --import, --inspect...)', () => {
      expect(opcoesNodeSeguras('--use-system-ca --require ./x.js --max-old-space-size=512 -r y.js --import=z --inspect=0.0.0.0:9229')).toBe(
        '--use-system-ca --max-old-space-size=512',
      );
      expect(ambienteMinimo({ NODE_OPTIONS: '--require ./x.js' }).NODE_OPTIONS).toBeUndefined();
    });

    it('com o serviço já respondendo, não lança outro processo', async () => {
      const dir = dirNovo();
      const f = await falso(() => ({ status: 200, texto: '{"success":true,"dados":{},"correlation_id":"x"}' }));
      await gravar(dir, f.porta, 't');
      const ok = await iniciarServicoEmSegundoPlano({
        diretorio: dir,
        executavel: path.join(dir, 'nao-deveria-rodar.exe'),
        caminhoServico: __filename,
        tempoMaxMs: 2_000,
      });
      expect(ok).toBe(true);
      expect(f.vistos[0].url).toBe('/v1/servico');
    });
  });
});
