import type { CodigoErro } from '../../core/domain/errors/erro-softdesk';
import type { INotificador } from '../../core/domain/ports/notificador';

/** Não notifica ninguém. Usado quando notificarWindows está desligado. */
export class NotificadorNulo implements INotificador {
  alertar(_codigo: CodigoErro): void {
    // intencionalmente vazio
  }
}
