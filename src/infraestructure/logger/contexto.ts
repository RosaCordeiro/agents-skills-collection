import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/** Contexto de uma operação (ARCH-001 §8.3): o `correlation_id` nasce na entrada e acompanha tudo. */
export type OrigemOperacao = 'mcp' | 'rest';

export interface ContextoOperacao {
  correlationId: string;
  origem?: OrigemOperacao;
}

const armazenamento = new AsyncLocalStorage<ContextoOperacao>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function novoCorrelationId(): string {
  return randomUUID();
}

export function correlationIdValido(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID.test(valor);
}

/** Usa o valor recebido (ex.: cabeçalho `X-Correlation-Id`) só se for um UUID; senão gera outro. */
export function correlationIdOuNovo(valor: unknown): string {
  return correlationIdValido(valor) ? valor.toLowerCase() : novoCorrelationId();
}

export function executarComContexto<T>(contexto: ContextoOperacao, fn: () => T): T {
  return armazenamento.run(contexto, fn);
}

export function contextoAtual(): ContextoOperacao | undefined {
  return armazenamento.getStore();
}

export function correlationIdAtual(): string | undefined {
  return armazenamento.getStore()?.correlationId;
}
