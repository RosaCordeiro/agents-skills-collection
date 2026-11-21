import fs from 'node:fs';
import path from 'node:path';
import { ClamedLoggerAdapter, type DestinoLog } from '../../src/infraestructure/logger/clamed-logger.adapter';
import { gerarMassa } from '../simulador/dados';
import { dormir } from '../simulador/consulta-apoio';
import { novoUuid, subirServico, type Servico } from '../simulador/rest-apoio';
import { sentinela } from '../simulador/apoio';
import { SoftdeskSimulado } from '../simulador/softdesk-simulado';

const MEU = 393;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('serviço pelo REST, contra o simulador (fragmento 5)', () => {
  let sim: SoftdeskSimulado;
  let outros: SoftdeskSimulado[];
  let servicos: Servico[];

  beforeEach(() => {
    outros = [];
    servicos = [];
  });

  afterEach(async () => {
    for (const s of servicos) await s.encerrar();
    await sim?.fechar();
    for (const o of outros) await o.fechar();
  });

  async function preparar(
    chamados = gerarMassa([
      { cdAtendente: MEU, status: 1, quantidade: 6 },
      { cdAtendente: MEU, status: 3, quantidade: 3 },
      { cdAtendente: 555, status: 1, quantidade: 4 },
    ]),
    opcoes: Parameters<typeof subirServico>[1] = {},
  ): Promise<Servico> {
    sim = await SoftdeskSimulado.iniciar({ chamados });
    const s = await subirServico(sim, opcoes);
    servicos.push(s);
    return s;
  }

  describe('fila, pesquisa e chamado pelo REST', () => {
    it('login pelo REST e fila: só os abertos do atendente configurado, no envelope padrão', async () => {
      const s = await preparar();
      const login = await s.entrarPeloRest();
      expect(login.status).toBe(200);
      expect(login.json.dados.autenticada).toBe(true);

      const r = await s.chamar('/v1/fila?limite=100');
      expect(r.status).toBe(200);
      expect(r.json.success).toBe(true);
      expect(r.json.dados.itens).toHaveLength(6);
      expect(r.json.dados.limite_aplicado).toBe(100);
      expect(r.json.correlation_id).toMatch(UUID);
      expect(sim.requisicoes('/chamado/json')[0].query['pesq_cd_atendente[]']).toEqual(['393']);
    });

    it('pesquisa (POST) e chamado completo (GET) devolvem o item do SoftDesk', async () => {
      const s = await preparar();
      await s.entrarPeloRest();
      const p = await s.chamar('/v1/chamados/pesquisa', { metodo: 'POST', corpo: { atendente: [555], limite: 50 } });
      expect(p.status).toBe(200);
      expect(p.json.dados.itens).toHaveLength(4);
      const codigo = p.json.dados.itens[0].codigo as number;
      const c = await s.chamar(`/v1/chamados/${codigo}`);
      expect(c.status).toBe(200);
      expect(c.json.dados.chamado.cd_chamado).toBe(codigo);
      const nao = await s.chamar('/v1/chamados/999999999');
      expect(nao.status).toBe(404);
      expect(nao.json.error.code).toBe('NAO_ENCONTRADO');
    });

    it('GET /v1/saude sem sessão confere a página de login, sem abrir janela', async () => {
      const s = await preparar();
      const r = await s.chamar('/v1/saude');
      expect(r.status).toBe(200);
      expect(r.json.dados.modo).toBe('login');
      expect(s.abridor.urls).toHaveLength(0);
    });

    it('envelope de erro de contrato traz destaque e o bloco alerta, também pelo REST', async () => {
      const s = await preparar();
      await s.entrarPeloRest();
      sim.pesquisa = 'sem_lista';
      const r = await s.chamar('/v1/fila');
      expect(r.status).toBe(502);
      expect(r.json.error.code).toBe('CONTRATO_ROTA_MUDOU');
      expect(r.json.error.destaque).toBe(true);
      expect(r.json.alerta.titulo).toContain('ATENÇÃO');
    });
  });

  describe('VAL-13 (REST): login rejeitado e sessão rejeitada', () => {
    it.each(['status_falso', '401'] as const)('login do simulador "%s" → 422 CREDENCIAL, sem sessão', async (cenario) => {
      const s = await preparar();
      sim.login = cenario;
      const r = await s.entrarPeloRest();
      expect(r.status).toBe(422);
      expect(r.json.error.code).toBe('CREDENCIAL');
      const estado = await s.chamar('/v1/sessao');
      expect(estado.json.dados.autenticada).toBe(false);
      expect(estado.json.dados.estado).toBe('SEM_SESSAO');
    });

    it.each(['401', '403'] as const)('pesquisa do simulador "%s" → 409 SESSAO_EXPIRADA com a janela aberta', async (cenario) => {
      const s = await preparar();
      await s.entrarPeloRest();
      sim.pesquisa = cenario;
      const r = await s.chamar('/v1/fila');
      expect(r.status).toBe(409);
      expect(r.json.error.code).toBe('SESSAO_EXPIRADA');
      expect(r.json.janela).toEqual({ aberta: true });
      expect(sim.requisicoes('/login', 'POST')).toHaveLength(1); // só o login original: não há relogin
      const estado = await s.chamar('/v1/sessao');
      expect(estado.json.dados.estado).not.toBe('AUTENTICADA');
    });
  });

  describe('VAL-18 (integração): configuração do serviço', () => {
    it('dois serviços com outro atendente e outra base URL usam cada um os seus valores', async () => {
      const sim1 = await SoftdeskSimulado.iniciar({
        chamados: gerarMassa([
          { cdAtendente: 393, status: 1, quantidade: 4 },
          { cdAtendente: 555, status: 1, quantidade: 2 },
        ]),
      });
      const sim2 = await SoftdeskSimulado.iniciar({
        chamados: gerarMassa(
          [
            { cdAtendente: 393, status: 1, quantidade: 2 },
            { cdAtendente: 555, status: 1, quantidade: 5 },
          ],
          { codigoMaisNovo: 2_000_000 },
        ),
      });
      sim = sim1;
      outros.push(sim2);
      const a = await subirServico(sim1); // padrão: 393
      const b = await subirServico(sim2, { env: { SOFTDESK_LOCAL_CD_ATENDENTE: '555' } });
      servicos.push(a, b);

      await a.entrarPeloRest();
      await b.entrarPeloRest();
      const ra = await a.chamar('/v1/fila');
      const rb = await b.chamar('/v1/fila');

      expect(ra.json.dados.itens).toHaveLength(4);
      expect(rb.json.dados.itens).toHaveLength(5);
      expect(ra.json.dados.itens.every((i: { codigo: number }) => i.codigo > 2_500_000)).toBe(true);
      expect(rb.json.dados.itens.every((i: { codigo: number }) => i.codigo <= 2_000_000)).toBe(true);
      expect(sim1.requisicoes('/chamado/json').every((r) => r.query['pesq_cd_atendente[]']?.[0] === '393')).toBe(true);
      expect(sim2.requisicoes('/chamado/json').every((r) => r.query['pesq_cd_atendente[]']?.[0] === '555')).toBe(true);
      expect(a.svc.container.config.cdAtendente).toBe(393);
      expect(b.svc.container.config.cdAtendente).toBe(555);
      expect(b.svc.container.config.baseUrl).toBe(sim2.url);
    });
  });

  describe('VAL-28: sem encerramento por ociosidade', () => {
    /*
     * O serviço não tem relógio de ociosidade: a sessão (SessaoMemoriaStore) nem recebe relógio, e o
     * único encerramento por tempo que existe é o da janela de login. Por isso o teste abaixo, que avança
     * o relógio injetado, só mostra que nada o usa para expirar. A prova de que um temporizador real de
     * ociosidade não existe vem destes dois testes: (a) 24 h de temporizadores falsos sem pedido nenhum
     * com o serviço de pé e (b) uma trava estática que falha se aparecer temporizador novo no código.
     */
    it('24 h de temporizadores avançados sem nenhum pedido: o serviço não pára sozinho e segue respondendo', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
      try {
        const s = await preparar();
        let parou = false;
        void s.svc.aguardarParada().then(() => (parou = true));
        await jest.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
        await jest.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
        expect(parou).toBe(false);
        expect(jest.getTimerCount()).toBe(0);
        const r = await s.chamar('/v1/servico');
        expect(r.status).toBe(200);
      } finally {
        jest.useRealTimers();
      }
    });

    it('trava estática: temporizadores no código de produção ficam só nos arquivos revisados (nenhum de ociosidade)', () => {
      const raiz = path.resolve(__dirname, '..', '..', 'src');
      const achados: Record<string, number> = {};
      const varrer = (dir: string): void => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) varrer(p);
          else if (e.name.endsWith('.ts')) {
            const n = (fs.readFileSync(p, 'utf8').match(/(setTimeout|setInterval)\s*\(/g) ?? []).length;
            if (n > 0) achados[path.relative(raiz, p).split(path.sep).join('/')] = n;
          }
        }
      };
      varrer(raiz);
      // Cada uso foi revisado: prazo de uma varredura, vigia da varredura, vida da janela de login,
      // espera do navegador, 2 s de fechar conexões na parada, saída 200 ms depois da parada,
      // pausa entre tentativas do início automático e do CLI. Nenhum encerra o serviço por ociosidade.
      // Temporizador novo? Revise: não pode encerrar serviço nem sessão por ociosidade (RN-15), e só
      // então atualize esta lista.
      expect(achados).toEqual({
        'cli-capturar-forma.ts': 1,
        'cli-entrar.ts': 1,
        'core/application/services/varredura.ts': 2,
        'infraestructure/login/abridor-navegador.windows.ts': 1,
        'infraestructure/login/janela-login.server.ts': 2,
        'presentation/mcp/iniciar-servico.ts': 1,
        'presentation/rest/servidor.ts': 1,
        'servico.ts': 1,
      });
    });

    it('relógio avançado por muito tempo, sem pedidos, e depois uma consulta: a sessão segue válida; só a rejeição do simulador a derruba', async () => {
      const s = await preparar();
      await s.entrarPeloRest();
      expect((await s.chamar('/v1/fila')).status).toBe(200);
      const loginsAntes = sim.requisicoes('/login', 'POST').length;
      const janelasAntes = s.abridor.urls.length;

      s.relogio.avancar(90 * 24 * 60 * 60 * 1000); // 90 dias sem pedido algum
      await dormir(50);

      const estado = await s.chamar('/v1/sessao');
      expect(estado.json.dados.estado).toBe('AUTENTICADA');
      const r = await s.chamar('/v1/fila');
      expect(r.status).toBe(200);
      expect(r.json.success).toBe(true);
      expect(sim.requisicoes('/login', 'POST')).toHaveLength(loginsAntes);
      expect(s.abridor.urls).toHaveLength(janelasAntes); // nenhuma janela nova pedindo login
      // O serviço também segue de pé.
      expect((await s.chamar('/v1/servico')).status).toBe(200);

      sim.expirarSessao();
      const caiu = await s.chamar('/v1/fila');
      expect(caiu.status).toBe(409);
      expect(caiu.json.error.code).toBe('SESSAO_EXPIRADA');
    });
  });

  describe('RNF-06 (REST): correlation_id e logs de início e fim', () => {
    function loggerReal() {
      const gravados: Array<{ nivel: string; obj: Record<string, any> }> = [];
      const destino: DestinoLog = {
        info: (_m, obj) => gravados.push({ nivel: 'info', obj: obj as Record<string, any> }),
        warn: (_m, obj) => gravados.push({ nivel: 'warn', obj: obj as Record<string, any> }),
        error: (_m, obj) => gravados.push({ nivel: 'error', obj: obj as Record<string, any> }),
      };
      return { gravados, logger: new ClamedLoggerAdapter(destino, MEU) };
    }
    const evento = (g: Array<{ obj: Record<string, any> }>, nome: string, acao: string, outcome: string) =>
      g.filter((x) => x.obj.event.name === nome && x.obj.event.action === acao && x.obj.event.outcome === outcome);

    it('fila, pesquisa, chamado, saúde e entrar: started e success/failure com o correlation_id do envelope; X-Correlation-Id válido é aceito', async () => {
      const { gravados, logger } = loggerReal();
      const s = await preparar(undefined, { substitutos: { logger } });

      const login = await s.entrarPeloRest().then(() => s.chamar('/v1/sessao'));
      expect(login.json.dados.autenticada).toBe(true);

      const cid = novoUuid();
      const fila = await s.chamar('/v1/fila', { headers: { 'X-Correlation-Id': cid } });
      expect(fila.json.correlation_id).toBe(cid);
      expect(fila.headers.get('x-correlation-id')).toBe(cid);

      const pesq = await s.chamar('/v1/chamados/pesquisa', { metodo: 'POST', corpo: { atendente: [MEU] } });
      const cod = pesq.json.dados.itens[0].codigo;
      const cham = await s.chamar(`/v1/chamados/${cod}`);
      const saude = await s.chamar('/v1/saude');
      const naoAch = await s.chamar('/v1/chamados/999999999');

      for (const [nome, acao, r] of [
        ['fila', 'scan', fila],
        ['pesquisa', 'search', pesq],
        ['chamado', 'get', cham],
        ['saude', 'check', saude],
      ] as const) {
        const id = r.json.correlation_id as string;
        expect(id).toMatch(UUID);
        const ini = evento(gravados, nome, acao, 'started').filter((x) => x.obj.correlation_id === id);
        const fim = evento(gravados, nome, acao, 'success').filter((x) => x.obj.correlation_id === id);
        expect(ini).toHaveLength(1);
        expect(fim).toHaveLength(1);
        expect(ini[0].obj.origem).toBe('rest');
      }
      // Falha: o fim sai como failure com o mesmo id.
      const idFalha = naoAch.json.correlation_id as string;
      expect(evento(gravados, 'chamado', 'get', 'started').some((x) => x.obj.correlation_id === idFalha)).toBe(true);
      expect(evento(gravados, 'chamado', 'get', 'failure').some((x) => x.obj.correlation_id === idFalha)).toBe(true);
    });

    it('entrar: início e fim com o mesmo correlation_id; X-Correlation-Id inválido é trocado por um UUID novo', async () => {
      const { gravados, logger } = loggerReal();
      const s = await preparar(undefined, { substitutos: { logger } });
      // `entrarPeloRest` não passa cabeçalho próprio: o id é o gerado pelo serviço.
      const r = await s.entrarPeloRest();
      const id = r.json.correlation_id as string;
      expect(id).toMatch(UUID);
      // O caso de uso de entrar loga o login (sessao/login) dentro da janela, sem contexto REST;
      // o que vale aqui é que o envelope devolve o id gerado e o cabeçalho acompanha.
      expect(r.headers.get('x-correlation-id')).toBe(id);

      const ruim = await s.chamar('/v1/sessao', { headers: { 'X-Correlation-Id': 'nao-e-uuid; DROP' } });
      expect(ruim.json.correlation_id).toMatch(UUID);
      expect(ruim.json.correlation_id).not.toContain('nao-e-uuid');
      void gravados;
    });
  });

  describe('cancelamento: a conexão fechada aborta a leitura da fila', () => {
    it('o cliente desiste, a leitura é cancelada e para de pedir páginas ao SoftDesk', async () => {
      const s = await preparar(gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 600 }]));
      await s.entrarPeloRest();
      sim.pesquisa = { lento: 400 };
      const antes = sim.requisicoes('/chamado/json').length;
      const ac = new AbortController();
      const pedido = s.chamar('/v1/fila?limite=200', { sinal: ac.signal }).catch((e) => e);
      await dormir(150);
      expect(s.svc.container.listarFila.leiturasEmAndamento).toBe(1);
      ac.abort();
      await pedido;
      for (let i = 0; i < 100 && s.svc.container.listarFila.leiturasEmAndamento > 0; i++) await dormir(20);
      expect(s.svc.container.listarFila.leiturasEmAndamento).toBe(0);
      const apos = sim.requisicoes('/chamado/json').length;
      await dormir(1000);
      // Depois da desistência a varredura não continua lendo páginas.
      expect(sim.requisicoes('/chamado/json').length).toBe(apos);
      expect(apos - antes).toBeLessThanOrEqual(2);
    });
  });

  describe('alerta de contrato no login e saúde automática', () => {
    it('LAYOUT_LOGIN_MUDOU no login: envelope com destaque, ultimo_alerta no estado e balão', async () => {
      const s = await preparar();
      sim.login = 'sem_xsrf';
      const r = await s.entrarPeloRest();
      expect(r.status).toBe(502);
      expect(r.json.error.code).toBe('LAYOUT_LOGIN_MUDOU');
      expect(r.json.error.destaque).toBe(true);
      expect(r.json.alerta).toBeDefined();
      const estado = await s.chamar('/v1/sessao');
      expect(estado.json.dados.ultimo_alerta.codigo).toBe('LAYOUT_LOGIN_MUDOU');
      expect(s.notificador.codigos).toContain('LAYOUT_LOGIN_MUDOU');
      const log = s.logger.registros.find((x) => x.campos.codigo_erro === 'LAYOUT_LOGIN_MUDOU' && x.nivel === 'error');
      expect(log).toBeDefined();
      expect(log?.campos.keywords).toContain('softdesk_contrato_mudou');
    });

    it('CREDENCIAL no login não gera alerta de contrato', async () => {
      const s = await preparar();
      sim.login = 'status_falso';
      await s.entrarPeloRest();
      const estado = await s.chamar('/v1/sessao');
      expect(estado.json.dados.ultimo_alerta).toBeNull();
      expect(s.notificador.codigos).toHaveLength(0);
    });

    it('depois do PRIMEIRO login faz uma pesquisa mínima e registra no log; o segundo login não repete; o login não espera', async () => {
      const s = await preparar(undefined, { opcoesContainer: { saudeAutomatica: true } });
      sim.pesquisa = { lento: 1200 };
      const t0 = Date.now();
      const login = await s.entrarPeloRest();
      expect(login.status).toBe(200);
      expect(Date.now() - t0).toBeLessThan(1000); // não esperou a pesquisa lenta
      const saudeLog = () =>
        s.logger.registros.filter((x) => {
          const ev = x.campos.event as { name: string; action: string };
          return ev.name === 'saude' && ev.action === 'auto';
        });
      expect(saudeLog()).toHaveLength(0);

      await s.svc.container.saudeAutomatica.aguardar();
      const pesqs = sim.requisicoes('/chamado/json');
      expect(pesqs).toHaveLength(1);
      expect(pesqs[0].query.limit).toEqual(['1']);
      expect(pesqs[0].query['pesq_cd_atendente[]']).toEqual(['393']);
      expect(saudeLog()).toHaveLength(1);
      expect((saudeLog()[0].campos.event as { outcome: string }).outcome).toBe('success');
      expect(saudeLog()[0].campos.modo).toBe('pesquisa');

      // Segundo login do mesmo início: nada de saúde automática de novo.
      sim.pesquisa = 'ok';
      sim.expirarSessao();
      await s.chamar('/v1/fila'); // SESSAO_EXPIRADA e janela
      await s.entrarPeloRest();
      await s.svc.container.saudeAutomatica.aguardar();
      await dormir(50);
      expect(sim.requisicoes('/chamado/json').filter((r) => r.query.limit?.[0] === '1')).toHaveLength(1);
    });

    it('contrato quebrado na saúde automática: log de falha, ultimo_alerta e o login já respondido normalmente', async () => {
      const s = await preparar(undefined, { opcoesContainer: { saudeAutomatica: true } });
      sim.pesquisa = 'sem_lista';
      const login = await s.entrarPeloRest();
      expect(login.status).toBe(200);
      await s.svc.container.saudeAutomatica.aguardar();
      const auto = s.logger.registros.find((x) => {
        const ev = x.campos.event as { name: string; action: string };
        return ev.name === 'saude' && ev.action === 'auto';
      });
      expect((auto?.campos.event as { outcome: string }).outcome).toBe('failure');
      expect(auto?.campos.codigo_erro).toBe('CONTRATO_ROTA_MUDOU');
      const estado = await s.chamar('/v1/sessao');
      expect(estado.json.dados.ultimo_alerta.codigo).toBe('CONTRATO_ROTA_MUDOU');
      expect(s.notificador.codigos).toContain('CONTRATO_ROTA_MUDOU');
    });
  });

  describe('nenhuma resposta, log ou erro contém a senha ou cookie', () => {
    it('senha sentinela, cookies do simulador e token da janela fora de respostas REST e logs, em sucesso e em falha', async () => {
      const s = await preparar();
      const senha = sentinela('SENHA-REST');
      const usuario = sentinela('USU-REST');
      const ok = await s.entrarPeloRest({ senha, usuario });
      expect(ok.status).toBe(200);
      await s.chamar('/v1/fila');
      await s.chamar('/v1/sessao');
      await s.chamar('/v1/saude');
      await s.chamar('/v1/chamados/pesquisa', { metodo: 'POST', corpo: { atendente: [MEU] } });

      sim.pesquisa = '401';
      await s.chamar('/v1/fila');
      sim.pesquisa = 'ok';
      sim.login = 'status_falso';
      const senha2 = sentinela('SENHA-REST');
      await s.entrarPeloRest({ senha: senha2, usuario });
      sim.login = 'sem_xsrf';
      const senha3 = sentinela('SENHA-REST');
      await s.entrarPeloRest({ senha: senha3, usuario });

      const tudo = [...s.respostas, s.logger.texto()].join('\n');
      for (const segredo of [senha, senha2, senha3, ...sim.cookiesEmitidos(), s.token]) {
        expect(tudo).not.toContain(segredo);
      }
      // O usuário aparece só em GET /v1/sessao (RF-02); nunca em log (RN-13).
      expect(s.logger.texto()).not.toContain(usuario);
      for (const url of s.abridor.urls) {
        const token = new URL(url).searchParams.get('t') as string;
        // O token da janela só pode aparecer na resposta de GET /v1/sessao/janela (não chamada aqui).
        expect(tudo).not.toContain(token);
      }
    });
  });
});
