import { paraBasico } from '../../src/core/domain/entities/chamado';
import { montarItem } from '../simulador/dados';

describe('paraBasico (RN-06, ARCH §5)', () => {
  it('renomeia os 11 campos básicos e só eles', () => {
    const bruto = montarItem({
      cd_chamado: 2487414,
      st_chamado: 8,
      cd_atendente: 393,
      nm_usuario: 'Cecília Montenegro',
      tt_chamado: 'Pedido sem retorno',
      ds_prioridade: 'Alta',
      ds_tipo_chamado: 'Incidente',
      da_chamado: '2026-11-18',
      ha_chamado: '14:05:00',
      qtd_interacoes: 4,
    });
    const basico = paraBasico(bruto);
    expect(basico).toEqual({
      codigo: 2487414,
      titulo: 'Pedido sem retorno',
      status_codigo: 8,
      status: 'Aguardando solicitante',
      prioridade: 'Alta',
      tipo: 'Incidente',
      solicitante: 'Cecília Montenegro',
      data_abertura: '2026-11-18',
      hora_abertura: '14:05:00',
      interacoes: 4,
      cd_atendente: 393,
    });
    expect(Object.keys(basico)).toHaveLength(11);
  });

  it('campo ausente vira null, sem erro', () => {
    const basico = paraBasico({ cd_chamado: 10 });
    expect(basico.codigo).toBe(10);
    for (const [campo, valor] of Object.entries(basico)) {
      if (campo !== 'codigo') expect(valor).toBeNull();
    }
  });

  it('campo de tipo inesperado vira null (não chega texto onde se espera número)', () => {
    const basico = paraBasico({
      cd_chamado: '10',
      st_chamado: 'Em atendimento',
      cd_atendente: null,
      nm_usuario: 42,
      qtd_interacoes: NaN,
      tt_chamado: { x: 1 },
    });
    expect(basico.codigo).toBeNull();
    expect(basico.status_codigo).toBeNull();
    expect(basico.cd_atendente).toBeNull();
    expect(basico.solicitante).toBeNull();
    expect(basico.interacoes).toBeNull();
    expect(basico.titulo).toBeNull();
  });

  it('data e hora passam como o SoftDesk devolve, sem conversão', () => {
    const basico = paraBasico({ da_chamado: '18/11/2026', ha_chamado: '9h' });
    expect(basico.data_abertura).toBe('18/11/2026');
    expect(basico.hora_abertura).toBe('9h');
  });

  it('não altera o item bruto', () => {
    const bruto = montarItem({ cd_chamado: 1, st_chamado: 1, cd_atendente: 393 });
    const copia = JSON.parse(JSON.stringify(bruto));
    paraBasico(bruto);
    expect(bruto).toEqual(copia);
  });
});
