import { ErroSoftdesk } from '../../src/core/domain/errors/erro-softdesk';
import { montarQuery } from '../../src/infraestructure/softdesk/softdesk-http.gateway';

function parametros(filtro: Parameters<typeof montarQuery>[0]): URLSearchParams {
  return new URLSearchParams(montarQuery(filtro));
}

const FIXOS: Record<string, string> = {
  cd_pasta: '8',
  pesq_tp_pesquisa: '0',
  pesq_cd_tecnico: '0',
  pesq_tp_tag: '1',
  pesq_flag_periodo: '1',
  tp_requisicao: 'PES_RESULTADO',
  tp_usuario: 'PES',
  cd_area: '0',
  cd_cliente: '0',
  cd_grupo_solucao: '0',
};

describe('montarQuery (ARCH §7.1 e §16 A.2)', () => {
  it('sempre envia os parâmetros fixos, mesmo sem filtro', () => {
    const p = parametros({});
    for (const [nome, valor] of Object.entries(FIXOS)) expect(p.get(nome)).toBe(valor);
    expect(p.get('start')).toBe('0');
    expect(p.get('limit')).toBe('50');
    expect(p.get('pesq_cd_chamado')).toBe('');
    expect(p.get('pesq_bus_inativos')).toBe('false');
    expect(p.has('pesq_cd_atendente[]')).toBe(false);
    expect(p.has('pesq_st_chamado[]')).toBe(false);
  });

  it('mapeia cada filtro para o parâmetro do SoftDesk', () => {
    const p = parametros({
      codigo: 2487414,
      atendente: [393, 809],
      prioridade: [1, 2],
      grupo_solucao: [7],
      tipo_chamado: [3],
      cliente: [55],
      palavra_chave: 'nota fiscal',
      area: 4,
      solicitante: 1474,
      servico: 9,
      categoria: 6,
      descricao_categoria: 'texto livre',
      periodo: 2,
      periodo_ini: '2026-11-01',
      periodo_fim: '2026-11-18',
      termino_previsto: '2026-12-01',
      incluir_inativos: true,
      inicio: 400,
      limite: 120,
    });
    expect(p.get('pesq_cd_chamado')).toBe('2487414');
    expect(p.getAll('pesq_cd_atendente[]')).toEqual(['393', '809']);
    expect(p.getAll('pesq_prioridade_chamado[]')).toEqual(['1', '2']);
    expect(p.getAll('pesq_grupo_solucao_chamado[]')).toEqual(['7']);
    expect(p.getAll('pesq_tipo_chamado[]')).toEqual(['3']);
    expect(p.getAll('pesq_cd_cliente[]')).toEqual(['55']);
    expect(p.get('pesq_ds_chamado')).toBe('nota fiscal');
    expect(p.get('pesq_cd_area')).toBe('4');
    expect(p.get('pesq_cd_usuario')).toBe('1474');
    expect(p.get('pesq_servico_chamado')).toBe('9');
    expect(p.get('pesq_categoria_chamado')).toBe('6');
    expect(p.get('pesq_descricao_categoria_chamado')).toBe('texto livre');
    expect(p.get('pesq_periodo')).toBe('2');
    expect(p.get('pesq_periodo_ini')).toBe('2026-11-01');
    expect(p.get('pesq_periodo_fim')).toBe('2026-11-18');
    expect(p.get('pesq_termino_previsto_chamado')).toBe('2026-12-01');
    expect(p.get('pesq_bus_inativos')).toBe('true');
    expect(p.get('start')).toBe('400');
    expect(p.get('limit')).toBe('120');
    for (const [nome, valor] of Object.entries(FIXOS)) expect(p.get(nome)).toBe(valor);
  });

  it('limite acima de 200 sai como 200 (CA-08)', () => {
    expect(parametros({ limite: 500 }).get('limit')).toBe('200');
  });

  it('status: só o conjunto exato {1} vai ao servidor, como EM_ATENDIMENTO (RN-09)', () => {
    expect(parametros({ status: [1] }).getAll('pesq_st_chamado[]')).toEqual(['EM_ATENDIMENTO']);
    expect(parametros({ status: [1, 1] }).getAll('pesq_st_chamado[]')).toEqual(['EM_ATENDIMENTO']);
    for (const outro of [[8], [1, 8], [0], [2, 3], []]) {
      expect(parametros({ status: outro }).has('pesq_st_chamado[]')).toBe(false);
    }
  });

  it('listas viram campo[]=a&campo[]=b (colchetes codificados como no protótipo)', () => {
    const bruta = montarQuery({ atendente: [1, 2] });
    expect(bruta).toContain('pesq_cd_atendente%5B%5D=1&pesq_cd_atendente%5B%5D=2');
  });

  it('paginação inválida lança FILTRO_INVALIDO antes de qualquer chamada', () => {
    expect(() => montarQuery({ limite: 0 })).toThrow(ErroSoftdesk);
    expect(() => montarQuery({ inicio: -1 })).toThrow(ErroSoftdesk);
  });
});
