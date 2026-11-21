import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { lerDescoberta } from '../../src/infraestructure/descoberta/arquivo-descoberta';
import { portaFechada } from './rest-apoio';

/** Ajudantes dos testes do MCP (fragmento 6): cliente do SDK contra `dist/mcp.js` e listagem de processos. */

export const RAIZ = path.resolve(__dirname, '..', '..');
export const MCP_JS = path.join(RAIZ, 'dist', 'mcp.js');
export const SERVICO_JS = path.join(RAIZ, 'dist', 'servico.js');

export interface McpConectado {
  client: Client;
  transport: StdioClientTransport;
  /** Tudo o que o processo do MCP escreveu em stderr até agora. */
  stderr(): string;
  fechar(): Promise<void>;
}

export async function conectarMcp(env: Record<string, string>): Promise<McpConectado> {
  const transport = new StdioClientTransport({ command: process.execPath, args: [MCP_JS], env, stderr: 'pipe' });
  let err = '';
  const client = new Client({ name: 'teste-softdesk-local', version: '0.0.0' });
  await client.connect(transport);
  transport.stderr?.on('data', (c: Buffer) => (err += c.toString()));
  return { client, transport, stderr: () => err, fechar: () => client.close() };
}

export interface RespostaTool {
  texto: string;
  json: any;
  isError: boolean;
}

export async function chamarTool(
  client: Client,
  name: string,
  args?: Record<string, unknown>,
  timeoutMs = 60_000,
): Promise<RespostaTool> {
  const r = (await client.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs })) as {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  const texto = r.content.map((c) => c.text).join('\n');
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    json = undefined;
  }
  return { texto, json, isError: r.isError === true };
}

export const semCorrelacao = (envelope: Record<string, unknown>): Record<string, unknown> => {
  const { correlation_id: _ignorado, ...resto } = envelope;
  return resto;
};

export interface ProcessoNode {
  pid: number;
  linha: string;
}

/** Processos `node.exe` cuja linha de comando contém `trecho` (insensível a caixa). */
export function processosNode(trecho: string): ProcessoNode[] {
  const saida = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
    ],
    { encoding: 'utf8', timeout: 30_000, windowsHide: true },
  ).trim();
  if (!saida) return [];
  const bruto = JSON.parse(saida) as unknown;
  const lista = (Array.isArray(bruto) ? bruto : [bruto]) as Array<{ ProcessId: number; CommandLine: string | null }>;
  return lista
    .filter((p) => (p.CommandLine ?? '').toLowerCase().includes(trecho.toLowerCase()))
    .map((p) => ({ pid: p.ProcessId, linha: p.CommandLine ?? '' }));
}

export function vivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Para o serviço descrito no diretório (rota de parar) e espera a porta liberar. Idempotente. */
export async function pararServicoDoDiretorio(dir: string): Promise<void> {
  const d = lerDescoberta(dir);
  if (!d) return;
  try {
    await fetch(`http://127.0.0.1:${d.porta}/v1/servico/parar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${d.token}` },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // já parado
  }
  for (let i = 0; i < 100; i++) {
    if (await portaFechada(d.porta)) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}
