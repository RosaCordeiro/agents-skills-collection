import { ErroSoftdesk } from '../../../core/domain/errors/erro-softdesk';
import { schemaSemEntrada, validarEntrada } from '../../../shared/schemas/entrada.schemas';
import type { ContextoRota } from '../roteador';

/** Ajudantes de entrada dos controllers (conversão de query e rotas sem entrada). */

const INTEIRO = /^\d{1,15}$/;

/** `"12"` vira 12; qualquer outra coisa segue como veio (o schema recusa). */
export function paraNumero(valor: string): number | string {
  return INTEIRO.test(valor) ? Number(valor) : valor;
}

/** Query como objeto; chave repetida vira lista (o schema recusa, pois nenhum filtro de query é lista). */
export function objetoDaQuery(query: URLSearchParams): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const chave of new Set(query.keys())) {
    const todos = query.getAll(chave);
    saida[chave] = todos.length === 1 ? todos[0] : todos;
  }
  return saida;
}

/** Corpo recebido como objeto (vazio quando não veio); corpo que não é objeto é `FILTRO_INVALIDO`. */
export function corpoComoObjeto(corpo: unknown): Record<string, unknown> {
  if (corpo === undefined) return {};
  if (corpo !== null && typeof corpo === 'object' && !Array.isArray(corpo)) return corpo as Record<string, unknown>;
  throw new ErroSoftdesk('FILTRO_INVALIDO', { mensagem: 'O corpo deve ser um objeto JSON.' });
}

/** Rotas sem entrada: nenhum campo na query nem no corpo (VAL-15: `senha` é recusada). */
export function exigirSemEntrada(ctx: ContextoRota): void {
  validarEntrada(schemaSemEntrada, { ...objetoDaQuery(ctx.query), ...corpoComoObjeto(ctx.corpo) });
}

/** Rotas que só usam query: corpo, se vier, tem de ser vazio. */
export function exigirSemCorpo(ctx: ContextoRota): void {
  validarEntrada(schemaSemEntrada, corpoComoObjeto(ctx.corpo));
}

/** Rotas que só usam corpo: query, se vier, tem de ser vazia. */
export function exigirSemQuery(ctx: ContextoRota): void {
  validarEntrada(schemaSemEntrada, objetoDaQuery(ctx.query));
}
