import { execFile } from 'node:child_process';
import type { IAbridorNavegador } from '../../core/domain/ports/abridor-navegador';

/** Só o endereço que a própria janela gera: `http://127.0.0.1:<porta>/?t=<hex>`. */
const PADRAO_URL = /^http:\/\/127\.0\.0\.1:(\d{1,5})\/\?t=[0-9a-f]{16,128}$/;

/** Prazo para o `cmd /c start` terminar; passou, conta como navegador não aberto. */
export const PRAZO_ABRIR_MS = 10_000;

export type Executar = (arquivo: string, args: string[], cb: (erro: Error | null) => void) => void;

const executarPadrao: Executar = (arquivo, args, cb) => {
  execFile(arquivo, args, { windowsHide: true, timeout: PRAZO_ABRIR_MS }, (erro) => cb(erro));
};

/** Abre o navegador padrão do Windows (`cmd /c start "" <url>`), sem passar texto livre ao shell. */
export class AbridorNavegadorWindows implements IAbridorNavegador {
  constructor(private readonly executar: Executar = executarPadrao) {}

  abrir(url: string): Promise<boolean> {
    const m = PADRAO_URL.exec(url);
    const porta = m ? Number(m[1]) : 0;
    if (!m || porta < 1 || porta > 65535) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      const prazo = setTimeout(() => resolve(false), PRAZO_ABRIR_MS + 1000);
      prazo.unref();
      const terminar = (ok: boolean): void => {
        clearTimeout(prazo);
        resolve(ok);
      };
      try {
        this.executar('cmd', ['/c', 'start', '', url], (erro) => terminar(erro === null));
      } catch {
        terminar(false);
      }
    });
  }
}
