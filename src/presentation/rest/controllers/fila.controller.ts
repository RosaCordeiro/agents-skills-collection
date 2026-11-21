import type { ContextoRota, RespostaRota } from '../roteador';
import { exigirSemCorpo, objetoDaQuery, paraNumero } from './entrada-rest';

/** `GET /v1/fila?inicio=&limite=&todas=true|false&solicitante_nome=&...` (RF-03). */
export async function minhaFila(ctx: ContextoRota): Promise<RespostaRota> {
  exigirSemCorpo(ctx);
  const entrada = objetoDaQuery(ctx.query);
  // Só `inicio` e `limite` são numéricos; a query chega em texto.
  for (const chave of ['inicio', 'limite']) {
    if (typeof entrada[chave] === 'string') entrada[chave] = paraNumero(entrada[chave] as string);
  }
  // `todas` também chega em texto: só `true` e `false` viram booleano (qualquer outro valor segue e o schema recusa).
  if (entrada.todas === 'true') entrada.todas = true;
  else if (entrada.todas === 'false') entrada.todas = false;
  const r = await ctx.container.listarFila.executar(entrada, { sinal: ctx.sinal });
  return { dados: r.dados, aviso_deriva: r.aviso_deriva };
}
