import { ErroSoftdesk } from '../../../core/domain/errors/erro-softdesk';
import { schemaCodigoChamado, validarEntrada } from '../../../shared/schemas/entrada.schemas';
import type { ContextoRota, RespostaRota } from '../roteador';
import { corpoComoObjeto, exigirSemCorpo, exigirSemQuery, objetoDaQuery, paraNumero } from './entrada-rest';

/** `POST /v1/chamados/pesquisa` (RF-04): filtros no corpo JSON, para não irem para a URL. */
export async function pesquisar(ctx: ContextoRota): Promise<RespostaRota> {
  exigirSemQuery(ctx);
  const r = await ctx.container.pesquisar.executar(corpoComoObjeto(ctx.corpo), { sinal: ctx.sinal });
  return { dados: r.dados, aviso_deriva: r.aviso_deriva };
}

/** `GET /v1/chamados/{codigo}` (RF-05). */
export async function obter(ctx: ContextoRota): Promise<RespostaRota> {
  exigirSemCorpo(ctx);
  const entrada = { ...objetoDaQuery(ctx.query), codigo: paraNumero(ctx.params.codigo ?? '') };
  const r = await ctx.container.obterChamado.executar(entrada, { sinal: ctx.sinal });
  return { dados: r.dados, aviso_deriva: r.aviso_deriva };
}

/**
 * `GET /v1/chamados/{codigo}/atividades` (RF-11).
 * STUB do fragmento 5: o caso de uso real (`listar-atividades.use-case.ts`) é o fragmento 9 e
 * depende de descobrir a rota (Q-07). Até lá a rota valida o código e responde `NAO_DISPONIVEL`
 * (501) com a orientação do MCP oficial `dossie_chamado` (texto fixo do código de erro).
 */
export async function atividades(ctx: ContextoRota): Promise<RespostaRota> {
  exigirSemCorpo(ctx);
  validarEntrada(schemaCodigoChamado, { ...objetoDaQuery(ctx.query), codigo: paraNumero(ctx.params.codigo ?? '') });
  throw new ErroSoftdesk('NAO_DISPONIVEL');
}
