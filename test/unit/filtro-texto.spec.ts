import type { ChamadoBruto } from '../../src/core/domain/entities/chamado';
import {
  casaTexto,
  filtrosTextoUsados,
  normalizarTexto,
  temFiltroTexto,
} from '../../src/core/domain/entities/filtro-texto';

const item = (parcial: ChamadoBruto): ChamadoBruto => ({
  cd_chamado: 1,
  nm_usuario: 'Fulano de Tal',
  tt_chamado: 'Titulo qualquer',
  ds_prioridade: 'Média',
  ds_tipo_chamado: 'Incidente',
  ...parcial,
});

describe('normalizarTexto', () => {
  it('tira acento, caixa e espaços sobrando', () => {
    expect(normalizarTexto('  Rosângela   ALVES ')).toBe('rosangela alves');
    expect(normalizarTexto('AÇÃO Concluída')).toBe('acao concluida');
    expect(normalizarTexto('ÜBER ñandú')).toBe('uber nandu');
  });
});

describe('casaTexto (RN-16, VAL-25 unit)', () => {
  const rosangelaAlves = item({ nm_usuario: 'Rosângela Alves' });
  const rosangelaSouza = item({ nm_usuario: 'ROSANGELA Souza' });
  const rogerio = item({ nm_usuario: 'Rogério Lima' });

  it('"rosangela" casa "Rosângela Alves" e "ROSANGELA Souza", não "Rogério Lima"', () => {
    const filtro = { solicitante_nome: 'rosangela' };
    expect(casaTexto(rosangelaAlves, filtro)).toBe(true);
    expect(casaTexto(rosangelaSouza, filtro)).toBe(true);
    expect(casaTexto(rogerio, filtro)).toBe(false);
    expect([rosangelaAlves, rosangelaSouza, rogerio].filter((i) => casaTexto(i, filtro))).toHaveLength(2);
  });

  it('o filtro com acento e maiúsculas casa do mesmo jeito', () => {
    expect(casaTexto(rosangelaSouza, { solicitante_nome: 'Rosângela' })).toBe(true);
    expect(casaTexto(rosangelaAlves, { solicitante_nome: 'ROSANGELA' })).toBe(true);
  });

  it('todas as palavras pedidas precisam aparecer, em qualquer ordem', () => {
    expect(casaTexto(rosangelaAlves, { solicitante_nome: 'rosangela alves' })).toBe(true);
    expect(casaTexto(rosangelaAlves, { solicitante_nome: 'alves rosangela' })).toBe(true);
    expect(casaTexto(rosangelaSouza, { solicitante_nome: 'rosangela alves' })).toBe(false);
  });

  it('VAL-26 unit: vários filtros juntos exigem todos', () => {
    const i = item({ nm_usuario: 'Rosângela Alves', tt_chamado: 'Erro na emissão da nota', ds_prioridade: 'Alta' });
    expect(casaTexto(i, { solicitante_nome: 'rosangela', titulo_contem: 'emissao nota' })).toBe(true);
    expect(casaTexto(i, { solicitante_nome: 'rosangela', titulo_contem: 'emissao boleto' })).toBe(false);
    expect(casaTexto(i, { solicitante_nome: 'rosangela', titulo_contem: 'nota', prioridade_nome: 'alta' })).toBe(true);
    expect(casaTexto(i, { solicitante_nome: 'rosangela', titulo_contem: 'nota', prioridade_nome: 'baixa' })).toBe(false);
    expect(casaTexto(i, { tipo_nome: 'incidente' })).toBe(true);
    expect(casaTexto(i, { tipo_nome: 'projeto' })).toBe(false);
  });

  it('cada filtro olha o seu campo: o nome do solicitante não casa com o título', () => {
    const i = item({ nm_usuario: 'Maria', tt_chamado: 'Chamado da Joana' });
    expect(casaTexto(i, { solicitante_nome: 'joana' })).toBe(false);
    expect(casaTexto(i, { titulo_contem: 'joana' })).toBe(true);
  });

  it('filtro ausente, vazio ou só espaços não restringe', () => {
    expect(casaTexto(rogerio, undefined)).toBe(true);
    expect(casaTexto(rogerio, {})).toBe(true);
    expect(casaTexto(rogerio, { solicitante_nome: '   ', titulo_contem: '' })).toBe(true);
  });

  it('campo do item ausente, nulo ou de outro tipo não casa com filtro que o exige', () => {
    expect(casaTexto(item({ nm_usuario: null }), { solicitante_nome: 'x' })).toBe(false);
    expect(casaTexto(item({ nm_usuario: 42 }), { solicitante_nome: '42' })).toBe(false);
    const semCampo = item({});
    delete semCampo.nm_usuario;
    expect(casaTexto(semCampo, { solicitante_nome: 'fulano' })).toBe(false);
    // mas sem exigir o campo, passa
    expect(casaTexto(semCampo, { titulo_contem: 'titulo' })).toBe(true);
  });
});

describe('filtrosTextoUsados / temFiltroTexto', () => {
  it('lista só os filtros com texto, na ordem fixa', () => {
    expect(filtrosTextoUsados({ tipo_nome: 'a', solicitante_nome: 'b', titulo_contem: '  ' })).toEqual([
      'solicitante_nome',
      'tipo_nome',
    ]);
    expect(temFiltroTexto({ titulo_contem: 'x' })).toBe(true);
    expect(temFiltroTexto({ titulo_contem: ' ' })).toBe(false);
    expect(temFiltroTexto(undefined)).toBe(false);
  });
});
