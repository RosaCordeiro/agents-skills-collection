import { paraBasico } from '../../src/core/domain/entities/chamado';
import { CONTRATO_DOURADO } from '../../src/infraestructure/softdesk/contrato';
import type { ISoftdeskGateway } from '../../src/core/domain/ports/softdesk.gateway';
import { gerarMassa, montarItem, type EspecChamado } from '../simulador/dados';
import { montarGateway } from '../simulador/apoio';
import { montarAmbiente, type Ambiente } from '../simulador/sessao-apoio';
import { SoftdeskSimulado } from '../simulador/softdesk-simulado';
import { abertoSpec, doAtendente, logarDireto, pesquisas } from '../simulador/consulta-apoio';

const MEU = 393;
const sem = (t: string): string => t.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();

describe('consultas: fila e pesquisa contra o simulador (fragmento 4)', () => {
  let sim: SoftdeskSimulado;
  let amb: Ambiente;

  afterEach(async () => {
    amb?.c.janelaLogin.fechar();
    await sim?.fechar();
  });

  async function preparar(chamados: EspecChamado[], substitutos: Parameters<typeof montarAmbiente>[2] = {}) {
    sim = await SoftdeskSimulado.iniciar({ chamados });
    amb = montarAmbiente(sim, {}, substitutos);
    await logarDireto(amb);
  }

  describe('VAL-03: pesquisa maior que a página, teto de 200 e páginas sem repetidos', () => {
    it('limite 500 → limite_aplicado 200 (e 200 vai ao servidor); página 2 sem repetidos; total do simulador', async () => {
      const massa = gerarMassa([
        { cdAtendente: MEU, status: 1, quantidade: 300 },
        { cdAtendente: MEU, status: 8, quantidade: 200 },
        { cdAtendente: MEU, status: 2, quantidade: 100 },
        { cdAtendente: 809, status: 1, quantidade: 150 },
      ]);
      await preparar(massa);
      const meus = doAtendente(massa, MEU);

      const p1 = (await amb.c.pesquisar.executar({ atendente: [MEU], limite: 500 })).dados;
      expect(p1.limite_pedido).toBe(500);
      expect(p1.limite_aplicado).toBe(200);
      expect(p1.itens).toHaveLength(200);
      expect(p1.total).toBe(meus.length);
      expect(p1.proximo_inicio).toBeNull(); // sem filtro no cliente a pesquisa não continua sozinha
      expect(pesquisas(sim)[0].query.limit).toEqual(['200']);

      const p2 = (await amb.c.pesquisar.executar({ atendente: [MEU], limite: 500, inicio: 200 })).dados;
      expect(p2.inicio).toBe(200);
      expect(p2.total).toBe(meus.length);
      const c1 = p1.itens.map((i) => i.codigo);
      const c2 = p2.itens.map((i) => i.codigo);
      expect(c2.filter((c) => c1.includes(c))).toEqual([]);
      expect(c1).toEqual(meus.slice(0, 200).map((c) => c.cd_chamado));
      expect(c2).toEqual(meus.slice(200, 400).map((c) => c.cd_chamado));
    });

    it('limite padrão é 50 e a resposta traz limite_pedido igual', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 120 }]));
      const r = (await amb.c.pesquisar.executar({ atendente: [MEU] })).dados;
      expect(r.itens).toHaveLength(50);
      expect(r.limite_aplicado).toBe(50);
      expect(r.limite_pedido).toBe(50);
    });

    it('filtros_nao_confirmados lista só nomes fora do conjunto confirmado (CA-09)', async () => {
      await preparar(gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 5 }]));
      const r = (
        await amb.c.pesquisar.executar({ atendente: [MEU], palavra_chave: 'impressora', area: 4, incluir_inativos: false })
      ).dados;
      expect(r.filtros_nao_confirmados.sort()).toEqual(['area', 'incluir_inativos', 'palavra_chave']);
      expect(JSON.stringify(r.filtros_nao_confirmados)).not.toContain('impressora');
    });
  });

  describe('VAL-04: teto de 15 páginas', () => {
    it('mais de 3.000 chamados sem abertos nas 15 primeiras páginas → incompleto, proximo_inicio e 15 páginas no registro; a continuação acha o resto', async () => {
      const massa = gerarMassa(
        [
          { cdAtendente: MEU, status: 2, quantidade: 3100 },
          { cdAtendente: MEU, status: 1, quantidade: 100 },
        ],
        { embaralhar: false },
      );
      await preparar(massa);

      const r1 = (await amb.c.listarFila.executar({})).dados;
      expect(r1.incompleto).toBe(true);
      expect(r1.proximo_inicio).toBe(3000);
      expect(r1.paginas_lidas).toBe(15);
      expect(r1.itens).toHaveLength(0);
      expect(r1.total_softdesk).toBe(3200);
      expect(pesquisas(sim)).toHaveLength(15);
      expect(pesquisas(sim).map((p) => p.query.start[0])).toEqual(
        Array.from({ length: 15 }, (_, i) => String(i * 200)),
      );

      const r2 = (await amb.c.listarFila.executar({ inicio: r1.proximo_inicio as number, limite: 200 })).dados;
      expect(r2.incompleto).toBe(false);
      expect(r2.proximo_inicio).toBeNull();
      expect(r2.itens).toHaveLength(100);
      expect(pesquisas(sim)).toHaveLength(16);
    });

    it('a pesquisa por status no cliente também marca incompleto ao cobrir só 3.000', async () => {
      const massa = gerarMassa(
        [
          { cdAtendente: MEU, status: 2, quantidade: 3100 },
          { cdAtendente: MEU, status: 8, quantidade: 50 },
        ],
        { embaralhar: false },
      );
      await preparar(massa);
      const r = (await amb.c.pesquisar.executar({ atendente: [MEU], status: [8] })).dados;
      expect(r.incompleto).toBe(true);
      expect(r.proximo_inicio).toBe(3000);
      expect(r.itens).toHaveLength(0);
      expect(r.paginas_lidas).toBe(15);
    });
  });

  describe('RN-16: pesquisa sem filtro de servidor restritivo', () => {
    it('filtro só de texto (sem atendente): lê os 3.000 mais novos em 15 páginas, marca incompleto e não manda atendente ao servidor', async () => {
      const massa = gerarMassa([{ cdAtendente: 809, status: 2, quantidade: 3200 }], { embaralhar: false });
      await preparar(massa);
      const r = (await amb.c.pesquisar.executar({ solicitante_nome: 'zzz-nome-que-ninguem-tem' })).dados;
      expect(r.incompleto).toBe(true);
      expect(r.paginas_lidas).toBe(15);
      expect(r.itens).toHaveLength(0);
      expect(pesquisas(sim)).toHaveLength(15);
      expect(pesquisas(sim).every((q) => q.query['pesq_cd_atendente[]'] === undefined)).toBe(true);
    });
  });

  describe('VAL-12: fila por partes com abertos e fechados espalhados', () => {
    const massa = (): EspecChamado[] =>
      gerarMassa([
        { cdAtendente: MEU, status: 1, quantidade: 300 },
        { cdAtendente: MEU, status: 8, quantidade: 150 },
        { cdAtendente: MEU, status: 0, quantidade: 70 },
        { cdAtendente: MEU, status: 2, quantidade: 120 },
        { cdAtendente: MEU, status: 3, quantidade: 90 },
        { cdAtendente: MEU, status: 4, quantidade: 80 },
        { cdAtendente: MEU, status: 6, quantidade: 90 },
        { cdAtendente: 809, status: 1, quantidade: 150 },
        { cdAtendente: 809, status: 2, quantidade: 60 },
      ]);

    it('leituras repetidas com proximo_inicio devolvem todos os abertos, sem repetidos e sem fechados; null no fim', async () => {
      const todos = massa();
      await preparar(todos);
      const esperados = doAtendente(todos, MEU).filter(abertoSpec).map((c) => c.cd_chamado);
      expect(esperados).toHaveLength(520);

      const recebidos: Array<number | null> = [];
      let inicio: number | undefined;
      let chamadas = 0;
      let ultimo;
      do {
        const r = (await amb.c.listarFila.executar({ limite: 120, ...(inicio === undefined ? {} : { inicio }) })).dados;
        chamadas += 1;
        expect(r.itens.length).toBeLessThanOrEqual(120);
        expect(r.total_softdesk).toBe(doAtendente(todos, MEU).length);
        for (const item of r.itens) {
          expect(item.cd_atendente).toBe(MEU);
          expect([2, 3, 4, 6]).not.toContain(item.status_codigo);
          recebidos.push(item.codigo);
        }
        ultimo = r;
        inicio = r.proximo_inicio ?? undefined;
        expect(chamadas).toBeLessThan(20);
      } while (inicio !== undefined);

      expect(ultimo.proximo_inicio).toBeNull();
      expect(chamadas).toBeGreaterThan(3);
      expect(new Set(recebidos).size).toBe(recebidos.length);
      expect(recebidos).toEqual(esperados); // todos, na ordem do SoftDesk
    });

    it('chamado novo durante a leitura desloca a página: o repetido é descartado e nada se perde', async () => {
      // Abertos nas posições ímpares: o item da posição 199 (último da 1ª página) é aberto e se repete na 2ª.
      const todos: EspecChamado[] = Array.from({ length: 500 }, (_, i) => ({
        cd_chamado: 2_000_000 - i,
        st_chamado: i % 2 === 0 ? 2 : 1,
        cd_atendente: MEU,
      }));
      sim = await SoftdeskSimulado.iniciar({ chamados: todos });
      const real = montarGateway(sim).gateway;
      let chamadas = 0;
      const gateway: ISoftdeskGateway = {
        conferirPaginaLogin: (s) => real.conferirPaginaLogin(s),
        autenticar: (u, s, p, sinal) => real.autenticar(u, s, p, sinal),
        pesquisar: async (sessao, filtro, sinal) => {
          const r = await real.pesquisar(sessao, filtro, sinal);
          chamadas += 1;
          if (chamadas === 1) {
            sim.definirChamados([{ cd_chamado: 9_000_000, st_chamado: 1, cd_atendente: MEU }, ...sim.chamados]);
          }
          return r;
        },
      };
      amb = montarAmbiente(sim, {}, { gateway });
      await logarDireto(amb);
      chamadas = 0;

      const r = (await amb.c.listarFila.executar({ limite: 150 })).dados;
      const antigos = todos.filter(abertoSpec).map((c) => c.cd_chamado);
      const codigos = r.itens.map((i) => i.codigo);
      expect(chamadas).toBe(2);
      expect(new Set(codigos).size).toBe(codigos.length); // sem repetidos
      expect(codigos).toEqual(antigos.slice(0, 150)); // sem o 9.000.000 e sem o repetido da posição 199
    });

    it('fila só do atendente configurado, mesmo se o servidor ignorar o filtro (defesa por cd_atendente)', async () => {
      const todos = massa();
      await preparar(todos);
      const real: ISoftdeskGateway = amb.c.gateway;
      // Gateway que "esquece" o filtro de atendente: quem lê deve descartar os de outro atendente.
      const gateway: ISoftdeskGateway = {
        conferirPaginaLogin: (s) => real.conferirPaginaLogin(s),
        autenticar: (u, s, p, sinal) => real.autenticar(u, s, p, sinal),
        pesquisar: (sessao, filtro, sinal) => real.pesquisar(sessao, { ...filtro, atendente: undefined }, sinal),
      };
      amb.c.janelaLogin.fechar();
      amb = montarAmbiente(sim, {}, { gateway });
      await logarDireto(amb);
      const r = (await amb.c.listarFila.executar({ limite: 200 })).dados;
      expect(r.itens.length).toBeGreaterThan(0);
      expect(r.itens.every((i) => i.cd_atendente === MEU)).toBe(true);
    });
  });

  describe('VAL-17: campos da fila e chamado completo', () => {
    it('cada item da fila tem só os 11 campos de RN-06, com os valores do registro do simulador', async () => {
      const todos = gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 5, prioridade: 'Alta', tipo: 'Incidente' }]);
      await preparar(todos);
      const r = (await amb.c.listarFila.executar({})).dados;
      const campos = [
        'cd_atendente',
        'codigo',
        'data_abertura',
        'hora_abertura',
        'interacoes',
        'prioridade',
        'solicitante',
        'status',
        'status_codigo',
        'tipo',
        'titulo',
      ];
      expect(r.itens).toHaveLength(5);
      for (const item of r.itens) expect(Object.keys(item).sort()).toEqual(campos);
      expect(r.itens[0]).toEqual(paraBasico(montarItem(todos[0])));
      expect(r.itens[0].prioridade).toBe('Alta');
      expect(r.itens[0].status).toBe('Em atendimento');
    });

    it('chamado completo é igual ao registro do simulador (sem remodelar, ~66 campos)', async () => {
      const todos = gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 5 }]);
      await preparar(todos);
      const alvo = todos[2];
      const r = (await amb.c.obterChamado.executar({ codigo: alvo.cd_chamado })).dados;
      expect(r.chamado).toEqual(montarItem(alvo, CONTRATO_DOURADO));
      expect(Object.keys(r.chamado).length).toBeGreaterThan(60);
      const req = pesquisas(sim).at(-1)!;
      expect(req.query.pesq_cd_chamado).toEqual([String(alvo.cd_chamado)]);
      expect(req.query.limit).toEqual(['10']);
    });

    it('fila de chamado fechado do próprio atendente: o chamado completo o encontra (fechados são pesquisáveis por código)', async () => {
      const todos = gerarMassa([{ cdAtendente: MEU, status: 2, quantidade: 3 }]);
      await preparar(todos);
      const r = (await amb.c.obterChamado.executar({ codigo: todos[0].cd_chamado })).dados;
      expect(r.chamado.st_chamado).toBe(2);
    });
  });

  describe('VAL-24: status "Aguardando solicitante" filtrado no cliente', () => {
    const massa = (): EspecChamado[] =>
      gerarMassa([
        { cdAtendente: MEU, status: 8, quantidade: 130 },
        { cdAtendente: MEU, status: 1, quantidade: 400 },
        { cdAtendente: MEU, status: 0, quantidade: 150 },
        { cdAtendente: MEU, status: 5, quantidade: 80 },
        { cdAtendente: MEU, status: 2, quantidade: 70 },
      ]);

    it('só itens 8, juntando o limite mesmo com outros status na página; sem pesq_st_chamado[]; total do simulador', async () => {
      const todos = massa();
      await preparar(todos);
      const r = (await amb.c.pesquisar.executar({ atendente: [MEU], status: ['Aguardando solicitante'], limite: 50 })).dados;
      expect(r.itens).toHaveLength(50);
      expect(r.itens.every((i) => i.status_codigo === 8)).toBe(true);
      expect(r.filtro_status_no_cliente).toBe(true);
      expect(r.filtro_texto_no_cliente).toBe(false);
      expect(r.proximo_inicio).not.toBeNull();
      expect(r.total).toBe(doAtendente(todos, MEU).length);
      expect(r.paginas_lidas).toBeGreaterThan(1); // o limite foi juntado em mais de uma página
      for (const req of pesquisas(sim)) {
        expect(req.query['pesq_st_chamado[]']).toBeUndefined();
        expect(req.query.limit).toEqual(['200']);
      }
    });

    it('continuando com proximo_inicio chega aos 130 itens, sem repetidos, e proximo_inicio null no fim', async () => {
      const todos = massa();
      await preparar(todos);
      const vistos: Array<number | null> = [];
      let inicio = 0;
      let proximo: number | null = 0;
      let voltas = 0;
      while (proximo !== null && voltas < 20) {
        const r: Awaited<ReturnType<typeof amb.c.pesquisar.executar>>['dados'] = (
          await amb.c.pesquisar.executar({ atendente: [MEU], status: [8], limite: 50, inicio })
        ).dados;
        vistos.push(...r.itens.map((i) => i.codigo));
        proximo = r.proximo_inicio;
        if (proximo !== null) inicio = proximo;
        voltas += 1;
      }
      expect(proximo).toBeNull();
      expect(vistos).toHaveLength(130);
      expect(new Set(vistos).size).toBe(130);
      expect(vistos).toEqual(doAtendente(todos, MEU).filter((c) => c.st_chamado === 8).map((c) => c.cd_chamado));
    });

    it('status exatamente {1}, por código ou por nome, vai ao servidor como EM_ATENDIMENTO e não marca filtro no cliente', async () => {
      const todos = massa();
      await preparar(todos);
      for (const status of [[1], ['Em atendimento'], ['EM_ATENDIMENTO'], ['1']]) {
        const r = (await amb.c.pesquisar.executar({ atendente: [MEU], status, limite: 30 })).dados;
        expect(r.filtro_status_no_cliente).toBe(false);
        expect(r.itens).toHaveLength(30);
        expect(r.itens.every((i) => i.status_codigo === 1)).toBe(true);
        expect(r.total).toBe(400); // total do simulador com o filtro de servidor aplicado
        expect(r.proximo_inicio).toBeNull();
        expect(pesquisas(sim).at(-1)!.query['pesq_st_chamado[]']).toEqual(['EM_ATENDIMENTO']);
      }
    });

    it('conjunto {1, 8} não vai ao servidor: filtra no cliente os dois status', async () => {
      const todos = massa();
      await preparar(todos);
      const r = (await amb.c.pesquisar.executar({ atendente: [MEU], status: [1, 8], limite: 200 })).dados;
      expect(r.filtro_status_no_cliente).toBe(true);
      expect(r.itens.every((i) => i.status_codigo === 1 || i.status_codigo === 8)).toBe(true);
      expect(r.itens.some((i) => i.status_codigo === 8)).toBe(true);
      expect(r.itens.some((i) => i.status_codigo === 1)).toBe(true);
      expect(pesquisas(sim).every((p) => p.query['pesq_st_chamado[]'] === undefined)).toBe(true);
    });

    it('status fora do catálogo → FILTRO_INVALIDO sem nenhuma requisição ao SoftDesk', async () => {
      await preparar(massa());
      const antes = sim.registro.length;
      await expect(amb.c.pesquisar.executar({ status: ['status inventado'] })).rejects.toMatchObject({
        codigo: 'FILTRO_INVALIDO',
      });
      await expect(amb.c.pesquisar.executar({ status: [12] })).rejects.toMatchObject({ codigo: 'FILTRO_INVALIDO' });
      expect(sim.registro.length).toBe(antes);
    });
  });

  describe('VAL-25: filtros de texto na fila e na pesquisa (RN-16)', () => {
    const NOMES = ['Rosângela Alves', 'ROSANGELA Souza', 'Rogério Lima'];
    const massa = (): EspecChamado[] =>
      gerarMassa([
        { cdAtendente: MEU, status: 1, quantidade: 90, solicitantes: NOMES },
        { cdAtendente: MEU, status: 2, quantidade: 30, solicitantes: NOMES },
        { cdAtendente: MEU, status: 8, quantidade: 60, solicitantes: ['Tobias Albuquerque'] },
        { cdAtendente: 809, status: 1, quantidade: 40, solicitantes: NOMES },
      ]);

    it('fila: "rosangela" casa os dois nomes (sem acento e sem diferenciar caixa), não casa "Rogério"; fechados e outros atendentes fora', async () => {
      const todos = massa();
      await preparar(todos);
      const r = (await amb.c.listarFila.executar({ solicitante_nome: 'rosangela', limite: 200 })).dados;
      const esperados = doAtendente(todos, MEU).filter((c) => abertoSpec(c) && sem(c.nm_usuario ?? '').includes('rosangela'));
      expect(esperados).toHaveLength(60);
      expect(r.itens.map((i) => i.codigo)).toEqual(esperados.map((c) => c.cd_chamado));
      expect(r.filtro_texto_no_cliente).toBe(true);
      expect(r.itens.some((i) => i.solicitante?.includes('Rogério'))).toBe(false);
      expect(r.itens.some((i) => i.solicitante === 'Rosângela Alves')).toBe(true);
      expect(r.itens.some((i) => i.solicitante === 'ROSANGELA Souza')).toBe(true);
    });

    it('fila: proximo_inicio coerente (posição logo depois do último casado) e a continuação não repete nem perde', async () => {
      const todos = massa();
      await preparar(todos);
      const lista = doAtendente(todos, MEU);
      const casa = (c: EspecChamado): boolean => abertoSpec(c) && sem(c.nm_usuario ?? '').includes('rosangela');

      const r1 = (await amb.c.listarFila.executar({ solicitante_nome: 'rosangela', limite: 25 })).dados;
      expect(r1.itens).toHaveLength(25);
      let contados = 0;
      let posicao = -1;
      for (let i = 0; i < lista.length && contados < 25; i += 1) {
        if (casa(lista[i])) {
          contados += 1;
          posicao = i + 1;
        }
      }
      expect(r1.proximo_inicio).toBe(posicao);

      const vistos = [...r1.itens.map((i) => i.codigo)];
      let proximo = r1.proximo_inicio;
      let voltas = 0;
      while (proximo !== null && voltas++ < 10) {
        const r = (await amb.c.listarFila.executar({ solicitante_nome: 'rosangela', limite: 25, inicio: proximo })).dados;
        vistos.push(...r.itens.map((i) => i.codigo));
        proximo = r.proximo_inicio;
      }
      expect(proximo).toBeNull();
      expect(vistos).toEqual(lista.filter(casa).map((c) => c.cd_chamado));
    });

    it('pesquisa: mesmo filtro, marca filtro_texto_no_cliente, não vai ao servidor e traz proximo_inicio', async () => {
      const todos = massa();
      await preparar(todos);
      const r = (await amb.c.pesquisar.executar({ atendente: [MEU], solicitante_nome: 'rosangela', limite: 25 })).dados;
      expect(r.itens).toHaveLength(25);
      expect(r.itens.every((i) => sem(i.solicitante ?? '').includes('rosangela'))).toBe(true);
      expect(r.filtro_texto_no_cliente).toBe(true);
      expect(r.filtro_status_no_cliente).toBe(false);
      expect(r.proximo_inicio).not.toBeNull();
      expect(r.total).toBe(doAtendente(todos, MEU).length);
      for (const req of pesquisas(sim)) {
        expect(JSON.stringify(req.query)).not.toMatch(/rosangela/i);
        expect(req.query.pesq_cd_usuario).toEqual(['0']);
      }
    });

    it('filtro com mais de uma palavra exige todas; palavra que não aparece zera o resultado', async () => {
      await preparar(massa());
      const a = (await amb.c.listarFila.executar({ solicitante_nome: 'alves rosangela', limite: 200 })).dados;
      expect(a.itens.length).toBeGreaterThan(0);
      expect(a.itens.every((i) => i.solicitante === 'Rosângela Alves')).toBe(true);
      const b = (await amb.c.listarFila.executar({ solicitante_nome: 'rosangela lima', limite: 200 })).dados;
      expect(b.itens).toHaveLength(0);
    });
  });

  describe('VAL-26: filtros combinados', () => {
    const massa = (): EspecChamado[] => {
      const base = gerarMassa([
        { cdAtendente: MEU, status: 1, quantidade: 60, solicitantes: ['Rosângela Alves', 'Hélio Pires'], titulo: 'Falha na impressora' },
        { cdAtendente: MEU, status: 8, quantidade: 60, solicitantes: ['Rosângela Alves', 'Hélio Pires'], titulo: 'Falha na impressora' },
        { cdAtendente: MEU, status: 8, quantidade: 60, solicitantes: ['Rosângela Alves', 'Hélio Pires'], titulo: 'Erro de login' },
        { cdAtendente: MEU, status: 2, quantidade: 40, solicitantes: ['Rosângela Alves'], titulo: 'Falha na impressora' },
      ]);
      return base;
    };

    it('pesquisa: solicitante_nome + titulo_contem + status juntos → só itens que casam todos', async () => {
      const todos = massa();
      await preparar(todos);
      const esperados = doAtendente(todos, MEU)
        .filter(
          (c) =>
            c.st_chamado === 8 &&
            sem(c.nm_usuario ?? '').includes('rosangela') &&
            sem(c.tt_chamado ?? '').includes('impressora'),
        )
        .map((c) => c.cd_chamado);
      expect(esperados).toHaveLength(30);
      const r = (
        await amb.c.pesquisar.executar({
          atendente: [MEU],
          status: ['Aguardando solicitante'],
          solicitante_nome: 'ROSANGELA',
          titulo_contem: 'Impressora',
          limite: 200,
        })
      ).dados;
      expect(r.itens.map((i) => i.codigo)).toEqual(esperados);
      expect(r.filtro_status_no_cliente).toBe(true);
      expect(r.filtro_texto_no_cliente).toBe(true);
    });

    it('fila: solicitante_nome + titulo_contem juntos (abertos de qualquer status)', async () => {
      const todos = massa();
      await preparar(todos);
      const esperados = doAtendente(todos, MEU)
        .filter(
          (c) =>
            abertoSpec(c) &&
            sem(c.nm_usuario ?? '').includes('rosangela') &&
            sem(c.tt_chamado ?? '').includes('impressora'),
        )
        .map((c) => c.cd_chamado);
      expect(esperados).toHaveLength(60);
      const r = (await amb.c.listarFila.executar({ solicitante_nome: 'rosangela', titulo_contem: 'impressora', limite: 200 })).dados;
      expect(r.itens.map((i) => i.codigo)).toEqual(esperados);
    });

    it('prioridade_nome e tipo_nome também filtram (campos ds_prioridade e ds_tipo_chamado)', async () => {
      const todos = gerarMassa([
        { cdAtendente: MEU, status: 1, quantidade: 30, prioridade: 'Alta', tipo: 'Incidente' },
        { cdAtendente: MEU, status: 1, quantidade: 30, prioridade: 'Alta', tipo: 'Requisição' },
        { cdAtendente: MEU, status: 1, quantidade: 30, prioridade: 'Baixa', tipo: 'Incidente' },
      ]);
      await preparar(todos);
      const r = (await amb.c.listarFila.executar({ prioridade_nome: 'alta', tipo_nome: 'requisicao', limite: 200 })).dados;
      expect(r.itens).toHaveLength(30);
      expect(r.itens.every((i) => i.prioridade === 'Alta' && i.tipo === 'Requisição')).toBe(true);
    });
  });
});
