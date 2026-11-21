/** Log estruturado (ARCH-001 §8.3). A implementação só aceita os campos da lista de permissão. */

export type ResultadoEvento = 'started' | 'success' | 'failure';

export interface EventoLog {
  /** Ex.: `servico`, `sessao`, `fila`. */
  name: string;
  /** Ex.: `start`, `login`, `scan`. */
  action: string;
  outcome?: ResultadoEvento;
}

/** Campos de um log. Qualquer campo fora da lista de permissão é descartado pelo adaptador. */
export interface CamposLog {
  event: EventoLog;
  keywords?: string[];
  [campo: string]: unknown;
}

export interface ILogger {
  /** `msg` deve ser texto fixo; nunca `message` de exceção, título, nome ou valor de filtro. */
  info(msg: string, campos: CamposLog): void;
  warn(msg: string, campos: CamposLog): void;
  error(msg: string, campos: CamposLog): void;
}
