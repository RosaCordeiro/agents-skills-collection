import { ErroSoftdesk } from '../errors/erro-softdesk';

/** Padrão e teto de itens por página (RN-09). */
export const LIMITE_PADRAO = 50;
export const LIMITE_MAXIMO = 200;

/**
 * Filtros que o gateway entende (ARCH-001 §7.1): parâmetros do servidor mais a paginação.
 * Os filtros de texto de RN-16 ficam em `FiltroTexto` porque nunca vão ao servidor.
 * `status` já vem em códigos (use `normalizarListaStatus` antes); só o conjunto exato {1} vai
 * ao servidor, como `pesq_st_chamado[]=EM_ATENDIMENTO`; os demais são filtrados no cliente.
 */
export interface FiltroPesquisa {
  codigo?: number;
  atendente?: number[];
  status?: number[];
  prioridade?: number[];
  grupo_solucao?: number[];
  tipo_chamado?: number[];
  cliente?: number[];
  palavra_chave?: string;
  area?: number;
  solicitante?: number;
  servico?: number;
  categoria?: number;
  descricao_categoria?: string;
  periodo?: number;
  periodo_ini?: string;
  periodo_fim?: string;
  termino_previsto?: string;
  incluir_inativos?: boolean;
  /** Posição inicial no SoftDesk (`start`); padrão 0. */
  inicio?: number;
  /** Itens por página (`limit`); padrão 50, teto 200. */
  limite?: number;
}

/** Filtros com parâmetro de servidor confirmado (CA-09); os demais são "por convenção". */
export const FILTROS_CONFIRMADOS: ReadonlySet<string> = new Set([
  'codigo',
  'atendente',
  'status',
  'prioridade',
  'grupo_solucao',
  'tipo_chamado',
  'cliente',
]);

/** Campos de paginação: não contam como filtro. */
const CAMPOS_PAGINACAO: ReadonlySet<string> = new Set(['inicio', 'limite']);

function usado(valor: unknown): boolean {
  if (valor === undefined || valor === null) return false;
  if (typeof valor === 'string') return valor.trim() !== '';
  if (Array.isArray(valor)) return valor.length > 0;
  return true;
}

/** Nomes (nunca valores) dos filtros usados que estão fora de `FILTROS_CONFIRMADOS`. */
export function filtrosNaoConfirmados(filtro: FiltroPesquisa): string[] {
  return Object.entries(filtro)
    .filter(([nome, valor]) => !CAMPOS_PAGINACAO.has(nome) && usado(valor))
    .map(([nome]) => nome)
    .filter((nome) => !FILTROS_CONFIRMADOS.has(nome));
}

export interface Paginacao {
  inicio: number;
  limite_aplicado: number;
  /** O que foi pedido (igual ao aplicado, exceto quando passou do teto de 200). */
  limite_pedido: number;
}

function filtroInvalido(campo: string): ErroSoftdesk {
  return new ErroSoftdesk('FILTRO_INVALIDO', {
    mensagem: `O campo ${campo} é inválido.`,
    campos: [campo],
  });
}

/**
 * Aplica o padrão (início 0, limite 50) e o teto (200). `limite` menor que 1, `inicio`
 * negativo ou valor não inteiro lançam `FILTRO_INVALIDO`.
 */
export function normalizarPaginacao(entrada: { inicio?: number; limite?: number } = {}): Paginacao {
  const inicio = entrada.inicio ?? 0;
  if (!Number.isInteger(inicio) || inicio < 0) throw filtroInvalido('inicio');
  const pedido = entrada.limite ?? LIMITE_PADRAO;
  if (!Number.isInteger(pedido) || pedido < 1) throw filtroInvalido('limite');
  return { inicio, limite_aplicado: Math.min(pedido, LIMITE_MAXIMO), limite_pedido: pedido };
}
