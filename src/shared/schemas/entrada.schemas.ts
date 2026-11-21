import { z } from 'zod';
import { ErroSoftdesk } from '../../core/domain/errors/erro-softdesk';

/**
 * Schemas de entrada compartilhados por REST e MCP (ARCH-001 §7.1, §9). Zod estrito: campo
 * desconhecido (por exemplo `senha`), tipo errado ou `limite < 1` viram `FILTRO_INVALIDO`,
 * sem chamar o SoftDesk. `limite > 200` não é erro: o caso de uso aplica o teto e informa
 * `limite_pedido` e `limite_aplicado`.
 *
 * Os valores chegam tipados (JSON do corpo REST ou argumentos do MCP). A rota REST de fila
 * recebe query string em texto: o controller converte `inicio` e `limite` para número antes.
 */

const textoFiltro = z.string().min(1).max(100);
const inteiro = z.number().int();
const listaInteiros = z.array(inteiro).max(200);

/** Filtros de texto no cliente (RN-16): valem na fila e na pesquisa. */
const filtrosTexto = {
  solicitante_nome: textoFiltro.optional(),
  titulo_contem: textoFiltro.optional(),
  prioridade_nome: textoFiltro.optional(),
  tipo_nome: textoFiltro.optional(),
};

const paginacao = {
  inicio: inteiro.min(0).optional(),
  limite: inteiro.min(1).optional(),
};

/**
 * `todas` (RN-09, RF-03, RF-04): leitura progressiva de todas as páginas, com tetos de proteção.
 * É ambíguo junto de `limite` (quantos?), então `todas: true` com `limite` é `FILTRO_INVALIDO`;
 * `inicio` continua permitido (continuação a partir de `proximo_inicio`). `todas: false` equivale a omitir.
 */
const todas = { todas: z.boolean().optional() };

function recusarTodasComLimite(e: { todas?: boolean; limite?: number }, ctx: z.RefinementCtx): void {
  if (e.todas === true && e.limite !== undefined) {
    for (const campo of ['todas', 'limite']) {
      ctx.addIssue({ code: 'custom', path: [campo], message: 'todas e limite não podem ser usados juntos.' });
    }
  }
}

export const schemaFila = z
  .strictObject({
    ...paginacao,
    ...todas,
    ...filtrosTexto,
  })
  .superRefine(recusarTodasComLimite);

export const schemaPesquisa = z
  .strictObject({
  codigo: inteiro.positive().optional(),
  atendente: listaInteiros.optional(),
  /** Código (0 a 14) ou nome do catálogo; a validação contra o catálogo é do caso de uso. */
  status: z.array(z.union([inteiro, z.string().min(1).max(100)])).max(20).optional(),
  prioridade: listaInteiros.optional(),
  grupo_solucao: listaInteiros.optional(),
  tipo_chamado: listaInteiros.optional(),
  cliente: listaInteiros.optional(),
  palavra_chave: z.string().max(200).optional(),
  area: inteiro.optional(),
  solicitante: inteiro.optional(),
  servico: inteiro.optional(),
  categoria: inteiro.optional(),
  descricao_categoria: z.string().max(200).optional(),
  periodo: inteiro.optional(),
  periodo_ini: z.string().max(50).optional(),
  periodo_fim: z.string().max(50).optional(),
  termino_previsto: z.string().max(50).optional(),
  incluir_inativos: z.boolean().optional(),
  ...paginacao,
  ...todas,
  ...filtrosTexto,
})
  .superRefine(recusarTodasComLimite);

export const schemaCodigoChamado = z.strictObject({
  codigo: inteiro.positive(),
});

/** Rotas sem entrada (entrar, estado, saúde, operacionais): qualquer campo, ex. `senha`, é recusado. */
export const schemaSemEntrada = z.strictObject({});

export type EntradaFila = z.infer<typeof schemaFila>;
export type EntradaPesquisa = z.infer<typeof schemaPesquisa>;
export type EntradaCodigoChamado = z.infer<typeof schemaCodigoChamado>;

const NOME_DE_CAMPO = /^[a-z0-9_]{1,64}$/;

/** Nomes (nunca valores) dos campos com problema. */
function camposDoErro(erro: z.ZodError): string[] {
  const nomes = new Set<string>();
  for (const issue of erro.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const chave of issue.keys) if (NOME_DE_CAMPO.test(chave)) nomes.add(chave);
    }
    const primeiro = issue.path[0];
    if (typeof primeiro === 'string' && NOME_DE_CAMPO.test(primeiro)) nomes.add(primeiro);
  }
  return [...nomes];
}

/**
 * Valida a entrada. Qualquer problema vira `FILTRO_INVALIDO` com mensagem fixa e só os nomes
 * dos campos (o valor informado nunca entra no erro, no log nem na resposta).
 */
export function validarEntrada<T>(schema: z.ZodType<T>, entrada: unknown): T {
  const r = schema.safeParse(entrada ?? {});
  if (r.success) return r.data;
  const campos = camposDoErro(r.error);
  throw new ErroSoftdesk('FILTRO_INVALIDO', {
    mensagem:
      campos.length > 0
        ? `Os filtros informados são inválidos (campos: ${campos.join(', ')}).`
        : 'Os filtros informados são inválidos.',
    campos,
  });
}
