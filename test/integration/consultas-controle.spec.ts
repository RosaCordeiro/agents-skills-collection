import type { ISoftdeskGateway } from '../../src/core/domain/ports/softdesk.gateway';
import { ClamedLoggerAdapter, type DestinoLog } from '../../src/infraestructure/logger/clamed-logger.adapter';
import { executarComContexto } from '../../src/infraestructure/logger/contexto';
import { montarGateway, sentinela } from '../simulador/apoio';
import { gerarMassa, type EspecChamado } from '../simulador/dados';
import { montarAmbiente, type Ambiente } from '../simulador/sessao-apoio';
import { SoftdeskSimulado } from '../simulador/softdesk-simulado';
import {
  NotificadorEspiao,
  dormir,
  doAtendente,
  erroSoftdesk,
  logarDireto,
  pesquisas,
} from '../simulador/consulta-apoio';

const MEU = 393;

describe('consultas: validação, saúde, concorrência, prazo, cancelamento e logs (fragmento 4)', () => {
  let sim: SoftdeskSimulado;
  let amb: Ambiente;

  afterEach(async () => {
    amb?.c.listarFila.cancelarTodas();
    amb?.c.janelaLogin.fechar();
    await sim?.fechar();
  });

  async function preparar(
    chamados: EspecChamado[],
    opcoes: Parameters<typeof montarAmbiente>[1] = {},
    substitutos: Parameters<typeof montarAmbiente>[2] = {},
    logar = true,
  ) {
    sim = await SoftdeskSimulado.iniciar({ chamados });
    amb = montarAmbiente(sim, opcoes, substitutos);
    if (logar) await logarDireto(amb);
  }

  describe('VAL-20: entrada inválida e código inexistente', () => {
    const casos: Array<[string, (c: Ambiente['c']) => Promise<unknown>]> = [
      ['fila com limite 0', (c) => c.listarFila.executar({ limite: 0 })],
      ['fila com limite negativo', (c) => c.listarFila.executar({ limite: -5 })],
      ['fila com limite em texto', (c) => c.listarFila.executar({ limite: '10' })],
      ['fila com inicio negativo', (c) => c.listarFila.executar({ inicio: -1 })],
      ['fila com filtro de texto vazio', (c) => c.listarFila.executar({ solicitante_nome: '' })],
      ['pesquisa com limite 0', (c) => c.pesquisar.executar({ limite: 0 })],
      ['pesquisa com atendente que não é lista', (c) => c.pesquisar.executar({ atendente: 393 })],
      ['pesquisa com campo desconhecido', (c) => c.pesquisar.executar({ filtro_inventado: 1 })],
      ['pesquisa com status inválido', (c) => c.pesquisar.executar({ status: ['inexistente'] })],
      ['chamado com código em texto', (c) => c.obterChamado.executar({ codigo: 'abc' })],
      ['chamado sem código', (c) => c.obterChamado.executar({})],
      ['chamado com código zero', (c) => c.obterChamado.executar({ codigo: 0 })],
    ];

    it.each(casos)('%s → FILTRO_INVALIDO com zero requisições ao SoftDesk e sem abrir janela', async (_nome, chamar) => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 5 }]), {}, {}, false);
      const e = await erroSoftdesk(() => chamar(amb.c));
      expect(e.codigo).toBe('FILTRO_INVALIDO');
      expect(sim.registro).toHaveLength(0);
      expect(amb.abridor.urls).toHaveLength(0);
    });

    it('campo senha em qualquer entrada → FILTRO_INVALIDO, zero requisições e a sentinela não aparece em erro nem em log', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 5 }]));
      const segredo = sentinela('SENHA');
      const antes = sim.registro.length;
      const erros = [
        await erroSoftdesk(() => amb.c.listarFila.executar({ senha: segredo })),
        await erroSoftdesk(() => amb.c.pesquisar.executar({ atendente: [MEU], senha: segredo })),
        await erroSoftdesk(() => amb.c.obterChamado.executar({ codigo: 1, senha: segredo })),
      ];
      for (const e of erros) {
        expect(e.codigo).toBe('FILTRO_INVALIDO');
        expect(e.campos).toEqual(['senha']);
        expect(JSON.stringify([e.mensagem, e.acao, e.message, e.campos])).not.toContain(segredo);
      }
      expect(sim.registro.length).toBe(antes);
      expect(amb.logger.texto()).not.toContain(segredo);
    });

    it('limite acima de 200 na fila usa 200 e informa o pedido', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 300 }]));
      const r = (await amb.c.listarFila.executar({ limite: 999 })).dados;
      expect(r.limite_pedido).toBe(999);
      expect(r.limite_aplicado).toBe(200);
      expect(r.itens).toHaveLength(200);
    });

    it('código inexistente → NAO_ENCONTRADO (a pesquisa por código foi feita, com limite 10)', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 5 }]));
      const e = await erroSoftdesk(() => amb.c.obterChamado.executar({ codigo: 7 }));
      expect(e.codigo).toBe('NAO_ENCONTRADO');
      const req = pesquisas(sim);
      expect(req).toHaveLength(1);
      expect(req[0].query.pesq_cd_chamado).toEqual(['7']);
      expect(req[0].query.limit).toEqual(['10']);
    });

    it('exige igualdade exata em cd_chamado: se o servidor devolve só outros códigos → NAO_ENCONTRADO', async () => {
      const todos = gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 5 }]);
      sim = await SoftdeskSimulado.iniciar({ chamados: todos });
      const real = montarGateway(sim).gateway;
      const gateway: ISoftdeskGateway = {
        conferirPaginaLogin: (s) => real.conferirPaginaLogin(s),
        autenticar: (u, s, p, sinal) => real.autenticar(u, s, p, sinal),
        // Ignora o filtro de código e devolve o chamado vizinho (como uma busca "parecida").
        pesquisar: (sessao, filtro, sinal) => real.pesquisar(sessao, { ...filtro, codigo: todos[1].cd_chamado }, sinal),
      };
      amb = montarAmbiente(sim, {}, { gateway });
      await logarDireto(amb);
      const e = await erroSoftdesk(() => amb.c.obterChamado.executar({ codigo: todos[0].cd_chamado }));
      expect(e.codigo).toBe('NAO_ENCONTRADO');
    });

    it('sem sessão, as consultas abrem a janela e devolvem AGUARDANDO_LOGIN (uma só janela)', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 5 }]), {}, {}, false);
      const e1 = await erroSoftdesk(() => amb.c.listarFila.executar({}));
      const e2 = await erroSoftdesk(() => amb.c.pesquisar.executar({ atendente: [MEU] }));
      const e3 = await erroSoftdesk(() => amb.c.obterChamado.executar({ codigo: 1 }));
      for (const e of [e1, e2, e3]) {
        expect(e.codigo).toBe('AGUARDANDO_LOGIN');
        expect(e.janela).toEqual({ aberta: true });
      }
      expect(amb.abridor.urls).toHaveLength(1);
      expect(pesquisas(sim)).toHaveLength(0);
    });
  });

  describe('VAL-22: saúde', () => {
    it('sem sessão e simulador normal → ok, modo login, só GET /login e nenhuma janela aberta', async () => {
      await preparar([], {}, {}, false);
      const r = (await amb.c.verificarSaude.executar()).dados;
      expect(r.ok).toBe(true);
      expect(r.modo).toBe('login');
      expect(typeof r.duracao_ms).toBe('number');
      expect(sim.registro.map((q) => `${q.metodo} ${q.caminho}`)).toEqual(['GET /login']);
      expect(amb.abridor.urls).toHaveLength(0);
      expect(amb.c.janelaLogin.info()).toBeNull();
      expect(amb.c.sessaoStore.estado()).toBe('SEM_SESSAO');
    });

    it('sem sessão e login sem XSRF → LAYOUT_LOGIN_MUDOU com destaque, alerta guardado, balão, e nenhuma janela', async () => {
      const notificador = new NotificadorEspiao();
      await preparar([], {}, { notificador }, false);
      sim.login = 'sem_xsrf';
      const e = await erroSoftdesk(() => amb.c.verificarSaude.executar());
      expect(e.codigo).toBe('LAYOUT_LOGIN_MUDOU');
      expect(e.destaque).toBe(true);
      expect(amb.abridor.urls).toHaveLength(0);
      expect(amb.c.janelaLogin.info()).toBeNull();
      expect(amb.c.alerta.ultimo()?.codigo).toBe('LAYOUT_LOGIN_MUDOU');
      expect(amb.c.estadoSessao.executar().ultimo_alerta?.codigo).toBe('LAYOUT_LOGIN_MUDOU');
      expect(notificador.codigos).toEqual(['LAYOUT_LOGIN_MUDOU']);
      const erros = amb.logger.registros.filter((r) => r.nivel === 'error' && r.campos.event.name === 'contrato');
      expect(erros).toHaveLength(1);
      expect(erros[0].campos.keywords).toEqual(['softdesk_contrato_mudou']);
    });

    it('com sessão: pesquisa mínima (limite 1, atendente configurado) → modo pesquisa', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 5 }]));
      const antes = sim.registro.length;
      const r = (await amb.c.verificarSaude.executar()).dados;
      expect(r.modo).toBe('pesquisa');
      const novas = sim.registro.slice(antes);
      expect(novas).toHaveLength(1);
      expect(novas[0].caminho).toBe('/chamado/json');
      expect(novas[0].query.limit).toEqual(['1']);
      expect(novas[0].query['pesq_cd_atendente[]']).toEqual(['393']);
    });

    it('com sessão e rota quebrada (sem_lista) → CONTRATO_ROTA_MUDOU, alerta e balão', async () => {
      const notificador = new NotificadorEspiao();
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 5 }]), {}, { notificador });
      sim.pesquisa = 'sem_lista';
      const e = await erroSoftdesk(() => amb.c.verificarSaude.executar());
      expect(e.codigo).toBe('CONTRATO_ROTA_MUDOU');
      expect(amb.c.alerta.ultimo()?.codigo).toBe('CONTRATO_ROTA_MUDOU');
      expect(notificador.codigos).toEqual(['CONTRATO_ROTA_MUDOU']);
    });

    it('com sessão, deriva de campo usado → ok com deriva só com nomes', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 3 }]));
      sim.aplicarDeriva({ remover: ['nm_usuario'] });
      const r = await amb.c.verificarSaude.executar();
      expect(r.dados.deriva).toEqual({ novos: [], ausentes: ['nm_usuario'], tipo_trocado: [] });
      expect(r.aviso_deriva).toEqual({ campos: ['nm_usuario'] });
    });
  });

  describe('contrato nas consultas: aviso_deriva, erro essencial e balão', () => {
    it('campo usado ausente: itens com o campo nulo, aviso_deriva com o nome, log só com o nome', async () => {
      const nome = 'Nome Secreto da Pessoa';
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 4, solicitantes: [nome] }]));
      sim.aplicarDeriva({ remover: ['nm_usuario'] });
      const r = await amb.c.listarFila.executar({});
      expect(r.aviso_deriva).toEqual({ campos: ['nm_usuario'] });
      expect(r.dados.itens.every((i) => i.solicitante === null)).toBe(true);
      const avisos = amb.logger.registros.filter((x) => x.campos.keywords?.includes('softdesk_deriva'));
      expect(avisos.length).toBeGreaterThan(0);
      expect(amb.logger.texto()).not.toContain(nome);
    });

    it('deriva em respostas de pesquisa e fila: log softdesk_deriva, ultimo_alerta DERIVA e balão (1 a cada 10 min), sem derrubar a consulta (B-4)', async () => {
      const notificador = new NotificadorEspiao();
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 4 }]), {}, { notificador });
      sim.aplicarDeriva({ remover: ['nm_usuario'] });
      const a = await amb.c.listarFila.executar({});
      const b = await amb.c.pesquisar.executar({ atendente: [MEU] });
      expect(a.dados.itens).toHaveLength(4);
      expect(b.aviso_deriva).toEqual({ campos: ['nm_usuario'] });
      expect(notificador.codigos).toEqual(['DERIVA']);
      expect(amb.c.estadoSessao.executar().ultimo_alerta?.codigo).toBe('DERIVA');
      amb.relogio.avancar(11 * 60 * 1000);
      await amb.c.listarFila.executar({});
      expect(notificador.codigos).toEqual(['DERIVA', 'DERIVA']);
    });

    it('campo essencial ausente → CONTRATO_ROTA_MUDOU com os nomes, alerta e um balão (o segundo erro em 10 min não gera outro)', async () => {
      const notificador = new NotificadorEspiao();
      const todos = gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 4 }]);
      await preparar(todos, {}, { notificador });
      sim.aplicarDeriva({ remover: ['cd_atendente'] });
      const e1 = await erroSoftdesk(() => amb.c.listarFila.executar({}));
      expect(e1.codigo).toBe('CONTRATO_ROTA_MUDOU');
      expect(e1.campos).toEqual(['cd_atendente']);
      const e2 = await erroSoftdesk(() => amb.c.pesquisar.executar({ atendente: [MEU] }));
      expect(e2.codigo).toBe('CONTRATO_ROTA_MUDOU');
      expect(notificador.codigos).toEqual(['CONTRATO_ROTA_MUDOU']);
      amb.relogio.avancar(11 * 60 * 1000);
      await erroSoftdesk(() => amb.c.obterChamado.executar({ codigo: todos[0].cd_chamado }));
      expect(notificador.codigos).toEqual(['CONTRATO_ROTA_MUDOU', 'CONTRATO_ROTA_MUDOU']);
    });

    it('sessão expirada no meio de uma consulta → SESSAO_EXPIRADA, janela aberta e a leitura não é repetida', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 4 }]));
      sim.expirarSessao();
      const e = await erroSoftdesk(() => amb.c.listarFila.executar({}));
      expect(e.codigo).toBe('SESSAO_EXPIRADA');
      expect(e.janela).toEqual({ aberta: true });
      expect(pesquisas(sim)).toHaveLength(1);
      expect(amb.c.sessaoStore.estado()).toBe('AGUARDANDO_LOGIN'); // expirou e a janela abriu na mesma operação
      expect(amb.abridor.urls).toHaveLength(1);
    });
  });

  describe('VAL-23: concorrência', () => {
    const massa = (): EspecChamado[] =>
      gerarMassa(
        [
          { cdAtendente: MEU, status: 2, quantidade: 300 },
          { cdAtendente: MEU, status: 1, quantidade: 150 },
        ],
        { embaralhar: false },
      );

    it('5 pedidos simultâneos (3 filas e 2 pesquisas), simulador lento → pico <= 2 e as páginas da fila são lidas uma única vez', async () => {
      await preparar(massa());
      sim.pesquisa = { lento: 120 };
      sim.zerarPico();
      const antes = pesquisas(sim).length;

      const [f1, f2, f3, p1, p2] = await Promise.all([
        amb.c.listarFila.executar({ limite: 200 }),
        amb.c.listarFila.executar({ limite: 200 }),
        amb.c.listarFila.executar({ limite: 200 }),
        amb.c.pesquisar.executar({ atendente: [MEU], limite: 5 }),
        amb.c.pesquisar.executar({ atendente: [MEU], limite: 7 }),
      ]);

      expect(sim.picoSimultaneas).toBeLessThanOrEqual(2);
      expect(sim.picoSimultaneas).toBe(2); // a fila e uma pesquisa avulsa rodaram juntas
      // abertos em 300..449: 3 páginas (0, 200 e 400); as 3 filas dividem uma única leitura.
      const novas = pesquisas(sim).slice(antes);
      const inicios = novas.map((q) => q.query.start[0]);
      expect(inicios.filter((s) => s === '0')).toHaveLength(1 + 2); // 1 página da fila + 2 pesquisas avulsas (início 0)
      expect(inicios.filter((s) => s === '200')).toHaveLength(1);
      expect(inicios.filter((s) => s === '400')).toHaveLength(1);
      expect(novas).toHaveLength(5);
      expect(f1.dados.itens).toHaveLength(150);
      expect(f2.dados.itens).toEqual(f1.dados.itens);
      expect(f3.dados.itens).toEqual(f1.dados.itens);
      expect(f1.dados.paginas_lidas).toBe(3);
      expect(p1.dados.itens).toHaveLength(5);
      expect(p2.dados.itens).toHaveLength(7);
    });

    it('duas leituras diferentes da fila ao mesmo tempo não se sobrepõem (uma leitura por vez): pico 1', async () => {
      await preparar(massa());
      sim.pesquisa = { lento: 60 };
      sim.zerarPico();
      const [a, b] = await Promise.all([
        amb.c.listarFila.executar({ limite: 200 }),
        amb.c.listarFila.executar({ limite: 199 }),
      ]);
      expect(a.dados.itens).toHaveLength(150);
      expect(b.dados.itens).toHaveLength(150);
      expect(sim.picoSimultaneas).toBe(1);
      expect(pesquisas(sim).length).toBeGreaterThanOrEqual(6); // 3 páginas para cada uma, sem compartilhar
    });

    it('leitura compartilhada devolve o limite_pedido de CADA chamador (B-7)', async () => {
      await preparar(massa());
      sim.pesquisa = { lento: 60 };
      sim.zerarPico();
      const [a, b] = await Promise.all([
        amb.c.listarFila.executar({ limite: 500 }),
        amb.c.listarFila.executar({ limite: 200 }),
      ]);
      expect(a.dados.limite_aplicado).toBe(200);
      expect(b.dados.limite_aplicado).toBe(200);
      expect(a.dados.limite_pedido).toBe(500);
      expect(b.dados.limite_pedido).toBe(200);
      expect(sim.picoSimultaneas).toBe(1);
    });

    it('sessão nova não se junta a uma leitura da sessão antiga: o login recente não é descartado (B-6)', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 600 }]));
      sim.pesquisa = { lento: 120 };
      const s1 = amb.c.sessaoStore.obter();
      const a = erroSoftdesk(() => amb.c.listarFila.executar({ limite: 200 })); // ocupa a vez com a sessão antiga
      await dormir(30);
      const l = erroSoftdesk(() => amb.c.listarFila.executar({ limite: 199 })); // espera a vez (sessão antiga)
      await dormir(30);
      amb.c.sessaoStore.descartar('expirada');
      await logarDireto(amb);
      expect(amb.c.sessaoStore.obter()).not.toBe(s1);
      const c = await amb.c.listarFila.executar({ limite: 199 }); // mesma chave de L, sessão nova
      expect(c.dados.itens.length).toBeGreaterThan(0);
      expect((await l).codigo).toBe('SESSAO_EXPIRADA');
      await a;
      expect(amb.c.sessaoStore.obter()).not.toBeNull(); // a sessão nova continua válida
    });

    it('fila e pesquisa com filtro no cliente também se alternam: uma varredura por vez', async () => {
      await preparar(massa());
      sim.pesquisa = { lento: 60 };
      sim.zerarPico();
      await Promise.all([
        amb.c.listarFila.executar({ limite: 200 }),
        amb.c.pesquisar.executar({ atendente: [MEU], status: [1], limite: 200, solicitante_nome: 'a' }),
      ]);
      expect(sim.picoSimultaneas).toBe(1);
    });

    it('leitura terminada não é reaproveitada: a chamada seguinte lê o SoftDesk de novo', async () => {
      await preparar(massa());
      await amb.c.listarFila.executar({ limite: 200 });
      const n = pesquisas(sim).length;
      await amb.c.listarFila.executar({ limite: 200 });
      expect(pesquisas(sim).length).toBe(2 * n);
      expect(amb.c.listarFila.leiturasEmAndamento).toBe(0);
    });
  });

  describe('RNF-05: prazo total da varredura', () => {
    it('simulador lento e prazo reduzido → REDE com a mensagem de prazo, em tempo curto, sem ler as 15 páginas', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 2, quantidade: 2000 }]), { prazoVarreduraMs: 250 });
      sim.pesquisa = { lento: 120 };
      const t0 = Date.now();
      const e = await erroSoftdesk(() => amb.c.listarFila.executar({}));
      const dur = Date.now() - t0;
      expect(e.codigo).toBe('REDE');
      expect(e.mensagem).toContain('leitura excedeu o tempo');
      // Ler as 15 páginas levaria ~1800 ms; o código REDE e a contagem de páginas abaixo são a prova principal.
      expect(dur).toBeLessThan(1700);
      expect(pesquisas(sim).length).toBeLessThan(6);
      await dormir(400);
      expect(pesquisas(sim).length).toBeLessThan(6); // a leitura parou de verdade, não só deixou de responder
    });

    it('a pesquisa com filtro no cliente respeita o mesmo prazo', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 2, quantidade: 2000 }]), { prazoVarreduraMs: 250 });
      sim.pesquisa = { lento: 120 };
      const e = await erroSoftdesk(() => amb.c.pesquisar.executar({ atendente: [MEU], status: [8] }));
      expect(e.codigo).toBe('REDE');
      expect(e.mensagem).toContain('leitura excedeu o tempo');
    });

    it('o prazo conta DESDE a chegada do pedido, incluindo a espera pela vez: a segunda leitura estoura e a resposta nunca passa do prazo (achado B-5)', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 2, quantidade: 400 }]), { prazoVarreduraMs: 450 });
      sim.pesquisa = { lento: 150 };
      // Cada leitura leva ~300 ms (2 páginas de 150 ms). A primeira cabe no prazo; a segunda espera ~300 ms
      // pela vez e só teria ~150 ms de leitura: a resposta é o prazo, em ~450 ms (nunca 600 ms).
      const t0 = Date.now();
      const [a, b] = await Promise.all([
        amb.c.listarFila.executar({ limite: 200 }),
        erroSoftdesk(() => amb.c.listarFila.executar({ limite: 199 })),
      ]);
      const dur = Date.now() - t0;
      expect(a.dados.paginas_lidas).toBe(2);
      expect(b.codigo).toBe('REDE');
      expect(b.mensagem).toContain('leitura excedeu o tempo');
      // A prova principal é b.codigo === 'REDE' (uma 2ª leitura completa teria sucesso); o tempo só limita a ordem de grandeza.
      expect(dur).toBeLessThan(450 + 450);
      expect(amb.c.varredura.emAndamento).toBe(0);
    });

    it('varredura lenta ocupando a vez: quem espera pela vez recebe o prazo sem nunca ter lido (B-5)', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 2, quantidade: 2000 }]), { prazoVarreduraMs: 400 });
      sim.pesquisa = { lento: 250 };
      const primeira = erroSoftdesk(() => amb.c.listarFila.executar({ limite: 200 }));
      await dormir(30);
      const t0 = Date.now();
      const segunda = await erroSoftdesk(() => amb.c.pesquisar.executar({ atendente: [MEU], status: [8] }));
      expect(segunda.codigo).toBe('REDE');
      expect(segunda.mensagem).toContain('leitura excedeu o tempo');
      expect(Date.now() - t0).toBeLessThan(400 + 500);
      await primeira;
    });

    it('erro numa página (500) encerra a leitura sem resultado parcial', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 2, quantidade: 600 }]));
      sim.pesquisa = '500';
      const e = await erroSoftdesk(() => amb.c.listarFila.executar({}));
      expect(e.codigo).toBe('REDE');
      expect(pesquisas(sim)).toHaveLength(1);
    });
  });

  describe('cancelamento da leitura', () => {
    const lenta = (): EspecChamado[] => gerarMassa([{ cdAtendente: MEU, status: 2, quantidade: 1500 }]);

    it('todos os que esperavam desistem → a leitura é cancelada: nenhuma página nova é pedida', async () => {
      await preparar(lenta());
      sim.pesquisa = { lento: 200 };
      const a = new AbortController();
      const b = new AbortController();
      const pa = amb.c.listarFila.executar({}, { sinal: a.signal });
      const pb = amb.c.listarFila.executar({}, { sinal: b.signal });
      const ra = erroSoftdesk(() => pa);
      const rb = erroSoftdesk(() => pb);
      await dormir(60);
      expect(amb.c.listarFila.leiturasEmAndamento).toBe(1); // compartilhada
      a.abort();
      b.abort();
      const [ea, eb] = await Promise.all([ra, rb]);
      expect(ea.codigo).toBe('REDE');
      expect(eb.codigo).toBe('REDE');
      expect(amb.c.listarFila.leiturasEmAndamento).toBe(0);
      await dormir(700);
      expect(pesquisas(sim)).toHaveLength(1); // a página em andamento não gerou a seguinte
      expect(amb.c.varredura.emAndamento).toBe(0);
    });

    it('só um dos que esperavam desiste → o outro recebe a leitura completa', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 5 }, { cdAtendente: MEU, status: 2, quantidade: 300 }], { embaralhar: false }));
      sim.pesquisa = { lento: 100 };
      const a = new AbortController();
      const pa = erroSoftdesk(() => amb.c.listarFila.executar({}, { sinal: a.signal }));
      const pb = amb.c.listarFila.executar({});
      await dormir(30);
      a.abort();
      expect((await pa).codigo).toBe('REDE');
      const rb = (await pb).dados;
      expect(rb.itens).toHaveLength(5);
      expect(rb.proximo_inicio).toBeNull();
    });

    it('sinal já abortado antes de começar → REDE sem nenhuma requisição', async () => {
      await preparar(lenta());
      const a = new AbortController();
      a.abort();
      const e = await erroSoftdesk(() => amb.c.listarFila.executar({}, { sinal: a.signal }));
      expect(e.codigo).toBe('REDE');
      expect(pesquisas(sim)).toHaveLength(0);
    });

    it('sessão descartada durante a leitura → SESSAO_EXPIRADA e nenhuma página nova', async () => {
      await preparar(lenta(), { intervaloSessaoMs: 10 });
      sim.pesquisa = { lento: 250 };
      const p = erroSoftdesk(() => amb.c.listarFila.executar({}));
      await dormir(60);
      amb.c.sessaoStore.descartar('expirada');
      const e = await p;
      expect(e.codigo).toBe('SESSAO_EXPIRADA');
      expect(pesquisas(sim)).toHaveLength(1);
      await dormir(400);
      expect(pesquisas(sim)).toHaveLength(1);
    });

    it('cancelarTodas (parada do serviço) aborta fila e pesquisa em andamento', async () => {
      await preparar(lenta());
      sim.pesquisa = { lento: 200 };
      const pf = erroSoftdesk(() => amb.c.listarFila.executar({}));
      const pp = erroSoftdesk(() => amb.c.pesquisar.executar({ atendente: [MEU], status: [8] }));
      await dormir(60);
      amb.c.listarFila.cancelarTodas();
      expect((await pf).codigo).toBe('REDE');
      expect((await pp).codigo).toBe('REDE');
      await dormir(500);
      expect(pesquisas(sim).length).toBeLessThanOrEqual(2);
    });

    it('sinal da pesquisa simples (uma página) também é propagado', async () => {
      await preparar(lenta());
      sim.pesquisa = { lento: 400 };
      const a = new AbortController();
      const t0 = Date.now();
      const p = erroSoftdesk(() => amb.c.pesquisar.executar({ atendente: [MEU] }, { sinal: a.signal }));
      await dormir(50);
      a.abort();
      expect((await p).codigo).toBe('REDE');
      // Sem o aborto a resposta levaria 400 ms; folga para máquina carregada.
      expect(Date.now() - t0).toBeLessThan(380);
    });
  });

  describe('RNF-06 e §8.3: log de início e de fim com o mesmo correlation_id, só campos permitidos', () => {
    const CID = '3f2b8c1e-9d4a-4e6b-8a7c-1d2e3f4a5b6c';

    function montarComLoggerReal(chamados: EspecChamado[]) {
      const gravados: Array<{ nivel: string; msg: string; obj: Record<string, unknown> }> = [];
      const destino: DestinoLog = {
        info: (msg, obj) => gravados.push({ nivel: 'info', msg, obj: obj as Record<string, unknown> }),
        warn: (msg, obj) => gravados.push({ nivel: 'warn', msg, obj: obj as Record<string, unknown> }),
        error: (msg, obj) => gravados.push({ nivel: 'error', msg, obj: obj as Record<string, unknown> }),
      };
      return { gravados, logger: new ClamedLoggerAdapter(destino, MEU), chamados };
    }

    const doEvento = (g: Array<{ obj: Record<string, unknown> }>, nome: string, acao: string) =>
      g.filter((x) => {
        const ev = x.obj.event as Record<string, string>;
        return ev.name === nome && ev.action === acao;
      });

    it('fila, pesquisa, chamado e saúde: started e success/failure com o mesmo correlation_id; sem valores de filtro, títulos ou nomes', async () => {
      const nomeSecreto = 'Zuleica Confidencial';
      const tituloSecreto = 'Titulo Sigiloso';
      const todos = gerarMassa([
        { cdAtendente: MEU, status: 1, quantidade: 10, solicitantes: [nomeSecreto], titulo: tituloSecreto },
      ]);
      const { gravados, logger } = montarComLoggerReal(todos);
      sim = await SoftdeskSimulado.iniciar({ chamados: todos });
      amb = montarAmbiente(sim, {}, { logger });
      await logarDireto(amb);
      gravados.length = 0;

      const rodar = <T>(fn: () => Promise<T>): Promise<T> =>
        executarComContexto({ correlationId: CID, origem: 'rest' }, fn);

      await rodar(() => amb.c.listarFila.executar({ solicitante_nome: 'zuleica' }));
      await rodar(() => amb.c.pesquisar.executar({ atendente: [MEU], titulo_contem: 'sigiloso', status: [1] }));
      await rodar(() => amb.c.obterChamado.executar({ codigo: todos[0].cd_chamado }));
      await rodar(() => amb.c.verificarSaude.executar());

      for (const [nome, acao] of [
        ['fila', 'scan'],
        ['pesquisa', 'search'],
        ['chamado', 'get'],
        ['saude', 'check'],
      ]) {
        const eventos = doEvento(gravados, nome, acao);
        expect(eventos).toHaveLength(2);
        const [ini, fim] = eventos;
        expect((ini.obj.event as Record<string, string>).outcome).toBe('started');
        expect((fim.obj.event as Record<string, string>).outcome).toBe('success');
        expect(ini.obj.correlation_id).toBe(CID);
        expect(fim.obj.correlation_id).toBe(CID);
        expect(ini.obj.origem).toBe('rest');
        expect(fim.obj.duracao_ms).toEqual(expect.any(Number));
      }

      const fila = doEvento(gravados, 'fila', 'scan')[1].obj;
      expect(fila).toMatchObject({ paginas_lidas: 1, abertos: 10, total_softdesk: 10, incompleto: false });
      const pesq = doEvento(gravados, 'pesquisa', 'search')[1].obj;
      expect(pesq.filtros_usados).toEqual(['atendente', 'status', 'titulo_contem']);
      expect(pesq).toMatchObject({ inicio: 0, limite_aplicado: 50, itens: 10, total: 10 });
      expect(doEvento(gravados, 'chamado', 'get')[1].obj.cd_chamado).toBe(todos[0].cd_chamado);
      expect(doEvento(gravados, 'saude', 'check')[1].obj.modo).toBe('pesquisa');

      const tudo = JSON.stringify(gravados);
      for (const proibido of [nomeSecreto, 'zuleica', tituloSecreto, 'sigiloso', 'Zuleica']) {
        expect(tudo.toLowerCase()).not.toContain(proibido.toLowerCase());
      }
      for (const g of gravados) {
        expect(g.msg).not.toMatch(/zuleica|sigiloso/i);
      }
    });

    it('falha: started e failure com o mesmo correlation_id e só o código do erro', async () => {
      const { gravados, logger } = montarComLoggerReal([]);
      sim = await SoftdeskSimulado.iniciar({ chamados: [] });
      amb = montarAmbiente(sim, {}, { logger });
      await logarDireto(amb);
      gravados.length = 0;
      await expect(
        executarComContexto({ correlationId: CID, origem: 'mcp' }, () => amb.c.listarFila.executar({ limite: 0 })),
      ).rejects.toMatchObject({ codigo: 'FILTRO_INVALIDO' });
      const eventos = doEvento(gravados, 'fila', 'scan');
      expect(eventos.map((e) => (e.obj.event as Record<string, string>).outcome)).toEqual(['started', 'failure']);
      expect(eventos.every((e) => e.obj.correlation_id === CID)).toBe(true);
      expect(eventos[1].obj.codigo_erro).toBe('FILTRO_INVALIDO');
      expect(Object.keys(eventos[1].obj)).not.toContain('message');
    });

    it('operações simultâneas mantêm cada uma o seu correlation_id', async () => {
      const todos = gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 10 }]);
      const { gravados, logger } = montarComLoggerReal(todos);
      sim = await SoftdeskSimulado.iniciar({ chamados: todos });
      amb = montarAmbiente(sim, {}, { logger });
      await logarDireto(amb);
      gravados.length = 0;
      const A = '11111111-1111-4111-8111-111111111111';
      const B = '22222222-2222-4222-8222-222222222222';
      await Promise.all([
        executarComContexto({ correlationId: A }, () => amb.c.listarFila.executar({})),
        executarComContexto({ correlationId: B }, () => amb.c.pesquisar.executar({ atendente: [MEU] })),
      ]);
      const fila = doEvento(gravados, 'fila', 'scan');
      const pesq = doEvento(gravados, 'pesquisa', 'search');
      expect(fila.map((e) => e.obj.correlation_id)).toEqual([A, A]);
      expect(pesq.map((e) => e.obj.correlation_id)).toEqual([B, B]);
    });

    it('sem sessão nada é lido do SoftDesk: o log de fim registra a falha AGUARDANDO_LOGIN', async () => {
      const { gravados, logger } = montarComLoggerReal([]);
      sim = await SoftdeskSimulado.iniciar({ chamados: [] });
      amb = montarAmbiente(sim, {}, { logger });
      await executarComContexto({ correlationId: CID }, () => amb.c.listarFila.executar({})).catch(() => undefined);
      const fim = doEvento(gravados, 'fila', 'scan').at(-1)!;
      expect((fim.obj.event as Record<string, string>).outcome).toBe('failure');
      expect(fim.obj.codigo_erro).toBe('AGUARDANDO_LOGIN');
      expect(doEvento(gravados, 'fila', 'scan')).toHaveLength(2);
      expect(doAtendente([], MEU)).toHaveLength(0);
    });
  });
});
