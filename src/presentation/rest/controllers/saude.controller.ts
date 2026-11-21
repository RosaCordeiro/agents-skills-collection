import type { ContextoRota, RespostaRota } from '../roteador';
import { exigirSemEntrada } from './entrada-rest';

/** `GET /v1/saude` (RF-06). */
export async function saude(ctx: ContextoRota): Promise<RespostaRota> {
  exigirSemEntrada(ctx);
  const r = await ctx.container.verificarSaude.executar({ sinal: ctx.sinal });
  return { dados: r.dados, aviso_deriva: r.aviso_deriva };
}
