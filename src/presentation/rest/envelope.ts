import type http from 'node:http';
import type { Envelope } from '../../shared/envelope/envelope';

/**
 * O envelope é o mesmo do MCP (ARCH-001 §7.3) e vive em `shared/envelope`; aqui só se reexporta
 * e se acrescenta a escrita da resposta HTTP, que é coisa do REST.
 */
export {
  montarEnvelopeErro,
  montarEnvelopeSucesso,
  statusHttpDoErro,
  type Envelope,
} from '../../shared/envelope/envelope';

/** Escreve o envelope como JSON. `Connection: close` evita conexões ociosas que atrasariam a parada. */
export function enviarEnvelope(res: http.ServerResponse, status: number, envelope: Envelope<unknown>): void {
  if (res.headersSent || res.writableEnded) return;
  const corpo = JSON.stringify(envelope);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(corpo),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Correlation-Id': envelope.correlation_id,
    Connection: 'close',
  });
  res.end(corpo);
}
