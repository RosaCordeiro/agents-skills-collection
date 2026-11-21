import crypto from 'node:crypto';
import type http from 'node:http';

/**
 * Autenticação do REST (ARCH-001 §7.2, RNF-02). Toda requisição passa por aqui, nesta ordem:
 * `Host` exato (403), cabeçalho `Origin` presente (403, bloqueia página de navegador) e
 * `Authorization: Bearer` comparado com `timingSafeEqual` (401). Não há CORS.
 */

export type MotivoRecusa = 'host' | 'origin' | 'sem_token' | 'token_errado';

export type ResultadoAutenticacao =
  | { ok: true }
  | { ok: false; status: 401 | 403; motivo: MotivoRecusa };

const digest = (valor: string): Buffer => crypto.createHash('sha256').update(valor, 'utf8').digest();

/** Compara em tempo constante e sem vazar o tamanho (compara os SHA-256 de cada lado). */
export function tokenConfere(candidato: string, esperado: string): boolean {
  return crypto.timingSafeEqual(digest(candidato), digest(esperado));
}

function tokenDoCabecalho(valor: string | string[] | undefined): string | null {
  if (typeof valor !== 'string') return null;
  const m = /^Bearer[ \t]+(\S+)$/i.exec(valor.trim());
  return m ? m[1] : null;
}

export function autenticar(
  req: Pick<http.IncomingMessage, 'headers'>,
  esperado: { porta: number; token: string },
): ResultadoAutenticacao {
  if (req.headers.host !== `127.0.0.1:${esperado.porta}`) return { ok: false, status: 403, motivo: 'host' };
  if (req.headers.origin !== undefined) return { ok: false, status: 403, motivo: 'origin' };
  const token = tokenDoCabecalho(req.headers.authorization);
  if (token === null) return { ok: false, status: 401, motivo: 'sem_token' };
  if (!tokenConfere(token, esperado.token)) return { ok: false, status: 401, motivo: 'token_errado' };
  return { ok: true };
}
