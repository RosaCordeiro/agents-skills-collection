import { gerarMassa, type EspecChamado } from '../simulador/dados';
import { montarAmbiente, type Ambiente } from '../simulador/sessao-apoio';
import { SoftdeskSimulado } from '../simulador/softdesk-simulado';
import { subirServico, type Servico } from '../simulador/rest-apoio';
import { abertoSpec, doAtendente, dormir, erroSoftdesk, logarDireto, pesquisas } from '../simulador/consulta-apoio';

/**
 * Modo `todas` (pedido de 21/11/2026): VAL-35 (devolve tudo), VAL-36 (tetos e prazo viram incompleto com
 * proximo_inicio e parada_por) e VAL-37 (sem `todas` nada muda; entrada inválida; REST). A parte do MCP
 * (tools/list e paridade) está em test/e2e/todas-mcp.spec.ts.
 */

const MEU = 393;

const codigos = (itens: Array<{ codigo: number | null }>): number[] => itens.map((i) => i.codigo as number);
const semRepetidos = (lista: number[]): boolean => new Set(lista).size === lista.length;
const ordenado = (lista: number[]): number[] => [...lista].sort((a, b) => a - b);

/** 850 do atendente (450 abertas e 400 fechadas) mais 150 de outro: 1.000 no SoftDesk, 5 páginas de 200. */
const massaMista = (): EspecChamado[] =>
  gerarMassa([
    { cdAtendente: MEU, status: 1, quantidade: 300 },
    { cdAtendente: MEU, status: 8, quantidade: 150 },
    { cdAtendente: MEU, status: 2, quantidade: 250 },
    { cdAtendente: MEU, status: 3, quantidade: 150 },
    { cdAtendente: 809, status: 1, quantidade: 150 },
  ]);

describe('modo todas: casos de uso contra o simulador', () => {
  let sim: SoftdeskSimulado;
  let amb: Ambiente;

  afterEach(async () => {
    amb?.c.janelaLogin.fechar();
    await sim?.fechar();
  });

  async function preparar(
    chamados: EspecChamado[],
    opcoes: Parameters<typeof montarAmbiente>[1] = {},
  ): Promise<void> {
    sim = await SoftdeskSimulado.iniciar({ chamados });
    // Os testes de VAL-35 em diante usam tetos largos; os tetos reais (300 itens, 60.000 bytes) têm testes próprios.
    amb = montarAmbiente(sim, { maxItensTodas: 1000, maxBytesTodas: 10_000_000, ...opcoes });
    await logarDireto(amb);
  }

  describe('VAL-35: todas devolve tudo, em 3 páginas ou mais, sem repetidos nem fechados', () => {
    it('fila: todas as 450 abertas, 5 páginas de 200, sem repetidos e sem fechados; envelope do modo todas', async () => {
      const massa = massaMista();
      await preparar(massa);
      const esperadas = doAtendente(massa, MEU).filter(abertoSpec).map((c) => c.cd_chamado);
      expect(esperadas).toHaveLength(450);

      const r = (await amb.c.listarFila.executar({ todas: true })).dados;

      expect(r.itens).toHaveLength(450);
      expect(semRepetidos(codigos(r.itens))).toBe(true);
      expect(ordenado(codigos(r.itens))).toEqual(ordenado(esperadas));
      expect(r.itens.every((i) => i.status_codigo !== null && ![2, 3, 4, 6].includes(i.status_codigo))).toBe(true);
      expect(r.incompleto).toBe(false);
      expect(r.proximo_inicio).toBeNull();
      expect(r.paginas_lidas).toBe(5);
      expect(r.todas).toBe(true);
      expect(r.itens_devolvidos).toBe(450);
      expect(r.teto_itens).toBe(1000);
      expect(r.parada_por).toBeNull();
      expect(r.limite_aplicado).toBeNull();
      expect(r.limite_pedido).toBeNull();
      expect(r.total_softdesk).toBe(850); // o servidor filtra pelo atendente (850 dele, abertas ou não)
      // Páginas de 200, em sequência, sempre só do atendente.
      expect(pesquisas(sim).map((p) => p.query.start[0])).toEqual(['0', '200', '400', '600', '800']);
      expect(pesquisas(sim).every((p) => p.query.limit[0] === '200')).toBe(true);
    });

    it('fila com filtro de texto: todas respeita o filtro (só os do solicitante) em várias páginas', async () => {
      const massa = massaMista();
      await preparar(massa);
      const esperadas = doAtendente(massa, MEU)
        .filter(abertoSpec)
        .filter((c) => c.nm_usuario === 'Marlene Figueira')
        .map((c) => c.cd_chamado);
      expect(esperadas.length).toBeGreaterThan(50);

      const r = (await amb.c.listarFila.executar({ todas: true, solicitante_nome: 'marlene figueira' })).dados;
      expect(ordenado(codigos(r.itens))).toEqual(ordenado(esperadas));
      expect(r.paginas_lidas).toBe(5);
      expect(r.filtro_texto_no_cliente).toBe(true);
    });

    it('pesquisa por atendente (filtro de servidor, sem filtro no cliente): todas passa dos 200 da parte única', async () => {
      const massa = massaMista();
      await preparar(massa);
      const meus = doAtendente(massa, MEU).map((c) => c.cd_chamado);

      const r = (await amb.c.pesquisar.executar({ atendente: [MEU], todas: true })).dados;

      expect(r.itens).toHaveLength(850);
      expect(semRepetidos(codigos(r.itens))).toBe(true);
      expect(ordenado(codigos(r.itens))).toEqual(ordenado(meus));
      expect(r.incompleto).toBe(false);
      expect(r.proximo_inicio).toBeNull();
      expect(r.paginas_lidas).toBe(5);
      expect(r.todas).toBe(true);
      expect(r.itens_devolvidos).toBe(850);
      expect(r.teto_itens).toBe(1000);
      expect(r.parada_por).toBeNull();
      expect(r.limite_aplicado).toBeNull();
      expect(r.total).toBe(meus.length);
    });

    it('pesquisa com status no cliente e atendente: todas devolve só os status pedidos, sem fechados', async () => {
      const massa = massaMista();
      await preparar(massa);
      const esperadas = doAtendente(massa, MEU)
        .filter((c) => c.st_chamado === 1 || c.st_chamado === 8)
        .map((c) => c.cd_chamado);

      const r = (await amb.c.pesquisar.executar({ atendente: [MEU], status: [1, 8], todas: true })).dados;

      expect(ordenado(codigos(r.itens))).toEqual(ordenado(esperadas));
      expect(semRepetidos(codigos(r.itens))).toBe(true);
      expect(r.filtro_status_no_cliente).toBe(true);
      expect(r.incompleto).toBe(false);
    });

    it('pesquisa com filtro de texto: todas respeita o filtro', async () => {
      const massa = massaMista();
      await preparar(massa);
      const esperadas = doAtendente(massa, MEU)
        .filter((c) => c.nm_usuario === 'Hélio Pires')
        .map((c) => c.cd_chamado);

      const r = (await amb.c.pesquisar.executar({ atendente: [MEU], solicitante_nome: 'helio pires', todas: true })).dados;
      expect(ordenado(codigos(r.itens))).toEqual(ordenado(esperadas));
    });
  });

  describe('VAL-36: tetos e prazo viram incompleto com proximo_inicio e parada_por; continuar completa sem repetidos', () => {
    /** Continua com `proximo_inicio` até acabar e devolve tudo o que veio, na ordem. */
    async function lerTudoContinuando(
      chamar: (inicio: number | undefined) => Promise<{ itens: Array<{ codigo: number | null }>; proximo_inicio: number | null }>,
    ): Promise<{ codigos: number[]; chamadas: number }> {
      const todos: number[] = [];
      let inicio: number | undefined;
      let chamadas = 0;
      for (;;) {
        const r = await chamar(inicio);
        chamadas += 1;
        todos.push(...codigos(r.itens));
        if (r.proximo_inicio === null) return { codigos: todos, chamadas };
        inicio = r.proximo_inicio;
        if (chamadas > 50) throw new Error('a continuação não terminou');
      }
    }

    it('teto de itens (fila): para em 100, incompleto, parada_por itens, proximo_inicio; continuar com proximo_inicio completa as 450 sem repetidos', async () => {
      const massa = massaMista();
      await preparar(massa, { maxItensTodas: 100 });
      const esperadas = doAtendente(massa, MEU).filter(abertoSpec).map((c) => c.cd_chamado);

      const r1 = (await amb.c.listarFila.executar({ todas: true })).dados;
      expect(r1.itens).toHaveLength(100);
      expect(r1.itens_devolvidos).toBe(100);
      expect(r1.teto_itens).toBe(100);
      expect(r1.incompleto).toBe(true);
      expect(r1.parada_por).toBe('itens');
      expect(typeof r1.proximo_inicio).toBe('number');
      expect(r1.proximo_inicio as number).toBeGreaterThan(0);

      const { codigos: todos, chamadas } = await lerTudoContinuando(async (inicio) => {
        const d = (await amb.c.listarFila.executar({ todas: true, ...(inicio === undefined ? {} : { inicio }) })).dados;
        return d;
      });
      expect(chamadas).toBeGreaterThanOrEqual(5);
      expect(semRepetidos(todos)).toBe(true);
      expect(ordenado(todos)).toEqual(ordenado(esperadas));
    });

    it('teto de itens (pesquisa): parada_por itens e a continuação completa sem repetidos', async () => {
      const massa = massaMista();
      await preparar(massa, { maxItensTodas: 300 });
      const meus = doAtendente(massa, MEU).map((c) => c.cd_chamado);

      const r1 = (await amb.c.pesquisar.executar({ atendente: [MEU], todas: true })).dados;
      expect(r1.itens).toHaveLength(300);
      expect(r1.incompleto).toBe(true);
      expect(r1.parada_por).toBe('itens');
      expect(r1.proximo_inicio).not.toBeNull();

      const { codigos: todos } = await lerTudoContinuando(async (inicio) =>
        (await amb.c.pesquisar.executar({ atendente: [MEU], todas: true, ...(inicio === undefined ? {} : { inicio }) })).dados,
      );
      expect(semRepetidos(todos)).toBe(true);
      expect(ordenado(todos)).toEqual(ordenado(meus));
    });

    it('chegar exatamente ao teto de itens no fim da lista NÃO é incompleto', async () => {
      const massa = gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 120 }]);
      await preparar(massa, { maxItensTodas: 120 });
      const r = (await amb.c.listarFila.executar({ todas: true })).dados;
      expect(r.itens).toHaveLength(120);
      expect(r.incompleto).toBe(false);
      expect(r.parada_por).toBeNull();
      expect(r.proximo_inicio).toBeNull();
    });

    it('teto de páginas (fila): lê 2 páginas, incompleto, parada_por paginas, proximo_inicio 400; continuar completa sem repetidos', async () => {
      const massa = massaMista();
      await preparar(massa, { maxPaginasTodas: 2 });
      const esperadas = doAtendente(massa, MEU).filter(abertoSpec).map((c) => c.cd_chamado);

      const r1 = (await amb.c.listarFila.executar({ todas: true })).dados;
      expect(r1.paginas_lidas).toBe(2);
      expect(r1.incompleto).toBe(true);
      expect(r1.parada_por).toBe('paginas');
      expect(r1.proximo_inicio).toBe(400);
      expect(pesquisas(sim)).toHaveLength(2);
      expect(r1.itens.length).toBeLessThan(450);

      const { codigos: todos, chamadas } = await lerTudoContinuando(async (inicio) =>
        (await amb.c.listarFila.executar({ todas: true, ...(inicio === undefined ? {} : { inicio }) })).dados,
      );
      expect(chamadas).toBe(3);
      expect(semRepetidos(todos)).toBe(true);
      expect(ordenado(todos)).toEqual(ordenado(esperadas));
    });

    it('teto de páginas (pesquisa): parada_por paginas e proximo_inicio 400', async () => {
      await preparar(massaMista(), { maxPaginasTodas: 2 });
      const r = (await amb.c.pesquisar.executar({ atendente: [MEU], todas: true })).dados;
      expect(r.paginas_lidas).toBe(2);
      expect(r.incompleto).toBe(true);
      expect(r.parada_por).toBe('paginas');
      expect(r.proximo_inicio).toBe(400);
      expect(r.itens).toHaveLength(400);
    });

    it('prazo (fila): devolve o que leu com incompleto, parada_por prazo e proximo_inicio (nunca erro); continuar completa sem repetidos', async () => {
      const massa = gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 1000 }]);
      await preparar(massa, { prazoVarreduraMs: 500 });
      sim.pesquisa = { lento: 200 };

      const r1 = (await amb.c.listarFila.executar({ todas: true })).dados;
      expect(r1.incompleto).toBe(true);
      expect(r1.parada_por).toBe('prazo');
      expect(r1.paginas_lidas).toBeGreaterThanOrEqual(1);
      expect(r1.paginas_lidas).toBeLessThan(5);
      expect(r1.proximo_inicio).toBe(r1.paginas_lidas * 200);
      expect(r1.itens).toHaveLength(r1.paginas_lidas * 200);
      expect(amb.c.varredura.emAndamento).toBe(0);

      sim.pesquisa = 'ok';
      const resto = (await amb.c.listarFila.executar({ todas: true, inicio: r1.proximo_inicio as number })).dados;
      expect(resto.incompleto).toBe(false);
      const todos = [...codigos(r1.itens), ...codigos(resto.itens)];
      expect(semRepetidos(todos)).toBe(true);
      expect(ordenado(todos)).toEqual(ordenado(massa.map((c) => c.cd_chamado)));
    });

    it('prazo (pesquisa): mesmo comportamento, parada_por prazo', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 1600 }]), { prazoVarreduraMs: 500 });
      sim.pesquisa = { lento: 200 };
      const r = (await amb.c.pesquisar.executar({ atendente: [MEU], todas: true })).dados;
      expect(r.incompleto).toBe(true);
      expect(r.parada_por).toBe('prazo');
      expect(r.proximo_inicio).toBe(r.paginas_lidas * 200);
      expect(r.itens).toHaveLength(r.paginas_lidas * 200);
    });

    it('prazo vencido ANTES de qualquer página lida continua sendo REDE (não há o que devolver)', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 600 }]), { prazoVarreduraMs: 150 });
      sim.pesquisa = { lento: 500 };
      const e = await erroSoftdesk(() => amb.c.listarFila.executar({ todas: true }));
      expect(e.codigo).toBe('REDE');
      expect(e.mensagem).toContain('leitura excedeu o tempo');
    });

    it('cancelamento no meio da leitura em modo todas é erro (não vira parcial) e libera a vez', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 1600 }]));
      sim.pesquisa = { lento: 150 };
      const ctl = new AbortController();
      const p = erroSoftdesk(() => amb.c.listarFila.executar({ todas: true }, { sinal: ctl.signal }));
      await dormir(200);
      ctl.abort();
      const e = await p;
      expect(e.codigo).toBe('REDE');
      expect(e.mensagem).toContain('cancelada');
      for (let i = 0; i < 100 && amb.c.varredura.emAndamento > 0; i++) await dormir(20);
      expect(amb.c.varredura.emAndamento).toBe(0);
    });

    it('RNF-04: fila todas e pesquisa todas ao mesmo tempo nunca têm duas requisições simultâneas ao SoftDesk', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 800 }]));
      sim.pesquisa = { lento: 20 };
      const [f, p] = await Promise.all([
        amb.c.listarFila.executar({ todas: true }),
        amb.c.pesquisar.executar({ atendente: [MEU], todas: true }),
      ]);
      expect(f.dados.itens).toHaveLength(800);
      expect(p.dados.itens).toHaveLength(800);
      expect(sim.picoSimultaneas).toBe(1);
    });
  });

  describe('teto real de 300 itens, parada por tamanho e encadeamento (continuar com proximo_inicio)', () => {
    type Leitura = { itens: Array<{ codigo: number | null }>; proximo_inicio: number | null; parada_por?: string | null };
    const encadear = async (chamar: (inicio?: number) => Promise<Leitura>) => {
      const todos: number[] = [];
      const paradas: Array<string | null | undefined> = [];
      let inicio: number | undefined;
      for (let i = 0; i < 30; i++) {
        const r = await chamar(inicio);
        todos.push(...codigos(r.itens));
        paradas.push(r.parada_por);
        if (r.proximo_inicio === null) return { todos, paradas };
        inicio = r.proximo_inicio;
      }
      throw new Error('a continuação não terminou');
    };
    const comInicio = (inicio?: number): Record<string, number> => (inicio === undefined ? {} : { inicio });

    it('teto de 300 itens (teto_itens 300, parada_por itens); encadear com proximo_inicio devolve as 450 sem repetidos', async () => {
      const massa = massaMista();
      await preparar(massa, { maxItensTodas: 300 });
      const esperadas = doAtendente(massa, MEU).filter(abertoSpec).map((c) => c.cd_chamado);
      const r1 = (await amb.c.listarFila.executar({ todas: true })).dados;
      expect(r1.itens).toHaveLength(300);
      expect(r1.teto_itens).toBe(300);
      expect(r1.parada_por).toBe('itens');
      const { todos, paradas } = await encadear(async (i) => (await amb.c.listarFila.executar({ todas: true, ...comInicio(i) })).dados);
      expect(paradas[0]).toBe('itens');
      expect(semRepetidos(todos)).toBe(true);
      expect(ordenado(todos)).toEqual(ordenado(esperadas));
    });

    it('constantes de regra: teto de 300 itens e 60.000 bytes; o container usa 300 sem opção', async () => {
      const { MAX_ITENS_TODAS, MAX_BYTES_TODAS } = await import('../../src/core/domain/services/fila.service');
      expect(MAX_ITENS_TODAS).toBe(300);
      expect(MAX_BYTES_TODAS).toBe(60_000);
      await preparar(massaMista());
      amb.c.janelaLogin.fechar();
      const padrao = montarAmbiente(sim, { maxBytesTodas: 10_000_000 });
      await logarDireto(padrao);
      const r = (await padrao.c.listarFila.executar({ todas: true })).dados;
      padrao.c.janelaLogin.fechar();
      expect(r.teto_itens).toBe(300);
      expect(r.itens).toHaveLength(300);
      expect(r.parada_por).toBe('itens');
    });

    it('parada por tamanho: JSON dos itens dentro do limite, incompleto, parada_por tamanho; encadear devolve as 450 sem repetidos', async () => {
      const massa = massaMista();
      await preparar(massa, { maxBytesTodas: 20_000 });
      const esperadas = doAtendente(massa, MEU).filter(abertoSpec).map((c) => c.cd_chamado);
      const r1 = (await amb.c.listarFila.executar({ todas: true })).dados;
      expect(r1.parada_por).toBe('tamanho');
      expect(r1.incompleto).toBe(true);
      expect(r1.itens.length).toBeGreaterThan(10);
      expect(r1.itens.length).toBeLessThan(450);
      expect(Buffer.byteLength(JSON.stringify(r1.itens))).toBeLessThanOrEqual(20_000);
      expect(typeof r1.proximo_inicio).toBe('number');
      const { todos, paradas } = await encadear(async (i) => (await amb.c.listarFila.executar({ todas: true, ...comInicio(i) })).dados);
      expect(paradas[0]).toBe('tamanho');
      expect(semRepetidos(todos)).toBe(true);
      expect(ordenado(todos)).toEqual(ordenado(esperadas));
    });

    it('parada por tamanho também na pesquisa; encadear devolve tudo sem repetidos', async () => {
      const massa = massaMista();
      await preparar(massa, { maxBytesTodas: 20_000 });
      const meus = doAtendente(massa, MEU).map((c) => c.cd_chamado);
      const { todos, paradas } = await encadear(async (i) => (await amb.c.pesquisar.executar({ atendente: [MEU], todas: true, ...comInicio(i) })).dados);
      expect(paradas[0]).toBe('tamanho');
      expect(ordenado(todos)).toEqual(ordenado(meus));
      expect(semRepetidos(todos)).toBe(true);
    });

    it('com os tetos reais (300 itens e 60.000 bytes) e títulos realistas (~100 caracteres, com acentos): o encadeamento devolve TODAS sem repetidos, cada resposta dentro de 60.000 bytes e parando por tamanho', async () => {
      const titulo = 'Solicitação de alteração de configuração da impressora fiscal na loja, não consegue emitir cupom após atualização';
      const massa = gerarMassa([
        { cdAtendente: MEU, status: 1, quantidade: 500, titulo },
        { cdAtendente: MEU, status: 8, quantidade: 200, titulo },
        { cdAtendente: MEU, status: 2, quantidade: 300, titulo },
        { cdAtendente: 809, status: 1, quantidade: 100, titulo },
      ]);
      await preparar(massa, { maxItensTodas: 300, maxBytesTodas: 60_000 });
      const esperadas = doAtendente(massa, MEU).filter(abertoSpec).map((c) => c.cd_chamado);
      expect(esperadas).toHaveLength(700);
      let maior = 0;
      let maiorItens = 0;
      const { todos, paradas } = await encadear(async (i) => {
        const d = (await amb.c.listarFila.executar({ todas: true, ...comInicio(i) })).dados;
        maior = Math.max(maior, Buffer.byteLength(JSON.stringify(d.itens)));
        maiorItens = Math.max(maiorItens, d.itens.length);
        return d;
      });
      expect(maior).toBeLessThanOrEqual(60_000);
      expect(maiorItens).toBeLessThan(300); // o tamanho, e não o teto de itens, é que manda com títulos reais
      expect(paradas[0]).toBe('tamanho');
      expect(paradas.length).toBeGreaterThanOrEqual(4);
      expect(paradas.slice(0, -1).every((p) => p === 'tamanho')).toBe(true);
      expect(paradas[paradas.length - 1]).toBeNull();
      expect(semRepetidos(todos)).toBe(true);
      expect(ordenado(todos)).toEqual(ordenado(esperadas));
    });

    it('pesquisa todas SEM nenhum filtro: varre as páginas do SoftDesk inteiro (5 páginas) e devolve tudo', async () => {
      await preparar(massaMista());
      const r = (await amb.c.pesquisar.executar({ todas: true })).dados;
      expect(r.itens).toHaveLength(1000);
      expect(r.paginas_lidas).toBe(5);
      expect(semRepetidos(codigos(r.itens))).toBe(true);
      expect(r.incompleto).toBe(false);
      expect(pesquisas(sim)).toHaveLength(5);
    });

    it('dois todas idênticos e simultâneos se juntam numa só leitura (5 requisições, não 10)', async () => {
      await preparar(massaMista());
      sim.pesquisa = { lento: 30 };
      const [a, b] = await Promise.all([amb.c.listarFila.executar({ todas: true }), amb.c.listarFila.executar({ todas: true })]);
      expect(a.dados.itens).toHaveLength(450);
      expect(b.dados).toEqual(a.dados);
      expect(pesquisas(sim)).toHaveLength(5);
    });

    it('log da pesquisa todas: só campos permitidos, sem título, nome ou valor de filtro', async () => {
      await preparar(massaMista());
      await amb.c.pesquisar.executar({ atendente: [MEU], solicitante_nome: 'helio pires', todas: true });
      const texto = amb.logger.texto();
      expect(texto).toContain('"todas":true');
      expect(texto).toContain('"parada_por":null');
      expect(texto).not.toMatch(/helio|Hélio|Chamado fictício/i);
    });
  });

  describe('VAL-37: sem todas nada muda; entrada inválida não chama o SoftDesk', () => {
    it('fila sem todas: mesmo envelope de antes (sem campos novos), limite 50, uma parte', async () => {
      await preparar(massaMista());
      const r = (await amb.c.listarFila.executar({})).dados;
      expect(Object.keys(r).sort()).toEqual(
        [
          'filtro_texto_no_cliente',
          'incompleto',
          'inicio',
          'itens',
          'limite_aplicado',
          'limite_pedido',
          'paginas_lidas',
          'proximo_inicio',
          'total_softdesk',
        ].sort(),
      );
      expect(r.itens).toHaveLength(50);
      expect(r.limite_aplicado).toBe(50);
      expect(r.limite_pedido).toBe(50);
      expect(r.proximo_inicio).not.toBeNull();
      expect(r.paginas_lidas).toBeLessThan(5);
    });

    it('fila com todas:false é idêntica a omitir todas (dados e requisições)', async () => {
      const massa = massaMista();
      await preparar(massa);
      const a = (await amb.c.listarFila.executar({})).dados;
      const reqA = pesquisas(sim).length;
      const b = (await amb.c.listarFila.executar({ todas: false })).dados;
      expect(b).toEqual(a);
      expect(pesquisas(sim).length - reqA).toBe(reqA);
      expect('todas' in b).toBe(false);
    });

    it('pesquisa sem todas (só servidor): uma página, teto de 200, sem campos novos; com todas:false igual', async () => {
      await preparar(massaMista());
      const a = (await amb.c.pesquisar.executar({ atendente: [MEU], limite: 500 })).dados;
      expect(pesquisas(sim)).toHaveLength(1);
      expect(a.itens).toHaveLength(200);
      expect(a.limite_aplicado).toBe(200);
      expect(a.limite_pedido).toBe(500);
      expect(a.paginas_lidas).toBe(1);
      expect(a.proximo_inicio).toBeNull();
      for (const k of ['todas', 'itens_devolvidos', 'teto_itens', 'parada_por']) expect(k in a).toBe(false);
      const b = (await amb.c.pesquisar.executar({ atendente: [MEU], limite: 500, todas: false })).dados;
      expect(b).toEqual(a);
    });

    it('sem todas o prazo estourado continua sendo REDE mesmo com páginas já lidas (sem parcial)', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 2, quantidade: 1600 }]), { prazoVarreduraMs: 500 });
      sim.pesquisa = { lento: 200 };
      const ef = await erroSoftdesk(() => amb.c.listarFila.executar({}));
      expect(ef.codigo).toBe('REDE');
      const ep = await erroSoftdesk(() => amb.c.pesquisar.executar({ atendente: [MEU], status: [8] }));
      expect(ep.codigo).toBe('REDE');
    });

    it('sem todas o teto de 15 páginas continua com parada informada só por incompleto (sem campos do modo todas)', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 2, quantidade: 3100 }], { embaralhar: false }));
      const r = (await amb.c.listarFila.executar({})).dados;
      expect(r.incompleto).toBe(true);
      expect(r.paginas_lidas).toBe(15);
      for (const k of ['todas', 'itens_devolvidos', 'teto_itens', 'parada_por']) expect(k in r).toBe(false);
    });

    it.each([
      ['todas como texto', { todas: 'true' }],
      ['todas como número', { todas: 1 }],
      ['todas nulo', { todas: null }],
      ['todas como lista', { todas: [true] }],
    ])('%s → FILTRO_INVALIDO na fila e na pesquisa, com zero requisições ao SoftDesk', async (_nome, entrada) => {
      await preparar(massaMista());
      const ef = await erroSoftdesk(() => amb.c.listarFila.executar(entrada));
      expect(ef.codigo).toBe('FILTRO_INVALIDO');
      expect(ef.campos).toEqual(['todas']);
      const ep = await erroSoftdesk(() => amb.c.pesquisar.executar({ atendente: [MEU], ...entrada }));
      expect(ep.codigo).toBe('FILTRO_INVALIDO');
      expect(ep.campos).toEqual(['todas']);
      expect(sim.requisicoes('/chamado/json')).toHaveLength(0);
    });

    it('todas:true junto de limite é ambíguo → FILTRO_INVALIDO (campos todas e limite), sem requisições; todas:false com limite vale', async () => {
      await preparar(massaMista());
      for (const limite of [10, 200, 500]) {
        const ef = await erroSoftdesk(() => amb.c.listarFila.executar({ todas: true, limite }));
        expect(ef.codigo).toBe('FILTRO_INVALIDO');
        expect(ef.campos).toEqual(['todas', 'limite']);
        const ep = await erroSoftdesk(() => amb.c.pesquisar.executar({ atendente: [MEU], todas: true, limite }));
        expect(ep.codigo).toBe('FILTRO_INVALIDO');
        expect(ep.campos).toEqual(['todas', 'limite']);
      }
      expect(sim.requisicoes('/chamado/json')).toHaveLength(0);

      const ok = (await amb.c.listarFila.executar({ todas: false, limite: 10 })).dados;
      expect(ok.itens).toHaveLength(10);
      expect(ok.limite_aplicado).toBe(10);
    });

    it('todas com inicio é permitido (continua a partir dele)', async () => {
      const massa = massaMista();
      await preparar(massa);
      const r = (await amb.c.listarFila.executar({ todas: true, inicio: 600 })).dados;
      expect(r.inicio).toBe(600);
      expect(r.paginas_lidas).toBe(2);
      expect(pesquisas(sim).map((p) => p.query.start[0])).toEqual(['600', '800']);
    });

    it('log do modo todas só tem campos da lista de permissão e nenhum título, nome ou valor de filtro', async () => {
      await preparar(massaMista());
      await amb.c.listarFila.executar({ todas: true, solicitante_nome: 'marlene figueira' });
      const texto = amb.logger.texto();
      expect(texto).toContain('"todas":true');
      expect(texto).toContain('"parada_por":null');
      expect(texto).not.toContain('Marlene');
      expect(texto).not.toContain('marlene');
      expect(texto).not.toContain('Chamado fictício');
    });
  });
});

describe('modo todas: REST', () => {
  let sim: SoftdeskSimulado;
  const servicos: Servico[] = [];

  afterEach(async () => {
    for (const s of servicos.splice(0)) await s.encerrar();
    await sim?.fechar();
  });

  async function iniciar(
    chamados: EspecChamado[],
    opcoesContainer: Parameters<typeof subirServico>[1] = {},
  ): Promise<Servico> {
    sim = await SoftdeskSimulado.iniciar({ chamados });
    const s = await subirServico(sim, {
      ...opcoesContainer,
      opcoesContainer: { maxItensTodas: 1000, maxBytesTodas: 10_000_000, ...(opcoesContainer.opcoesContainer ?? {}) },
    });
    servicos.push(s);
    await s.entrarPeloRest();
    return s;
  }

  it('VAL-35 REST: GET /v1/fila?todas=true devolve as 450 abertas e POST pesquisa com todas:true devolve as 850', async () => {
    const massa = massaMista();
    const s = await iniciar(massa);
    const esperadas = doAtendente(massa, MEU).filter(abertoSpec).map((c) => c.cd_chamado);

    const f = await s.chamar('/v1/fila?todas=true');
    expect(f.status).toBe(200);
    expect(f.json.dados.todas).toBe(true);
    expect(f.json.dados.itens).toHaveLength(450);
    expect(semRepetidos(codigos(f.json.dados.itens))).toBe(true);
    expect(ordenado(codigos(f.json.dados.itens))).toEqual(ordenado(esperadas));
    expect(f.json.dados.itens_devolvidos).toBe(450);
    expect(f.json.dados.parada_por).toBeNull();
    expect(f.json.dados.incompleto).toBe(false);

    const p = await s.chamar('/v1/chamados/pesquisa', { metodo: 'POST', corpo: { atendente: [MEU], todas: true } });
    expect(p.status).toBe(200);
    expect(p.json.dados.itens).toHaveLength(850);
    expect(semRepetidos(codigos(p.json.dados.itens))).toBe(true);
    expect(p.json.dados.todas).toBe(true);
    expect(p.json.dados.itens_devolvidos).toBe(850);
  });

  it('VAL-36 REST: teto de itens reduzido devolve 200 com incompleto, parada_por e proximo_inicio; continuar com ?inicio= completa', async () => {
    const massa = massaMista();
    const s = await iniciar(massa, { opcoesContainer: { maxItensTodas: 200 } });
    const esperadas = doAtendente(massa, MEU).filter(abertoSpec).map((c) => c.cd_chamado);

    const todos: number[] = [];
    let inicio = 0;
    let primeira = true;
    for (let i = 0; i < 10; i++) {
      const r = await s.chamar(`/v1/fila?todas=true&inicio=${inicio}`);
      expect(r.status).toBe(200);
      if (primeira) {
        expect(r.json.dados.incompleto).toBe(true);
        expect(r.json.dados.parada_por).toBe('itens');
        expect(r.json.dados.teto_itens).toBe(200);
        primeira = false;
      }
      todos.push(...codigos(r.json.dados.itens));
      if (r.json.dados.proximo_inicio === null) break;
      inicio = r.json.dados.proximo_inicio;
    }
    expect(semRepetidos(todos)).toBe(true);
    expect(ordenado(todos)).toEqual(ordenado(esperadas));
  });

  it('VAL-37 REST: todas=false igual a omitir; todas inválido, repetido ou com limite → 400 FILTRO_INVALIDO sem requisições', async () => {
    const s = await iniciar(massaMista());
    const sem = await s.chamar('/v1/fila');
    const requisicoesAntes = sim.requisicoes('/chamado/json').length;
    const falso = await s.chamar('/v1/fila?todas=false');
    expect(falso.status).toBe(200);
    const normal = (j: any) => {
      const { correlation_id: _c, ...resto } = j;
      return resto;
    };
    expect(normal(falso.json)).toEqual(normal(sem.json));
    expect('todas' in falso.json.dados).toBe(false);
    const requisicoesDepois = sim.requisicoes('/chamado/json').length;

    for (const q of ['todas=talvez', 'todas=1', 'todas=TRUE', 'todas=', 'todas=true&todas=true', 'todas=true&limite=10', 'todas=true&limite=500']) {
      const r = await s.chamar(`/v1/fila?${q}`);
      expect(r.status).toBe(400);
      expect(r.json.error.code).toBe('FILTRO_INVALIDO');
    }
    const post = await s.chamar('/v1/chamados/pesquisa', { metodo: 'POST', corpo: { atendente: [MEU], todas: true, limite: 20 } });
    expect(post.status).toBe(400);
    expect(post.json.error.code).toBe('FILTRO_INVALIDO');
    expect(post.json.error.campos).toEqual(['todas', 'limite']);
    const postTexto = await s.chamar('/v1/chamados/pesquisa', { metodo: 'POST', corpo: { atendente: [MEU], todas: 'true' } });
    expect(postTexto.status).toBe(400);
    expect(postTexto.json.error.code).toBe('FILTRO_INVALIDO');
    expect(sim.requisicoes('/chamado/json').length).toBe(requisicoesDepois);
    expect(requisicoesDepois - requisicoesAntes).toBe(requisicoesAntes); // todas=false fez as mesmas requisições de omitir
  });
});
