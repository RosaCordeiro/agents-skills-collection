import { ErroSoftdesk } from '../../src/core/domain/errors/erro-softdesk';
import {
  FILTROS_CONFIRMADOS,
  filtrosNaoConfirmados,
  normalizarPaginacao,
} from '../../src/core/domain/entities/filtro-pesquisa';

function invalido(fn: () => unknown): ErroSoftdesk {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ErroSoftdesk);
    expect((e as ErroSoftdesk).codigo).toBe('FILTRO_INVALIDO');
    return e as ErroSoftdesk;
  }
  throw new Error('era esperado FILTRO_INVALIDO');
}

describe('normalizarPaginacao (RN-09)', () => {
  it('padrão: início 0 e limite 50', () => {
    expect(normalizarPaginacao()).toEqual({ inicio: 0, limite_aplicado: 50, limite_pedido: 50 });
    expect(normalizarPaginacao({})).toEqual({ inicio: 0, limite_aplicado: 50, limite_pedido: 50 });
  });

  it('respeita o que foi pedido até o teto de 200', () => {
    expect(normalizarPaginacao({ inicio: 120, limite: 7 })).toEqual({ inicio: 120, limite_aplicado: 7, limite_pedido: 7 });
    expect(normalizarPaginacao({ limite: 200 }).limite_aplicado).toBe(200);
  });

  it('acima de 200 usa 200 e informa o pedido (CA-08)', () => {
    expect(normalizarPaginacao({ limite: 500 })).toEqual({ inicio: 0, limite_aplicado: 200, limite_pedido: 500 });
    expect(normalizarPaginacao({ limite: 201 }).limite_aplicado).toBe(200);
  });

  it.each([0, -3, 1.5, NaN, '50' as unknown as number])('limite %p é FILTRO_INVALIDO', (limite) => {
    expect(invalido(() => normalizarPaginacao({ limite })).campos).toEqual(['limite']);
  });

  it.each([-1, 2.5, '0' as unknown as number])('inicio %p é FILTRO_INVALIDO', (inicio) => {
    expect(invalido(() => normalizarPaginacao({ inicio })).campos).toEqual(['inicio']);
  });
});

describe('filtrosNaoConfirmados (CA-09)', () => {
  it('conjunto confirmado: codigo, atendente, status, prioridade, grupo_solucao, tipo_chamado, cliente', () => {
    expect([...FILTROS_CONFIRMADOS].sort()).toEqual(
      ['atendente', 'cliente', 'codigo', 'grupo_solucao', 'prioridade', 'status', 'tipo_chamado'].sort(),
    );
  });

  it('filtros confirmados e paginação não aparecem', () => {
    expect(
      filtrosNaoConfirmados({
        codigo: 1,
        atendente: [393],
        status: [1],
        prioridade: [2],
        grupo_solucao: [3],
        tipo_chamado: [4],
        cliente: [5],
        inicio: 10,
        limite: 20,
      }),
    ).toEqual([]);
  });

  it('palavra_chave vazia ou só com espaços não conta como filtro não confirmado (B-13)', () => {
    expect(filtrosNaoConfirmados({ atendente: [393], palavra_chave: '' })).toEqual([]);
    expect(filtrosNaoConfirmados({ palavra_chave: '   ' })).toEqual([]);
    expect(filtrosNaoConfirmados({ palavra_chave: 'x' })).toEqual(['palavra_chave']);
  });

  it('lista só os nomes dos usados fora do conjunto, na ordem do objeto', () => {
    const lista = filtrosNaoConfirmados({
      atendente: [393],
      palavra_chave: 'SEGREDO-NAO-VAI-PARA-O-LOG',
      area: 5,
      periodo_ini: '2026-01-01',
      incluir_inativos: true,
    });
    expect(lista).toEqual(['palavra_chave', 'area', 'periodo_ini', 'incluir_inativos']);
    expect(JSON.stringify(lista)).not.toContain('SEGREDO');
  });

  it('ignora vazios (lista vazia, undefined, null)', () => {
    expect(filtrosNaoConfirmados({ atendente: [], area: undefined, servico: null as unknown as number })).toEqual([]);
  });
});
