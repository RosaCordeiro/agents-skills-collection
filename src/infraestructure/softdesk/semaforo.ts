/**
 * Semáforo FIFO (ARCH-001 §4, RNF-04): limita as chamadas simultâneas ao SoftDesk.
 * Quando uma vaga é liberada ela passa direto ao primeiro da fila, então `emUso` nunca
 * passa de `vagas`.
 */

interface Espera {
  entregar: (liberar: () => void) => void;
  falhar: (motivo: unknown) => void;
}

export class Semaforo {
  private usadas = 0;
  private picoUsadas = 0;
  private readonly fila: Espera[] = [];

  constructor(readonly vagas: number) {
    if (!Number.isInteger(vagas) || vagas < 1) {
      throw new RangeError('O semáforo exige pelo menos 1 vaga.');
    }
  }

  /** Vagas ocupadas agora. */
  get emUso(): number {
    return this.usadas;
  }

  /** Maior número de vagas ocupadas ao mesmo tempo desde a criação. */
  get pico(): number {
    return this.picoUsadas;
  }

  get aguardando(): number {
    return this.fila.length;
  }

  /** Espera uma vaga. Se `sinal` abortar na espera, rejeita com `sinal.reason` e sai da fila. */
  adquirir(sinal?: AbortSignal): Promise<() => void> {
    if (sinal?.aborted) return Promise.reject(sinal.reason);
    if (this.usadas < this.vagas) return Promise.resolve(this.ocupar());
    return new Promise<() => void>((resolve, reject) => {
      const espera: Espera = {
        entregar: (liberar) => {
          sinal?.removeEventListener('abort', aoAbortar);
          resolve(liberar);
        },
        falhar: reject,
      };
      const aoAbortar = (): void => {
        const i = this.fila.indexOf(espera);
        if (i >= 0) this.fila.splice(i, 1);
        reject(sinal?.reason);
      };
      sinal?.addEventListener('abort', aoAbortar, { once: true });
      this.fila.push(espera);
    });
  }

  /** Executa `fn` segurando uma vaga e a devolve sempre, inclusive em erro. */
  async executar<T>(fn: () => Promise<T>, sinal?: AbortSignal): Promise<T> {
    const liberar = await this.adquirir(sinal);
    try {
      return await fn();
    } finally {
      liberar();
    }
  }

  private ocupar(): () => void {
    this.usadas += 1;
    if (this.usadas > this.picoUsadas) this.picoUsadas = this.usadas;
    let liberada = false;
    return () => {
      if (liberada) return;
      liberada = true;
      const proxima = this.fila.shift();
      if (proxima) {
        // A vaga muda de dono sem passar por zero: o contador não oscila.
        this.usadas -= 1;
        proxima.entregar(this.ocupar());
      } else {
        this.usadas -= 1;
      }
    };
  }
}
