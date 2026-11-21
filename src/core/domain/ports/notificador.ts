import type { CodigoErro } from '../errors/erro-softdesk';

/** Alerta visível ao usuário (RF-07). Nunca lança; texto fixo por código, sem dado pessoal. */
export interface INotificador {
  alertar(codigo: CodigoErro | 'DERIVA'): void;
}
