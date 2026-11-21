import { randomBytes } from 'node:crypto';
import type { SessaoHttp } from '../../src/core/domain/entities/sessao';
import type { CamposLog, ILogger } from '../../src/core/domain/ports/logger';
import { SoftdeskHttpGateway, type OpcoesGateway } from '../../src/infraestructure/softdesk/softdesk-http.gateway';

/** Ajudantes dos testes de integração contra o simulador. */

export interface RegistroLog {
  nivel: 'info' | 'warn' | 'error';
  msg: string;
  campos: CamposLog;
}

export interface LoggerEspiao extends ILogger {
  registros: RegistroLog[];
  /** Tudo o que foi logado, serializado (para buscar vazamento). */
  texto(): string;
}

export function criarLoggerEspiao(): LoggerEspiao {
  const registros: RegistroLog[] = [];
  const mk = (nivel: RegistroLog['nivel']) => (msg: string, campos: CamposLog) => {
    registros.push({ nivel, msg, campos });
  };
  return {
    registros,
    info: mk('info'),
    warn: mk('warn'),
    error: mk('error'),
    texto: () => JSON.stringify(registros),
  };
}

export const sentinela = (prefixo = 'SENT'): string => `${prefixo}-${randomBytes(9).toString('hex')}`;

export interface Montagem {
  gateway: SoftdeskHttpGateway;
  logger: LoggerEspiao;
}

export function montarGateway(
  sim: { url: string },
  opcoes: Partial<Omit<OpcoesGateway, 'baseUrl' | 'logger'>> = {},
): Montagem {
  const logger = criarLoggerEspiao();
  const gateway = new SoftdeskHttpGateway({ baseUrl: sim.url, logger, timeoutMs: 5000, ...opcoes });
  return { gateway, logger };
}

/** Entra com sentinelas e devolve a sessão. */
export async function entrar(m: Montagem): Promise<SessaoHttp> {
  return m.gateway.autenticar(sentinela('USU'), sentinela('SENHA'), 'A');
}

/** Captura o erro lançado por `fn` (falha o teste se não lançar). */
export async function capturarErro(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (e) {
    return e;
  }
  throw new Error('era esperado um erro e nada foi lançado');
}

/** Tudo o que um erro expõe, para buscar vazamento: campos, `message`, `stack`, `String()`. */
export function descreverErro(e: unknown): string {
  const partes: string[] = [];
  try {
    const plano = Object.fromEntries(
      Object.getOwnPropertyNames(e as object).map((k) => [k, (e as Record<string, unknown>)[k]]),
    );
    partes.push(JSON.stringify(plano));
  } catch {
    // ignora objetos circulares
  }
  partes.push(String(e));
  if (e instanceof Error) partes.push(e.message, e.stack ?? '');
  return partes.join('\n');
}
