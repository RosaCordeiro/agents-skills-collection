import type { ChamadoBruto } from '../../src/core/domain/entities/chamado';
import {
  MAX_PAGINAS_VARREDURA,
  TAMANHO_PAGINA_VARREDURA,
  acumularPagina,
  novoAcumulador,
  resultadoDaFila,
  type ParametrosVarredura,
  type ResultadoFila,
} from '../../src/core/domain/services/fila.service';
import { estaAberto } from '../../src/core/domain/entities/status';
import { gerarMassa, montarItem, type EspecChamado } from '../simulador/dados';

const MEU = 393;

/** Simula o SoftDesk: filtra por atendente no servidor, pagina de 200 e informa o total. */
function lerUmaVez(
  todos: EspecChamado[],
  params: ParametrosVarredura,
  inicio = 0,
  noServidor: (c: EspecChamado) => boolean = (c) => c.cd_atendente === MEU,
): ResultadoFila {
  const servidor = todos.filter(noServidor);
  const acc = novoAcumulador(inicio);
  while (!acc.concluido) {
    const lista = servidor.slice(acc.posicao, acc.posicao + TAMANHO_PAGINA_VARREDURA).map((s) => montarItem(s));
    acumularPagina(acc, { lista, total: servidor.length }, params);
  }
  return resultadoDaFila(acc);
}

/** Continua com `proximo_inicio` até vir `null`, como quem chama a fila. */
function lerTudo(todos: EspecChamado[], params: ParametrosVarredura) {
  const itens: ResultadoFila['itens'] = [];
  const leituras: ResultadoFila[] = [];
  let inicio: number | null = 0;
  while (inicio !== null) {
    const r = lerUmaVez(todos, params, inicio);
    leituras.push(r);
    itens.push(...r.itens);
    inicio = r.proximo_inicio;
    if (leituras.length > 200) throw new Error('não terminou');
  }
  return { itens, leituras };
}

const ABERTOS = [0, 1, 5, 7, 8, 9, 10, 11, 13, 14];
const FECHADOS = [2, 3, 4, 6];

function massaMista(): EspecChamado[] {
  return gerarMassa([
    { cdAtendente: MEU, status: 1, quantidade: 70 },
    { cdAtendente: MEU, status: 8, quantidade: 45 },
    { cdAtendente: MEU, status: 0, quantidade: 20 },
    { cdAtendente: MEU, status: 2, quantidade: 120 },
    { cdAtendente: MEU, status: 3, quantidade: 40 },
    { cdAtendente: MEU, status: 4, quantidade: 30 },
    { cdAtendente: MEU, status: 6, quantidade: 60 },
    { cdAtendente: 809, status: 1, quantidade: 90 },
    { cdAtendente: 809, status: 2, quantidade: 60 },
    { cdAtendente: 0, status: 0, quantidade: 25 },
  ]);
}

describe('fila.service (VAL-02 unit, RN-04, RN-09)', () => {
  const todos = massaMista();
  const esperados = todos.filter((c) => c.cd_atendente === MEU && ABERTOS.includes(c.st_chamado));

  it('a massa de teste tem abertos e fechados espalhados em mais de uma página', () => {
    const meus = todos.filter((c) => c.cd_atendente === MEU);
    expect(meus.length).toBeGreaterThan(TAMANHO_PAGINA_VARREDURA);
    expect(esperados).toHaveLength(135);
    const primeiraPagina = meus.slice(0, TAMANHO_PAGINA_VARREDURA);
    expect(primeiraPagina.some((c) => FECHADOS.includes(c.st_chamado))).toBe(true);
    expect(primeiraPagina.some((c) => ABERTOS.includes(c.st_chamado))).toBe(true);
  });

  it('uma leitura grande devolve só os abertos do atendente, na ordem do SoftDesk', () => {
    const r = lerUmaVez(todos, { limite: 200, cdAtendente: MEU, somenteAbertos: true });
    expect(r.itens.map((i) => i.codigo)).toEqual(esperados.map((c) => c.cd_chamado));
    expect(r.itens.every((i) => i.cd_atendente === MEU)).toBe(true);
    expect(r.itens.every((i) => estaAberto(i.status_codigo as number))).toBe(true);
    expect(r.proximo_inicio).toBeNull();
    expect(r.incompleto).toBe(false);
    // o total do SoftDesk inclui os fechados e é só informação
    expect(r.total_softdesk).toBe(todos.filter((c) => c.cd_atendente === MEU).length);
    expect(r.total_softdesk).toBeGreaterThan(r.itens.length);
    expect(r.paginas_lidas).toBe(2);
  });

  it('continuar com proximo_inicio até null traz todos os abertos, sem repetidos nem fechados (CA-05)', () => {
    const { itens, leituras } = lerTudo(todos, { limite: 50, cdAtendente: MEU, somenteAbertos: true });
    const codigos = itens.map((i) => i.codigo);
    expect(codigos).toEqual(esperados.map((c) => c.cd_chamado));
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(itens.some((i) => FECHADOS.includes(i.status_codigo as number))).toBe(false);
    expect(leituras.length).toBe(3);
    expect(leituras.slice(0, -1).every((l) => l.itens.length === 50 && l.proximo_inicio !== null)).toBe(true);
    expect(leituras[leituras.length - 1].proximo_inicio).toBeNull();
  });

  it('proximo_inicio é a posição do SoftDesk logo depois do último item entregue', () => {
    const meus = todos.filter((c) => c.cd_atendente === MEU);
    const r = lerUmaVez(todos, { limite: 10, cdAtendente: MEU, somenteAbertos: true });
    const ultimo = r.itens[r.itens.length - 1].codigo;
    const posicaoDoUltimo = meus.findIndex((c) => c.cd_chamado === ultimo);
    expect(r.proximo_inicio).toBe(posicaoDoUltimo + 1);
  });

  it('retomar de um proximo_inicio no meio não pula nem repete itens', () => {
    const params: ParametrosVarredura = { limite: 20, cdAtendente: MEU, somenteAbertos: true };
    const a = lerUmaVez(todos, params, 0);
    const b = lerUmaVez(todos, params, a.proximo_inicio as number);
    const juntos = [...a.itens, ...b.itens].map((i) => i.codigo);
    expect(juntos).toEqual(esperados.slice(0, 40).map((c) => c.cd_chamado));
  });

  it('limite que fecha exatamente no último item do SoftDesk já diz que acabou', () => {
    const r = lerUmaVez(todos, { limite: esperados.length, cdAtendente: MEU, somenteAbertos: true });
    expect(r.itens).toHaveLength(esperados.length);
    // sobram fechados depois do último aberto: a leitura não terminou, continua do ponto seguinte
    const meus = todos.filter((c) => c.cd_atendente === MEU);
    const posUltimoAberto = meus.map((c) => c.cd_chamado).indexOf(esperados[esperados.length - 1].cd_chamado) + 1;
    expect(r.proximo_inicio).toBe(posUltimoAberto >= meus.length ? null : posUltimoAberto);
    const sobra = lerUmaVez(todos, { limite: 50, cdAtendente: MEU, somenteAbertos: true }, r.proximo_inicio ?? meus.length);
    expect(sobra.itens).toEqual([]);
    expect(sobra.proximo_inicio).toBeNull();
  });

  it('descarta repetidos quando a página se desloca durante a leitura', () => {
    const base = Array.from({ length: 3 }, (_, i) => montarItem({ cd_chamado: 900 - i, st_chamado: 1, cd_atendente: MEU }));
    const acc = novoAcumulador(0);
    const params: ParametrosVarredura = { limite: 50, cdAtendente: MEU, somenteAbertos: true, tamanhoPagina: 3 };
    acumularPagina(acc, { lista: base, total: 6 }, params);
    // entrou chamado novo no topo: o último da página anterior reaparece como primeiro desta
    const deslocada = [base[2], montarItem({ cd_chamado: 897, st_chamado: 1, cd_atendente: MEU }), montarItem({ cd_chamado: 896, st_chamado: 1, cd_atendente: MEU })];
    acumularPagina(acc, { lista: deslocada, total: 6 }, params);
    expect(acc.itens.map((i) => i.codigo)).toEqual([900, 899, 898, 897, 896]);
  });

  it('descarta item de outro atendente e de status fechado mesmo que o servidor os devolva', () => {
    const lista: ChamadoBruto[] = [
      montarItem({ cd_chamado: 5, st_chamado: 1, cd_atendente: 809 }),
      montarItem({ cd_chamado: 4, st_chamado: 2, cd_atendente: MEU }),
      montarItem({ cd_chamado: 3, st_chamado: 1, cd_atendente: MEU }),
    ];
    const acc = acumularPagina(novoAcumulador(), { lista, total: 3 }, { limite: 50, cdAtendente: MEU, somenteAbertos: true });
    expect(acc.itens.map((i) => i.codigo)).toEqual([3]);
  });

  it('item sem cd_chamado numérico é ignorado', () => {
    const lista: ChamadoBruto[] = [{ cd_atendente: MEU, st_chamado: 1 }, { cd_chamado: 'x', st_chamado: 1, cd_atendente: MEU }];
    const acc = acumularPagina(novoAcumulador(), { lista, total: 2 }, { limite: 5, somenteAbertos: true });
    expect(acc.itens).toEqual([]);
  });

  it('VAL-04 unit: 15 páginas lidas sem juntar o limite → incompleto, com a continuação logo depois', () => {
    const fechados = gerarMassa([{ cdAtendente: MEU, status: 2, quantidade: 3100 }], { embaralhar: false });
    const abertoNoFim = gerarMassa([{ cdAtendente: MEU, status: 1, quantidade: 5 }], { embaralhar: false, codigoMaisNovo: 1000 });
    const todosFim = [...fechados, ...abertoNoFim];
    const params: ParametrosVarredura = { limite: 50, cdAtendente: MEU, somenteAbertos: true };
    const r = lerUmaVez(todosFim, params);
    expect(r.paginas_lidas).toBe(MAX_PAGINAS_VARREDURA);
    expect(r.incompleto).toBe(true);
    expect(r.itens).toEqual([]);
    expect(r.proximo_inicio).toBe(MAX_PAGINAS_VARREDURA * TAMANHO_PAGINA_VARREDURA);
    expect(r.total_softdesk).toBe(3105);
    // a leitura seguinte, de onde parou, acaba e acha os 5 abertos
    const resto = lerUmaVez(todosFim, params, r.proximo_inicio as number);
    expect(resto.itens).toHaveLength(5);
    expect(resto.incompleto).toBe(false);
    expect(resto.proximo_inicio).toBeNull();
  });

  it('15 páginas que esgotam o SoftDesk não são "incompleto"', () => {
    const fechados = gerarMassa([{ cdAtendente: MEU, status: 2, quantidade: 3000 }], { embaralhar: false });
    const r = lerUmaVez(fechados, { limite: 50, cdAtendente: MEU, somenteAbertos: true });
    expect(r.paginas_lidas).toBe(15);
    expect(r.incompleto).toBe(false);
    expect(r.proximo_inicio).toBeNull();
  });

  it('depois de concluído, novas páginas não mudam nada', () => {
    const acc = novoAcumulador();
    const lista = [montarItem({ cd_chamado: 1, st_chamado: 1, cd_atendente: MEU })];
    acumularPagina(acc, { lista, total: 1 }, { limite: 5, somenteAbertos: true });
    expect(acc.concluido).toBe(true);
    acumularPagina(acc, { lista: [montarItem({ cd_chamado: 2, st_chamado: 1, cd_atendente: MEU })], total: 1 }, { limite: 5 });
    expect(acc.itens).toHaveLength(1);
    expect(acc.paginasLidas).toBe(1);
  });

  it('VAL-24 unit: status no cliente junta só os itens do status, mesmo com outros na página', () => {
    const r = lerUmaVez(todos, { limite: 30, cdAtendente: MEU, statusAceitos: new Set([8]) });
    expect(r.itens).toHaveLength(30);
    expect(r.itens.every((i) => i.status_codigo === 8)).toBe(true);
    expect(r.proximo_inicio).not.toBeNull();
    const resto = lerUmaVez(todos, { limite: 30, cdAtendente: MEU, statusAceitos: new Set([8]) }, r.proximo_inicio as number);
    expect(resto.itens).toHaveLength(15);
    expect(resto.proximo_inicio).toBeNull();
  });

  it('VAL-25 e VAL-26 unit: filtro de texto na fila, junto com o de status', () => {
    const nomes = ['Rosângela Alves', 'ROSANGELA Souza', 'Rogério Lima'];
    const massa = gerarMassa([
      { cdAtendente: MEU, status: 1, quantidade: 60, solicitantes: nomes },
      { cdAtendente: MEU, status: 8, quantidade: 30, solicitantes: nomes },
      { cdAtendente: MEU, status: 2, quantidade: 30, solicitantes: nomes },
    ]);
    const so = lerUmaVez(massa, { limite: 200, cdAtendente: MEU, somenteAbertos: true, filtroTexto: { solicitante_nome: 'rosangela' } });
    expect(so.itens).toHaveLength(60);
    expect(so.itens.every((i) => /^rosangela/i.test((i.solicitante as string).normalize('NFD').replace(/\p{M}/gu, '')))).toBe(true);
    expect(so.itens.some((i) => i.solicitante === 'Rogério Lima')).toBe(false);

    const alves = lerUmaVez(massa, {
      limite: 200,
      cdAtendente: MEU,
      statusAceitos: new Set([8]),
      filtroTexto: { solicitante_nome: 'rosangela alves' },
    });
    expect(alves.itens).toHaveLength(10);
    expect(alves.itens.every((i) => i.solicitante === 'Rosângela Alves' && i.status_codigo === 8)).toBe(true);
  });

  it('resultadoDaFila antes de qualquer página não inventa total', () => {
    expect(resultadoDaFila(novoAcumulador(30))).toEqual({
      itens: [],
      proximo_inicio: null,
      total_softdesk: 0,
      paginas_lidas: 0,
      incompleto: false,
    });
  });
});
