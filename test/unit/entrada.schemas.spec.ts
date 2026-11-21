import { ErroSoftdesk } from '../../src/core/domain/errors/erro-softdesk';
import {
  schemaCodigoChamado,
  schemaFila,
  schemaPesquisa,
  validarEntrada,
} from '../../src/shared/schemas/entrada.schemas';
import { sentinela } from '../simulador/apoio';

const falha = (fn: () => unknown): ErroSoftdesk => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ErroSoftdesk);
    return e as ErroSoftdesk;
  }
  throw new Error('era esperado FILTRO_INVALIDO');
};

describe('schemas de entrada (REST e MCP)', () => {
  it('fila: entrada vazia ou ausente é válida', () => {
    expect(validarEntrada(schemaFila, {})).toEqual({});
    expect(validarEntrada(schemaFila, undefined)).toEqual({});
  });

  it('pesquisa: aceita todos os filtros do §7.1 com os tipos do contrato', () => {
    const entrada = {
      codigo: 10,
      atendente: [393],
      status: [1, 'Aguardando solicitante'],
      prioridade: [2],
      grupo_solucao: [3],
      tipo_chamado: [4],
      cliente: [5],
      palavra_chave: 'impressora',
      area: 6,
      solicitante: 7,
      servico: 8,
      categoria: 9,
      descricao_categoria: 'texto',
      periodo: 1,
      periodo_ini: '2026-01-01',
      periodo_fim: '2026-02-01',
      termino_previsto: '2026-03-01',
      incluir_inativos: true,
      inicio: 0,
      limite: 50,
      solicitante_nome: 'rosangela',
      titulo_contem: 'erro',
      prioridade_nome: 'alta',
      tipo_nome: 'incidente',
    };
    expect(validarEntrada(schemaPesquisa, entrada)).toEqual(entrada);
  });

  it('VAL-20/VAL-15: campo desconhecido (senha) é FILTRO_INVALIDO e o valor não aparece no erro', () => {
    const segredo = sentinela('SENHA');
    for (const schema of [schemaFila, schemaPesquisa, schemaCodigoChamado]) {
      const e = falha(() => validarEntrada(schema as never, { codigo: 1, senha: segredo }));
      expect(e.codigo).toBe('FILTRO_INVALIDO');
      expect(e.campos).toContain('senha');
      expect(JSON.stringify([e.mensagem, e.acao, e.campos, e.message])).not.toContain(segredo);
    }
  });

  it.each([
    ['limite 0', schemaFila, { limite: 0 }, 'limite'],
    ['limite negativo', schemaFila, { limite: -3 }, 'limite'],
    ['limite fracionário', schemaPesquisa, { limite: 1.5 }, 'limite'],
    ['limite em texto', schemaPesquisa, { limite: '10' }, 'limite'],
    ['inicio negativo', schemaFila, { inicio: -1 }, 'inicio'],
    ['atendente não é lista', schemaPesquisa, { atendente: 393 }, 'atendente'],
    ['atendente com texto', schemaPesquisa, { atendente: ['a'] }, 'atendente'],
    ['codigo zero', schemaPesquisa, { codigo: 0 }, 'codigo'],
    ['incluir_inativos em texto', schemaPesquisa, { incluir_inativos: 'sim' }, 'incluir_inativos'],
    ['filtro de texto vazio', schemaFila, { solicitante_nome: '' }, 'solicitante_nome'],
    ['filtro de texto com 101 caracteres', schemaFila, { titulo_contem: 'x'.repeat(101) }, 'titulo_contem'],
    ['palavra_chave com 201 caracteres', schemaPesquisa, { palavra_chave: 'x'.repeat(201) }, 'palavra_chave'],
    ['status com booleano', schemaPesquisa, { status: [true] }, 'status'],
  ])('%s → FILTRO_INVALIDO com o nome do campo', (_nome, schema, entrada, campo) => {
    const e = falha(() => validarEntrada(schema as never, entrada));
    expect(e.codigo).toBe('FILTRO_INVALIDO');
    expect(e.campos).toContain(campo);
  });

  it('chamado completo: codigo é obrigatório e inteiro positivo', () => {
    expect(validarEntrada(schemaCodigoChamado, { codigo: 2487414 })).toEqual({ codigo: 2487414 });
    for (const ruim of [{}, { codigo: 'abc' }, { codigo: -1 }, { codigo: 1.2 }]) {
      expect(falha(() => validarEntrada(schemaCodigoChamado, ruim)).codigo).toBe('FILTRO_INVALIDO');
    }
  });

  it('limite acima de 200 não é erro no schema (o caso de uso aplica o teto e informa o pedido)', () => {
    expect(validarEntrada(schemaFila, { limite: 500 })).toEqual({ limite: 500 });
  });

  it('nome de campo fora do padrão não vai para a lista de campos do erro', () => {
    const e = falha(() => validarEntrada(schemaFila, { 'Valor Secreto 123!': 1 }));
    expect(e.campos).toEqual([]);
    expect(e.mensagem).not.toContain('Secreto');
  });
});
