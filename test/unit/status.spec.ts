import { ErroSoftdesk } from '../../src/core/domain/errors/erro-softdesk';
import {
  CATALOGO_STATUS,
  STATUS_FECHADOS,
  estaAberto,
  normalizarListaStatus,
  normalizarStatus,
  statusPorCodigo,
} from '../../src/core/domain/entities/status';

function lancaFiltroInvalido(fn: () => unknown): ErroSoftdesk {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ErroSoftdesk);
    expect((e as ErroSoftdesk).codigo).toBe('FILTRO_INVALIDO');
    return e as ErroSoftdesk;
  }
  throw new Error('era esperado FILTRO_INVALIDO');
}

describe('catálogo de status (ARCH §16 A.3)', () => {
  it('tem os 14 status, de 0 a 14, sem o código 12', () => {
    const codigos = CATALOGO_STATUS.map((s) => s.codigo);
    expect(codigos).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14]);
    expect(statusPorCodigo(12)).toBeUndefined();
    expect(new Set(CATALOGO_STATUS.map((s) => s.nome)).size).toBe(14);
  });

  it('fechados são exatamente {2, 3, 4, 6}', () => {
    expect([...STATUS_FECHADOS].sort()).toEqual([2, 3, 4, 6]);
    for (const s of CATALOGO_STATUS) {
      expect(estaAberto(s.codigo)).toBe(![2, 3, 4, 6].includes(s.codigo));
    }
  });
});

describe('normalizarStatus', () => {
  it.each([
    [0, 0],
    [1, 1],
    [13, 13],
    ['8', 8],
    [' 14 ', 14],
    ['Aguardando solicitante', 8],
    ['aguardando SOLICITANTE', 8],
    ['  Aguardando   solicitante  ', 8],
    ['aguardando_solicitante', 8],
    ['EM_ATENDIMENTO', 1],
    ['em atendimento', 1],
    ['Fechado pelo usuário', 3],
    ['fechado pelo usuario', 3],
    ['FECHADO POR DECURSO DE PRAZO', 6],
    ['aguardando aprovacao', 10],
    ['Novo (sem categoria)', 0],
  ])('aceita %p e devolve o código %p', (entrada, esperado) => {
    expect(normalizarStatus(entrada)).toBe(esperado);
  });

  it.each([12, '12', 15, -1, 1.5, NaN, '', '   ', 'inexistente', 'Fechado', 'Em atendimento!'])(
    'recusa %p com FILTRO_INVALIDO',
    (entrada) => {
      const erro = lancaFiltroInvalido(() => normalizarStatus(entrada));
      expect(erro.campos).toEqual(['status']);
    },
  );

  it('o erro não repete o valor informado', () => {
    const esquisito = 'valor-secreto-xyz';
    const erro = lancaFiltroInvalido(() => normalizarStatus(esquisito));
    expect(`${erro.mensagem} ${erro.acao} ${erro.message}`).not.toContain(esquisito);
  });

  it('normalizarListaStatus junta códigos e nomes sem repetir', () => {
    expect(normalizarListaStatus([8, 'Aguardando solicitante', '1', 'EM_ATENDIMENTO'])).toEqual([8, 1]);
    lancaFiltroInvalido(() => normalizarListaStatus([1, 12]));
  });
});
