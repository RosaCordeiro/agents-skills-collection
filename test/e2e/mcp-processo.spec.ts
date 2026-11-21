import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { lerDescoberta } from '../../src/infraestructure/descoberta/arquivo-descoberta';
import { NOMES_TOOLS } from '../../src/presentation/mcp/tools';
import { sentinela } from '../simulador/apoio';
import { dormir } from '../simulador/consulta-apoio';
import { gerarMassa } from '../simulador/dados';
import {
  chamarTool,
  conectarMcp,
  MCP_JS,
  pararServicoDoDiretorio,
  processosNode,
  RAIZ,
  semCorrelacao,
  SERVICO_JS,
  vivo,
  type McpConectado,
} from '../simulador/mcp-apoio';
import { pastaTemporaria, portaFechada, portaLivre, removerPasta, subirServico, type Servico } from '../simulador/rest-apoio';
import { postarLogin } from '../simulador/sessao-apoio';
import { SoftdeskSimulado } from '../simulador/softdesk-simulado';

/**
 * e2e do MCP (fragmento 6): `dist/mcp.js` como processo filho, falado por um cliente do SDK.
 * Fecha VAL-21 (paridade MCP x REST), VAL-15 (MCP), VAL-27 e CA-17. Só o simulador local; nenhuma
 * janela de login é aberta no navegador (o serviço dos testes de login roda no processo do teste com
 * abridor falso; os serviços iniciados pelo MCP só recebem tools que não abrem janela).
 */

const MEU = 393;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAMPOS_DE_CREDENCIAL = /senha|usuario|password|passwd|cookie|token|credencial|login/i;

describe('e2e: MCP fino (dist/mcp.js)', () => {
  jest.setTimeout(120_000);

  let sim: SoftdeskSimulado;
  const servicos: Servico[] = [];
  const conexoes: McpConectado[] = [];
  const dirs: string[] = [];
  /**
   * Serviços reais que já rodavam com este mesmo `dist/servico.js` antes dos testes (o MCP registrado
   * pelo usuário sobe o serviço por esse caminho). Os testes só olham os processos que eles criaram.
   */
  let preexistentes = new Set<number>();
  const meusServicos = () => processosNode(SERVICO_JS).filter((p) => !preexistentes.has(p.pid));

  beforeAll(() => {
    preexistentes = new Set(processosNode(SERVICO_JS).map((p) => p.pid));
    // Garante o dist atualizado (o `npm test` não compila sozinho).
    execFileSync(process.execPath, [path.join(RAIZ, 'node_modules', 'typescript', 'bin', 'tsc')], { cwd: RAIZ, timeout: 120_000 });
  }, 130_000);

  beforeEach(async () => {
    sim = await SoftdeskSimulado.iniciar({
      chamados: gerarMassa([
        { cdAtendente: MEU, status: 1, quantidade: 6 },
        { cdAtendente: MEU, status: 3, quantidade: 2 },
        { cdAtendente: 555, status: 1, quantidade: 3 },
      ]),
    });
  });

  afterEach(async () => {
    for (const c of conexoes.splice(0)) await c.fechar().catch(() => undefined);
    for (const s of servicos.splice(0)) await s.encerrar();
    for (const d of dirs.splice(0)) {
      await pararServicoDoDiretorio(d);
      removerPasta(d);
    }
    await sim.fechar();
  });

  const envMcp = (dir: string, porta: number): Record<string, string> => ({
    SOFTDESK_LOCAL_DIR: dir,
    SOFTDESK_LOCAL_BASE_URL: sim.url,
    SOFTDESK_LOCAL_PORTA: String(porta),
    SOFTDESK_LOCAL_NOTIFICAR: 'false',
  });

  async function comServicoNoProcesso(): Promise<{ s: Servico; mcp: McpConectado }> {
    const s = await subirServico(sim);
    servicos.push(s);
    const mcp = await conectarMcp(envMcp(s.dir, s.porta));
    conexoes.push(mcp);
    return { s, mcp };
  }

  /** Login pelo MCP: `softdesk_entrar` espera; o teste lê o endereço pelo REST e faz o POST do formulário. */
  async function entrarPeloMcp(s: Servico, mcp: McpConectado, senha: string, usuario: string) {
    const pedido = chamarTool(mcp.client, 'softdesk_entrar', {}, 130_000);
    let url: string | null = null;
    for (let i = 0; i < 500 && !url; i++) {
      const r = await s.chamar('/v1/sessao/janela');
      url = r.json?.dados?.url ?? null;
      if (!url) await dormir(20);
    }
    if (!url) throw new Error('a janela de login não abriu');
    await postarLogin(url, { u: usuario, s: senha });
    return { resposta: await pedido, url };
  }

  describe('catálogo (VAL-15 MCP)', () => {
    it('tools/list traz as sete tools, schema estrito e nenhum campo de credencial', async () => {
      const dir = pastaTemporaria();
      dirs.push(dir);
      const mcp = await conectarMcp(envMcp(dir, await portaLivre()));
      conexoes.push(mcp);

      const { tools } = await mcp.client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual([...NOMES_TOOLS].sort());
      expect(tools.map((t) => t.name).sort()).toEqual(
        [
          'softdesk_atividades',
          'softdesk_chamado_completo',
          'softdesk_entrar',
          'softdesk_estado_sessao',
          'softdesk_minha_fila',
          'softdesk_pesquisar',
          'softdesk_saude',
        ].sort(),
      );
      for (const t of tools) {
        const props = Object.keys((t.inputSchema as { properties?: object }).properties ?? {});
        for (const p of props) expect(p).not.toMatch(CAMPOS_DE_CREDENCIAL);
        expect((t.inputSchema as { additionalProperties?: unknown }).additionalProperties).toBe(false);
        expect(t.description ?? '').toMatch(/[Nn]unca pede usuário nem senha|Nunca pede/);
      }
      expect(tools.find((t) => t.name === 'softdesk_atividades')?.description).toContain('NAO_DISPONIVEL');
      expect(tools.find((t) => t.name === 'softdesk_entrar')?.description).toContain('janela de login');
      // Nada foi iniciado só por listar as tools.
      expect(lerDescoberta(dir)).toBeNull();
    });

    it.each([
      ['softdesk_entrar', {}],
      ['softdesk_estado_sessao', {}],
      ['softdesk_saude', {}],
      ['softdesk_minha_fila', { limite: 5 }],
      ['softdesk_pesquisar', { codigo: 1 }],
      ['softdesk_chamado_completo', { codigo: 1 }],
      ['softdesk_atividades', { codigo: 1 }],
    ])('%s com campo extra "senha" → FILTRO_INVALIDO no envelope, sem chamar o serviço e sem repetir o valor', async (nome, base) => {
      const dir = pastaTemporaria();
      dirs.push(dir);
      const mcp = await conectarMcp(envMcp(dir, await portaLivre()));
      conexoes.push(mcp);
      const senha = sentinela('SENHA');

      const r = await chamarTool(mcp.client, nome, { ...base, senha });

      expect(r.isError).toBe(true);
      expect(r.json.success).toBe(false);
      expect(r.json.error.code).toBe('FILTRO_INVALIDO');
      expect(r.json.error.campos).toEqual(['senha']);
      expect(r.json.correlation_id).toMatch(UUID);
      expect(r.texto).not.toContain(senha);
      // Sem chamar o serviço: com o serviço parado, nada foi iniciado.
      expect(lerDescoberta(dir)).toBeNull();
    });

    it('valor inválido de campo conhecido (limite 0, codigo negativo) também é FILTRO_INVALIDO sem chamar o serviço', async () => {
      const dir = pastaTemporaria();
      dirs.push(dir);
      const mcp = await conectarMcp(envMcp(dir, await portaLivre()));
      conexoes.push(mcp);
      for (const [nome, args] of [
        ['softdesk_minha_fila', { limite: 0 }],
        ['softdesk_chamado_completo', { codigo: -3 }],
        ['softdesk_pesquisar', { codigo: 'abc' }],
      ] as const) {
        const r = await chamarTool(mcp.client, nome, args);
        expect(r.isError).toBe(true);
        expect(r.json.error.code).toBe('FILTRO_INVALIDO');
      }
      expect(lerDescoberta(dir)).toBeNull();
    });

    it('R3: McpServer.registerTool com strictObject recusa campo extra, mas com texto do SDK (fora do envelope) — por isso o MCP usa o Server de baixo nível', async () => {
      const server = new McpServer({ name: 'r3', version: '0.0.0' });
      server.registerTool('t', { inputSchema: z.strictObject({ a: z.number().optional() }) }, async () => ({
        content: [{ type: 'text' as const, text: 'chamou' }],
      }));
      const [a, b] = InMemoryTransport.createLinkedPair();
      await server.connect(a);
      const cliente = new Client({ name: 'c', version: '0' });
      await cliente.connect(b);
      const r = (await cliente.callTool({ name: 't', arguments: { a: 1, senha: 'x' } })) as {
        content: Array<{ text: string }>;
        isError?: boolean;
      };
      expect(r.isError).toBe(true);
      expect(r.content[0].text).not.toBe('chamou');
      expect(() => JSON.parse(r.content[0].text)).toThrow();
      await cliente.close();
    });
  });

  describe('VAL-21: mesmos pedidos por MCP e REST; login por uma porta vale na outra', () => {
    it('login pelo MCP; todas as consultas devolvem o mesmo envelope no REST e no MCP (menos correlation_id)', async () => {
      const { s, mcp } = await comServicoNoProcesso();
      const senha = sentinela('SENHA');
      const usuario = sentinela('USU');

      const { resposta: login, url } = await entrarPeloMcp(s, mcp, senha, usuario);
      expect(login.isError).toBe(false);
      expect(login.json.success).toBe(true);
      expect(login.json.dados.autenticada).toBe(true);
      // O login por uma porta vale na outra: o REST já enxerga a sessão.
      expect((await s.chamar('/v1/sessao')).json.dados.autenticada).toBe(true);

      const saidasMcp: string[] = [login.texto];
      const comparar = async (tool: string, args: Record<string, unknown> | undefined, rest: Promise<{ json: any; status: number }>) => {
        const m = await chamarTool(mcp.client, tool, args);
        const r = await rest;
        saidasMcp.push(m.texto);
        // `duracao_ms` (saúde) é medição de tempo e muda a cada chamada; todo o resto tem de ser igual.
        const normal = (j: any) => {
          const c = semCorrelacao(JSON.parse(JSON.stringify(j))) as any;
          if (c.dados && 'duracao_ms' in c.dados) c.dados.duracao_ms = 0;
          return c;
        };
        expect(normal(m.json)).toEqual(normal(r.json));
        expect(m.isError).toBe(r.json.success === false);
        expect(m.json.correlation_id).toMatch(UUID);
        expect(m.json.correlation_id).not.toBe(r.json.correlation_id);
        return m;
      };

      await comparar('softdesk_estado_sessao', {}, s.chamar('/v1/sessao'));
      const fila = await comparar('softdesk_minha_fila', { limite: 100 }, s.chamar('/v1/fila?limite=100'));
      expect(fila.json.dados.itens).toHaveLength(6);
      await comparar('softdesk_minha_fila', { inicio: 2, limite: 3 }, s.chamar('/v1/fila?inicio=2&limite=3'));
      const codigo = fila.json.dados.itens[0].cd_chamado ?? fila.json.dados.itens[0].codigo;
      expect(typeof codigo).toBe('number');
      await comparar('softdesk_pesquisar', { codigo }, s.chamar('/v1/chamados/pesquisa', { metodo: 'POST', corpo: { codigo } }));
      await comparar(
        'softdesk_pesquisar',
        { atendente: [MEU], status: [1], limite: 4 },
        s.chamar('/v1/chamados/pesquisa', { metodo: 'POST', corpo: { atendente: [MEU], status: [1], limite: 4 } }),
      );
      const completo = await comparar('softdesk_chamado_completo', { codigo }, s.chamar(`/v1/chamados/${codigo}`));
      expect(completo.json.success).toBe(true);
      const naoAchou = await comparar('softdesk_chamado_completo', { codigo: 987654321 }, s.chamar('/v1/chamados/987654321'));
      expect(naoAchou.json.error.code).toBe('NAO_ENCONTRADO');
      expect(naoAchou.isError).toBe(true);
      const ativ = await comparar('softdesk_atividades', { codigo }, s.chamar(`/v1/chamados/${codigo}/atividades`));
      expect(ativ.json.error.code).toBe('NAO_DISPONIVEL');
      await comparar('softdesk_saude', {}, s.chamar('/v1/saude'));

      // O endereço e o token da janela nunca saem pelo MCP (ADR-007), nem o token do serviço.
      const tokenJanela = new URL(url).searchParams.get('t') as string;
      const tokenServico = (lerDescoberta(s.dir) as { token: string }).token;
      const tudo = saidasMcp.join('\n');
      expect(tudo.includes(tokenJanela)).toBe(false);
      expect(tudo.includes(url)).toBe(false);
      expect(tudo.includes(tokenServico)).toBe(false);
      expect(tudo).not.toMatch(/\?t=[0-9a-f]{16,}/);
      expect(tudo.includes(senha)).toBe(false);

      // RN-01: o SoftDesk só recebeu GET /login, POST /login e GET /chamado/json.
      for (const r of sim.registro) expect(['GET /login', 'POST /login', 'GET /chamado/json']).toContain(`${r.metodo} ${r.caminho}`);
    });

    it('login pelo REST vale no MCP (sem segundo login)', async () => {
      const { s, mcp } = await comServicoNoProcesso();
      const antes = await chamarTool(mcp.client, 'softdesk_estado_sessao', {});
      expect(antes.json.dados.autenticada).toBe(false);

      const login = await s.entrarPeloRest();
      expect(login.json.dados.autenticada).toBe(true);

      const estado = await chamarTool(mcp.client, 'softdesk_estado_sessao', {});
      expect(estado.json.dados.autenticada).toBe(true);
      const fila = await chamarTool(mcp.client, 'softdesk_minha_fila', { limite: 100 });
      expect(fila.json.success).toBe(true);
      expect(fila.json.dados.itens).toHaveLength(6);
      expect(sim.logins).toHaveLength(1);
    });

    it('sem sessão, uma tool de consulta devolve o envelope de sessão (AGUARDANDO_LOGIN) sem pedir credencial', async () => {
      const { s, mcp } = await comServicoNoProcesso();
      const r = await chamarTool(mcp.client, 'softdesk_minha_fila', {});
      const rest = await s.chamar('/v1/fila');
      expect(r.isError).toBe(true);
      expect(r.json.error.code).toBe('AGUARDANDO_LOGIN');
      expect(r.json.janela).toEqual({ aberta: true });
      expect(semCorrelacao(r.json)).toEqual(semCorrelacao(rest.json));
      expect(r.texto).not.toMatch(/https?:\/\//);
    });
  });

  describe('VAL-15 MCP: varredura de vazamento da senha', () => {
    it('a senha do login (sentinela) não aparece no ambiente, nos arquivos da pasta, nas saídas nem no stderr do MCP', async () => {
      const { s, mcp } = await comServicoNoProcesso();
      const senha = sentinela('SENHA');
      const usuario = sentinela('USU');
      const { resposta } = await entrarPeloMcp(s, mcp, senha, usuario);
      expect(resposta.json.success).toBe(true);
      const outras = [
        await chamarTool(mcp.client, 'softdesk_minha_fila', { limite: 100 }),
        await chamarTool(mcp.client, 'softdesk_estado_sessao', {}),
        await chamarTool(mcp.client, 'softdesk_saude', {}),
        await chamarTool(mcp.client, 'softdesk_pesquisar', { senha }),
      ];
      const saidas = [resposta, ...outras].map((r) => r.texto).join('\n');

      const env = Object.entries(process.env).map(([k, v]) => `${k}=${v}`).join('\n');
      const arquivos: string[] = [];
      const percorrer = (d: string): void => {
        for (const n of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, n.name);
          if (n.isDirectory()) percorrer(p);
          else arquivos.push(fs.readFileSync(p, 'utf8'));
        }
      };
      percorrer(s.dir);
      // Booleanos, para que uma falha não imprima o ambiente (pode ter segredos reais da máquina).
      const tudo = [env, saidas, mcp.stderr(), ...arquivos].join('\n');
      expect(tudo.includes(senha)).toBe(false);
      // O usuário aparece de propósito só no envelope de estado; nunca no ambiente, nos arquivos nem no stderr.
      expect([env, mcp.stderr(), ...arquivos].join('\n').includes(usuario)).toBe(false);
      expect(arquivos.length).toBeGreaterThan(0);
    });
  });

  describe('stdout limpo', () => {
    it('stdout do MCP tem só mensagens JSON-RPC (inclusive após erro de validação e com o serviço iniciado por ele); stderr vazio', async () => {
      const dir = pastaTemporaria();
      dirs.push(dir);
      const porta = await portaLivre();
      const filho = spawn(process.execPath, [MCP_JS], { env: { ...process.env, ...envMcp(dir, porta) }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      let out = '';
      let err = '';
      filho.stdout.on('data', (c: Buffer) => (out += c.toString()));
      filho.stderr.on('data', (c: Buffer) => (err += c.toString()));
      const enviar = (m: object): void => void filho.stdin.write(`${JSON.stringify(m)}\n`);
      enviar({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } } });
      enviar({ jsonrpc: '2.0', method: 'notifications/initialized' });
      enviar({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      enviar({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'softdesk_saude', arguments: { senha: 'x' } } });
      enviar({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'softdesk_estado_sessao', arguments: {} } });
      const fim = Date.now() + 40_000;
      while (Date.now() < fim && !/"id":4/.test(out)) await dormir(50);
      filho.stdin.end();
      await new Promise<void>((r) => (filho.exitCode !== null ? r() : filho.once('exit', () => r())));

      const linhas = out.split('\n').filter((l) => l.trim() !== '');
      expect(linhas.length).toBeGreaterThanOrEqual(4);
      for (const l of linhas) {
        const m = JSON.parse(l);
        expect(m.jsonrpc).toBe('2.0');
      }
      expect(err).toBe('');
      expect(out).toContain('"id":4');
      expect(out).toContain('FILTRO_INVALIDO');
    });
  });

  describe('VAL-27 / CA-17: serviço parado → o MCP o inicia', () => {
    it('com o serviço parado, a chamada sobe o serviço sozinho (detached, sobrevive ao MCP) e a resposta chega', async () => {
      const dir = pastaTemporaria();
      dirs.push(dir);
      const porta = await portaLivre();
      expect(lerDescoberta(dir)).toBeNull();
      const mcp = await conectarMcp(envMcp(dir, porta));
      conexoes.push(mcp);

      const r = await chamarTool(mcp.client, 'softdesk_estado_sessao', {});
      expect(r.json.success).toBe(true);
      expect(r.json.dados.autenticada).toBe(false);

      const desc = lerDescoberta(dir);
      expect(desc).not.toBeNull();
      expect(desc?.porta).toBe(porta);
      expect(vivo(desc!.pid)).toBe(true);
      expect(desc!.pid).not.toBe(mcp.transport.pid);
      expect(desc!.pid).not.toBe(process.pid);
      const meu = processosNode(SERVICO_JS).filter((p) => p.pid === desc!.pid);
      expect(meu).toHaveLength(1);

      // Detached: o processo do MCP termina e o serviço continua de pé, respondendo.
      const pidMcp = mcp.transport.pid as number;
      await mcp.fechar();
      for (let i = 0; i < 100 && vivo(pidMcp); i++) await dormir(50);
      expect(vivo(pidMcp)).toBe(false);
      expect(vivo(desc!.pid)).toBe(true);
      const info = await fetch(`http://127.0.0.1:${porta}/v1/servico`, { headers: { Authorization: `Bearer ${desc!.token}` } });
      expect(info.status).toBe(200);
      expect((await info.json()).dados.pid).toBe(desc!.pid);

      // Um MCP novo reaproveita o mesmo serviço (não inicia outro).
      const mcp2 = await conectarMcp(envMcp(dir, porta));
      conexoes.push(mcp2);
      const r2 = await chamarTool(mcp2.client, 'softdesk_saude', {});
      expect(r2.json.success).toBe(true);
      expect(lerDescoberta(dir)?.pid).toBe(desc!.pid);

      // Só consultas ao SoftDesk permitidas pela RN-01.
      for (const q of sim.registro) expect(['GET /login', 'POST /login', 'GET /chamado/json']).toContain(`${q.metodo} ${q.caminho}`);

      await pararServicoDoDiretorio(dir);
      expect(await portaFechada(porta)).toBe(true);
      expect(lerDescoberta(dir)).toBeNull();
    });

    it('arquivo de descoberta velho (serviço morto, porta sem ninguém) → o MCP inicia o serviço e responde', async () => {
      const dir = pastaTemporaria();
      dirs.push(dir);
      const porta = await portaLivre();
      fs.writeFileSync(
        path.join(dir, 'servico.json'),
        JSON.stringify({ porta, token: 'ab'.repeat(32), pid: 999_999, iniciado_em: new Date().toISOString(), versao: 'velha' }),
      );
      const mcp = await conectarMcp(envMcp(dir, porta));
      conexoes.push(mcp);
      const r = await chamarTool(mcp.client, 'softdesk_estado_sessao', {});
      expect(r.json.success).toBe(true);
      const d = lerDescoberta(dir);
      expect(d?.versao).not.toBe('velha');
      expect(d?.token).not.toBe('ab'.repeat(32));
      expect(vivo(d!.pid)).toBe(true);
    });

    it('dois MCPs ao mesmo tempo com o serviço parado → uma só instância viva', async () => {
      const dir = pastaTemporaria();
      dirs.push(dir);
      const porta = await portaLivre();
      const [m1, m2] = await Promise.all([conectarMcp(envMcp(dir, porta)), conectarMcp(envMcp(dir, porta))]);
      conexoes.push(m1, m2);

      const [r1, r2] = await Promise.all([
        chamarTool(m1.client, 'softdesk_estado_sessao', {}),
        chamarTool(m2.client, 'softdesk_estado_sessao', {}),
      ]);
      expect(r1.json.success).toBe(true);
      expect(r2.json.success).toBe(true);

      // Quem perdeu a disputa pela porta sai sozinho; espera ativa (até 20 s) até restar só o vencedor.
      const desc = lerDescoberta(dir);
      expect(desc).not.toBeNull();
      const fim = Date.now() + 20_000;
      while (meusServicos().length > 1 && Date.now() < fim) await dormir(250);
      const vivos = meusServicos();
      expect(vivos.map((p) => p.pid)).toEqual([desc!.pid]);
      expect(lerDescoberta(dir)?.pid).toBe(desc!.pid);
    });
  });

  it('RN-15 / VAL-27: serviço que não sobe (porta tomada por outro programa) → SERVICO_INDISPONIVEL em cerca de 10 s, pelo dist/mcp.js real', async () => {
    const dir = pastaTemporaria();
    dirs.push(dir);
    // Um programa qualquer ocupa a porta fixa: o serviço iniciado pelo MCP sai na hora e nunca grava a descoberta.
    const ocupante = net.createServer();
    await new Promise<void>((r) => ocupante.listen(0, '127.0.0.1', () => r()));
    const porta = (ocupante.address() as net.AddressInfo).port;
    try {
      const mcp = await conectarMcp(envMcp(dir, porta));
      conexoes.push(mcp);
      const t0 = Date.now();
      const r = await chamarTool(mcp.client, 'softdesk_estado_sessao', {}, 40_000);
      const gasto = Date.now() - t0;
      expect(r.json.success).toBe(false);
      expect(r.json.error.code).toBe('SERVICO_INDISPONIVEL');
      // O prazo é o de 10 s (RN-15): nem antes, nem a minutos. Com 60 s o MCP passaria de 30 s.
      expect(gasto).toBeGreaterThanOrEqual(9_000);
      expect(gasto).toBeLessThan(25_000);
      expect(lerDescoberta(dir)).toBeNull();
    } finally {
      await new Promise<void>((r) => ocupante.close(() => r()));
    }
  }, 60_000);

  it('nenhum processo de serviço fica rodando depois dos testes deste arquivo', async () => {
    // Roda por último neste describe raiz: os afterEach já pararam tudo; confirma pela lista de processos.
    for (const d of dirs.splice(0)) await pararServicoDoDiretorio(d);
    const fim = Date.now() + 10_000;
    while (meusServicos().length > 0 && Date.now() < fim) await dormir(250);
    expect(meusServicos()).toEqual([]);
  });
});
