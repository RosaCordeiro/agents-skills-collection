import crypto from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { montarEnvelopeErro } from '../../shared/envelope/envelope';
import { validarEntrada } from '../../shared/schemas/entrada.schemas';
import type { ClienteServico } from './cliente-servico';
import { TOOLS } from './tools';

/**
 * Servidor MCP fino (ARCH-001 §14 F6). Usa o `Server` de baixo nível do SDK, e não `McpServer.registerTool`,
 * por causa do R3: no SDK instalado (1.32) `registerTool` com `z.strictObject` RECUSA campo extra, mas com a
 * própria mensagem de erro do SDK (texto livre, fora do envelope §7.3). Para devolver `FILTRO_INVALIDO` no
 * formato do envelope, a validação é feita aqui com os mesmos schemas estritos de `shared/schemas`, e o
 * `tools/list` publica o JSON Schema gerado deles (`additionalProperties: false`).
 * Sem regra, sem sessão, sem falar com o SoftDesk, sem janela e sem escrever em stdout além do protocolo.
 */

export const NOME_SERVIDOR_MCP = 'softdesk-local';

function resultado(texto: string, erro: boolean) {
  return { content: [{ type: 'text' as const, text: texto }], ...(erro ? { isError: true } : {}) };
}

export function criarServidorMcp(cliente: ClienteServico, versao = '0.1.0'): Server {
  const server = new Server({ name: NOME_SERVIDOR_MCP, version: versao }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.nome,
      description: t.descricao,
      inputSchema: z.toJSONSchema(t.schema, { io: 'input', target: 'draft-7' }) as {
        type: 'object';
        [k: string]: unknown;
      },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = TOOLS.find((t) => t.nome === req.params.name);
    if (!tool) throw new McpError(ErrorCode.InvalidParams, 'Tool desconhecida.');
    const correlationId = crypto.randomUUID();
    let entrada: unknown;
    try {
      entrada = validarEntrada(tool.schema, req.params.arguments);
    } catch (e) {
      // Não chama o serviço; mesmo formato do envelope do REST.
      return resultado(JSON.stringify(montarEnvelopeErro(e, correlationId), null, 2), true);
    }
    const r = await cliente.chamar(tool.pedido(entrada), correlationId);
    return resultado(r.texto, !r.sucesso);
  });

  return server;
}
