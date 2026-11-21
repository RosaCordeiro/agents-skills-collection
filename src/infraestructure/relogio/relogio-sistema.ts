import type { IRelogio } from '../../core/domain/ports/relogio';

/** Relógio real. */
export class RelogioSistema implements IRelogio {
  agora(): Date {
    return new Date();
  }
}
