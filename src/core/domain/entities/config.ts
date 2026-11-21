import type { PerfilLogin } from './sessao';

export const NIVEIS_LOG = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
export type NivelLog = (typeof NIVEIS_LOG)[number];

/** Configuração local não secreta (ARCH-001 §8.2, RN-12). Lida uma vez, no início do serviço. */
export interface Config {
  /** Origem do SoftDesk (https; http só para 127.0.0.1/localhost, que é o simulador). */
  baseUrl: string;
  cdAtendente: number;
  perfilPadrao: PerfilLogin;
  esperaLoginSegundos: number;
  porta: number;
  prazoVarreduraSegundos: number;
  notificarWindows: boolean;
  nivelLog: NivelLog;
  /** Diretório do serviço (descoberta, config.json, logs). */
  diretorio: string;
}
