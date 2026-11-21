/**
 * Chamado nas duas formas que o sistema usa (ARCH-001 §5).
 * Único trecho do domínio que conhece os nomes de campo do SoftDesk, apenas para renomear
 * os 11 campos básicos (RN-06); o resto do sistema usa `ChamadoBruto` e `ChamadoBasico`.
 */

/** Item de `lista` como veio do SoftDesk (cerca de 70 campos), sem remodelar (RN-06). */
export type ChamadoBruto = Record<string, unknown>;

/** Os 11 campos básicos da lista. Campo ausente ou de tipo inesperado vira `null`, sem erro. */
export interface ChamadoBasico {
  codigo: number | null;
  titulo: string | null;
  status_codigo: number | null;
  status: string | null;
  prioridade: string | null;
  tipo: string | null;
  solicitante: string | null;
  /** `da_chamado` como o SoftDesk devolve (texto), sem conversão. */
  data_abertura: string | null;
  /** `ha_chamado` como o SoftDesk devolve (texto), sem conversão. */
  hora_abertura: string | null;
  interacoes: number | null;
  cd_atendente: number | null;
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' ? valor : null;
}

function numero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

export function paraBasico(bruto: ChamadoBruto): ChamadoBasico {
  return {
    codigo: numero(bruto.cd_chamado),
    titulo: texto(bruto.tt_chamado),
    status_codigo: numero(bruto.st_chamado),
    status: texto(bruto.ds_status),
    prioridade: texto(bruto.ds_prioridade),
    tipo: texto(bruto.ds_tipo_chamado),
    solicitante: texto(bruto.nm_usuario),
    data_abertura: texto(bruto.da_chamado),
    hora_abertura: texto(bruto.ha_chamado),
    interacoes: numero(bruto.qtd_interacoes),
    cd_atendente: numero(bruto.cd_atendente),
  };
}
