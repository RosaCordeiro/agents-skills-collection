import fs from 'node:fs';
import path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolverDiretorio } from './infraestructure/config/carregar-config';
import { ClienteServico, TIMEOUT_PADRAO_MS } from './presentation/mcp/cliente-servico';
import { criarServidorMcp } from './presentation/mcp/servidor-mcp';

/**
 * Entrada do MCP (`node dist/mcp.js`, stdio). stdout é só o protocolo; qualquer problema vai para stderr.
 * Variáveis: `SOFTDESK_LOCAL_DIR` (mesma do serviço) e `SOFTDESK_LOCAL_MCP_TIMEOUT_S` (opcional, > 0;
 * padrão 310 s, acima do teto de 280 s da espera de login).
 */

function lerVersao(): string {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')) as { version?: unknown };
    return typeof p.version === 'string' ? p.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function timeoutDoAmbiente(env: NodeJS.ProcessEnv): number {
  const s = Number(env.SOFTDESK_LOCAL_MCP_TIMEOUT_S);
  return Number.isFinite(s) && s > 0 ? Math.round(s * 1000) : TIMEOUT_PADRAO_MS;
}

async function principal(): Promise<void> {
  const cliente = new ClienteServico({
    diretorio: resolverDiretorio(process.env),
    timeoutMs: timeoutDoAmbiente(process.env),
  });
  const server = criarServidorMcp(cliente, lerVersao());
  await server.connect(new StdioServerTransport());
}

principal().catch(() => {
  process.stderr.write('softdesk-local-mcp: não foi possível iniciar o MCP.\n');
  process.exit(1);
});
