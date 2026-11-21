import type { ContextoRota, RespostaRota } from '../roteador';
import { exigirSemEntrada } from './entrada-rest';

/** `GET /v1/servico` (operacional): quem está rodando. */
export async function info(ctx: ContextoRota): Promise<RespostaRota> {
  exigirSemEntrada(ctx);
  return {
    dados: {
      versao: ctx.servico.versao,
      pid: ctx.servico.pid,
      iniciado_em: ctx.servico.iniciadoEm.toISOString(),
    },
  };
}

/** `POST /v1/servico/parar` (operacional): responde e só então pede a parada. */
export async function parar(ctx: ContextoRota): Promise<RespostaRota> {
  exigirSemEntrada(ctx);
  return { dados: { parando: true }, depois: () => ctx.servico.parar() };
}
