import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { schemaCodigoChamado, schemaFila, schemaPesquisa } from '../../src/shared/schemas/entrada.schemas';
import { gerarMassa } from '../simulador/dados';
import { portaFechada, subirServico, type Servico } from '../simulador/rest-apoio';
import { requisitar } from '../simulador/sessao-apoio';
import { SoftdeskSimulado } from '../simulador/softdesk-simulado';

const MEU = 393;

describe('REST: proteção, rotas e entrada (fragmento 5)', () => {
  let sim: SoftdeskSimulado;
  let s: Servico;

  beforeEach(async () => {
    sim = await SoftdeskSimulado.iniciar({
      chamados: gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 6 }]),
    });
    s = await subirServico(sim);
  });

  afterEach(async () => {
    await s?.encerrar();
    await sim?.fechar();
  });

  const cru = (caminho: string, o: Parameters<typeof requisitar>[1] = {}) =>
    requisitar(`${s.base}${caminho}`, { ...o, headers: { Authorization: `Bearer ${s.token}`, ...(o.headers ?? {}) } });

  const logsRest = () =>
    s.logger.registros.filter((r) => (r.campos.event as { name: string }).name === 'rest');

  describe('VAL-11: proteção do REST', () => {
    it('com o token certo, o Host certo e sem Origin, a rota responde', async () => {
      const r = await s.chamar('/v1/servico');
      expect(r.status).toBe(200);
      expect(r.json.success).toBe(true);
    });

    it('sem token → 401 NAO_AUTORIZADO, e nenhuma operação roda', async () => {
      const r = await s.chamar('/v1/servico', { token: null });
      expect(r.status).toBe(401);
      expect(r.json.success).toBe(false);
      expect(r.json.error.code).toBe('NAO_AUTORIZADO');
      expect(typeof r.json.correlation_id).toBe('string');
      expect(sim.registro).toHaveLength(0);
    });

    it.each([
      ['do mesmo tamanho', (t: string) => (t[0] === 'a' ? 'b' : 'a') + t.slice(1)],
      ['mais curto', (t: string) => t.slice(0, 10)],
      ['mais longo', (t: string) => `${t}00`],
      ['vazio', () => 'x'],
    ])('token errado (%s) → 401', async (_n, alterar) => {
      const r = await s.chamar('/v1/sessao', { token: alterar(s.token) });
      expect(r.status).toBe(401);
      expect(r.json.error.code).toBe('NAO_AUTORIZADO');
    });

    it('esquema que não é Bearer → 401', async () => {
      const r = await cru('/v1/servico', { headers: { Authorization: `Basic ${s.token}` } });
      expect(r.status).toBe(401);
    });

    it('Host errado → 403, mesmo com o token certo', async () => {
      for (const host of [`localhost:${s.porta}`, `127.0.0.1:${s.porta + 1}`, '127.0.0.1', 'exemplo.com']) {
        const r = await cru('/v1/servico', { host });
        expect(r.status).toBe(403);
        expect(JSON.parse(r.corpo).error.code).toBe('NAO_AUTORIZADO');
      }
    });

    it('cabeçalho Origin presente → 403, mesmo com o token certo (bloqueia página de navegador)', async () => {
      for (const origin of ['http://exemplo.com', `http://127.0.0.1:${s.porta}`, 'null']) {
        const r = await cru('/v1/servico', { headers: { Origin: origin } });
        expect(r.status).toBe(403);
      }
    });

    it('Host errado vence a falta de token (403, não 401)', async () => {
      const r = await requisitar(`${s.base}/v1/servico`, { host: 'exemplo.com' });
      expect(r.status).toBe(403);
    });

    it('sem CORS: nenhuma resposta traz cabeçalho Access-Control-*', async () => {
      const ok = await s.chamar('/v1/servico');
      expect([...ok.headers.keys()].some((k) => k.startsWith('access-control-'))).toBe(false);
      const pre = await cru('/v1/servico', {
        metodo: 'OPTIONS',
        headers: { Origin: 'http://exemplo.com', 'Access-Control-Request-Method': 'GET' },
      });
      expect(pre.status).toBe(403);
      expect(Object.keys(pre.headers).some((k) => k.startsWith('access-control-'))).toBe(false);
    });

    it('o servidor escuta só em 127.0.0.1', async () => {
      const addr = s.svc.servidor.http.address() as { address: string; port: number };
      expect(addr.address).toBe('127.0.0.1');
      expect(addr.port).toBe(s.porta);
      // Nenhuma interface de rede que não seja loopback aceita conexão na porta.
      const externos = Object.values(os.networkInterfaces())
        .flat()
        .filter((i): i is NonNullable<typeof i> => !!i && i.family === 'IPv4' && !i.internal);
      for (const i of externos) {
        const abriu = await new Promise<boolean>((resolve) => {
          const sock = net.connect({ host: i.address, port: s.porta });
          sock.once('connect', () => {
            sock.destroy();
            resolve(true);
          });
          sock.once('error', () => resolve(false));
        });
        expect(abriu).toBe(false);
      }
    });

    it('registra rest/auth só com o motivo (sem token), com a keyword rest_nao_autorizado', async () => {
      const errado = 'TOKEN-ERRADO-ENVIADO-PELO-TESTE';
      await s.chamar('/v1/servico', { token: null });
      await s.chamar('/v1/servico', { token: errado });
      await cru('/v1/servico', { host: 'exemplo.com' });
      await cru('/v1/servico', { headers: { Origin: 'http://exemplo.com' } });
      const regs = logsRest().filter((r) => (r.campos.event as { action: string }).action === 'auth');
      expect(regs.map((r) => r.campos.motivo)).toEqual(['sem_token', 'token_errado', 'host', 'origin']);
      for (const r of regs) {
        expect(r.nivel).toBe('warn');
        expect(r.campos.keywords).toContain('rest_nao_autorizado');
      }
      const tudo = s.logger.texto();
      expect(tudo).not.toContain(s.token);
      expect(tudo).not.toContain(errado);
    });

    it('corpo acima de 16 KB → 413 FILTRO_INVALIDO; JSON inválido → 400 sem repetir o corpo', async () => {
      const grande = JSON.stringify({ palavra_chave: 'x'.repeat(20_000) });
      const r1 = await s.chamar('/v1/chamados/pesquisa', { metodo: 'POST', corpoBruto: grande });
      expect(r1.status).toBe(413);
      expect(r1.json.error.code).toBe('FILTRO_INVALIDO');
      const segredo = 'SEGREDO-NO-CORPO';
      const r2 = await s.chamar('/v1/chamados/pesquisa', { metodo: 'POST', corpoBruto: `{"palavra_chave": "${segredo}` });
      expect(r2.status).toBe(400);
      expect(r2.json.error.code).toBe('FILTRO_INVALIDO');
      expect(r2.texto).not.toContain(segredo);
      expect(sim.registro).toHaveLength(0);
    });

    it('um corpo de até 16 KB é aceito', async () => {
      const r = await s.chamar('/v1/chamados/pesquisa', {
        metodo: 'POST',
        corpo: { palavra_chave: 'x'.repeat(150) },
      });
      // Sem sessão: AGUARDANDO_LOGIN (409), não erro de corpo.
      expect(r.status).toBe(409);
      expect(r.json.error.code).toBe('AGUARDANDO_LOGIN');
    });
  });

  describe('rotas de §7.1', () => {
    it('rota desconhecida → 404 e método errado → 405 (depois da autenticação)', async () => {
      expect((await s.chamar('/v1/nao-existe')).status).toBe(404);
      expect((await s.chamar('/v1/fila', { metodo: 'POST' })).status).toBe(405);
      expect((await s.chamar('/v1/servico/parar')).status).toBe(405);
      expect((await s.chamar('/v1/nao-existe', { token: null })).status).toBe(401);
    });

    it('GET /v1/servico → { versao, pid, iniciado_em }', async () => {
      const r = await s.chamar('/v1/servico');
      expect(Object.keys(r.json.dados).sort()).toEqual(['iniciado_em', 'pid', 'versao']);
      expect(r.json.dados.pid).toBe(process.pid);
      expect(Number.isNaN(Date.parse(r.json.dados.iniciado_em))).toBe(false);
    });

    it('GET /v1/sessao sem sessão → SEM_SESSAO, sem abrir janela', async () => {
      const r = await s.chamar('/v1/sessao');
      expect(r.status).toBe(200);
      expect(r.json.dados.estado).toBe('SEM_SESSAO');
      expect(r.json.dados.janela.aberta).toBe(false);
      expect(s.abridor.urls).toHaveLength(0);
    });

    it('GET /v1/sessao/janela: sem janela → { aberta: false, url: null }; com janela → o endereço; as outras rotas nunca o trazem', async () => {
      const antes = await s.chamar('/v1/sessao/janela');
      expect(antes.json.dados).toEqual({ aberta: false, url: null, expira_em: null });
      expect(s.abridor.urls).toHaveLength(0);

      // Uma consulta sem sessão abre a janela (RN-14).
      const fila = await s.chamar('/v1/fila');
      expect(fila.status).toBe(409);
      expect(fila.json.error.code).toBe('AGUARDANDO_LOGIN');
      expect(fila.json.janela).toEqual({ aberta: true });

      const depois = await s.chamar('/v1/sessao/janela');
      expect(depois.json.dados.aberta).toBe(true);
      expect(depois.json.dados.url).toBe(s.abridor.urls[0]);
      expect(Number.isNaN(Date.parse(depois.json.dados.expira_em))).toBe(false);

      const token = new URL(s.abridor.urls[0]).searchParams.get('t') as string;
      const estado = await s.chamar('/v1/sessao');
      const saude = await s.chamar('/v1/saude');
      for (const r of [fila, estado, saude]) {
        expect(r.texto).not.toContain(token);
        expect(r.texto).not.toContain(s.abridor.urls[0]);
      }
    });

    it('GET /v1/chamados/{codigo}/atividades → 501 NAO_DISPONIVEL com a orientação do MCP oficial (stub do fragmento 9)', async () => {
      const r = await s.chamar('/v1/chamados/123/atividades');
      expect(r.status).toBe(501);
      expect(r.json.error.code).toBe('NAO_DISPONIVEL');
      expect(r.json.error.acao).toContain('dossie_chamado');
      expect(sim.registro).toHaveLength(0);
      const ruim = await s.chamar('/v1/chamados/abc/atividades');
      expect(ruim.status).toBe(400);
      expect(ruim.json.error.code).toBe('FILTRO_INVALIDO');
    });

    it('GET /v1/chamados/{codigo} com código que não é inteiro positivo → 400, zero requisições ao SoftDesk', async () => {
      for (const c of ['abc', '0', '-3', '1.5']) {
        const r = await s.chamar(`/v1/chamados/${c}`);
        expect(r.status).toBe(400);
        expect(r.json.error.code).toBe('FILTRO_INVALIDO');
      }
      expect(sim.registro).toHaveLength(0);
    });

    it('fila: inicio e limite em texto não numérico, zero ou negativo → 400 sem chamar o SoftDesk', async () => {
      for (const q of ['limite=abc', 'limite=0', 'limite=-1', 'inicio=-1', 'inicio=', 'limite=1&limite=2', 'solicitante_nome=']) {
        const r = await s.chamar(`/v1/fila?${q}`);
        expect(r.status).toBe(400);
        expect(r.json.error.code).toBe('FILTRO_INVALIDO');
      }
      expect(sim.registro).toHaveLength(0);
    });

    it('POST /v1/servico/parar → { parando: true }, apaga o arquivo de descoberta e libera a porta', async () => {
      const arquivo = path.join(s.dir, 'servico.json');
      expect(fs.existsSync(arquivo)).toBe(true);
      const r = await s.chamar('/v1/servico/parar', { metodo: 'POST' });
      expect(r.status).toBe(200);
      expect(r.json.dados).toEqual({ parando: true });
      await s.svc.aguardarParada();
      expect(fs.existsSync(arquivo)).toBe(false);
      expect(await portaFechada(s.porta)).toBe(true);
      const stop = s.logger.registros.find(
        (x) => (x.campos.event as { name: string; action: string }).name === 'servico' && (x.campos.event as { action: string }).action === 'stop',
      );
      expect(stop).toBeDefined();
    });
  });

  describe('VAL-15 (REST): nenhuma rota aceita senha', () => {
    const SENHA = 'SENTINELA-SENHA-REST-123';

    it('campo "senha" no corpo ou na query é recusado com FILTRO_INVALIDO, sem chamar o SoftDesk nem repetir o valor', async () => {
      const chamadas = [
        s.chamar('/v1/chamados/pesquisa', { metodo: 'POST', corpo: { senha: SENHA } }),
        s.chamar('/v1/chamados/pesquisa', { metodo: 'POST', corpo: { atendente: [393], senha: SENHA } }),
        s.chamar(`/v1/fila?senha=${SENHA}`),
        s.chamar('/v1/sessao/entrar', { metodo: 'POST', corpo: { usuario: 'fulano', senha: SENHA } }),
        s.chamar(`/v1/saude?senha=${SENHA}`),
        cru('/v1/sessao', {
          corpo: JSON.stringify({ senha: SENHA }),
          headers: { 'Content-Type': 'application/json' },
        }).then((r) => ({ status: r.status, json: JSON.parse(r.corpo), texto: r.corpo })),
        s.chamar(`/v1/chamados/10?senha=${SENHA}`),
        s.chamar('/v1/servico/parar', { metodo: 'POST', corpo: { senha: SENHA } }),
      ];
      const rs = await Promise.all(chamadas);
      for (const r of rs) {
        expect(r.status).toBe(400);
        expect(r.json.error.code).toBe('FILTRO_INVALIDO');
        expect(r.json.error.campos).toContain('senha');
        expect(r.texto).not.toContain(SENHA);
      }
      expect(sim.registro).toHaveLength(0);
      // "entrar" com senha extra não abriu janela nem derrubou o serviço.
      expect(s.abridor.urls).toHaveLength(0);
      expect((await s.chamar('/v1/servico')).status).toBe(200);
      expect(s.logger.texto()).not.toContain(SENHA);
    });

    it('os schemas de entrada não têm campo de credencial', () => {
      const nomes = [
        ...Object.keys(schemaFila.shape),
        ...Object.keys(schemaPesquisa.shape),
        ...Object.keys(schemaCodigoChamado.shape),
      ];
      expect(nomes.length).toBeGreaterThan(10);
      for (const n of nomes) expect(n).not.toMatch(/senha|password|passwd|usuario|login|cookie|token|credencial|segredo/i);
    });

    it('a pasta do serviço (inclusive logs/) não guarda a senha de teste', async () => {
      await s.chamar('/v1/chamados/pesquisa', { metodo: 'POST', corpo: { senha: SENHA } });
      let lidos = 0;
      const varrer = (dir: string): void => {
        for (const f of fs.readdirSync(dir)) {
          const p = path.join(dir, f);
          if (fs.statSync(p).isDirectory()) varrer(p);
          else {
            lidos++;
            expect(fs.readFileSync(p, 'utf8')).not.toContain(SENHA);
          }
        }
      };
      varrer(s.dir);
      expect(lidos).toBeGreaterThan(0);
    });
  });
});
