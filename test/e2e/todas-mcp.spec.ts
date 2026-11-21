import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { lerDescoberta } from '../../src/infraestructure/descoberta/arquivo-descoberta';
import { gerarMassa } from '../simulador/dados';
import { chamarTool, conectarMcp, pararServicoDoDiretorio, RAIZ, semCorrelacao, type McpConectado } from '../simulador/mcp-apoio';
import { pastaTemporaria, portaLivre, removerPasta, subirServico, type Servico } from '../simulador/rest-apoio';
import { SoftdeskSimulado } from '../simulador/softdesk-simulado';

/**
 * VAL-37 (parte MCP) do modo `todas`: `tools/list` expõe `todas`, entrada inválida não chama o serviço e o
 * envelope do MCP é igual ao do REST. Só o simulador local; nenhuma janela de login é aberta no navegador.
 */

const MEU = 393;

describe('e2e: modo todas pelo MCP (dist/mcp.js)', () => {
  jest.setTimeout(120_000);

  let sim: SoftdeskSimulado;
  const servicos: Servico[] = [];
  const conexoes: McpConectado[] = [];
  const dirs: string[] = [];

  beforeAll(() => {
    // Garante o dist atualizado (o `npm test` não compila sozinho).
    execFileSync(process.execPath, [path.join(RAIZ, 'node_modules', 'typescript', 'bin', 'tsc')], { cwd: RAIZ, timeout: 120_000 });
  }, 130_000);

  beforeEach(async () => {
    sim = await SoftdeskSimulado.iniciar({
      chamados: gerarMassa([
        { cdAtendente: MEU, status: 1, quantidade: 300 },
        { cdAtendente: MEU, status: 8, quantidade: 150 },
        { cdAtendente: MEU, status: 3, quantidade: 100 },
        { cdAtendente: 555, status: 1, quantidade: 60 },
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

  it('tools/list expõe `todas` (boolean) só em softdesk_minha_fila e softdesk_pesquisar, com schema estrito', async () => {
    const dir = pastaTemporaria();
    dirs.push(dir);
    const mcp = await conectarMcp(envMcp(dir, await portaLivre()));
    conexoes.push(mcp);

    const { tools } = await mcp.client.listTools();
    for (const t of tools) {
      const props = (t.inputSchema as { properties?: Record<string, { type?: string }> }).properties ?? {};
      if (t.name === 'softdesk_minha_fila' || t.name === 'softdesk_pesquisar') {
        expect(props.todas?.type).toBe('boolean');
        expect(props.limite?.type).toBe('integer');
        expect(t.description ?? '').toContain('todas: true');
        expect(t.description ?? '').toContain('junto de limite');
      } else {
        expect('todas' in props).toBe(false);
      }
      expect((t.inputSchema as { additionalProperties?: unknown }).additionalProperties).toBe(false);
    }
    expect(lerDescoberta(dir)).toBeNull();
  });

  it.each([
    ['softdesk_minha_fila', { todas: true, limite: 10 }, ['todas', 'limite']],
    ['softdesk_pesquisar', { atendente: [MEU], todas: true, limite: 10 }, ['todas', 'limite']],
    ['softdesk_minha_fila', { todas: 'true' }, ['todas']],
    ['softdesk_pesquisar', { atendente: [MEU], todas: 1 }, ['todas']],
  ])('%s com entrada inválida de `todas` → FILTRO_INVALIDO no envelope, sem chamar o serviço', async (nome, args, campos) => {
    const dir = pastaTemporaria();
    dirs.push(dir);
    const mcp = await conectarMcp(envMcp(dir, await portaLivre()));
    conexoes.push(mcp);

    const r = await chamarTool(mcp.client, nome, args as Record<string, unknown>);

    expect(r.isError).toBe(true);
    expect(r.json.success).toBe(false);
    expect(r.json.error.code).toBe('FILTRO_INVALIDO');
    expect(r.json.error.campos).toEqual(campos);
    expect(lerDescoberta(dir)).toBeNull();
    expect(sim.requisicoes('/chamado/json')).toHaveLength(0);
  });

  it('paridade MCP x REST: fila e pesquisa com todas devolvem o mesmo envelope (menos correlation_id), com várias páginas', async () => {
    const s = await subirServico(sim, { opcoesContainer: { maxItensTodas: 1000, maxBytesTodas: 10_000_000 } });
    servicos.push(s);
    const mcp = await conectarMcp(envMcp(s.dir, s.porta));
    conexoes.push(mcp);
    await s.entrarPeloRest();

    const fila = await chamarTool(mcp.client, 'softdesk_minha_fila', { todas: true });
    const filaRest = await s.chamar('/v1/fila?todas=true');
    expect(fila.isError).toBe(false);
    expect(fila.json.dados.todas).toBe(true);
    expect(fila.json.dados.itens).toHaveLength(450);
    expect(fila.json.dados.paginas_lidas).toBeGreaterThanOrEqual(3);
    expect(semCorrelacao(fila.json)).toEqual(semCorrelacao(filaRest.json));

    const pesq = await chamarTool(mcp.client, 'softdesk_pesquisar', { atendente: [MEU], todas: true });
    const pesqRest = await s.chamar('/v1/chamados/pesquisa', { metodo: 'POST', corpo: { atendente: [MEU], todas: true } });
    expect(pesq.isError).toBe(false);
    expect(pesq.json.dados.itens).toHaveLength(550);
    expect(semCorrelacao(pesq.json)).toEqual(semCorrelacao(pesqRest.json));

    // Com inicio (continuação) e sem todas (comportamento anterior) a paridade também vale.
    const cont = await chamarTool(mcp.client, 'softdesk_minha_fila', { todas: true, inicio: 400 });
    const contRest = await s.chamar('/v1/fila?todas=true&inicio=400');
    expect(semCorrelacao(cont.json)).toEqual(semCorrelacao(contRest.json));
    const antiga = await chamarTool(mcp.client, 'softdesk_minha_fila', { limite: 30 });
    const antigaRest = await s.chamar('/v1/fila?limite=30');
    expect(antiga.json.dados.itens).toHaveLength(30);
    expect('todas' in antiga.json.dados).toBe(false);
    expect(semCorrelacao(antiga.json)).toEqual(semCorrelacao(antigaRest.json));
  });
});
